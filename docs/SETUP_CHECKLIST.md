# AtlasEngine MVP - Setup Checklist

Complete this checklist before running end-to-end tests.

## Prerequisites Installation

### 1. Docker
- [ ] Docker Desktop installed (macOS/Windows) or Docker Engine (Linux)
- [ ] Docker is running: `docker ps` works
- [ ] Docker version >= 20.10.0: `docker --version`

### 2. PostgreSQL
- [ ] PostgreSQL installed
- [ ] PostgreSQL is running: `pg_isready` returns success
- [ ] PostgreSQL version >= 12.0: `psql --version`
- [ ] Can connect to PostgreSQL: `psql -l` works

### 3. Node.js
- [ ] Node.js installed
- [ ] Node.js version >= 18.0.0: `node --version`
- [ ] npm version >= 9.0.0: `npm --version`

### 4. Additional Tools
- [ ] Git installed: `git --version`
- [ ] curl installed: `curl --version`
- [ ] jq installed: `jq --version` (for test script)
  - macOS: `brew install jq`
  - Ubuntu: `sudo apt-get install jq`
  - Windows: Download from https://stedolan.github.io/jq/

## Database Setup

### 1. Create Database
```bash
createdb atlasengine_dev
```
- [ ] Database created successfully

### 2. Run Schema
```bash
cd backend
chmod +x scripts/init-db.sh
./scripts/init-db.sh
```
OR manually:
```bash
psql atlasengine_dev < backend/scripts/schema.sql
```
- [ ] Schema applied successfully
- [ ] All 9 tables created
- [ ] Views created
- [ ] Triggers created

### 3. Create Test User
```bash
psql atlasengine_dev -c "
INSERT INTO users (id, email, name, password_hash)
VALUES ('test-user-id', 'test@atlasengine.dev', 'Test User', '\$2b\$10\$mockhashedpassword')
ON CONFLICT (id) DO NOTHING;
"
```
- [ ] Test user created

### 4. Verify Database
```bash
psql atlasengine_dev -c "\dt"
```
- [ ] Should show 9 tables: users, projects, builds, previews, memory_snapshots, user_quotas, usage_ledger, events, sessions

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```
- [ ] All dependencies installed successfully
- [ ] No errors during installation

### 2. Create Environment File
```bash
cp .env.example .env
```
Then edit `backend/.env` with your settings:
- [ ] DATABASE_URL configured
- [ ] DB_* variables set
- [ ] PORT set (default: 3000)
- [ ] CORS_ORIGIN set (default: http://localhost:5173)
- [ ] JWT_SECRET set
- [ ] DOCKER_NETWORK set
- [ ] PORT_POOL_START/END set
- [ ] ANTHROPIC_API_KEY set (optional for MVP)

### 3. Create Docker Network
```bash
docker network create atlasengine-internal
```
- [ ] Network created (or already exists)

### 4. Create Projects Directory
```bash
# Option A: System directory
sudo mkdir -p /var/atlasengine/projects
sudo chmod 755 /var/atlasengine/projects
sudo chown $USER /var/atlasengine/projects

# Option B: Local directory (recommended for development)
mkdir -p ./projects
```
- [ ] Projects directory created and writable

### 5. Test Backend Startup
```bash
npm run dev
```
- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] Docker connection successful
- [ ] Server listening on http://localhost:3000

### 6. Test Health Endpoint
Open another terminal:
```bash
curl http://localhost:3000/health
```
- [ ] Returns HTTP 200
- [ ] Shows "status": "ok"
- [ ] Shows "database": "connected"
- [ ] Shows "docker": "connected"

## Frontend Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```
- [ ] All dependencies installed successfully

### 2. Create Environment File
```bash
echo "VITE_API_BASE_URL=http://localhost:3000" > .env
```
- [ ] .env file created

### 3. Test Frontend Startup
```bash
npm run dev
```
- [ ] Vite starts successfully
- [ ] Server listening on http://localhost:5173
- [ ] No compilation errors

### 4. Test Frontend in Browser
```bash
open http://localhost:5173
```
- [ ] Page loads without errors
- [ ] No console errors
- [ ] UI renders correctly
- [ ] Can see "New Project" button

## Integration Tests

### 1. Test API Connectivity
With backend running, test API from frontend:
```bash
curl http://localhost:3000/api/projects
```
- [ ] Returns HTTP 200
- [ ] Returns projects array (may be empty)

### 2. Test CORS
Open browser console at http://localhost:5173 and run:
```javascript
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(console.log)
```
- [ ] No CORS errors
- [ ] Response received successfully

### 3. Test WebSocket Connection
Open browser console at http://localhost:5173:
- [ ] Check for "Client connected" message in backend logs
- [ ] No WebSocket errors in browser console

## Run End-to-End Test

### 1. Ensure Both Servers Running
- [ ] Backend running on http://localhost:3000
- [ ] Frontend running on http://localhost:5173

### 2. Run Test Script
```bash
chmod +x test-e2e.sh
./test-e2e.sh
```
- [ ] All tests pass
- [ ] Project created successfully
- [ ] Memory system working
- [ ] File operations working
- [ ] Build system working
- [ ] Deployment working
- [ ] Preview accessible

### 3. Manual Frontend Test
1. [ ] Open http://localhost:5173
2. [ ] Click "New Project"
3. [ ] Enter project details
4. [ ] Project appears in list
5. [ ] Select project
6. [ ] File tree shows files
7. [ ] Can click and view files
8. [ ] Memory panel shows CLAUDE.md
9. [ ] Can edit memory
10. [ ] Chat panel connects
11. [ ] Can send chat messages
12. [ ] Preview panel shows controls

## Troubleshooting

### Database Issues
If database connection fails:
```bash
# Check PostgreSQL is running
pg_isready

# Check if database exists
psql -l | grep atlasengine

# Recreate if needed
dropdb atlasengine_dev
createdb atlasengine_dev
psql atlasengine_dev < backend/scripts/schema.sql
```

### Docker Issues
If Docker connection fails:
```bash
# Check Docker is running
docker ps

# Restart Docker Desktop (macOS/Windows)
# Or restart Docker service (Linux)
sudo systemctl restart docker

# Recreate network
docker network rm atlasengine-internal
docker network create atlasengine-internal
```

### Port Conflicts
If port 3000 or 5173 is in use:
```bash
# Find process using port
lsof -i :3000
lsof -i :5173

# Kill process or change port in .env
```

### Permission Issues
If projects directory is not writable:
```bash
# For local development
mkdir -p ./projects
chmod 755 ./projects

# Update backend/.env
# PROJECT_ROOT=./projects
```

## Ready for Production?

Before deploying to production, complete:
- [ ] JWT authentication implemented
- [ ] Caddy reverse proxy configured
- [ ] SSL certificates set up
- [ ] Environment variables secured
- [ ] Docker network isolated
- [ ] Resource limits configured
- [ ] Monitoring set up
- [ ] Backup strategy implemented
- [ ] Security audit completed

## Success!

If all checkboxes are checked:
- ✅ Your development environment is ready
- ✅ You can run end-to-end tests
- ✅ You can start developing new features
- ✅ You can deploy to production (after completing production checklist)

## Next Steps

1. Run `./test-e2e.sh` to verify everything works
2. Implement remaining features (auth, templates, janitor)
3. Set up production environment
4. Deploy and monitor
