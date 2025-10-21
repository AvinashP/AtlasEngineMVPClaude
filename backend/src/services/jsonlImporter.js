/**
 * JSONL Importer Service
 *
 * Imports conversation history from Claude SDK's JSONL files to PostgreSQL.
 * This enables fast database queries while keeping JSONL as source of truth.
 *
 * JSONL File Location:
 * ~/.claude/projects/<encoded-project-path>/<sessionId>.jsonl
 *
 * Each line in JSONL is a JSON object representing an SDK message.
 */

import fs from 'fs/promises';
import path from 'path';
import { saveChatMessage } from '../db/queries.js';

/**
 * Map SDK message type to our database role
 *
 * @param {Object} sdkMessage - SDK message object
 * @returns {string} Role: 'user' or 'assistant' or 'system'
 */
function mapMessageRole(sdkMessage) {
  const type = sdkMessage.type;

  // Map SDK types to database roles
  if (type === 'user' || type === 'input') {
    return 'user';
  }

  if (type === 'assistant' || type === 'output' || type === 'result') {
    return 'assistant';
  }

  if (type === 'system') {
    return 'system';
  }

  // Default to assistant for unknown types
  return 'assistant';
}

/**
 * Extract text content from SDK message
 *
 * @param {Object} sdkMessage - SDK message object
 * @returns {string} Text content
 */
function extractContent(sdkMessage) {
  // Handle different SDK message formats

  // Direct text field
  if (sdkMessage.text) {
    return sdkMessage.text;
  }

  // Message object with content array
  if (sdkMessage.message && Array.isArray(sdkMessage.message.content)) {
    const textBlocks = sdkMessage.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .filter(Boolean);

    return textBlocks.join('\n');
  }

  // Content array directly
  if (Array.isArray(sdkMessage.content)) {
    const textBlocks = sdkMessage.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .filter(Boolean);

    return textBlocks.join('\n');
  }

  // Prompt field (for user messages)
  if (sdkMessage.prompt) {
    return sdkMessage.prompt;
  }

  // Fallback to empty string
  return '';
}

/**
 * Extract token usage from SDK message
 *
 * @param {Object} sdkMessage - SDK message object
 * @returns {number} Token count
 */
function extractTokens(sdkMessage) {
  // Usage object
  if (sdkMessage.usage?.output_tokens) {
    return sdkMessage.usage.output_tokens;
  }

  // Message usage
  if (sdkMessage.message?.usage?.output_tokens) {
    return sdkMessage.message.usage.output_tokens;
  }

  // Model usage (detailed breakdown)
  if (sdkMessage.modelUsage) {
    const models = Object.values(sdkMessage.modelUsage);
    if (models.length > 0) {
      return models[0].outputTokens || 0;
    }
  }

  return 0;
}

/**
 * Extract model name from SDK message
 *
 * @param {Object} sdkMessage - SDK message object
 * @returns {string|null} Model name
 */
function extractModel(sdkMessage) {
  if (sdkMessage.model) {
    return sdkMessage.model;
  }

  if (sdkMessage.message?.model) {
    return sdkMessage.message.model;
  }

  return null;
}

/**
 * Get JSONL file path for a session
 *
 * @param {string} projectPath - Absolute path to project
 * @param {string} sessionId - Session ID
 * @returns {string} Path to JSONL file
 */
function getJSONLPath(projectPath, sessionId) {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const encodedPath = encodeURIComponent(projectPath);
  return path.join(homeDir, '.claude', 'projects', encodedPath, `${sessionId}.jsonl`);
}

/**
 * Import JSONL file to PostgreSQL
 *
 * Reads SDK's JSONL file and imports messages to database.
 * Skips duplicate messages based on UUID.
 *
 * @param {Object} options - Import options
 * @param {string} options.projectId - Project UUID
 * @param {string} options.userId - User UUID
 * @param {string} options.sessionId - SDK session ID
 * @param {string} options.projectPath - Absolute path to project directory
 * @param {Set<string>} [options.existingMessageIds] - Set of already-imported message UUIDs
 * @returns {Promise<Object>} Import statistics
 */
export async function importJSONLToPostgres({
  projectId,
  userId,
  sessionId,
  projectPath,
  existingMessageIds = new Set()
}) {
  const stats = {
    totalLines: 0,
    messagesImported: 0,
    messagesDuplicate: 0,
    messagesSkipped: 0,
    errors: []
  };

  try {
    // Get JSONL file path
    const jsonlPath = getJSONLPath(projectPath, sessionId);

    // Check if file exists
    try {
      await fs.access(jsonlPath);
    } catch {
      // File doesn't exist yet (session may not have started)
      return {
        ...stats,
        fileExists: false,
        path: jsonlPath
      };
    }

    // Read JSONL file
    const content = await fs.readFile(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    stats.totalLines = lines.length;

    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      try {
        const sdkMessage = JSON.parse(line);

        // Extract message UUID (SDK uses 'uuid' or 'id' field)
        const messageId = sdkMessage.uuid || sdkMessage.id;

        // Skip if duplicate
        if (messageId && existingMessageIds.has(messageId)) {
          stats.messagesDuplicate++;
          continue;
        }

        // Extract content
        const content = extractContent(sdkMessage);

        // Skip messages with no content
        if (!content || content.trim() === '') {
          stats.messagesSkipped++;
          continue;
        }

        // Map role
        const role = mapMessageRole(sdkMessage);

        // Extract metadata
        const tokensUsed = extractTokens(sdkMessage);
        const model = extractModel(sdkMessage);

        // Save to database
        await saveChatMessage({
          projectId,
          userId,
          role,
          content,
          tokensUsed,
          model,
          meta: {
            sdkSessionId: sessionId,
            sdkMessageId: messageId,
            sdkMessageType: sdkMessage.type,
            importedAt: new Date().toISOString(),
            lineNumber: i + 1
          }
        });

        // Track as imported
        if (messageId) {
          existingMessageIds.add(messageId);
        }

        stats.messagesImported++;

      } catch (error) {
        // Log parse error and continue
        stats.errors.push({
          line: i + 1,
          error: error.message
        });
        stats.messagesSkipped++;
      }
    }

    return {
      ...stats,
      fileExists: true,
      path: jsonlPath
    };

  } catch (error) {
    throw new Error(`Failed to import JSONL: ${error.message}`);
  }
}

/**
 * Get existing message IDs from database for a project
 *
 * This is used to avoid re-importing duplicate messages.
 *
 * @param {string} projectId - Project UUID
 * @returns {Promise<Set<string>>} Set of message UUIDs already in database
 */
export async function getExistingMessageIds(projectId) {
  const { getChatHistory } = await import('../db/queries.js');

  const messages = await getChatHistory(projectId, 10000); // Get all messages

  const ids = new Set();

  for (const msg of messages) {
    // Extract SDK message ID from meta
    if (msg.meta?.sdkMessageId) {
      ids.add(msg.meta.sdkMessageId);
    }
  }

  return ids;
}

/**
 * Import all JSONL files for a project
 *
 * If a project has multiple sessions, this imports all of them.
 *
 * @param {Object} options - Import options
 * @param {string} options.projectId - Project UUID
 * @param {string} options.userId - User UUID
 * @param {string} options.projectPath - Absolute path to project directory
 * @param {string[]} options.sessionIds - Array of session IDs to import
 * @returns {Promise<Object>} Aggregated statistics
 */
export async function importAllSessions({
  projectId,
  userId,
  projectPath,
  sessionIds
}) {
  const aggregateStats = {
    sessionsProcessed: 0,
    totalMessagesImported: 0,
    totalMessagesDuplicate: 0,
    totalMessagesSkipped: 0,
    totalErrors: 0
  };

  // Get existing message IDs once (to avoid duplicates across sessions)
  const existingMessageIds = await getExistingMessageIds(projectId);

  for (const sessionId of sessionIds) {
    try {
      const stats = await importJSONLToPostgres({
        projectId,
        userId,
        sessionId,
        projectPath,
        existingMessageIds // Pass same set to accumulate IDs
      });

      if (stats.fileExists) {
        aggregateStats.sessionsProcessed++;
        aggregateStats.totalMessagesImported += stats.messagesImported;
        aggregateStats.totalMessagesDuplicate += stats.messagesDuplicate;
        aggregateStats.totalMessagesSkipped += stats.messagesSkipped;
        aggregateStats.totalErrors += stats.errors.length;
      }
    } catch (error) {
      console.error(`Failed to import session ${sessionId}:`, error.message);
      aggregateStats.totalErrors++;
    }
  }

  return aggregateStats;
}

export default {
  importJSONLToPostgres,
  getExistingMessageIds,
  importAllSessions,
  getJSONLPath
};
