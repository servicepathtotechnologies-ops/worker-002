# WebSocket Chat Server Environment Configuration

## Issue
WebSocket upgrade requests are being made but connections may not be completing. This guide helps configure the environment variables correctly.

## Required Environment Variables

### Backend (Worker Service) - `worker/.env`

```bash
# ============================================
# Worker Service Configuration
# ============================================
PORT=3001
PUBLIC_BASE_URL=http://localhost:3001

# ============================================
# WebSocket Configuration (Chat Trigger)
# ============================================
# WebSocket URL for chat connections
# Development: ws://localhost:3001
# Production: wss://your-domain.com
WEBSOCKET_URL=ws://localhost:3001

# WebSocket path for chat (default: /ws/chat)
WEBSOCKET_PATH=/ws/chat

# Enable chat forwarding from AI agent to UI
CHAT_FORWARDING_ENABLED=true

# Maximum chat message size in bytes
MAX_CHAT_MESSAGE_SIZE=5000

# Chat heartbeat interval in milliseconds
CHAT_HEARTBEAT_INTERVAL=30000

# Enable debug logging for chat WebSocket
CHAT_DEBUG=true
```

### Frontend - `ctrl_checks/.env.local`

```bash
# ============================================
# Worker Service Configuration
# ============================================
# Local development: http://localhost:3001
# Production: https://your-worker-domain.com
VITE_API_URL=http://localhost:3001
```

## How It Works

1. **Frontend** (`ctrl_checks/src/pages/ChatTrigger.tsx`):
   - Reads `VITE_API_URL` from environment
   - Constructs WebSocket URL: `ws://${apiUrl.host}/ws/chat?sessionId=...`
   - Connects to backend WebSocket server

2. **Backend** (`worker/src/index.ts`):
   - Server runs on `PORT` (default: 3001)
   - WebSocket server initialized on same port
   - Endpoint: `ws://localhost:3001/ws/chat`

## Common Issues & Solutions

### Issue 1: WebSocket Connection Fails
**Symptoms:** Multiple WebSocket upgrade requests but no successful connection

**Solutions:**
1. **Check Backend is Running:**
   ```bash
   # Verify worker service is running on port 3001
   curl http://localhost:3001/health
   ```

2. **Check WebSocket Health:**
   ```bash
   curl http://localhost:3001/api/chat/health
   ```
   Should return: `{"websocket": {"initialized": true}}`

3. **Verify Environment Variables:**
   - Backend: `PORT=3001` in `worker/.env`
   - Frontend: `VITE_API_URL=http://localhost:3001` in `ctrl_checks/.env.local`

### Issue 2: CORS Errors
**Symptoms:** WebSocket upgrade blocked by CORS

**Solutions:**
1. **Backend CORS Configuration** (`worker/src/core/config.ts`):
   ```bash
   # In worker/.env
   CORS_ORIGIN=http://localhost:8080,http://localhost:5173
   ```

2. **Verify Frontend Origin:**
   - If frontend runs on `localhost:8080`, ensure CORS_ORIGIN includes it
   - If frontend runs on `localhost:5173`, ensure CORS_ORIGIN includes it

### Issue 3: Port Mismatch
**Symptoms:** WebSocket tries to connect to wrong port

**Solutions:**
1. **Backend Port:**
   - Set `PORT=3001` in `worker/.env`
   - Restart worker service

2. **Frontend API URL:**
   - Set `VITE_API_URL=http://localhost:3001` in `ctrl_checks/.env.local`
   - Restart frontend dev server (Vite needs restart to pick up env changes)

### Issue 4: WebSocket Server Not Initialized
**Symptoms:** Health check shows `{"websocket": {"initialized": false}}`

**Solutions:**
1. **Check Server Logs:**
   - Look for: `💬 Chat WebSocket server initialized`
   - Look for: `Chat WebSocket endpoint: ws://localhost:3001/ws/chat`

2. **Verify Dependencies:**
   ```bash
   cd worker
   npm install ws
   ```

3. **Check Server Startup:**
   - Ensure `worker/src/index.ts` successfully initializes chat server
   - Check for errors in server startup logs

## Quick Setup Checklist

- [ ] Backend `.env` file exists in `worker/` directory
- [ ] `PORT=3001` set in `worker/.env`
- [ ] `WEBSOCKET_URL=ws://localhost:3001` set in `worker/.env`
- [ ] `CHAT_DEBUG=true` set for debugging (optional)
- [ ] Frontend `.env.local` file exists in `ctrl_checks/` directory
- [ ] `VITE_API_URL=http://localhost:3001` set in `ctrl_checks/.env.local`
- [ ] Backend server restarted after env changes
- [ ] Frontend dev server restarted after env changes
- [ ] WebSocket health check passes: `curl http://localhost:3001/api/chat/health`

## Testing WebSocket Connection

1. **Check Health:**
   ```bash
   curl http://localhost:3001/api/chat/health
   ```

2. **Test WebSocket (using wscat):**
   ```bash
   npm install -g wscat
   wscat -c ws://localhost:3001/ws/chat?sessionId=test-session
   ```

3. **Check Browser Console:**
   - Open browser DevTools → Network → WS tab
   - Look for WebSocket connection to `ws://localhost:3001/ws/chat`
   - Status should be "101 Switching Protocols"

## Production Configuration

For production, update these variables:

**Backend (`worker/.env`):**
```bash
PORT=3001
PUBLIC_BASE_URL=https://your-worker-domain.com
WEBSOCKET_URL=wss://your-worker-domain.com
CORS_ORIGIN=https://your-frontend-domain.com
```

**Frontend (`ctrl_checks/.env.local`):**
```bash
VITE_API_URL=https://your-worker-domain.com
```

## Debugging

Enable debug logging:
```bash
# In worker/.env
CHAT_DEBUG=true
LOG_LEVEL=DEBUG
```

This will show detailed WebSocket connection logs in the server console.
