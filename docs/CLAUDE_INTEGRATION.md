# Claude Code CLI Integration

This document describes how Claude Code CLI is integrated into AtlasEngine MVP.

## Overview

AtlasEngine integrates Claude Code CLI to provide AI-powered development assistance within each project. The integration consists of:

1. **Backend Service** (`claudeService.js`) - Manages Claude sessions and message processing
2. **API Routes** (`/api/chat/*`) - RESTful endpoints for chat operations
3. **WebSocket Events** - Real-time bidirectional communication
4. **CLI Wrapper** (`claude-wrapper.js`) - Simulates/wraps Claude Code CLI

## Architecture

```
┌─────────────┐
│   Frontend  │
│ ChatPanel   │
└──────┬──────┘
       │ Socket.IO
       │ (ai-message, ai-response)
       ▼
┌─────────────┐
│   Backend   │
│  server.js  │
└──────┬──────┘
       │
       ▼
┌─────────────┐         ┌──────────────┐
│ claudeService├────────►│ CLAUDE.md    │
│             │         │ Memory System│
└──────┬──────┘         └──────────────┘
       │
       ▼
┌─────────────┐
│claude-wrapper│
│   (CLI)      │
└──────────────┘
```

## Components

### 1. Claude Service (`backend/src/services/claudeService.js`)

**Purpose**: Manages Claude Code sessions for each project.

**Key Features**:
- Session initialization with CLAUDE.md context
- Message processing with quota enforcement
- Automatic memory updates every 5 messages
- Token usage tracking
- Event emission for real-time updates

**API**:
```javascript
// Initialize session
await claudeService.initializeSession(projectId, projectPath, userId);

// Send message
const response = await claudeService.sendMessage(projectId, message);

// Get session info
const session = claudeService.getSession(projectId);

// End session
await claudeService.endSession(projectId);
```

### 2. Chat Routes (`backend/src/routes/chat.js`)

**Endpoints**:

- `POST /api/chat/sessions/:projectId/init` - Initialize session
- `POST /api/chat/sessions/:projectId/message` - Send message
- `GET /api/chat/sessions/:projectId/history` - Get message history
- `DELETE /api/chat/sessions/:projectId/history` - Clear history
- `GET /api/chat/sessions/:projectId/stats` - Get session stats
- `DELETE /api/chat/sessions/:projectId` - End session

### 3. WebSocket Events

**Client → Server**:
```javascript
socket.emit('ai-message', {
  projectId: 'project-123',
  message: 'Create a new React component'
});
```

**Server → Client**:
```javascript
// Typing indicator
socket.on('ai-typing', (data) => {
  // Show typing indicator
});

// Response
socket.on('ai-response', (data) => {
  // data.message - Claude's response
  // data.tokensUsed - Token count
  // data.model - Model used
});

// Error
socket.on('ai-error', (data) => {
  // data.error - Error message
});
```

### 4. Claude Wrapper (`backend/src/scripts/claude-wrapper.js`)

**Purpose**: Wraps Claude Code CLI for MVP simulation.

**MVP Implementation**:
- Simulates Claude responses based on message patterns
- Reads CLAUDE.md for context
- Returns JSON-formatted responses
- Estimates token usage

**Production Implementation**:
Replace with actual Claude Code CLI:
```javascript
const claudeProcess = spawn('claude', [
  '--project-path', projectPath,
  '--message', message,
  '--format', 'json'
]);
```

## Integration Flow

### 1. User Sends Message

```
User types message in ChatPanel
    ↓
Frontend emits 'ai-message' via Socket.IO
    ↓
Backend receives message in server.js
    ↓
claudeService processes message
    ↓
Backend emits 'ai-response' back to frontend
    ↓
ChatPanel displays response
```

### 2. Session Lifecycle

```
1. User opens project → ChatPanel connects via Socket.IO
2. First message triggers session initialization
3. claudeService creates session with CLAUDE.md context
4. Messages are processed with quota checks
5. Every 5 messages, CLAUDE.md is auto-updated
6. Session ends on project close or explicit end
```

### 3. Memory Integration

```
Message sent
    ↓
claudeService.sendMessage()
    ↓
Execute claude-wrapper.js with CLAUDE.md context
    ↓
Response generated
    ↓
Every 5 messages: Update CLAUDE.md with conversation
    ↓
memoryService.updateMemory()
    ↓
Create memory snapshot in database
```

## Quota Enforcement

All chat operations are subject to quota limits:

```javascript
// Before processing each message:
1. Check user quotas (tokens, cost, rate limit)
2. If quota exceeded → reject message
3. Process message
4. Log token usage to usage_ledger
5. Update user quota counters
```

**Enforced Limits**:
- Monthly token limit (default: 1M tokens)
- Cost limit (default: $100/month)
- Rate limit (default: 10 requests/minute)

## Configuration

**Environment Variables**:
```bash
# Claude Code CLI configuration
ANTHROPIC_API_KEY=sk-ant-xxx

# Timeout for Claude commands (milliseconds)
CLAUDE_TIMEOUT=120000

# Token estimation ratio (chars per token)
CLAUDE_TOKEN_RATIO=4
```

## Usage Examples

### Frontend (ChatPanel)

```typescript
// Send message
socket.emit('ai-message', {
  projectId: currentProject.id,
  message: 'Add error handling to the login function'
});

// Listen for response
socket.on('ai-response', (data) => {
  setMessages([...messages, {
    role: 'assistant',
    content: data.message,
    timestamp: new Date()
  }]);
});

// Listen for errors
socket.on('ai-error', (data) => {
  alert(`Error: ${data.error}`);
});
```

### Backend (API)

```javascript
// Initialize session
const response = await fetch('/api/chat/sessions/project-123/init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user-123' })
});

// Send message (REST API alternative to WebSocket)
const response = await fetch('/api/chat/sessions/project-123/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    message: 'Review this code for bugs'
  })
});

const data = await response.json();
// data.message - Claude's response
// data.tokensUsed - Token count
```

## Error Handling

**Common Errors**:

1. **Quota Exceeded**
```javascript
{
  success: false,
  error: 'User quota exceeded. Cannot start Claude session.'
}
```

2. **Session Not Found**
```javascript
{
  success: false,
  error: 'Session not initialized. Call initializeSession first.'
}
```

3. **CLI Timeout**
```javascript
{
  success: false,
  error: 'Claude command timed out'
}
```

4. **Project Not Found**
```javascript
{
  success: false,
  error: 'Project not found'
}
```

## Security

**Implemented Safeguards**:

1. **Quota Enforcement** - Hard limits prevent runaway costs
2. **User Verification** - Only project owner can chat
3. **Process Isolation** - Each session runs in isolated context
4. **Timeout Protection** - Commands timeout after 2 minutes
5. **Input Validation** - Messages are validated before processing
6. **Rate Limiting** - Prevents abuse

## Production Deployment

**Steps to Deploy with Real Claude Code CLI**:

1. Install Claude Code CLI on server
2. Configure ANTHROPIC_API_KEY
3. Replace `claude-wrapper.js` spawn command:
   ```javascript
   // Change from:
   spawn('node', ['src/scripts/claude-wrapper.js', ...args])

   // To:
   spawn('claude', args)
   ```
4. Update timeout based on real CLI performance
5. Monitor token usage and costs
6. Set up logging and error tracking

## Monitoring

**Metrics to Track**:
- Messages per session
- Average tokens per message
- Session duration
- Error rate
- API response time
- Token usage by user/project
- Cost per user/project

**Logging**:
All chat operations are logged via winston:
```javascript
logger.info('Claude session initialized', { projectId, userId });
logger.error('Failed to send message', { error, projectId });
```

## Future Enhancements

1. **Streaming Responses** - Stream Claude's response in real-time
2. **Multi-file Context** - Include multiple files in context
3. **Code Execution** - Allow Claude to execute code changes
4. **Voice Chat** - Add voice interface
5. **Conversation Branching** - Support multiple conversation threads
6. **Auto-suggestions** - Proactive code suggestions
7. **Team Chat** - Multi-user collaboration

## Troubleshooting

**Issue: Messages not sending**
- Check WebSocket connection status
- Verify project exists and user has access
- Check quota limits

**Issue: Slow responses**
- Increase CLAUDE_TIMEOUT
- Check CLAUDE.md file size
- Monitor server resources

**Issue: High token usage**
- Review conversation length
- Compact CLAUDE.md regularly
- Implement message summarization

## References

- [Claude Code Documentation](https://docs.claude.com/claude-code)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Winston Logger](https://github.com/winstonjs/winston)
