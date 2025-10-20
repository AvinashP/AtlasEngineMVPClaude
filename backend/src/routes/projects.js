/**
 * Project Routes
 * CRUD operations for projects with memory initialization
 */

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  createProject,
  getProjectById,
  getProjectBySessionId,
  getUserProjects,
  updateProjectLastAccessed
} from '../db/queries.js';
import memoryService from '../services/memoryService.js';
import dockerService from '../services/dockerService.js';
import { enforceQuotas, checkBuildQuota, checkContainerQuota } from '../middleware/quotas.js';

const router = express.Router();

// Base projects directory from environment
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), '../projects');

/**
 * POST /api/projects
 * Create a new project with memory initialization
 */
router.post('/', enforceQuotas, async (req, res) => {
  try {
    const { name, description, framework, language } = req.body;
    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Generate unique session ID
    const sessionId = uuidv4();

    // Create project directory
    const projectPath = path.join(PROJECTS_DIR, `${userId || 'anonymous'}_${sessionId}`);
    await fs.mkdir(projectPath, { recursive: true });

    // Create project in database
    const project = await createProject({
      userId,
      sessionId,
      name,
      description,
      path: projectPath,
      framework,
      language
    });

    // Initialize memory system
    await memoryService.initializeMemory(
      project.id,
      projectPath,
      name,
      userId,
      { framework, language, description }
    );

    res.status(201).json({
      success: true,
      project: {
        id: project.id,
        sessionId: project.session_id,
        name: project.name,
        description: project.description,
        framework: project.framework,
        language: project.language,
        hasMemory: true,
        createdAt: project.created_at
      }
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects
 * List user's projects
 */
router.get('/', enforceQuotas, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit = 50, offset = 0, status = 'active' } = req.query;

    const projects = await getUserProjects(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status
    });

    res.json({
      success: true,
      projects: projects.map(p => ({
        id: p.id,
        sessionId: p.session_id,
        name: p.name,
        description: p.description,
        framework: p.framework,
        language: p.language,
        hasMemory: p.has_memory,
        memorySize: p.memory_size,
        status: p.status,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        lastAccessed: p.last_accessed
      })),
      total: projects.length
    });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/**
 * GET /api/projects/:id
 * Get project details
 */
router.get('/:id', enforceQuotas, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Update last accessed
    await updateProjectLastAccessed(id);

    res.json({
      success: true,
      project: {
        id: project.id,
        sessionId: project.session_id,
        name: project.name,
        description: project.description,
        framework: project.framework,
        language: project.language,
        path: project.path,
        hasMemory: project.has_memory,
        memorySize: project.memory_size,
        lastMemoryUpdate: project.last_memory_update,
        status: project.status,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        lastAccessed: project.last_accessed
      }
    });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * GET /api/projects/session/:sessionId
 * Get project by session ID
 */
router.get('/session/:sessionId', enforceQuotas, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    const project = await getProjectBySessionId(sessionId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({
      success: true,
      project: {
        id: project.id,
        sessionId: project.session_id,
        name: project.name,
        description: project.description,
        framework: project.framework,
        language: project.language,
        hasMemory: project.has_memory,
        createdAt: project.created_at
      }
    });
  } catch (error) {
    console.error('Error getting project by session:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * PATCH /api/projects/:id
 * Update project details
 */
router.patch('/:id', enforceQuotas, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { name, description, framework, language } = req.body;

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Note: In a full implementation, we'd have an updateProject query
    // For now, this is a placeholder
    res.json({
      success: true,
      message: 'Project update endpoint - to be implemented with updateProject query'
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 * Archive a project (soft delete)
 */
router.delete('/:id', enforceQuotas, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Note: In a full implementation, we'd update status to 'archived'
    // For now, this is a placeholder
    res.json({
      success: true,
      message: 'Project archive endpoint - to be implemented with updateProject query'
    });
  } catch (error) {
    console.error('Error archiving project:', error);
    res.status(500).json({ error: 'Failed to archive project' });
  }
});

/**
 * POST /api/projects/:id/build
 * Trigger a build for the project
 */
router.post('/:id/build', enforceQuotas, checkBuildQuota, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Trigger build asynchronously
    const buildResult = await dockerService.buildProject(
      project.id,
      project.path,
      userId
    );

    res.json({
      success: buildResult.success,
      buildId: buildResult.buildId,
      message: buildResult.success ? 'Build completed successfully' : 'Build failed',
      logs: buildResult.logs,
      error: buildResult.error
    });
  } catch (error) {
    console.error('Error triggering build:', error);
    res.status(500).json({ error: 'Failed to trigger build' });
  }
});

/**
 * POST /api/projects/:id/deploy
 * Deploy a project
 */
router.post('/:id/deploy', enforceQuotas, checkContainerQuota, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { buildId } = req.body;

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Deploy project
    const deployResult = await dockerService.deployProject(
      project.id,
      project.path,
      userId,
      buildId
    );

    res.json({
      success: deployResult.success,
      preview: {
        id: deployResult.previewId,
        containerId: deployResult.containerId,
        containerName: deployResult.containerName,
        port: deployResult.port,
        host: deployResult.host,
        url: deployResult.url
      }
    });
  } catch (error) {
    console.error('Error deploying project:', error);
    res.status(500).json({ error: 'Failed to deploy project' });
  }
});

/**
 * GET /api/projects/:id/files
 * List project files
 */
router.get('/:id/files', enforceQuotas, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { path: relativePath = '' } = req.query;

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const targetPath = path.join(project.path, relativePath);

    // Security check: ensure path is within project directory
    if (!targetPath.startsWith(project.path)) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    const files = await fs.readdir(targetPath, { withFileTypes: true });

    const fileList = files.map(file => ({
      name: file.name,
      type: file.isDirectory() ? 'directory' : 'file',
      path: path.join(relativePath, file.name)
    }));

    res.json({
      success: true,
      files: fileList,
      currentPath: relativePath
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * GET /api/projects/:id/files/content
 * Get file content
 */
router.get('/:id/files/content', enforceQuotas, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { path: relativePath } = req.query;

    if (!relativePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const targetPath = path.join(project.path, relativePath);

    // Security check: ensure path is within project directory
    if (!targetPath.startsWith(project.path)) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    const content = await fs.readFile(targetPath, 'utf8');

    res.json({
      success: true,
      content,
      path: relativePath
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

/**
 * PUT /api/projects/:id/files/content
 * Update file content
 */
router.put('/:id/files/content', enforceQuotas, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { path: relativePath, content } = req.body;

    if (!relativePath || content === undefined) {
      return res.status(400).json({ error: 'File path and content are required' });
    }

    const project = await getProjectById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const targetPath = path.join(project.path, relativePath);

    // Security check: ensure path is within project directory
    if (!targetPath.startsWith(project.path)) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    await fs.writeFile(targetPath, content, 'utf8');

    res.json({
      success: true,
      message: 'File updated successfully',
      path: relativePath
    });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

export default router;
