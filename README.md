# AtlasEngine MVP

> AI-powered full-stack development platform with persistent memory

## 🎯 Overview

AtlasEngine is a Replit-like development platform that integrates Claude Code CLI to enable AI-assisted full-stack application development. The platform features:

- 🧠 **Persistent AI Memory** - Claude remembers context across unlimited sessions via CLAUDE.md
- ⚡ **Live Preview** - Real-time app previews with hot reload
- 🔒 **Security-Hardened** - Container isolation, origin separation, enforced quotas
- 🚀 **One-Click Deploy** - Docker-based deployments with health checks
- 💰 **Cost-Controlled** - Mandatory resource quotas and usage tracking

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Code Editor │  │  Chat with   │  │ Live Preview │   │
│  │  (Monaco)    │  │  Claude Code │  │  (iframe)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
                           ↓ WebSocket / HTTP
┌─────────────────────────────────────────────────────────┐
│          Backend (Node.js/Express)                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Services                                       │    │
│  │  - Memory Management (CLAUDE.md)                │    │
│  │  - Docker Orchestration                         │    │
│  │  - Port Registry + Health Checks                │    │
│  │  - Quota Enforcement                            │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  PostgreSQL                                     │    │
│  │  - Users, Projects, Builds, Memory Snapshots    │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Docker Containers (Isolated)                   │    │
│  │  - Builder containers (ephemeral)               │    │
│  │  - Runner containers (non-root, hardened)       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x
- PostgreSQL 15
- Docker
- Redis (for build queue)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd AtlasEngineMVP

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Set up database
psql -U postgres -f backend/scripts/schema.sql

# Start development servers
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## 📁 Project Structure

```
AtlasEngineMVP/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── services/    # Business logic
│   │   ├── routes/      # API endpoints
│   │   ├── middleware/  # Express middleware
│   │   ├── config/      # Configuration
│   │   └── db/          # Database setup
│   └── server.js        # Entry point
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom hooks
│   │   ├── services/    # API clients
│   │   └── types/       # TypeScript types
│   └── package.json
├── docs/                # Documentation
├── templates/           # Project templates
└── CLAUDE.md           # AI memory file
```

## 🔒 Security Features

1. **Container Isolation**: Builder and runner containers separated
2. **Origin Isolation**: Previews on separate subdomains (proj-*.domain.com)
3. **Enforced Quotas**: Hard limits on API usage, containers, costs
4. **Non-root Containers**: All user containers run as uid 1000
5. **Read-only Filesystem**: Containers use read-only root + tmpfs
6. **Health Checks**: Ports only exposed after successful health probe

## 🧠 Memory System

AtlasEngine uses CLAUDE.md files to provide persistent context to Claude Code across unlimited sessions:

- **Automatic Updates**: AI updates CLAUDE.md after major milestones
- **Manual Checkpoints**: Save project state at any time
- **Session Continuity**: Pick up where you left off, even weeks later
- **Transparent**: Users can view and edit AI memory

## 🛠️ Development

```bash
# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test

# Build for production
npm run build

# Start production server
pm2 start ecosystem.config.js
```

## 📊 Database Schema

Key tables:
- `users` - User accounts and authentication
- `projects` - User projects and metadata
- `builds` - Build history and logs
- `previews` - Active deployments/containers
- `memory_snapshots` - CLAUDE.md version history
- `user_quotas` - Resource limits and enforcement
- `usage_ledger` - Usage tracking for billing

See `backend/scripts/schema.sql` for full schema.

## 🎯 Roadmap

**Phase 1: Foundation (Weeks 1-2)**
- [x] Project structure setup
- [ ] Backend core services
- [ ] Database setup
- [ ] Basic frontend

**Phase 2: Core Features (Weeks 3-4)**
- [ ] Claude Code integration
- [ ] Docker deployment system
- [ ] Live preview
- [ ] Memory management UI

**Phase 3: Polish (Weeks 5-6)**
- [ ] Authentication
- [ ] Quota enforcement
- [ ] Security hardening
- [ ] Beta testing

## 📝 License

MIT (custom implementation, not derived from GPL code)

## 🤝 Contributing

This is an MVP in active development. Contributions welcome!

## 📧 Contact

For questions or feedback, please open an issue.

---

**Built with Claude Code** 🚀
