# WebSocket Connection Troubleshooting

## Issue: WebSocket Connection Fails in Frontend

**Symptoms:**
- Frontend shows: `WebSocket connection to 'ws://localhost:3001/ws/chat...' failed`
- Backend logs show upgrade requests but no successful connection
- Workflow execution works (via HTTP API) but WebSocket UI doesn't connect

## Root Cause Analysis

The WebSocket upgrade requests are being received by the server, but the upgrade is not completing successfully. This is typically caused by:

1. **Error in `handleUpgrade`** - The upgrade callback is failing silently
2. **Socket already destroyed** - The socket is being closed before upgrade completes
3. **Missing error handling** - Errors are not being logged

## Solution Applied

### Enhanced Error Handling

Added comprehensive error handling to the WebSocket upgrade process:

```typescript
// ✅ CRITICAL: Validate WebSocket server exists before upgrade
if (!this.wss) {
  console.error('[ChatServer] ❌ WebSocket server not initialized');
  socket.destroy();
  return;
}

// ✅ CRITICAL: Add error handling for upgrade
socket.on('error', (error) => {
  console.error('[ChatServer] ❌ Socket error during upgrade:', error);
});

// Handle the upgrade with try-catch
try {
  this.wss.handleUpgrade(request, socket, head, (ws) => {
    console.log('[ChatServer] ✅ WebSocket upgrade successful');
    this.wss!.emit('connection', ws, request);
  });
} catch (upgradeError: any) {
  console.error('[ChatServer] ❌ Error in handleUpgrade:', upgradeError);
  socket.destroy();
}
```

## Debugging Steps

### 1. Check Server Logs

Look for these log messages in the backend:

**Expected logs:**
```
[ChatServer] 🔄 WebSocket upgrade request for /ws/chat
[ChatServer] ✅ WebSocket upgrade successful
[ChatServer] ✅ New WebSocket connection received
```

**If you see errors:**
```
[ChatServer] ❌ Error in handleUpgrade: ...
[ChatServer] ❌ Socket error during upgrade: ...
```

### 2. Verify WebSocket Server Initialization

Check that the chat server is initialized:

```bash
curl http://localhost:3001/api/chat/health
```

Should return:
```json
{
  "status": "ok",
  "websocket": {
    "initialized": true,
    "path": "/ws/chat",
    "activeSessions": 0
  }
}
```

### 3. Check Browser Console

In the browser DevTools Console, look for:
- WebSocket connection errors
- Network tab → WS filter → Check WebSocket connection status
- Status should be "101 Switching Protocols" if successful

### 4. Verify Environment Variables

**Backend (`worker/.env`):**
```bash
PORT=3001
WEBSOCKET_URL=ws://localhost:3001
CHAT_DEBUG=true  # Enable for detailed logging
```

**Frontend (`ctrl_checks/.env.local`):**
```bash
VITE_API_URL=http://localhost:3001
```

### 5. Test WebSocket Connection Directly

Using `wscat` (install: `npm install -g wscat`):

```bash
wscat -c ws://localhost:3001/ws/chat?sessionId=test-session
```

If this works, the issue is in the frontend. If it fails, the issue is in the backend.

## Common Issues & Fixes

### Issue 1: "WebSocket server not initialized"

**Fix:** Restart the worker service to ensure chat server initializes properly.

### Issue 2: "Socket error during upgrade"

**Possible causes:**
- Port conflict (another service using port 3001)
- Firewall blocking WebSocket connections
- Proxy/load balancer not configured for WebSocket upgrades

**Fix:**
- Check for port conflicts: `netstat -ano | findstr :3001` (Windows) or `lsof -i :3001` (Linux/Mac)
- Ensure firewall allows WebSocket connections
- If using a proxy, ensure it's configured for WebSocket upgrades

### Issue 3: Upgrade succeeds but connection closes immediately

**Possible causes:**
- Session validation failing
- Missing sessionId in query parameters
- Session not found

**Fix:**
- Check that sessionId is in the URL: `ws://localhost:3001/ws/chat?sessionId=...`
- Verify session format: `workflowId_nodeId` or `workflowId_node_nodeId`
- Check server logs for session creation/validation errors

## Workaround

If WebSocket connection fails, the workflow will still work via HTTP API:

1. Messages can be sent via the chat trigger API endpoint
2. AI agent responses will be returned via HTTP response
3. Only real-time UI updates via WebSocket will be unavailable

## Next Steps

1. **Check server logs** for the new error messages
2. **Verify WebSocket server initialization** via health check
3. **Test direct WebSocket connection** using wscat
4. **Review environment variables** to ensure correct configuration

If issues persist after applying these fixes, check the server logs for the specific error messages to identify the root cause.
