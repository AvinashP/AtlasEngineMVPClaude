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

// Import middleware
import { enforceQuotas, getQuotaSummary } from './src/middleware/quotas.js';

// Import routes
import projectsRouter from './src/routes/projects.js';
import memoryRouter from './src/routes/memory.js';
import buildsRouter from './src/routes/builds.js';
import previewsRouter from './src/routes/previews.js';
import chatRouter from './src/routes/chat.js';

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
  // For MVP, we'll use a mock user
  // In production, this would verify JWT tokens
  if (req.headers.authorization) {
    req.user = {
      id: 'test-user-id',
      email: 'test@atlasengine.dev'
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

  // AI chat message handler
  socket.on('ai-message', async (data) => {
    const { projectId, message } = data;

    try {
      // Forward typing event
      socket.to(`project-${projectId}`).emit('ai-typing', { projectId });

      // Initialize session if needed
      if (!claudeService.isSessionActive(projectId)) {
        // For MVP, use mock user ID - replace with actual auth
        const userId = 'test-user-id';
        const projectPath = `/var/atlasengine/projects/${projectId}`;
        await claudeService.initializeSession(projectId, projectPath, userId);
      }

      // Send message to Claude
      const response = await claudeService.sendMessage(projectId, message);

      // Send response back to client
      socket.emit('ai-response', {
        message: response.message,
        tokensUsed: response.tokensUsed,
        model: response.model,
      });

      // Also broadcast to project room
      socket.to(`project-${projectId}`).emit('ai-response', {
        message: response.message,
        tokensUsed: response.tokensUsed,
        model: response.model,
      });
    } catch (error) {
      console.error('AI message error:', error);
      socket.emit('ai-error', { error: error.message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
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
