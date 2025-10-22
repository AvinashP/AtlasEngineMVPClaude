/**
 * AtlasEngine MVP - Main Server
 * Express server with all routes and middleware
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';

// Load environment variables
dotenv.config();

// Import database
import db from './src/db/connection.js';

// Import services
import dockerService from './src/services/dockerService.js';
import portRegistry from './src/services/portRegistry.js';
import claudeService from './src/services/claudeService.js';
import memoryService from './src/services/memoryService.js';

// Import middleware
import { enforceQuotas, getQuotaSummary } from './src/middleware/quotas.js';

// Import routes
import projectsRouter from './src/routes/projects.js';
import memoryRouter from './src/routes/memory.js';
import buildsRouter from './src/routes/builds.js';
import previewsRouter from './src/routes/previews.js';
import chatRouter from './src/routes/chat.js';
import devServersRouter from './src/routes/devServers.js';

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new SocketIO(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Server configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
// In development, disable most helmet protections to avoid CORS/CSP issues
if (NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env.CORS_ORIGIN || 'http://localhost:5173'],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  }));
} else {
  // Development: Disable helmet entirely for easier debugging
  // In production, all security headers will be enabled
  console.log('⚠️  Running in development mode - Helmet security headers disabled');
  // Skip helmet entirely in development
}

// CORS - Enhanced configuration for development
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400 // 24 hours
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development only)
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`\n=== Incoming Request ===`);
    console.log(`${req.method} ${req.path}`);
    console.log(`Origin: ${req.headers.origin || 'none'}`);
    console.log(`Authorization: ${req.headers.authorization ? 'present' : 'none'}`);
    console.log(`Content-Type: ${req.headers['content-type'] || 'none'}`);

    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      console.log(`Response Status: ${res.statusCode}`);
      console.log(`======================\n`);
      originalSend.call(this, data);
    };

    next();
  });
}

// Mock authentication middleware (replace with real JWT auth)
app.use((req, res, next) => {
  // For MVP, we use anonymous user by default (no auth required)
  // In production, this would verify JWT tokens and set req.user
  if (req.headers.authorization) {
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'anonymous@atlasengine.local'
    };
  }
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    const dockerHealth = await dockerService.healthCheck();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth.healthy ? 'connected' : 'disconnected',
      docker: dockerHealth.healthy ? 'connected' : 'disconnected',
      portRegistry: {
        available: portRegistry.getStats().available,
        allocated: portRegistry.getStats().allocated,
        utilization: portRegistry.getStats().utilizationPercent + '%'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// API routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects', memoryRouter);
app.use('/api/builds', buildsRouter);
app.use('/api/previews', previewsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/devservers', devServersRouter);

// Quota summary endpoint
app.get('/api/quotas/summary', enforceQuotas, getQuotaSummary);

// Port registry stats (admin only in production)
app.get('/api/admin/ports', (req, res) => {
  const stats = portRegistry.getStats();
  const allocations = portRegistry.getAllocations();

  res.json({
    stats,
    allocations
  });
});

// Docker stats (admin only in production)
app.get('/api/admin/docker', async (req, res) => {
  try {
    const containers = await dockerService.listContainers();
    const health = await dockerService.healthCheck();

    res.json({
      health,
      containers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Claude sessions stats (admin only in production)
app.get('/api/admin/claude-sessions', (req, res) => {
  try {
    const sessions = claudeService.getAllSessions();

    res.json({
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.isActive).length,
      sessions: sessions.map(s => ({
        ...s,
        uptimeFormatted: formatUptime(s.uptime),
        lastActivityRelative: formatRelativeTime(s.lastActivity),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for formatting
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

// Static file server for project previews
app.use('/preview/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { getProjectById } = await import('./src/db/queries.js');
    const project = await getProjectById(projectId);

    if (!project) {
      return res.status(404).send('Project not found');
    }

    // Serve static files from project directory
    const express = await import('express');
    const staticMiddleware = express.default.static(project.path, {
      index: ['index.html', 'index.htm'],
      extensions: ['html', 'htm'],
    });

    staticMiddleware(req, res, next);
  } catch (error) {
    console.error('Static file server error:', error);
    res.status(500).send('Error serving preview');
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// WEBSOCKET
// ============================================================================

// Track active Claude processes per socket
const activeProcesses = new Map(); // socketId -> { process, projectId }
// Track active Claude processes per project to prevent concurrent access
const activeProjectProcesses = new Map(); // projectId -> { process, socketId, startedAt }

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join project room
  socket.on('join-project', (projectId) => {
    socket.join(`project-${projectId}`);
    console.log(`Socket ${socket.id} joined project ${projectId}`);
  });

  // Leave project room
  socket.on('leave-project', (projectId) => {
    socket.leave(`project-${projectId}`);
    console.log(`Socket ${socket.id} left project ${projectId}`);
  });

  // Stop current AI processing
  socket.on('ai-stop', (data) => {
    const { projectId } = data;
    console.log(`Stop requested for socket ${socket.id}, project ${projectId}`);

    const processInfo = activeProcesses.get(socket.id);
    if (processInfo && processInfo.process) {
      console.log(`Killing Claude process for socket ${socket.id}, project ${projectId}`);
      processInfo.process.kill('SIGTERM');
      activeProcesses.delete(socket.id);
      activeProjectProcesses.delete(projectId);

      socket.emit('ai-stopped', { projectId });
      socket.to(`project-${projectId}`).emit('ai-stopped', { projectId });
    }
  });

  // AI chat message handler with streaming support
  socket.on('ai-message', async (data) => {
    const { projectId, message } = data;

    try {
      // Forward typing event
      socket.emit('ai-typing', { projectId });
      socket.to(`project-${projectId}`).emit('ai-typing', { projectId });

      // Get project details and initialize session if needed
      const { getProjectById, saveChatMessage, getChatHistory } = await import('./src/db/queries.js');
      const project = await getProjectById(projectId);

      if (!project) {
        socket.emit('ai-error', { error: 'Project not found' });
        return;
      }

      // Initialize session if needed
      if (!claudeService.isSessionActive(projectId)) {
        await claudeService.initializeSession(projectId, project.path, project.user_id);
      }

      // Save user message to database
      try {
        await saveChatMessage({
          projectId,
          userId: project.user_id,
          role: 'user',
          content: message,
          tokensUsed: 0,
          model: null,
          meta: null,
        });
      } catch (error) {
        console.error('Failed to save user message:', error.message);
      }

      // Load conversation history for context
      let conversationHistory = [];
      try {
        const dbHistory = await getChatHistory(projectId, 10);
        conversationHistory = dbHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));
      } catch (error) {
        console.warn('Failed to load conversation history:', error.message);
      }

      // Get session for project path
      const session = claudeService.getSession(projectId);
      if (!session) {
        socket.emit('ai-error', { error: 'Session not initialized' });
        return;
      }

      // Check if another Claude process is already running for this project
      if (activeProjectProcesses.has(projectId)) {
        const existingProcess = activeProjectProcesses.get(projectId);
        console.log(`Claude process already running for project ${projectId} (started ${Date.now() - existingProcess.startedAt}ms ago)`);
        socket.emit('ai-error', {
          error: 'Another request is already being processed for this project. Please wait for it to complete.'
        });
        return;
      }

      // Spawn Claude CLI directly for streaming
      const { spawn } = await import('child_process');

      // Use projectId as session ID for persistent session across all messages
      // This enables Claude to maintain context and remember conversation history
      const sessionId = projectId;

      // Prepend system instructions to keep Claude within project directory
      const systemInstruction = `IMPORTANT SYSTEM INSTRUCTION: You are working on a user project located at: ${session.projectPath}

You MUST ONLY read, write, or modify files within this directory. DO NOT access or modify any files outside of this directory, including:
- The AtlasEngine MVP codebase at /Users/avinash/Projects/AI/AtlasEngineMVP
- Any system files
- Any files in parent directories

Your working directory is: ${session.projectPath}
Always use relative paths when working with files.

User's request: ${message}`;

      const claudeArgs = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--session-id', sessionId,
        systemInstruction
      ];

      const claudePath = '/opt/homebrew/bin/claude';
      const claudeProcess = spawn(claudePath, claudeArgs, {
        cwd: session.projectPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Register process for stopping (both by socket and project)
      const processInfo = { process: claudeProcess, projectId, socketId: socket.id, startedAt: Date.now() };
      activeProcesses.set(socket.id, processInfo);
      activeProjectProcesses.set(projectId, processInfo);

      let assistantMessage = '';
      let tokensUsed = 0;
      let model = 'claude-sonnet-4-5';
      const toolUseEvents = []; // Collect tool use events for database storage

      // Handle stdout - stream events to client in real-time
      claudeProcess.stdout.on('data', (data) => {
        const rawOutput = data.toString();
        const lines = rawOutput.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const event = JSON.parse(line);

            // Emit raw event to client for debugging
            // console.log('Claude event:', event.type);

            switch (event.type) {
              case 'system':
                if (event.model) {
                  model = event.model;
                }
                // Send system init event
                socket.emit('claude-stream-event', {
                  type: 'system',
                  data: event
                });
                socket.to(`project-${projectId}`).emit('claude-stream-event', {
                  type: 'system',
                  data: event
                });
                break;

              case 'assistant':
                if (event.message) {
                  model = event.message.model || model;

                  // Extract content array
                  if (event.message.content && Array.isArray(event.message.content)) {
                    for (const content of event.message.content) {
                      if (content.type === 'text' && content.text) {
                        // Stream text content
                        assistantMessage += content.text;
                        socket.emit('claude-stream-event', {
                          type: 'text',
                          data: { text: content.text }
                        });
                        socket.to(`project-${projectId}`).emit('claude-stream-event', {
                          type: 'text',
                          data: { text: content.text }
                        });
                      } else if (content.type === 'tool_use') {
                        // Store tool use event for database persistence
                        const toolEvent = {
                          id: content.id,
                          name: content.name,
                          input: content.input
                        };
                        toolUseEvents.push(toolEvent);

                        // Stream tool use event
                        socket.emit('claude-stream-event', {
                          type: 'tool_use',
                          data: toolEvent
                        });
                        socket.to(`project-${projectId}`).emit('claude-stream-event', {
                          type: 'tool_use',
                          data: toolEvent
                        });
                      }
                    }
                  }

                  // Extract token usage
                  if (event.message.usage && event.message.usage.output_tokens) {
                    tokensUsed = event.message.usage.output_tokens;
                  }
                }
                break;

              case 'result':
                // Extract final token usage
                if (event.usage && event.usage.output_tokens) {
                  tokensUsed = event.usage.output_tokens;
                }
                if (event.modelUsage && event.modelUsage['claude-sonnet-4-5-20250929']) {
                  tokensUsed = event.modelUsage['claude-sonnet-4-5-20250929'].outputTokens || tokensUsed;
                }
                break;
            }
          } catch (error) {
            // Non-JSON line, likely verbose debug output - ignore
          }
        }
      });

      // Handle stderr
      claudeProcess.stderr.on('data', (data) => {
        console.error('Claude CLI stderr:', data.toString());
      });

      // Handle process completion
      claudeProcess.on('close', async (code) => {
        // Clean up process from tracking (both maps)
        activeProcesses.delete(socket.id);
        activeProjectProcesses.delete(projectId);
        console.log(`Claude process completed for project ${projectId} with code ${code}`);

        if (code === 0 || code === null || code === 143) { // null means killed by signal, 143 = SIGTERM (stopped by user)
          // Save assistant message to database with tool use events in meta (only if not killed)
          if (code === 0 && assistantMessage) {
            try {
              const meta = toolUseEvents.length > 0 ? { toolUseEvents } : null;
              await saveChatMessage({
                projectId,
                userId: project.user_id,
                role: 'assistant',
                content: assistantMessage || 'No response',
                tokensUsed: tokensUsed || 0,
                model: model,
                meta: meta,
              });
            } catch (error) {
              console.error('Failed to save assistant message:', error.message);
            }

            // Analyze tool use and intelligently update CLAUDE.md memory
            if (toolUseEvents.length > 0) {
              try {
                const memoryUpdate = await memoryService.analyzeAndUpdateFromToolUse(
                  projectId,
                  session.projectPath,
                  project.user_id,
                  toolUseEvents,
                  message,
                  assistantMessage
                );

                if (memoryUpdate.updated) {
                  console.log(`✅ Memory updated for project ${projectId}:`, memoryUpdate.insights);

                  if (memoryUpdate.checkpointCreated) {
                    console.log(`📸 Auto-checkpoint created for milestone`);
                  }
                }
              } catch (error) {
                console.error('Failed to update memory from tool use:', error.message);
                // Don't fail the request if memory update fails
              }
            }
          }

          // Send completion event
          socket.emit('claude-complete', {
            tokensUsed,
            model,
            exitCode: code
          });
          socket.to(`project-${projectId}`).emit('claude-complete', {
            tokensUsed,
            model,
            exitCode: code
          });

          // Update session stats
          if (session) {
            session.messageCount++;
            session.tokensUsed += tokensUsed || 0;
          }
        } else {
          socket.emit('ai-error', { error: `Claude CLI exited with code ${code}` });
        }
      });

      // Handle process errors
      claudeProcess.on('error', (error) => {
        console.error('Claude CLI process error:', error);
        // Clean up process from tracking (both maps)
        activeProcesses.delete(socket.id);
        activeProjectProcesses.delete(projectId);
        socket.emit('ai-error', { error: error.message });
      });

      // Close stdin
      claudeProcess.stdin.end();

    } catch (error) {
      console.error('AI message error:', error);
      socket.emit('ai-error', { error: error.message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Clean up any running Claude process for this socket
    const processInfo = activeProcesses.get(socket.id);
    if (processInfo) {
      console.log(`Cleaning up Claude process for disconnected socket ${socket.id}, project ${processInfo.projectId}`);
      try {
        processInfo.process.kill('SIGTERM');
      } catch (error) {
        console.error(`Failed to kill process: ${error.message}`);
      }
      activeProcesses.delete(socket.id);
      activeProjectProcesses.delete(processInfo.projectId);
    }
  });
});

// Emit build events (to be called from build service)
export function emitBuildEvent(projectId, event, data) {
  io.to(`project-${projectId}`).emit(`build-${event}`, data);
}

// Emit deployment events
export function emitDeployEvent(projectId, event, data) {
  io.to(`project-${projectId}`).emit(`deploy-${event}`, data);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize() {
  console.log('🚀 Initializing AtlasEngine MVP...');

  try {
    // Initialize database
    console.log('📊 Checking database connection...');
    const dbHealthy = await db.initialize();

    if (!dbHealthy) {
      console.error('❌ Database not initialized. Please run: ./backend/scripts/init-db.sh');
      process.exit(1);
    }

    // Initialize Docker network
    console.log('🐳 Initializing Docker network...');
    await dockerService.initializeNetwork();

    // Clean up stopped containers from previous runs
    console.log('🧹 Cleaning up stopped containers...');
    await dockerService.cleanupStoppedContainers();

    console.log('✅ Initialization complete!');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// ============================================================================
// SERVER START
// ============================================================================

async function start() {
  await initialize();

  httpServer.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                 AtlasEngine MVP Server                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server running on: http://localhost:${PORT}`);
    console.log(`📝 Environment: ${NODE_ENV}`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    console.log('');
    console.log('Available endpoints:');
    console.log('  POST   /api/projects                 - Create project');
    console.log('  GET    /api/projects                 - List projects');
    console.log('  GET    /api/projects/:id             - Get project');
    console.log('  POST   /api/projects/:id/build       - Build project');
    console.log('  POST   /api/projects/:id/deploy      - Deploy project');
    console.log('  GET    /api/projects/:id/memory      - Get CLAUDE.md');
    console.log('  POST   /api/projects/:id/memory      - Update CLAUDE.md');
    console.log('  POST   /api/projects/:id/memory/checkpoint - Create checkpoint');
    console.log('  GET    /api/builds/:id               - Get build details');
    console.log('  GET    /api/previews/:id             - Get preview details');
    console.log('  DELETE /api/previews/:id             - Stop preview');
    console.log('  GET    /api/quotas/summary           - Get quota usage');
    console.log('  POST   /api/chat/sessions/:id/init   - Initialize chat session');
    console.log('  POST   /api/chat/sessions/:id/message - Send chat message');
    console.log('  GET    /api/chat/sessions/:id/history - Get chat history');
    console.log('');
    console.log('WebSocket events:');
    console.log('  ai-message                           - Send message to Claude');
    console.log('  ai-response                          - Receive Claude response');
    console.log('  ai-typing                            - Claude is typing');
    console.log('  ai-error                             - Error occurred');
    console.log('');
    console.log('Ready to accept requests! 🎉');
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');

  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  await db.close();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Export for testing
export { app, io };
