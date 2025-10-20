# Database Setup - Complete Guide

## Overview

The AtlasEngine database is built on PostgreSQL 15+ with a security-hardened schema designed for:
- Multi-tenant user isolation
- Enforced resource quotas
- Audit trail and observability
- CLAUDE.md memory persistence
- High-performance queries

## Database Schema

### Tables Created (9 Total)

1. **`users`** - User accounts and authentication
   - UUID primary key
   - Email/password authentication
   - Plan-based access (free/pro/enterprise)
   - Email verification status

2. **`user_quotas`** - ENFORCED resource limits (CRITICAL)
   - Token limits (monthly)
   - Cost limits (monthly)
   - Container limits (concurrent)
   - Rate limits (hourly)
   - Build limits (daily)
   - Auto-created via trigger when user signs up

3. **`projects`** - User projects
   - Session ID for unique identification
   - Filesystem path tracking
   - Memory system status (has_memory, memory_size)
   - Framework and language metadata
   - Status tracking (active/archived/deleted)

4. **`builds`** - Build history
   - Status tracking (queued → running → succeeded/failed)
   - Container ID and image ID tracking
   - Build logs and error messages
   - Timing metrics (duration_seconds)
   - Resource usage tracking

5. **`previews`** - Active deployments
   - Container and network information
   - Health check status
   - Host and port mapping
   - Resource limits per container
   - Auto-sleep configuration
   - Last accessed tracking

6. **`memory_snapshots`** - CLAUDE.md version history
   - Content snapshots with SHA256 hashing
   - Snapshot types: claude_md, scratch, checkpoint, auto
   - Size and context tracking
   - Named checkpoints

7. **`usage_ledger`** - Billing and analytics
   - All API calls tracked
   - Token usage logged
   - Container minutes tracked
   - JSONB metadata for flexibility

8. **`events`** - Audit trail and observability
   - All system events logged
   - User and project context
   - IP address and user agent for security
   - JSONB metadata

9. **`sessions`** - JWT session management
   - Token hash storage
   - Expiration tracking
   - Active status
   - IP and user agent logging

### Views Created (2 Total)

1. **`user_usage_summary`** - Real-time user resource overview
   - Token and cost usage
   - Project count
   - Active preview count
   - Recent builds

2. **`project_health`** - Project status dashboard
   - Build success/failure rates
   - Last build timestamp
   - Active preview count
   - Memory system status

### Triggers and Functions

1. **`update_updated_at_column()`** - Auto-update timestamp
   - Applied to: users, projects, user_quotas, previews

2. **`create_default_user_quota()`** - Auto-create quotas
   - Triggered on user signup
   - Ensures every user has enforced limits

## Files Created

### 1. `backend/scripts/schema.sql`
Complete PostgreSQL schema with:
- 9 tables with proper constraints
- 2 analytical views
- Triggers for automation
- Comprehensive indexes
- Security checks and validations
- ~500 lines of SQL

**Key Features:**
- UUID primary keys for security
- Foreign key constraints for data integrity
- CHECK constraints for data validation
- JSONB columns for flexible metadata
- Timestamptz for timezone-aware timestamps
- Proper indexing for query performance

### 2. `backend/src/db/connection.js`
Database connection module with:
- Connection pooling (max 20 clients)
- Health check function
- Transaction support
- Query logging (development)
- Graceful shutdown handlers
- Error handling

**API:**
```javascript
import db from './db/connection.js';

// Simple query
const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

// Transaction
await db.transaction(async (client) => {
  await client.query('INSERT INTO users ...');
  await client.query('INSERT INTO user_quotas ...');
});

// Health check
const health = await db.healthCheck();
```

### 3. `backend/src/db/queries.js`
30+ reusable query functions:
- **User queries**: createUser, findUserByEmail, findUserById
- **Quota queries**: getUserQuotas, updateTokenUsage, checkUserQuota, resetMonthlyQuotas
- **Project queries**: createProject, getProjectById, getUserProjects, updateProjectMemory
- **Build queries**: createBuild, updateBuildStatus, getProjectBuilds
- **Preview queries**: createPreview, updatePreviewStatus, getActivePreview, stopPreview
- **Memory queries**: createMemorySnapshot, getProjectMemorySnapshots
- **Usage queries**: logUsage
- **Event queries**: logEvent, getRecentEvents

**Example Usage:**
```javascript
import { createUser, getUserQuotas, checkUserQuota } from './db/queries.js';

// Create user (auto-creates quotas via trigger)
const user = await createUser({
  email: 'user@example.com',
  passwordHash: await bcrypt.hash('password', 10),
  name: 'John Doe'
});

// Check quota before expensive operation
const quotaCheck = await checkUserQuota(user.id);
if (quotaCheck.exceeded) {
  throw new Error(`Quota exceeded: ${quotaCheck.reason}`);
}

// Log API usage
await logUsage({
  userId: user.id,
  projectId: project.id,
  kind: 'tokens',
  amount: 1500,
  cost: 0.03,
  meta: { model: 'claude-sonnet-4' }
});
```

### 4. `backend/scripts/init-db.sh`
Automated database initialization script:
- Checks PostgreSQL connection
- Creates database if not exists
- Creates user and grants privileges
- Applies schema.sql
- Verifies table creation
- Color-coded output

**Usage:**
```bash
cd backend/scripts
./init-db.sh
```

## Setup Instructions

### Prerequisites

1. **PostgreSQL 15+**
   ```bash
   # macOS
   brew install postgresql@15
   brew services start postgresql@15

   # Ubuntu/Debian
   sudo apt install postgresql-15
   sudo systemctl start postgresql

   # Docker
   docker run -d -p 5432:5432 \
     -e POSTGRES_PASSWORD=postgres \
     --name atlasengine-db \
     postgres:15
   ```

2. **Environment Variables**
   ```bash
   cp backend/.env.example backend/.env

   # Edit backend/.env:
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=atlasengine
   DB_USER=atlasengine
   DB_PASSWORD=your_secure_password_here
   ```

### Installation

**Option 1: Automated Script (Recommended)**
```bash
cd backend/scripts
./init-db.sh
```

**Option 2: Manual Setup**
```bash
# Create database
createdb atlasengine

# Create user
psql -d postgres -c "CREATE USER atlasengine WITH PASSWORD 'your_password';"

# Grant privileges
psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE atlasengine TO atlasengine;"

# Apply schema
psql -d atlasengine -f backend/scripts/schema.sql
```

### Verification

```bash
# Connect to database
psql -d atlasengine

# List tables
\dt

# Check schema version
SELECT * FROM schema_version;

# View user usage summary
SELECT * FROM user_usage_summary;

# Check triggers
\df
```

## Database Maintenance

### Monthly Quota Reset (Cron Job)

```javascript
// Run on 1st of every month at 00:00
import { resetMonthlyQuotas } from './db/queries.js';

const resetCount = await resetMonthlyQuotas();
console.log(`Reset quotas for ${resetCount} users`);
```

### Cleanup Old Snapshots

```sql
-- Delete auto-snapshots older than 30 days, keep checkpoints
DELETE FROM memory_snapshots
WHERE kind = 'auto'
  AND created_at < NOW() - INTERVAL '30 days';
```

### Cleanup Stopped Previews

```sql
-- Delete preview records for stopped containers older than 7 days
DELETE FROM previews
WHERE status = 'stopped'
  AND stopped_at < NOW() - INTERVAL '7 days';
```

## Security Features

### 1. SQL Injection Prevention
- All queries use parameterized statements
- No string concatenation in SQL

### 2. Quota Enforcement
- User quotas created automatically on signup
- Checked before every expensive operation
- Hard limits, not soft warnings

### 3. Audit Trail
- Every action logged to `events` table
- IP address and user agent captured
- JSONB metadata for context

### 4. Data Integrity
- Foreign key constraints prevent orphaned records
- CHECK constraints validate data
- NOT NULL constraints prevent missing data

## Performance Optimizations

### Indexes Created

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);

-- Project queries
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_session ON projects(session_id);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);

-- Build queries
CREATE INDEX idx_builds_project ON builds(project_id);
CREATE INDEX idx_builds_status ON builds(status);

-- Preview queries
CREATE INDEX idx_previews_project ON previews(project_id);
CREATE INDEX idx_previews_host ON previews(host);

-- Event queries
CREATE INDEX idx_events_user_created ON events(user_id, created_at DESC);

-- Usage analytics
CREATE INDEX idx_usage_ledger_user_created ON usage_ledger(user_id, created_at DESC);
```

### Connection Pooling

- Max 20 connections
- 30 second idle timeout
- 5 second connection timeout
- Automatic reconnection

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux
```

### Permission Denied

```bash
# Grant all privileges
psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE atlasengine TO atlasengine;"

# Grant schema privileges
psql -d atlasengine -c "GRANT ALL ON SCHEMA public TO atlasengine;"
psql -d atlasengine -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO atlasengine;"
```

### Schema Already Exists

```bash
# Drop and recreate (WARNING: deletes all data)
psql -d postgres -c "DROP DATABASE atlasengine;"
cd backend/scripts && ./init-db.sh
```

## Next Steps

With the database fully set up, you can now:

1. ✅ Implement Memory Management Service
2. ✅ Implement Docker Service
3. ✅ Implement Port Registry Service
4. ✅ Implement Quota Middleware
5. ✅ Create API routes

The database is production-ready and waiting for the application layer!

---

**Schema Version:** 1
**Last Updated:** 2025-10-19
**Status:** ✅ Complete and Tested
