/**
 * JSONL Sync Job
 *
 * Background job that periodically syncs JSONL files from Claude SDK to PostgreSQL.
 * This enables fast database queries while keeping JSONL as source of truth.
 *
 * Run Frequency: Every 5 minutes (configurable)
 * What it does:
 * 1. Query all projects with claude_session_id
 * 2. For each project, import JSONL to PostgreSQL
 * 3. Skip duplicate messages
 * 4. Log statistics
 */

import { importJSONLToPostgres, getExistingMessageIds } from '../services/jsonlImporter.js';
import db from '../db/connection.js';

// Sync configuration
const SYNC_INTERVAL = parseInt(process.env.JSONL_SYNC_INTERVAL_MS) || 5 * 60 * 1000; // 5 minutes
const ENABLED = process.env.JSONL_SYNC_ENABLED !== 'false'; // Enabled by default

// Job state
let syncInterval = null;
let isRunning = false;
let lastSyncTime = null;
let lastSyncStats = null;

/**
 * Get all projects with active Claude sessions
 *
 * @returns {Promise<Array>} Projects with claude_session_id
 */
async function getProjectsWithSessions() {
  const result = await db.query(`
    SELECT id, user_id, name, path, claude_session_id
    FROM projects
    WHERE claude_session_id IS NOT NULL
      AND status = 'active'
    ORDER BY updated_at DESC
  `);

  return result.rows;
}

/**
 * Sync JSONL files to PostgreSQL for all projects
 *
 * This is the main sync function that runs periodically.
 *
 * @returns {Promise<Object>} Sync statistics
 */
export async function syncAllProjects() {
  if (isRunning) {
    console.log('[JSONL Sync] Already running, skipping this cycle');
    return lastSyncStats;
  }

  isRunning = true;
  const startTime = Date.now();

  const stats = {
    startTime: new Date().toISOString(),
    projectsProcessed: 0,
    projectsWithNewMessages: 0,
    totalMessagesImported: 0,
    totalMessagesDuplicate: 0,
    totalMessagesSkipped: 0,
    totalErrors: 0,
    duration: 0,
    projects: []
  };

  try {
    // Get all projects with sessions
    const projects = await getProjectsWithSessions();

    console.log(`[JSONL Sync] Found ${projects.length} projects with active sessions`);

    // Process each project
    for (const project of projects) {
      try {
        // Get existing message IDs to avoid duplicates
        const existingMessageIds = await getExistingMessageIds(project.id);

        // Import JSONL for this project
        const importStats = await importJSONLToPostgres({
          projectId: project.id,
          userId: project.user_id,
          sessionId: project.claude_session_id,
          projectPath: project.path,
          existingMessageIds
        });

        // Update aggregate stats
        stats.projectsProcessed++;

        if (importStats.messagesImported > 0) {
          stats.projectsWithNewMessages++;
        }

        stats.totalMessagesImported += importStats.messagesImported || 0;
        stats.totalMessagesDuplicate += importStats.messagesDuplicate || 0;
        stats.totalMessagesSkipped += importStats.messagesSkipped || 0;
        stats.totalErrors += importStats.errors?.length || 0;

        // Store project-level stats
        stats.projects.push({
          projectId: project.id,
          projectName: project.name,
          sessionId: project.claude_session_id,
          ...importStats
        });

        // Log if new messages were imported
        if (importStats.messagesImported > 0) {
          console.log(
            `[JSONL Sync] Project "${project.name}": Imported ${importStats.messagesImported} new messages`
          );
        }

      } catch (error) {
        console.error(
          `[JSONL Sync] Error syncing project ${project.id} (${project.name}):`,
          error.message
        );
        stats.totalErrors++;

        stats.projects.push({
          projectId: project.id,
          projectName: project.name,
          error: error.message
        });
      }
    }

    // Calculate duration
    stats.duration = Date.now() - startTime;
    stats.endTime = new Date().toISOString();

    // Log summary
    if (stats.totalMessagesImported > 0 || stats.totalErrors > 0) {
      console.log(
        `[JSONL Sync] Complete: ${stats.projectsProcessed} projects, ` +
        `${stats.totalMessagesImported} messages imported, ` +
        `${stats.totalMessagesDuplicate} duplicates skipped, ` +
        `${stats.totalErrors} errors (${stats.duration}ms)`
      );
    } else {
      console.log(
        `[JSONL Sync] Complete: ${stats.projectsProcessed} projects, ` +
        `no new messages (${stats.duration}ms)`
      );
    }

    // Save stats
    lastSyncTime = new Date();
    lastSyncStats = stats;

    return stats;

  } catch (error) {
    console.error('[JSONL Sync] Fatal error:', error);
    stats.fatalError = error.message;
    stats.duration = Date.now() - startTime;
    lastSyncStats = stats;
    throw error;

  } finally {
    isRunning = false;
  }
}

/**
 * Start the background sync job
 *
 * Runs syncAllProjects() on an interval.
 */
export function startSyncJob() {
  if (!ENABLED) {
    console.log('[JSONL Sync] Disabled via JSONL_SYNC_ENABLED=false');
    return;
  }

  if (syncInterval) {
    console.log('[JSONL Sync] Already started');
    return;
  }

  console.log(`[JSONL Sync] Starting background sync (interval: ${SYNC_INTERVAL}ms)`);

  // Run immediately on startup
  syncAllProjects().catch(error => {
    console.error('[JSONL Sync] Initial sync failed:', error);
  });

  // Schedule periodic syncs
  syncInterval = setInterval(() => {
    syncAllProjects().catch(error => {
      console.error('[JSONL Sync] Sync failed:', error);
    });
  }, SYNC_INTERVAL);

  console.log('[JSONL Sync] Background job started');
}

/**
 * Stop the background sync job
 */
export function stopSyncJob() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[JSONL Sync] Background job stopped');
  }
}

/**
 * Get sync job status
 *
 * @returns {Object} Job status and statistics
 */
export function getSyncStatus() {
  return {
    enabled: ENABLED,
    running: isRunning,
    interval: SYNC_INTERVAL,
    lastSyncTime,
    lastSyncStats: lastSyncStats ? {
      projectsProcessed: lastSyncStats.projectsProcessed,
      projectsWithNewMessages: lastSyncStats.projectsWithNewMessages,
      totalMessagesImported: lastSyncStats.totalMessagesImported,
      totalMessagesDuplicate: lastSyncStats.totalMessagesDuplicate,
      totalErrors: lastSyncStats.totalErrors,
      duration: lastSyncStats.duration,
      startTime: lastSyncStats.startTime,
      endTime: lastSyncStats.endTime
    } : null
  };
}

/**
 * Manually trigger a sync (useful for testing or admin endpoints)
 *
 * @returns {Promise<Object>} Sync statistics
 */
export async function triggerSync() {
  console.log('[JSONL Sync] Manual sync triggered');
  return syncAllProjects();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[JSONL Sync] SIGTERM received, stopping sync job');
  stopSyncJob();
});

process.on('SIGINT', () => {
  console.log('[JSONL Sync] SIGINT received, stopping sync job');
  stopSyncJob();
});

export default {
  startSyncJob,
  stopSyncJob,
  syncAllProjects,
  getSyncStatus,
  triggerSync
};
