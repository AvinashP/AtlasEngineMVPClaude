/**
 * PostgreSQL Database Connection
 * Implements connection pooling with health checks and error handling
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'atlasengine',
  user: process.env.DB_USER || 'atlasengine',
  password: process.env.DB_PASSWORD,

  // Connection pool settings
  max: 20,                    // Maximum number of clients in pool
  idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Wait 5 seconds for connection

  // SSL configuration (enable in production)
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};

// Create connection pool
const pool = new Pool(dbConfig);

// Pool error handler
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Pool connection event
pool.on('connect', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ New PostgreSQL client connected');
  }
});

// Pool removal event
pool.on('remove', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('PostgreSQL client removed from pool');
  }
});

/**
 * Execute a query with automatic error handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params) {
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: result.rowCount });
    }

    return result;
  } catch (error) {
    console.error('Database query error:', {
      query: text,
      params,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
export async function getClient() {
  const client = await pool.connect();

  // Add query method with logging
  const originalQuery = client.query.bind(client);
  client.query = (...args) => {
    const start = Date.now();
    return originalQuery(...args).then(result => {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development') {
        console.log('Transaction query', { duration, rows: result.rowCount });
      }
      return result;
    });
  };

  return client;
}

/**
 * Execute a transaction
 * @param {Function} callback - Async function to execute in transaction
 * @returns {Promise<any>} Transaction result
 */
export async function transaction(callback) {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connection health
 * @returns {Promise<boolean>} True if healthy
 */
export async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as now, version() as version');
    return {
      healthy: true,
      timestamp: result.rows[0].now,
      version: result.rows[0].version,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Initialize database - create tables if not exist
 * @returns {Promise<boolean>} Success status
 */
export async function initialize() {
  try {
    // Check if schema_version table exists
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'schema_version'
      ) as exists
    `);

    if (result.rows[0].exists) {
      console.log('✅ Database schema already initialized');

      // Get current schema version
      const versionResult = await query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
      console.log(`📊 Schema version: ${versionResult.rows[0].version}`);

      return true;
    } else {
      console.log('⚠️  Database schema not found. Please run: psql -d atlasengine -f backend/scripts/schema.sql');
      return false;
    }
  } catch (error) {
    console.error('Database initialization check failed:', error);
    return false;
  }
}

/**
 * Close all database connections gracefully
 * @returns {Promise<void>}
 */
export async function close() {
  try {
    await pool.end();
    console.log('✅ Database pool closed gracefully');
  } catch (error) {
    console.error('Error closing database pool:', error);
    throw error;
  }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database connections...');
  await close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await close();
  process.exit(0);
});

// Export pool for advanced usage
export { pool };

// Export default for convenience
export default {
  query,
  getClient,
  transaction,
  healthCheck,
  initialize,
  close,
  pool
};
