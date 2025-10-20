# AtlasEngine MVP - Testing Guide

This guide walks you through testing the complete AtlasEngine MVP from setup to deployment.

## Prerequisites

Before testing, ensure you have:

1. **Docker** - For container management
   ```bash
   docker --version  # Should be >= 20.10.0
   docker ps         # Should run without errors
   ```

2. **PostgreSQL** - For database
   ```bash
   psql --version    # Should be >= 12.0
   ```

3. **Node.js** - For backend and frontend
   ```bash
   node --version    # Should be >= 18.0.0
   npm --version     # Should be >= 9.0.0
   ```

4. **Git** - For version control
   ```bash
   git --version     # Should be >= 2.0.0
   ```

## Setup Steps

### 1. Install Dependencies

**Backend**:
```bash
cd backend
npm install
```

**Frontend**:
```bash
cd frontend
npm install
```

### 2. Database Setup

**Option A: Using init script (recommended)**:
```bash
cd backend
chmod +x scripts/init-db.sh
./scripts/init-db.sh
```

**Option B: Manual setup**:
```bash
# Create database
createdb atlasengine_dev

# Run schema
psql atlasengine_dev < backend/scripts/schema.sql

# Create test user (for MVP testing)
psql atlasengine_dev -c "
INSERT INTO users (id, email, name, password_hash)
VALUES ('test-user-id', 'test@atlasengine.dev', 'Test User', '\$2b\$10\$mockhashedpassword');
"
```

### 3. Environment Configuration

**Backend** - Create `backend/.env`:
```bash
# Database
DATABASE_URL=postgresql://localhost:5432/atlasengine_dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atlasengine_dev
DB_USER=your_username
DB_PASSWORD=your_password

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# JWT (for future auth)
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Docker
DOCKER_NETWORK=atlasengine-internal
BUILDER_IMAGE=node:20-alpine
RUNNER_IMAGE=node:20-alpine

# Ports
PORT_POOL_START=3001
PORT_POOL_END=3100

# Quotas (per user)
DEFAULT_MONTHLY_TOKEN_LIMIT=1000000
DEFAULT_COST_LIMIT=100.00
DEFAULT_RATE_LIMIT=10

# Redis (optional - for production)
REDIS_URL=redis://localhost:6379

# Claude Code CLI
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_TIMEOUT=120000

# Logging
LOG_LEVEL=debug
```

**Frontend** - Create `frontend/.env`:
```bash
VITE_API_BASE_URL=http://localhost:3000
```

### 4. Create Docker Network

```bash
docker network create atlasengine-internal
```

### 5. Create Projects Directory

```bash
mkdir -p /var/atlasengine/projects
# Or on macOS/Windows, use a local directory:
mkdir -p ./projects
```

## Test Scenarios

### Test 1: Database & Backend Health Check

**Start Backend**:
```bash
cd backend
npm run dev
```

**Expected Output**:
```
🚀 Initializing AtlasEngine MVP...
📊 Checking database connection...
🐳 Initializing Docker network...
🧹 Cleaning up stopped containers...
✅ Initialization complete!

╔════════════════════════════════════════════════════════════╗
║                 AtlasEngine MVP Server                     ║
╚════════════════════════════════════════════════════════════╝

🌐 Server running on: http://localhost:3000
📝 Environment: development
Ready to accept requests! 🎉
```

**Test Health Endpoint**:
```bash
curl http://localhost:3000/health
```

**Expected Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-20T...",
  "database": "connected",
  "docker": "connected",
  "portRegistry": {
    "available": 100,
    "allocated": 0,
    "utilization": "0%"
  }
}
```

### Test 2: Create Project

**Request**:
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "description": "My first AtlasEngine project",
    "framework": "react",
    "language": "typescript"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "project": {
    "id": "...",
    "sessionId": "...",
    "name": "Test Project",
    "description": "My first AtlasEngine project",
    "framework": "react",
    "language": "typescript",
    "status": "active",
    "hasMemory": true,
    "createdAt": "..."
  }
}
```

**Verify CLAUDE.md was created**:
```bash
# Note: projectId from response above
ls -la /var/atlasengine/projects/{projectId}/CLAUDE.md
# Or for local testing:
ls -la ./projects/{projectId}/CLAUDE.md
```

### Test 3: List Files

**Request**:
```bash
curl "http://localhost:3000/api/projects/{projectId}/files"
```

**Expected Response**:
```json
{
  "success": true,
  "files": [
    {
      "name": "CLAUDE.md",
      "path": "CLAUDE.md",
      "type": "file",
      "size": 1234
    }
  ]
}
```

### Test 4: Get CLAUDE.md Content

**Request**:
```bash
curl "http://localhost:3000/api/projects/{projectId}/memory"
```

**Expected Response**:
```json
{
  "success": true,
  "content": "# CLAUDE.md - Project Memory\n\n## Project Overview\n...",
  "stats": {
    "sizeBytes": 1234,
    "snapshotCount": 1,
    "lastUpdated": "..."
  }
}
```

### Test 5: Update CLAUDE.md

**Request**:
```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/memory \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {
      "Current Task": "Building authentication system",
      "Tech Stack": "React + TypeScript + Node.js"
    }
  }'
```

**Expected Response**:
```json
{
  "success": true
}
```

### Test 6: Frontend Testing

**Start Frontend**:
```bash
cd frontend
npm run dev
```

**Expected Output**:
```
VITE v5.x.x ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Manual Testing Steps**:

1. Open http://localhost:5173
2. Click "New Project" button
3. Enter project details
4. Verify project appears in dropdown
5. Select project from dropdown
6. Verify file tree shows CLAUDE.md
7. Click CLAUDE.md to view content
8. Switch to Memory panel
9. Click "Edit Mode"
10. Make changes and click "Save"
11. Switch to Chat panel
12. Send a message to Claude
13. Verify response appears

### Test 7: Build Project (Requires actual project files)

**Setup**: First, create a simple React app in the project directory

**Create package.json**:
```bash
curl -X PUT http://localhost:3000/api/projects/{projectId}/files/content \
  -H "Content-Type: application/json" \
  -d '{
    "path": "package.json",
    "content": "{\n  \"name\": \"test-app\",\n  \"version\": \"1.0.0\",\n  \"scripts\": {\n    \"build\": \"echo Building...\"\n  }\n}"
  }'
```

**Trigger Build**:
```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/build
```

**Expected Response**:
```json
{
  "success": true,
  "buildId": "...",
  "logs": "Building...\n"
}
```

### Test 8: Deploy Project

**Request**:
```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "buildId": "{buildId from Test 7}"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "preview": {
    "id": "...",
    "projectId": "...",
    "containerId": "...",
    "port": 3001,
    "status": "starting",
    "url": "http://localhost:3001"
  }
}
```

**Wait for health check**:
```bash
# After ~10 seconds, check preview status
curl http://localhost:3000/api/previews/{previewId}
```

**Expected Response**:
```json
{
  "success": true,
  "preview": {
    "status": "healthy",
    "port": 3001,
    "url": "http://localhost:3001"
  }
}
```

**Visit Preview**:
```bash
open http://localhost:3001
# Or curl to check:
curl http://localhost:3001
```

### Test 9: Chat with Claude (WebSocket)

**Using Browser Console**:
```javascript
// Open browser console at http://localhost:5173
// Socket.IO is already connected by ChatPanel

// Listen for responses
socket.on('ai-response', (data) => {
  console.log('Claude:', data.message);
});

// Send message
socket.emit('ai-message', {
  projectId: 'your-project-id',
  message: 'Hello Claude, can you help me?'
});
```

**Expected Console Output**:
```
Claude: Hello! I'm Claude Code, your AI development assistant...
```

### Test 10: Chat with Claude (REST API)

**Request**:
```bash
curl -X POST http://localhost:3000/api/chat/sessions/{projectId}/message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "message": "What files are in this project?"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Here's your project structure:\n- 📄 CLAUDE.md\n- 📄 package.json\n\nWhat would you like to do with these files?",
  "tokensUsed": 120,
  "model": "claude-3-sonnet"
}
```

### Test 11: Memory Checkpoint

**Request**:
```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/memory/checkpoint \
  -H "Content-Type: application/json" \
  -d '{
    "name": "After initial setup",
    "notes": "Project created with basic structure"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "checkpoint": {
    "id": "...",
    "name": "After initial setup",
    "notes": "Project created with basic structure"
  }
}
```

### Test 12: Quota Check

**Request**:
```bash
curl http://localhost:3000/api/quotas/summary \
  -H "Authorization: Bearer mock-token"
```

**Expected Response**:
```json
{
  "userId": "test-user-id",
  "currentPeriod": "2025-10",
  "tokensUsed": 120,
  "tokenLimit": 1000000,
  "costAccrued": 0.00012,
  "costLimit": 100.00,
  "quotaExceeded": false,
  "utilizationPercent": 0.012
}
```

## Complete End-to-End Flow

**Test the complete workflow**:

```bash
# 1. Create project
PROJECT_RESPONSE=$(curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test", "framework": "react", "language": "typescript"}')

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.project.id')
echo "Created project: $PROJECT_ID"

# 2. View memory
curl http://localhost:3000/api/projects/$PROJECT_ID/memory | jq '.content'

# 3. Update memory
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/memory \
  -H "Content-Type: application/json" \
  -d '{"updates": {"Status": "Testing E2E flow"}}'

# 4. Chat with Claude
curl -X POST http://localhost:3000/api/chat/sessions/$PROJECT_ID/message \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-id", "message": "Hello!"}' | jq '.message'

# 5. Create package.json for build
curl -X PUT http://localhost:3000/api/projects/$PROJECT_ID/files/content \
  -H "Content-Type: application/json" \
  -d '{"path": "package.json", "content": "{\"name\":\"test\",\"scripts\":{\"build\":\"echo Built\"}}"}'

# 6. Build project
BUILD_RESPONSE=$(curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/build)
BUILD_ID=$(echo $BUILD_RESPONSE | jq -r '.buildId')
echo "Build ID: $BUILD_ID"

# 7. Deploy project
DEPLOY_RESPONSE=$(curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/deploy \
  -H "Content-Type: application/json" \
  -d "{\"buildId\": \"$BUILD_ID\"}")
PREVIEW_ID=$(echo $DEPLOY_RESPONSE | jq -r '.preview.id')
PORT=$(echo $DEPLOY_RESPONSE | jq -r '.preview.port')
echo "Preview at: http://localhost:$PORT"

# 8. Wait for health check
sleep 15

# 9. Check preview
curl http://localhost:$PORT

echo "✅ End-to-end test complete!"
```

## Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL is running
pg_isready

# Check database exists
psql -l | grep atlasengine

# Recreate database
dropdb atlasengine_dev
createdb atlasengine_dev
psql atlasengine_dev < backend/scripts/schema.sql
```

### Docker Issues
```bash
# Check Docker is running
docker ps

# Create network if missing
docker network create atlasengine-internal

# Clean up containers
docker rm -f $(docker ps -aq --filter "label=atlasengine=true")
```

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### CLAUDE.md Not Found
```bash
# Check projects directory exists and is writable
ls -la /var/atlasengine/projects
# Or
ls -la ./projects

# Ensure directory permissions
chmod 755 /var/atlasengine/projects
```

### Frontend Not Connecting to Backend
```bash
# Verify CORS_ORIGIN in backend/.env
echo $CORS_ORIGIN  # Should be http://localhost:5173

# Check frontend .env
cat frontend/.env  # Should have VITE_API_BASE_URL=http://localhost:3000
```

## Success Criteria

All tests pass if:

- ✅ Database connects successfully
- ✅ Docker network exists
- ✅ Backend starts without errors
- ✅ Health check returns 200 OK
- ✅ Projects can be created
- ✅ CLAUDE.md is initialized
- ✅ Memory can be read and updated
- ✅ Files can be created and edited
- ✅ Builds execute successfully
- ✅ Containers deploy and pass health checks
- ✅ Previews are accessible
- ✅ Chat responds to messages
- ✅ Frontend loads and displays projects
- ✅ All panels work (FileTree, Editor, Memory, Chat, Preview)
- ✅ WebSocket connection is stable
- ✅ Quotas are tracked correctly

## Next Steps

After successful testing:

1. Implement JWT authentication
2. Set up Caddy reverse proxy
3. Create starter templates
4. Build janitor service
5. Deploy to production environment
