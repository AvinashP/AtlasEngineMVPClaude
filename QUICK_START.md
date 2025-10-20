# AtlasEngine MVP - Quick Start Guide

Get AtlasEngine running in 5 minutes!

## Current Status

✅ Docker installed and running
⚠️ PostgreSQL needs to be installed
✅ Node.js ready
✅ jq installed (for test scripts)

## Setup Steps

### Step 1: Install PostgreSQL

**macOS**:
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows**:
Download from https://www.postgresql.org/download/windows/

### Step 2: Create Database

```bash
# Create database
createdb atlasengine_dev

# Run schema
cd backend
psql atlasengine_dev < scripts/schema.sql

# Create test user
psql atlasengine_dev -c "
INSERT INTO users (id, email, name, password_hash)
VALUES ('test-user-id', 'test@atlasengine.dev', 'Test User', '\$2b\$10\$mockhashedpassword');
"
```

### Step 3: Install Dependencies

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

### Step 4: Configure Environment

**Backend** - Create `backend/.env`:
```bash
cat > backend/.env << 'EOF'
# Database
DATABASE_URL=postgresql://localhost:5432/atlasengine_dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atlasengine_dev
DB_USER=$USER
DB_PASSWORD=

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# JWT
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d

# Docker
DOCKER_NETWORK=atlasengine-internal
BUILDER_IMAGE=node:20-alpine
RUNNER_IMAGE=node:20-alpine

# Ports
PORT_POOL_START=3001
PORT_POOL_END=3100

# Quotas
DEFAULT_MONTHLY_TOKEN_LIMIT=1000000
DEFAULT_COST_LIMIT=100.00
DEFAULT_RATE_LIMIT=10

# Claude (optional for MVP)
ANTHROPIC_API_KEY=
CLAUDE_TIMEOUT=120000

# Logging
LOG_LEVEL=debug
EOF
```

**Frontend** - Create `frontend/.env`:
```bash
echo "VITE_API_BASE_URL=http://localhost:3000" > frontend/.env
```

### Step 5: Setup Docker Network

```bash
docker network create atlasengine-internal
```

### Step 6: Create Projects Directory

```bash
# For development, use local directory
mkdir -p projects
```

Update `backend/.env` to add:
```bash
PROJECT_ROOT=./projects
```

### Step 7: Start Backend

```bash
cd backend
npm run dev
```

You should see:
```
🚀 Initializing AtlasEngine MVP...
✅ Initialization complete!
🌐 Server running on: http://localhost:3000
```

### Step 8: Start Frontend (new terminal)

```bash
cd frontend
npm run dev
```

You should see:
```
VITE v5.x.x ready in xxx ms
➜  Local:   http://localhost:5173/
```

### Step 9: Test It!

Open browser to http://localhost:5173

OR run automated tests:
```bash
./test-e2e.sh
```

## Troubleshooting

### PostgreSQL Not Found

If `createdb` command not found:

**macOS**:
```bash
# Add to PATH
echo 'export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Linux**:
```bash
sudo -u postgres createdb atlasengine_dev
sudo -u postgres psql atlasengine_dev < backend/scripts/schema.sql
```

### Database Connection Failed

Check PostgreSQL is running:
```bash
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql
```

Update `backend/.env` with correct credentials:
```bash
DB_USER=your_postgres_username
DB_PASSWORD=your_postgres_password
```

### Docker Network Already Exists

This is fine! The network will be reused.

### Port 3000 or 5173 Already in Use

Find and kill the process:
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

Or change ports in `.env` files.

## What's Next?

Once everything is running:

1. ✅ Open http://localhost:5173
2. ✅ Create a new project
3. ✅ Explore the file tree
4. ✅ Edit files in Monaco Editor
5. ✅ Chat with Claude
6. ✅ View CLAUDE.md memory
7. ✅ Build and deploy

## Full Testing

For comprehensive testing, see:
- `docs/TESTING_GUIDE.md` - Detailed testing instructions
- `docs/SETUP_CHECKLIST.md` - Complete setup checklist
- `./test-e2e.sh` - Automated test script

## Need Help?

Check the documentation:
- `README.md` - Project overview
- `docs/DATABASE_SETUP.md` - Database details
- `docs/CLAUDE_INTEGRATION.md` - AI chat details
- `docs/PROGRESS.md` - Development progress

## Alternative: Use Docker Compose (Coming Soon)

For easier setup, we'll add Docker Compose support to run everything with one command:
```bash
docker-compose up
```

This will start PostgreSQL, backend, and frontend automatically.
