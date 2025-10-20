/**
 * Chat API Routes
 * Endpoints for Claude Code chat functionality
 */

import express from 'express';
import claudeService from '../services/claudeService.js';
import { getProjectById } from '../db/queries.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/chat/sessions/:projectId/init
 * Initialize a Claude Code session for a project
 */
router.post('/sessions/:projectId/init', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.id || req.body.userId; // Get from auth or body

    // Get project details
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Verify user owns the project
    if (project.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Initialize session
    const projectPath = project.projectPath || `/var/atlasengine/projects/${projectId}`;
    const session = await claudeService.initializeSession(projectId, projectPath, userId);

    res.json({
      success: true,
      session: {
        projectId: session.projectId,
        startedAt: session.startedAt,
        isActive: session.isActive,
      },
    });
  } catch (error) {
    logger.error(`Failed to initialize chat session: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/chat/sessions/:projectId/message
 * Send a message to Claude
 */
router.post('/sessions/:projectId/message', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;
    const userId = req.user?.id || req.body.userId;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Check if session exists, initialize if needed
    if (!claudeService.isSessionActive(projectId)) {
      const project = await getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      const projectPath = project.projectPath || `/var/atlasengine/projects/${projectId}`;
      await claudeService.initializeSession(projectId, projectPath, userId);
    }

    // Send message
    const response = await claudeService.sendMessage(projectId, message);

    res.json(response);
  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/sessions/:projectId/history
 * Get message history for a session
 */
router.get('/sessions/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const history = claudeService.getMessageHistory(projectId, limit);

    res.json({
      success: true,
      messages: history,
      count: history.length,
    });
  } catch (error) {
    logger.error(`Failed to get message history: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/chat/sessions/:projectId/history
 * Clear message history for a session
 */
router.delete('/sessions/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;

    claudeService.clearHistory(projectId);

    res.json({
      success: true,
      message: 'Message history cleared',
    });
  } catch (error) {
    logger.error(`Failed to clear message history: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/sessions/:projectId/stats
 * Get session statistics
 */
router.get('/sessions/:projectId/stats', async (req, res) => {
  try {
    const { projectId } = req.params;

    const stats = claudeService.getSessionStats(projectId);

    if (!stats) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error(`Failed to get session stats: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/chat/sessions/:projectId
 * End a Claude Code session
 */
router.delete('/sessions/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    await claudeService.endSession(projectId);

    res.json({
      success: true,
      message: 'Session ended',
    });
  } catch (error) {
    logger.error(`Failed to end session: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
