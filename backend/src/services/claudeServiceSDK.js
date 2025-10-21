import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ClaudeServiceSDK - Official SDK integration for Claude Code
 *
 * This service wraps the @anthropic-ai/claude-code SDK to provide:
 * - Streaming query execution with real-time updates
 * - Session continuity via JSONL-based resume
 * - Permission mode configuration
 * - Abort controller support for cancellation
 * - Automatic project path validation
 *
 * Advantages over CLI spawning:
 * - Official SDK with better reliability
 * - Built-in session management (JSONL persistence)
 * - Structured message format (no stdout parsing)
 * - Better error handling and cancellation
 * - TypeScript type safety
 */
class ClaudeServiceSDK {
  constructor() {
    this.activeQueries = new Map(); // Track active queries for abort support
  }

  /**
   * Execute a Claude query with streaming responses
   *
   * @param {Object} options - Query options
   * @param {string} options.message - User message/prompt to send to Claude
   * @param {string} options.projectPath - Absolute path to project directory (working directory)
   * @param {string} [options.sessionId] - Session ID for conversation continuity (resume from JSONL)
   * @param {string} [options.permissionMode='normal'] - Permission mode: 'normal', 'always', 'never'
   * @param {AbortController} [options.abortController] - Optional abort controller for cancellation
   * @param {string} [options.queryId] - Unique query ID for tracking
   *
   * @yields {Object} SDK message object with type, data, and metadata
   *
   * @example
   * const service = new ClaudeServiceSDK();
   *
   * for await (const msg of service.executeQuery({
   *   message: "Create a new React component",
   *   projectPath: "/Users/alice/projects/my-app",
   *   sessionId: "session-1729464523",
   *   permissionMode: "normal"
   * })) {
   *   console.log(msg.type, msg.data);
   * }
   */
  async* executeQuery(options) {
    const {
      message,
      projectPath,
      sessionId = null,
      permissionMode = 'normal',
      abortController = new AbortController(),
      queryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    } = options;

    // Validation
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string');
    }

    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Project path is required and must be a string');
    }

    if (!['normal', 'always', 'never'].includes(permissionMode)) {
      throw new Error(`Invalid permission mode: ${permissionMode}. Must be 'normal', 'always', or 'never'`);
    }

    // Track active query
    this.activeQueries.set(queryId, {
      abortController,
      startTime: Date.now(),
      message: message.substring(0, 100), // First 100 chars for debugging
      projectPath
    });

    try {
      // Ensure project directory exists before running SDK
      try {
        await fs.access(projectPath);
      } catch {
        // Directory doesn't exist, create it
        await fs.mkdir(projectPath, { recursive: true });
        console.log(`Created project directory: ${projectPath}`);
      }

      // Call SDK's query function
      // The SDK automatically:
      // 1. Saves messages to ~/.claude/projects/<encoded-path>/<sessionId>.jsonl
      // 2. Resumes from JSONL if sessionId is provided
      // 3. Streams responses in real-time
      const queryOptions = {
        cwd: projectPath,
        permissionMode,
        signal: abortController.signal
      };

      // Add resume option if session ID provided
      if (sessionId) {
        queryOptions.resume = sessionId;
      }

      // Stream messages from SDK
      let messageCount = 0;
      let tokenCount = 0;

      // Call SDK with correct API signature
      for await (const sdkMessage of query({
        prompt: message,
        options: queryOptions
      })) {
        messageCount++;

        // Track token usage if available
        if (sdkMessage.usage?.output_tokens) {
          tokenCount += sdkMessage.usage.output_tokens;
        }

        // Yield message to caller (will be streamed to frontend)
        yield {
          ...sdkMessage,
          // Add metadata for our tracking
          _meta: {
            queryId,
            messageCount,
            tokenCount,
            timestamp: new Date().toISOString()
          }
        };
      }

      // Query completed successfully
      yield {
        type: 'query_complete',
        data: {
          queryId,
          messageCount,
          tokenCount,
          duration: Date.now() - this.activeQueries.get(queryId).startTime
        },
        _meta: {
          queryId,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      // Handle abort
      if (error.name === 'AbortError') {
        yield {
          type: 'query_aborted',
          data: {
            queryId,
            message: 'Query was cancelled by user',
            duration: Date.now() - this.activeQueries.get(queryId).startTime
          },
          _meta: {
            queryId,
            timestamp: new Date().toISOString()
          }
        };
        return;
      }

      // Handle other errors
      yield {
        type: 'error',
        data: {
          queryId,
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        _meta: {
          queryId,
          timestamp: new Date().toISOString()
        }
      };

      throw error; // Re-throw for caller to handle
    } finally {
      // Clean up tracking
      this.activeQueries.delete(queryId);
    }
  }

  /**
   * Abort an active query
   *
   * @param {string} queryId - Query ID to abort
   * @returns {boolean} True if query was found and aborted
   */
  abortQuery(queryId) {
    const query = this.activeQueries.get(queryId);
    if (query) {
      query.abortController.abort();
      return true;
    }
    return false;
  }

  /**
   * Get information about active queries
   *
   * @returns {Array} List of active query metadata
   */
  getActiveQueries() {
    return Array.from(this.activeQueries.entries()).map(([id, data]) => ({
      queryId: id,
      duration: Date.now() - data.startTime,
      message: data.message,
      projectPath: data.projectPath
    }));
  }

  /**
   * Abort all active queries
   *
   * @returns {number} Number of queries aborted
   */
  abortAllQueries() {
    let count = 0;
    for (const [queryId, query] of this.activeQueries.entries()) {
      query.abortController.abort();
      count++;
    }
    return count;
  }

  /**
   * Generate a session ID for a new conversation
   *
   * Session IDs are used by the SDK to identify conversation history in JSONL files.
   * Format: session-<timestamp>-<random>
   *
   * @returns {string} New session ID
   */
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the JSONL file path for a session
   *
   * This is where the SDK stores conversation history.
   * Path: ~/.claude/projects/<encoded-project-path>/<sessionId>.jsonl
   *
   * @param {string} projectPath - Absolute path to project
   * @param {string} sessionId - Session ID
   * @returns {string} Path to JSONL file
   */
  getJSONLPath(projectPath, sessionId) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const encodedPath = encodeURIComponent(projectPath);
    return path.join(homeDir, '.claude', 'projects', encodedPath, `${sessionId}.jsonl`);
  }

  /**
   * Check if a session has existing history
   *
   * @param {string} projectPath - Absolute path to project
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if JSONL file exists
   */
  async hasSessionHistory(projectPath, sessionId) {
    const fs = await import('fs/promises');
    const jsonlPath = this.getJSONLPath(projectPath, sessionId);

    try {
      await fs.access(jsonlPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session statistics
   *
   * @param {string} projectPath - Absolute path to project
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session stats (messageCount, fileSize, lastModified)
   */
  async getSessionStats(projectPath, sessionId) {
    const fs = await import('fs/promises');
    const jsonlPath = this.getJSONLPath(projectPath, sessionId);

    try {
      const stats = await fs.stat(jsonlPath);
      const content = await fs.readFile(jsonlPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      return {
        exists: true,
        messageCount: lines.length,
        fileSize: stats.size,
        lastModified: stats.mtime,
        path: jsonlPath
      };
    } catch (error) {
      return {
        exists: false,
        messageCount: 0,
        fileSize: 0,
        lastModified: null,
        path: jsonlPath
      };
    }
  }
}

// Export singleton instance
export default new ClaudeServiceSDK();

// Also export class for testing
export { ClaudeServiceSDK };
