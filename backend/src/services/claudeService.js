/**
 * Claude Code Service
 * Integration with Claude Code CLI for AI-powered development assistance
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import memoryService from './memoryService.js';
import { getUserQuotas, logUsage } from '../db/queries.js';

class ClaudeService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // projectId -> session data
    this.commandQueue = new Map(); // projectId -> queue of commands
  }

  /**
   * Initialize Claude Code session for a project
   * @param {string} projectId - Project ID
   * @param {string} projectPath - Absolute path to project directory
   * @param {string} userId - User ID for quota enforcement
   * @returns {Promise<Object>} Session info
   */
  async initializeSession(projectId, projectPath, userId) {
    try {
      // Check if session already exists
      if (this.sessions.has(projectId)) {
        logger.info(`Claude session already exists for project ${projectId}`);
        return this.sessions.get(projectId);
      }

      // Check user quotas before starting
      const quotas = await getUserQuotas(userId);
      if (quotas.quota_exceeded) {
        throw new Error('User quota exceeded. Cannot start Claude session.');
      }

      // Ensure CLAUDE.md exists
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      try {
        await fs.access(claudeMdPath);
      } catch (error) {
        logger.info(`CLAUDE.md not found, initializing for project ${projectId}`);
        await memoryService.initializeMemory(projectId, projectPath, path.basename(projectPath), userId);
      }

      // Create session data
      const session = {
        projectId,
        projectPath,
        userId,
        startedAt: new Date(),
        messageCount: 0,
        tokensUsed: 0,
        isActive: true,
        claudeProcess: null,
        messageHistory: [],
      };

      this.sessions.set(projectId, session);
      this.commandQueue.set(projectId, []);

      logger.info(`Claude session initialized for project ${projectId}`);
      return session;
    } catch (error) {
      logger.error(`Failed to initialize Claude session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a message to Claude Code CLI
   * @param {string} projectId - Project ID
   * @param {string} message - User message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response from Claude
   */
  async sendMessage(projectId, message, options = {}) {
    try {
      const session = this.sessions.get(projectId);
      if (!session) {
        throw new Error('Session not initialized. Call initializeSession first.');
      }

      if (!session.isActive) {
        throw new Error('Session is not active');
      }

      // Check quotas before processing
      const quotas = await getUserQuotas(session.userId);
      if (quotas.quota_exceeded) {
        throw new Error('Quota exceeded');
      }

      // Add user message to history
      session.messageHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });

      // Emit typing event
      this.emit('ai-typing', { projectId });

      // Execute Claude Code CLI command
      const response = await this._executeClaudeCommand(projectId, message, options);

      // Add assistant response to history
      session.messageHistory.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      });

      // Update session stats
      session.messageCount++;
      session.tokensUsed += response.tokensUsed || 0;

      // Log usage
      await logUsage({
        userId: session.userId,
        projectId,
        kind: 'tokens',
        amount: response.tokensUsed || 0,
        cost: (response.tokensUsed || 0) * 0.000001, // Approximate cost
        meta: {
          model: response.model || 'claude-3-sonnet',
          messageLength: message.length,
        },
      });

      // Update CLAUDE.md with conversation context periodically
      if (session.messageCount % 5 === 0) {
        await this._updateMemoryFromConversation(projectId);
      }

      return {
        success: true,
        message: response.content,
        tokensUsed: response.tokensUsed,
        model: response.model,
      };
    } catch (error) {
      logger.error(`Failed to send message to Claude: ${error.message}`);
      this.emit('ai-error', { projectId, error: error.message });
      throw error;
    }
  }

  /**
   * Execute Claude Code CLI command
   * @private
   */
  async _executeClaudeCommand(projectId, message, options = {}) {
    const session = this.sessions.get(projectId);

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 120000; // 2 minutes default
      let response = '';
      let errorOutput = '';
      let tokensUsed = 0;

      // Prepare the command
      // Note: This is a simplified implementation. In production, you'd use the actual Claude Code CLI
      // For now, we'll simulate the interaction by spawning a process that reads CLAUDE.md context
      const args = [
        '--project-path', session.projectPath,
        '--message', message,
        '--format', 'json',
      ];

      // In a real implementation, this would be:
      // const claudeProcess = spawn('claude', args, { cwd: session.projectPath });

      // For MVP, we'll create a wrapper script that simulates Claude Code behavior
      const claudeProcess = spawn('node', [
        path.join(process.cwd(), 'src', 'scripts', 'claude-wrapper.js'),
        ...args,
      ], {
        cwd: session.projectPath,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      });

      const timeoutHandle = setTimeout(() => {
        claudeProcess.kill();
        reject(new Error('Claude command timed out'));
      }, timeout);

      claudeProcess.stdout.on('data', (data) => {
        response += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        logger.warn(`Claude stderr: ${data.toString()}`);
      });

      claudeProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);

        if (code !== 0) {
          reject(new Error(`Claude process exited with code ${code}: ${errorOutput}`));
          return;
        }

        try {
          // Parse JSON response
          const parsed = JSON.parse(response);
          resolve({
            content: parsed.message || parsed.content || response,
            tokensUsed: parsed.tokensUsed || this._estimateTokens(message + response),
            model: parsed.model || 'claude-3-sonnet',
          });
        } catch (error) {
          // If not JSON, return raw response
          resolve({
            content: response.trim(),
            tokensUsed: this._estimateTokens(message + response),
            model: 'claude-3-sonnet',
          });
        }
      });

      claudeProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(new Error(`Failed to spawn Claude process: ${error.message}`));
      });
    });
  }

  /**
   * Update CLAUDE.md with conversation context
   * @private
   */
  async _updateMemoryFromConversation(projectId) {
    try {
      const session = this.sessions.get(projectId);
      if (!session) return;

      // Get recent messages (last 10)
      const recentMessages = session.messageHistory.slice(-10);

      // Format as conversation summary
      const conversationSummary = recentMessages
        .map((msg) => `[${msg.role}]: ${msg.content.substring(0, 200)}...`)
        .join('\n');

      // Update CLAUDE.md with recent conversation context
      const updates = {
        'Recent Conversation': conversationSummary,
        'Last Updated': new Date().toISOString(),
        'Total Messages': session.messageCount.toString(),
        'Tokens Used': session.tokensUsed.toString(),
      };

      await memoryService.updateMemory(
        projectId,
        session.projectPath,
        session.userId,
        updates,
        { source: 'claude_conversation' }
      );

      logger.info(`Updated CLAUDE.md for project ${projectId} with conversation context`);
    } catch (error) {
      logger.error(`Failed to update memory from conversation: ${error.message}`);
    }
  }

  /**
   * Estimate token count (rough approximation)
   * @private
   */
  _estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get session info
   * @param {string} projectId - Project ID
   * @returns {Object|null} Session data
   */
  getSession(projectId) {
    return this.sessions.get(projectId) || null;
  }

  /**
   * Get message history for a project
   * @param {string} projectId - Project ID
   * @param {number} limit - Number of messages to return
   * @returns {Array} Message history
   */
  getMessageHistory(projectId, limit = 50) {
    const session = this.sessions.get(projectId);
    if (!session) return [];

    return session.messageHistory.slice(-limit);
  }

  /**
   * Clear message history
   * @param {string} projectId - Project ID
   */
  clearHistory(projectId) {
    const session = this.sessions.get(projectId);
    if (session) {
      session.messageHistory = [];
      session.messageCount = 0;
      logger.info(`Cleared message history for project ${projectId}`);
    }
  }

  /**
   * End Claude session
   * @param {string} projectId - Project ID
   */
  async endSession(projectId) {
    try {
      const session = this.sessions.get(projectId);
      if (!session) return;

      // Update memory one last time
      if (session.messageHistory.length > 0) {
        await this._updateMemoryFromConversation(projectId);
      }

      // Mark session as inactive
      session.isActive = false;

      // Kill any running process
      if (session.claudeProcess) {
        session.claudeProcess.kill();
      }

      // Remove from active sessions
      this.sessions.delete(projectId);
      this.commandQueue.delete(projectId);

      logger.info(`Claude session ended for project ${projectId}`);
    } catch (error) {
      logger.error(`Failed to end Claude session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get session statistics
   * @param {string} projectId - Project ID
   * @returns {Object} Session stats
   */
  getSessionStats(projectId) {
    const session = this.sessions.get(projectId);
    if (!session) {
      return null;
    }

    return {
      projectId: session.projectId,
      startedAt: session.startedAt,
      messageCount: session.messageCount,
      tokensUsed: session.tokensUsed,
      isActive: session.isActive,
      historyLength: session.messageHistory.length,
    };
  }

  /**
   * Check if session is active
   * @param {string} projectId - Project ID
   * @returns {boolean}
   */
  isSessionActive(projectId) {
    const session = this.sessions.get(projectId);
    return session ? session.isActive : false;
  }
}

// Export singleton instance
const claudeService = new ClaudeService();
export default claudeService;
