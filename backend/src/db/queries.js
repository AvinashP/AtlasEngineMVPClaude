/**
 * Database Query Helpers
 * Reusable query functions for common database operations
 */

import { query, transaction } from './connection.js';

// ============================================================================
// USER QUERIES
// ============================================================================

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
export async function createUser({ email, passwordHash, name, plan = 'free' }) {
  const result = await query(
    `INSERT INTO users (email, password_hash, name, plan)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, plan, created_at`,
    [email, passwordHash, name, plan]
  );

  return result.rows[0];
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User or null
 */
export async function findUserByEmail(email) {
  const result = await query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Find user by ID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} User or null
 */
export async function findUserById(userId) {
  const result = await query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Update user last login
 * @param {string} userId - User UUID
 * @returns {Promise<void>}
 */
export async function updateUserLastLogin(userId) {
  await query(
    'UPDATE users SET last_login = NOW() WHERE id = $1',
    [userId]
  );
}

// ============================================================================
// USER QUOTA QUERIES
// ============================================================================

/**
 * Get user quotas
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} User quotas
 */
export async function getUserQuotas(userId) {
  const result = await query(
    'SELECT * FROM user_quotas WHERE user_id = $1',
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Update token usage
 * @param {string} userId - User UUID
 * @param {number} tokensUsed - Number of tokens used
 * @param {number} cost - Cost in USD
 * @returns {Promise<void>}
 */
export async function updateTokenUsage(userId, tokensUsed, cost) {
  await query(
    `UPDATE user_quotas
     SET tokens_used_this_month = tokens_used_this_month + $1,
         cost_this_month = cost_this_month + $2,
         updated_at = NOW()
     WHERE user_id = $3`,
    [tokensUsed, cost, userId]
  );
}

/**
 * Check if user has exceeded quota
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} Quota check result
 */
export async function checkUserQuota(userId) {
  const quotas = await getUserQuotas(userId);

  if (!quotas) {
    return { exceeded: false, reason: null };
  }

  if (quotas.quota_exceeded) {
    return { exceeded: true, reason: quotas.quota_exceeded_reason || 'Quota exceeded' };
  }

  if (quotas.tokens_used_this_month >= quotas.monthly_token_limit) {
    await query(
      `UPDATE user_quotas
       SET quota_exceeded = TRUE, quota_exceeded_reason = 'Token limit exceeded'
       WHERE user_id = $1`,
      [userId]
    );
    return { exceeded: true, reason: 'Token limit exceeded' };
  }

  if (quotas.cost_this_month >= quotas.monthly_cost_limit) {
    await query(
      `UPDATE user_quotas
       SET quota_exceeded = TRUE, quota_exceeded_reason = 'Cost limit exceeded'
       WHERE user_id = $1`,
      [userId]
    );
    return { exceeded: true, reason: 'Cost limit exceeded' };
  }

  return { exceeded: false, reason: null };
}

/**
 * Reset monthly quotas (called by cron job)
 * @returns {Promise<number>} Number of users reset
 */
export async function resetMonthlyQuotas() {
  const result = await query(
    `UPDATE user_quotas
     SET tokens_used_this_month = 0,
         cost_this_month = 0,
         quota_exceeded = FALSE,
         quota_exceeded_reason = NULL,
         last_reset = NOW()
     WHERE last_reset < date_trunc('month', NOW())
     RETURNING user_id`
  );

  return result.rowCount;
}

// ============================================================================
// PROJECT QUERIES
// ============================================================================

/**
 * Create a new project
 * @param {Object} projectData - Project data
 * @returns {Promise<Object>} Created project
 */
export async function createProject({ userId, sessionId, name, description, path, framework, language }) {
  const result = await query(
    `INSERT INTO projects (user_id, session_id, name, description, path, framework, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, sessionId, name, description, path, framework, language]
  );

  return result.rows[0];
}

/**
 * Get project by ID
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object|null>} Project or null
 */
export async function getProjectById(projectId) {
  const result = await query(
    'SELECT * FROM projects WHERE id = $1',
    [projectId]
  );

  return result.rows[0] || null;
}

/**
 * Get project by session ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Project or null
 */
export async function getProjectBySessionId(sessionId) {
  const result = await query(
    'SELECT * FROM projects WHERE session_id = $1',
    [sessionId]
  );

  return result.rows[0] || null;
}

/**
 * Get user projects
 * @param {string} userId - User UUID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} User projects
 */
export async function getUserProjects(userId, { limit = 50, offset = 0, status = 'active' } = {}) {
  const result = await query(
    `SELECT * FROM projects
     WHERE user_id = $1 AND status = $2
     ORDER BY updated_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, status, limit, offset]
  );

  return result.rows;
}

/**
 * Update project memory status
 * @param {string} projectId - Project UUID
 * @param {number} memorySize - Memory size in bytes
 * @returns {Promise<void>}
 */
export async function updateProjectMemory(projectId, memorySize) {
  await query(
    `UPDATE projects
     SET has_memory = TRUE,
         memory_size = $1,
         last_memory_update = NOW()
     WHERE id = $2`,
    [memorySize, projectId]
  );
}

/**
 * Update project last accessed
 * @param {string} projectId - Project UUID
 * @returns {Promise<void>}
 */
export async function updateProjectLastAccessed(projectId) {
  await query(
    'UPDATE projects SET last_accessed = NOW() WHERE id = $1',
    [projectId]
  );
}

// ============================================================================
// BUILD QUERIES
// ============================================================================

/**
 * Create a new build
 * @param {Object} buildData - Build data
 * @returns {Promise<Object>} Created build
 */
export async function createBuild({ projectId, userId, status = 'queued' }) {
  const result = await query(
    `INSERT INTO builds (project_id, user_id, status, queued_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [projectId, userId, status]
  );

  return result.rows[0];
}

/**
 * Update build status
 * @param {string} buildId - Build UUID
 * @param {string} status - New status
 * @param {Object} data - Additional data
 * @returns {Promise<void>}
 */
export async function updateBuildStatus(buildId, status, data = {}) {
  const updates = [];
  const values = [buildId];
  let paramIndex = 2;

  updates.push(`status = $${paramIndex++}`);
  values.push(status);

  if (status === 'running') {
    updates.push(`started_at = NOW()`);
  }

  if (status === 'succeeded' || status === 'failed') {
    updates.push(`finished_at = NOW()`);
    updates.push(`duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))`);
  }

  if (data.builderContainerId) {
    updates.push(`builder_container_id = $${paramIndex++}`);
    values.push(data.builderContainerId);
  }

  if (data.imageId) {
    updates.push(`image_id = $${paramIndex++}`);
    values.push(data.imageId);
  }

  if (data.errorMessage) {
    updates.push(`error_message = $${paramIndex++}`);
    values.push(data.errorMessage);
  }

  if (data.buildLogs) {
    updates.push(`build_logs = $${paramIndex++}`);
    values.push(data.buildLogs);
  }

  await query(
    `UPDATE builds SET ${updates.join(', ')} WHERE id = $1`,
    values
  );
}

/**
 * Get project builds
 * @param {string} projectId - Project UUID
 * @param {number} limit - Number of builds to return
 * @returns {Promise<Array>} Project builds
 */
export async function getProjectBuilds(projectId, limit = 10) {
  const result = await query(
    `SELECT * FROM builds
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectId, limit]
  );

  return result.rows;
}

// ============================================================================
// PREVIEW QUERIES
// ============================================================================

/**
 * Create a new preview
 * @param {Object} previewData - Preview data
 * @returns {Promise<Object>} Created preview
 */
export async function createPreview({ projectId, buildId, userId, containerId, containerName, host, port, imageId }) {
  const result = await query(
    `INSERT INTO previews (project_id, build_id, user_id, container_id, container_name, host, port, image_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'starting')
     RETURNING *`,
    [projectId, buildId, userId, containerId, containerName, host, port, imageId]
  );

  return result.rows[0];
}

/**
 * Update preview status
 * @param {string} previewId - Preview UUID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export async function updatePreviewStatus(previewId, status) {
  await query(
    `UPDATE previews
     SET status = $1,
         last_health_check = NOW(),
         health_check_count = health_check_count + 1
     WHERE id = $2`,
    [status, previewId]
  );
}

/**
 * Get active preview by project
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object|null>} Preview or null
 */
export async function getActivePreview(projectId) {
  const result = await query(
    `SELECT * FROM previews
     WHERE project_id = $1 AND status IN ('starting', 'healthy')
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId]
  );

  return result.rows[0] || null;
}

/**
 * Stop preview
 * @param {string} previewId - Preview UUID
 * @returns {Promise<void>}
 */
export async function stopPreview(previewId) {
  await query(
    `UPDATE previews
     SET status = 'stopped',
         stopped_at = NOW()
     WHERE id = $1`,
    [previewId]
  );
}

// ============================================================================
// MEMORY SNAPSHOT QUERIES
// ============================================================================

/**
 * Create memory snapshot
 * @param {Object} snapshotData - Snapshot data
 * @returns {Promise<Object>} Created snapshot
 */
export async function createMemorySnapshot({ projectId, userId, kind, path, content, contentHash, notes }) {
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  const result = await query(
    `INSERT INTO memory_snapshots (project_id, user_id, kind, path, content, content_hash, size_bytes, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [projectId, userId, kind, path, content, contentHash, sizeBytes, notes]
  );

  return result.rows[0];
}

/**
 * Get project memory snapshots
 * @param {string} projectId - Project UUID
 * @param {number} limit - Number of snapshots to return
 * @returns {Promise<Array>} Memory snapshots
 */
export async function getProjectMemorySnapshots(projectId, limit = 10) {
  const result = await query(
    `SELECT * FROM memory_snapshots
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectId, limit]
  );

  return result.rows;
}

// ============================================================================
// USAGE LEDGER QUERIES
// ============================================================================

/**
 * Log usage event
 * @param {Object} usageData - Usage data
 * @returns {Promise<void>}
 */
export async function logUsage({ userId, projectId, kind, amount, cost, meta = {} }) {
  await query(
    `INSERT INTO usage_ledger (user_id, project_id, kind, amount, cost, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, projectId, kind, amount, cost, JSON.stringify(meta)]
  );
}

// ============================================================================
// EVENT QUERIES
// ============================================================================

/**
 * Log event
 * @param {Object} eventData - Event data
 * @returns {Promise<void>}
 */
export async function logEvent({ userId, projectId, kind, status, message, meta = {}, ipAddress, userAgent }) {
  await query(
    `INSERT INTO events (user_id, project_id, kind, status, message, meta, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, projectId, kind, status, message, JSON.stringify(meta), ipAddress, userAgent]
  );
}

/**
 * Get recent events
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Events
 */
export async function getRecentEvents({ userId, projectId, kind, limit = 50 } = {}) {
  let queryText = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (userId) {
    queryText += ` AND user_id = $${paramIndex++}`;
    params.push(userId);
  }

  if (projectId) {
    queryText += ` AND project_id = $${paramIndex++}`;
    params.push(projectId);
  }

  if (kind) {
    queryText += ` AND kind = $${paramIndex++}`;
    params.push(kind);
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query(queryText, params);
  return result.rows;
}

// ============================================================================
// CHAT MESSAGE QUERIES
// ============================================================================

/**
 * Save a chat message to database
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Saved message
 */
export async function saveChatMessage({
  projectId,
  userId,
  role,
  content,
  tokensUsed = 0,
  model = null,
  meta = null
}) {
  const result = await query(
    `INSERT INTO chat_messages (project_id, user_id, role, content, tokens_used, model, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [projectId, userId, role, content, tokensUsed, model, meta]
  );

  return result.rows[0];
}

/**
 * Get chat history for a project
 * @param {string} projectId - Project UUID
 * @param {number} limit - Number of messages to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Chat messages
 */
export async function getChatHistory(projectId, limit = 50, offset = 0) {
  const result = await query(
    `SELECT * FROM chat_messages
     WHERE project_id = $1 AND is_deleted = FALSE
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [projectId, limit, offset]
  );

  return result.rows;
}

/**
 * Clear chat history for a project (soft delete)
 * @param {string} projectId - Project UUID
 * @returns {Promise<number>} Number of messages deleted
 */
export async function clearChatHistory(projectId) {
  const result = await query(
    `UPDATE chat_messages
     SET is_deleted = TRUE
     WHERE project_id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [projectId]
  );

  return result.rowCount;
}

/**
 * Get chat statistics for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object>} Chat statistics
 */
export async function getChatStats(projectId) {
  const result = await query(
    `SELECT * FROM chat_stats_by_project WHERE project_id = $1`,
    [projectId]
  );

  return result.rows[0] || {
    project_id: projectId,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    total_tokens: 0,
    first_message_at: null,
    last_message_at: null
  };
}

/**
 * Delete a specific chat message (soft delete)
 * @param {string} messageId - Message UUID
 * @returns {Promise<boolean>} Success
 */
export async function deleteChatMessage(messageId) {
  const result = await query(
    `UPDATE chat_messages
     SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [messageId]
  );

  return result.rowCount > 0;
}

// Export all functions
export default {
  // Users
  createUser,
  findUserByEmail,
  findUserById,
  updateUserLastLogin,

  // Quotas
  getUserQuotas,
  updateTokenUsage,
  checkUserQuota,
  resetMonthlyQuotas,

  // Projects
  createProject,
  getProjectById,
  getProjectBySessionId,
  getUserProjects,
  updateProjectMemory,
  updateProjectLastAccessed,

  // Builds
  createBuild,
  updateBuildStatus,
  getProjectBuilds,

  // Previews
  createPreview,
  updatePreviewStatus,
  getActivePreview,
  stopPreview,

  // Memory
  createMemorySnapshot,
  getProjectMemorySnapshots,

  // Usage
  logUsage,

  // Events
  logEvent,
  getRecentEvents,

  // Chat
  saveChatMessage,
  getChatHistory,
  clearChatHistory,
  getChatStats,
  deleteChatMessage
};
