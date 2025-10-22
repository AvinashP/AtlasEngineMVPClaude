/**
 * Development Server Service
 * Manages development servers for projects (Vite, Next.js, etc.)
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import portRegistry from './portRegistry.js';

class DevServerService {
  constructor() {
    // Map of projectId -> { process, port, status, logs }
    this.servers = new Map();
  }

  /**
   * Detect project type by reading package.json
   */
  async detectProjectType(projectPath, port) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      // Check dependencies and scripts
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const scripts = packageJson.scripts || {};

      if (deps.vite || scripts.dev?.includes('vite')) {
        return { type: 'vite', command: 'npm', args: ['run', 'dev', '--', '--port', port.toString(), '--host'] };
      }

      if (deps.next || scripts.dev?.includes('next')) {
        return { type: 'next', command: 'npm', args: ['run', 'dev', '--', '--port', port.toString()] };
      }

      if (deps['react-scripts']) {
        return { type: 'cra', command: 'npm', args: ['start'], env: { PORT: port.toString() } };
      }

      return null; // Not a recognized dev server project
    } catch (error) {
      console.error('Failed to detect project type:', error.message);
      return null;
    }
  }

  /**
   * Check if node_modules exists
   */
  async hasNodeModules(projectPath) {
    try {
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      await fs.access(nodeModulesPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install dependencies
   */
  async installDependencies(projectId, projectPath) {
    return new Promise((resolve, reject) => {
      console.log(`📦 Installing dependencies for project ${projectId}...`);

      const installProcess = spawn('npm', ['install'], {
        cwd: projectPath,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';

      installProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[${projectId}] ${data.toString().trim()}`);
      });

      installProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[${projectId}] ${data.toString().trim()}`);
      });

      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Dependencies installed for project ${projectId}`);
          resolve({ success: true, stdout, stderr });
        } else {
          console.error(`❌ Failed to install dependencies for project ${projectId}`);
          reject(new Error(`npm install failed with code ${code}\n${stderr}`));
        }
      });
    });
  }

  /**
   * Start development server
   */
  async startDevServer(projectId, projectPath, userId) {
    try {
      // Check if already running
      if (this.servers.has(projectId)) {
        const existing = this.servers.get(projectId);
        if (existing.status === 'running') {
          console.log(`Dev server already running for project ${projectId}`);
          return {
            success: true,
            port: existing.port,
            url: `http://localhost:${existing.port}`,
            status: 'running',
          };
        }
      }

      // Allocate port first (needed for some frameworks like Vite)
      const port = await portRegistry.allocatePort(projectId, userId);
      console.log(`📡 Allocated port ${port} for dev server`);

      // Detect project type with port
      const projectType = await this.detectProjectType(projectPath, port);
      if (!projectType) {
        await portRegistry.releasePort(port);
        throw new Error('Not a recognized dev server project (no Vite, Next.js, or CRA detected)');
      }

      console.log(`🔍 Detected ${projectType.type} project`);

      // Check if node_modules exists
      const hasModules = await this.hasNodeModules(projectPath);
      if (!hasModules) {
        console.log(`📦 node_modules not found, installing dependencies...`);
        await this.installDependencies(projectId, projectPath);
      }

      // Set environment variables for the dev server
      const env = {
        ...process.env,
        // Disable browser auto-open
        BROWSER: 'none',
        // Merge any framework-specific env vars (e.g., CRA uses PORT)
        ...(projectType.env || {}),
      };

      // Start dev server process
      console.log(`🚀 Starting ${projectType.type} dev server on port ${port}...`);
      const serverProcess = spawn(projectType.command, projectType.args, {
        cwd: projectPath,
        env,
        stdio: 'pipe',
      });

      const serverInfo = {
        process: serverProcess,
        port,
        status: 'starting',
        logs: [],
        projectType: projectType.type,
        startedAt: new Date(),
      };

      this.servers.set(projectId, serverInfo);

      // Capture logs
      serverProcess.stdout.on('data', (data) => {
        const log = data.toString();
        serverInfo.logs.push({ type: 'stdout', message: log, timestamp: new Date() });
        console.log(`[${projectId}:${port}] ${log.trim()}`);

        // Detect actual port from Vite output (in case it auto-incremented)
        // Vite outputs: "➜  Local:   http://localhost:3005/"
        const vitePortMatch = log.match(/Local:\s+http:\/\/localhost:(\d+)/);
        if (vitePortMatch) {
          const actualPort = parseInt(vitePortMatch[1], 10);
          if (actualPort !== port) {
            console.log(`⚠️  Vite auto-incremented port: ${port} → ${actualPort}`);
            // Release old port and update to actual port
            portRegistry.releasePort(port);
            serverInfo.port = actualPort;
            port = actualPort; // Update local variable for logging
          }
        }

        // Detect when server is ready
        if (
          log.includes('ready in') || // Vite
          log.includes('Local:') || // Vite
          log.includes('compiled successfully') || // Next.js/CRA
          log.includes('started server on')  // Next.js
        ) {
          serverInfo.status = 'running';
          console.log(`✅ Dev server running for ${projectId} on http://localhost:${serverInfo.port}`);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        const log = data.toString();
        serverInfo.logs.push({ type: 'stderr', message: log, timestamp: new Date() });
        console.error(`[${projectId}:${port}] ${log.trim()}`);
      });

      serverProcess.on('close', (code) => {
        console.log(`Dev server stopped for ${projectId} (exit code: ${code})`);
        serverInfo.status = 'stopped';
        this.servers.delete(projectId);
        portRegistry.releasePort(port);
      });

      serverProcess.on('error', (error) => {
        console.error(`Dev server error for ${projectId}:`, error);
        serverInfo.status = 'error';
        serverInfo.error = error.message;
      });

      // Wait for server to be ready (max 30 seconds)
      const maxWait = 30000;
      const startTime = Date.now();
      while (serverInfo.status === 'starting' && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (serverInfo.status !== 'running') {
        throw new Error('Dev server failed to start within 30 seconds');
      }

      return {
        success: true,
        port: serverInfo.port, // Use actual port (may have auto-incremented)
        url: `http://localhost:${serverInfo.port}`,
        status: 'running',
        projectType: projectType.type,
      };
    } catch (error) {
      console.error(`Failed to start dev server for ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Stop development server
   */
  async stopDevServer(projectId) {
    const serverInfo = this.servers.get(projectId);
    if (!serverInfo) {
      return { success: false, message: 'No dev server running for this project' };
    }

    try {
      console.log(`🛑 Stopping dev server for ${projectId}...`);

      // Kill the process
      serverInfo.process.kill('SIGTERM');

      // Wait a bit for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Force kill if still running
      if (!serverInfo.process.killed) {
        serverInfo.process.kill('SIGKILL');
      }

      // Release port
      await portRegistry.releasePort(serverInfo.port);

      // Remove from map
      this.servers.delete(projectId);

      console.log(`✅ Dev server stopped for ${projectId}`);
      return { success: true, message: 'Dev server stopped' };
    } catch (error) {
      console.error(`Failed to stop dev server for ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get dev server status
   */
  getDevServerStatus(projectId) {
    const serverInfo = this.servers.get(projectId);
    if (!serverInfo) {
      return { running: false };
    }

    return {
      running: true,
      port: serverInfo.port,
      url: `http://localhost:${serverInfo.port}`,
      status: serverInfo.status,
      projectType: serverInfo.projectType,
      startedAt: serverInfo.startedAt,
      uptime: Date.now() - serverInfo.startedAt.getTime(),
    };
  }

  /**
   * Get dev server logs
   */
  getDevServerLogs(projectId, limit = 100) {
    const serverInfo = this.servers.get(projectId);
    if (!serverInfo) {
      return [];
    }

    return serverInfo.logs.slice(-limit);
  }

  /**
   * Stop all dev servers (cleanup on shutdown)
   */
  async stopAllDevServers() {
    console.log('🧹 Stopping all dev servers...');
    const promises = [];
    for (const [projectId] of this.servers) {
      promises.push(this.stopDevServer(projectId));
    }
    await Promise.allSettled(promises);
    console.log('✅ All dev servers stopped');
  }
}

// Singleton instance
const devServerService = new DevServerService();

// Cleanup on process exit
process.on('SIGINT', async () => {
  await devServerService.stopAllDevServers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await devServerService.stopAllDevServers();
  process.exit(0);
});

export default devServerService;
