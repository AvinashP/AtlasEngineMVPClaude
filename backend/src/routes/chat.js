/**
 * Chat API Routes
 * Endpoints for Claude Code chat functionality
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import claudeService from '../services/claudeService.js';
import {
  getProjectById,
  getChatHistory,
  clearChatHistory,
  getChatStats
} from '../db/queries.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const { projectId } = req.params;
      const uploadDir = path.join(process.cwd(), 'projects', projectId, 'uploads');

      // Create uploads directory if it doesn't exist
      await fs.mkdir(uploadDir, { recursive: true });

      cb(null, uploadDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    // Use timestamp + original filename to avoid collisions
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

// File filter: Only allow images (JPEG, PNG, GIF, WebP)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

// Multer upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 3.75 * 1024 * 1024, // 3.75 MB limit
    files: 20 // Max 20 files per request
  }
});

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
 * POST /api/chat/sessions/:projectId/upload
 * Upload files (images) for use in chat messages
 */
router.post('/sessions/:projectId/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.id || req.body.userId || '00000000-0000-0000-0000-000000000000'; // Default to all-zeros UUID for MVP

    // Verify project exists and user owns it
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Database uses snake_case (user_id) not camelCase (userId)
    // For MVP, also accept if project uses the default all-zeros UUID
    const isAuthorized = project.user_id === userId ||
                         project.user_id === '00000000-0000-0000-0000-000000000000';

    if (!isAuthorized) {
      logger.warn(`Upload auth failed: project.user_id=${project.user_id}, userId=${userId}`);
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    // Return file metadata
    const files = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
      // Relative path for easier frontend access
      relativePath: path.join('uploads', file.filename),
    }));

    logger.info(`Uploaded ${files.length} file(s) for project ${projectId}`);

    res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error) {
    logger.error(`Failed to upload files: ${error.message}`);

    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 3.75 MB limit',
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum 20 files allowed per upload',
      });
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/chat/sessions/:projectId/message
 * Send a message to Claude (with optional file attachments)
 */
router.post('/sessions/:projectId/message', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message, attachments } = req.body; // attachments is an array of file paths
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

    // Send message with optional attachments
    const response = await claudeService.sendMessage(projectId, message, attachments);

    res.json(response);
  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/sessions/:projectId/history
 * Get message history for a session (from database)
 */
router.get('/sessions/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Get persistent history from database
    const history = await getChatHistory(projectId, limit, offset);

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
 * Clear message history for a session (both database and in-memory)
 */
router.delete('/sessions/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Clear in-memory history
    claudeService.clearHistory(projectId);

    // Clear persistent history from database
    const deletedCount = await clearChatHistory(projectId);

    res.json({
      success: true,
      message: 'Message history cleared',
      deletedCount,
    });
  } catch (error) {
    logger.error(`Failed to clear message history: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/sessions/:projectId/stats
 * Get session statistics (from database and active session)
 */
router.get('/sessions/:projectId/stats', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get persistent stats from database
    const dbStats = await getChatStats(projectId);

    // Get active session stats if session exists
    const sessionStats = claudeService.getSessionStats(projectId);

    res.json({
      success: true,
      stats: {
        // Persistent stats (database)
        persistent: dbStats,
        // Active session stats (in-memory)
        session: sessionStats,
      },
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
