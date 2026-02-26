import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';

// Type guard to ensure we have a valid HTTP server
function isHttpServer(server: any): server is Server {
  return server && typeof server.listen === 'function' && typeof server.on === 'function';
}

interface ChatSession {
  sessionId: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  ws: WebSocket;
  createdAt: Date;
  lastActivity: Date;
  messages: Array<{
    type: 'user' | 'workflow';
    message: string;
    timestamp: Date;
  }>;
}

/**
 * Chat Server for managing chat trigger sessions
 * Handles WebSocket connections for chat interfaces and routes messages to workflows
 */
export class ChatServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, ChatSession> = new Map();
  private messageCallbacks: Map<string, (message: string) => void> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // Default session timeout: 1 hour
  private readonly SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    try {
      // Validate server object
      if (!isHttpServer(server)) {
        throw new Error('Invalid server object provided. Expected HTTP Server instance.');
      }

      console.log('[ChatServer] Initializing WebSocket server...');
      console.log('[ChatServer] Server type:', server.constructor.name);
      console.log('[ChatServer] Server listening:', server.listening);
      console.log('[ChatServer] Server address:', server.address());

      // Create WebSocket server - use noServer option and handle upgrade manually for better control
      this.wss = new WebSocketServer({ 
        noServer: true, // Don't auto-handle upgrades, we'll do it manually
        perMessageDeflate: false, // Disable compression for debugging
      });

      // Manually handle upgrade requests
      server.on('upgrade', (request, socket, head) => {
        try {
          const url = new URL(request.url || '', `http://${request.headers.host}`);
          
          // Only handle /ws/chat path
          if (url.pathname === '/ws/chat') {
            console.log('[ChatServer] 🔄 WebSocket upgrade request for /ws/chat');
            console.log('[ChatServer] Request URL:', request.url);
            console.log('[ChatServer] Origin:', request.headers.origin);
            
            // ✅ CRITICAL: Add error handling for upgrade
            socket.on('error', (error) => {
              console.error('[ChatServer] ❌ Socket error during upgrade:', error);
            });
            
            // ✅ CRITICAL: Validate WebSocket server exists before upgrade
            if (!this.wss) {
              console.error('[ChatServer] ❌ WebSocket server not initialized');
              socket.destroy();
              return;
            }
            
            // Handle the upgrade
            try {
              this.wss.handleUpgrade(request, socket, head, (ws) => {
                console.log('[ChatServer] ✅ WebSocket upgrade successful');
                console.log('[ChatServer] WebSocket readyState:', ws.readyState);
                this.wss!.emit('connection', ws, request);
              });
            } catch (upgradeError: any) {
              console.error('[ChatServer] ❌ Error in handleUpgrade:', upgradeError);
              console.error('[ChatServer] Upgrade error details:', upgradeError?.message, upgradeError?.stack);
              if (!socket.destroyed) {
                socket.destroy();
              }
            }
          } else {
            // Not our path, destroy the socket
            console.log(`[ChatServer] Ignoring upgrade request for path: ${url.pathname}`);
            if (!socket.destroyed) {
              socket.destroy();
            }
          }
        } catch (error: any) {
          console.error('[ChatServer] ❌ Error processing upgrade request:', error);
          console.error('[ChatServer] Error details:', error?.message, error?.stack);
          if (!socket.destroyed) {
            socket.destroy();
          }
        }
      });

      this.wss.on('connection', (ws: WebSocket, req) => {
        console.log('[ChatServer] ✅ New WebSocket connection received');
        this.handleClientConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        console.error('[ChatServer] ❌ WebSocket server error:', error);
        console.error('[ChatServer] Error details:', error.message, error.stack);
      });

      this.wss.on('listening', () => {
        console.log('[ChatServer] ✅ WebSocket server is listening on /ws/chat');
      });


      // Verify WebSocket server was created
      if (!this.wss) {
        throw new Error('WebSocketServer was not created');
      }

      console.log('[ChatServer] ✅ WebSocket server initialized successfully');
      console.log('[ChatServer] Path: /ws/chat');
      console.log('[ChatServer] Ready to accept connections');
    } catch (error: any) {
      console.error('[ChatServer] ❌ Failed to initialize WebSocket server:', error);
      console.error('[ChatServer] Error stack:', error?.stack);
      throw error;
    }
  }

  /**
   * Handle new client connection
   */
  private handleClientConnection(ws: WebSocket, req: any): void {
    console.log('[ChatServer] New WebSocket connection attempt');
    console.log('[ChatServer] Request URL:', req.url);
    console.log('[ChatServer] Request headers:', req.headers);
    
    // Extract sessionId from query parameters
    let sessionId: string | null = null;
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      sessionId = url.searchParams.get('sessionId');
      console.log('[ChatServer] Extracted sessionId:', sessionId);
    } catch (urlError: any) {
      console.error('[ChatServer] Error parsing URL:', urlError);
      ws.close(1008, 'Invalid URL');
      return;
    }

    if (!sessionId) {
      console.warn('[ChatServer] Connection rejected: no sessionId provided');
      ws.close(1008, 'Session ID required');
      return;
    }

    // Check if session exists, if not create it (for static sessionId format)
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Auto-create session for static format: workflowId_nodeId or workflowId_node_nodeId
      // Handle both formats: "workflowId_nodeId" and "workflowId_node_nodeId"
      let workflowId: string | null = null;
      let nodeId: string | null = null;
      
      // Try to parse sessionId - handle both formats
      if (sessionId.includes('_node_')) {
        // Format: workflowId_node_nodeId
        const parts = sessionId.split('_node_');
        if (parts.length === 2) {
          workflowId = parts[0];
          nodeId = parts[1];
        }
      } else {
        // Format: workflowId_nodeId (may have multiple underscores)
        const parts = sessionId.split('_');
        if (parts.length >= 2) {
          workflowId = parts[0];
          nodeId = parts.slice(1).join('_');
        }
      }
      
      if (workflowId && nodeId) {
        console.log(`[ChatServer] Auto-creating session ${sessionId} for workflow ${workflowId}, node ${nodeId}`);
        this.createSession(sessionId, workflowId, `auto-${Date.now()}`, nodeId);
        session = this.sessions.get(sessionId);
      } else {
        console.warn(`[ChatServer] Could not parse sessionId format: ${sessionId}`);
      }
    }

    if (!session) {
      console.warn(`[ChatServer] Connection rejected: session ${sessionId} not found and could not be created`);
      ws.close(1008, 'Session not found');
      return;
    }

    // Update session with WebSocket connection
    session.ws = ws;
    session.lastActivity = new Date();

    // Send welcome message
    this.sendToSession(sessionId, {
      type: 'system',
      message: 'Connected to chat. You can now send messages.',
    });

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'chat' && message.content) {
          this.handleChatMessage(sessionId, message.content);
        } else if (message.type === 'agent_response') {
          // Handle agent response from workflow (forward to UI)
          this.sendToSession(sessionId, {
            type: 'chat',
            message: message.content || message.message,
          });
        } else if (message.type === 'ping') {
          // Heartbeat
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error(`[ChatServer] Error processing message from session ${sessionId}:`, error);
        this.sendToSession(sessionId, {
          type: 'error',
          message: 'Failed to process message. Please try again.',
        });
      }
    });

    ws.on('close', () => {
      console.log(`[ChatServer] WebSocket closed for session ${sessionId}`);
      // Don't delete session immediately - allow reconnection
      // Session will be cleaned up by timeout
    });

    ws.on('error', (error) => {
      console.error(`[ChatServer] WebSocket error for session ${sessionId}:`, error);
    });

    console.log(`[ChatServer] Client connected to session ${sessionId}`);
  }

  /**
   * Handle chat message from user
   */
  private async handleChatMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[ChatServer] Message received for unknown session: ${sessionId}`);
      return;
    }

    // Update last activity
    session.lastActivity = new Date();
    session.messages.push({
      type: 'user',
      message,
      timestamp: new Date(),
    });

    // Trigger callback if registered
    const callback = this.messageCallbacks.get(sessionId);
    if (callback) {
      callback(message);
    }

    // CRITICAL: Trigger workflow execution by calling the chat-trigger API endpoint internally
    // This ensures messages sent via WebSocket also trigger workflow execution
    try {
      const config = require('../core/config').config;
      const baseUrl = config.publicBaseUrl || `http://localhost:${config.port}`;
      const apiUrl = `${baseUrl}/api/chat-trigger/${session.workflowId}/${session.nodeId}/message`;
      
      console.log(`[ChatServer] Triggering workflow execution via internal API: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(`HTTP ${response.status}: ${errorData.message || errorData.error || 'Failed to trigger workflow'}`);
      }

      const result = await response.json() as { executionId?: string; [key: string]: any };
      console.log(`[ChatServer] ✅ Workflow execution triggered via WebSocket:`, result);
      
      // Update session with new execution ID if provided
      if (result.executionId) {
        (session as any).executionId = result.executionId;
      }
    } catch (error: any) {
      console.error(`[ChatServer] Error triggering workflow execution for WebSocket message:`, error);
      // Send error message back to client
      this.sendToSession(sessionId, {
        type: 'error',
        message: 'Failed to process message. Please try again.',
      });
    }

    // Emit event for workflow to handle (for backwards compatibility)
    this.emit('message', {
      sessionId,
      workflowId: session.workflowId,
      executionId: session.executionId,
      nodeId: session.nodeId,
      message,
    });
  }

  /**
   * Create a new chat session
   */
  createSession(
    sessionId: string,
    workflowId: string,
    executionId: string,
    nodeId: string
  ): void {
    // Clean up existing session if any
    this.destroySession(sessionId);

    const session: ChatSession = {
      sessionId,
      workflowId,
      executionId,
      nodeId,
      ws: null as any, // Will be set when client connects
      createdAt: new Date(),
      lastActivity: new Date(),
      messages: [],
    };

    this.sessions.set(sessionId, session);

    // Set timeout to clean up session
    const timeout = setTimeout(() => {
      console.log(`[ChatServer] Session ${sessionId} expired`);
      this.destroySession(sessionId);
    }, this.SESSION_TIMEOUT);

    this.sessionTimeouts.set(sessionId, timeout);

    console.log(`[ChatServer] Created session ${sessionId} for workflow ${workflowId}, execution ${executionId}`);
  }

  /**
   * Register callback for when a message arrives for a session
   */
  registerMessageCallback(sessionId: string, callback: (message: string) => void): void {
    this.messageCallbacks.set(sessionId, callback);
  }

  /**
   * Send message to chat interface
   * Can be called from workflow execution to send AI agent responses
   */
  sendToSession(sessionId: string, data: { type: string; message: string }): boolean {
    const session = this.sessions.get(sessionId);
    
    // If session doesn't exist, try to auto-create it (for static sessionId format)
    if (!session) {
      const parts = sessionId.split('_');
      if (parts.length >= 2) {
        const workflowId = parts[0];
        const nodeId = parts.slice(1).join('_');
        console.log(`[ChatServer] Auto-creating session ${sessionId} for message forwarding`);
        this.createSession(sessionId, workflowId, `auto-${Date.now()}`, nodeId);
      }
    }
    
    const updatedSession = this.sessions.get(sessionId);
    if (!updatedSession || !updatedSession.ws) {
      console.warn(`[ChatServer] Cannot send message: session ${sessionId} not connected (session exists: ${!!updatedSession})`);
      return false;
    }

    try {
      if (updatedSession.ws.readyState === WebSocket.OPEN) {
        updatedSession.ws.send(JSON.stringify(data));
        updatedSession.lastActivity = new Date();
        
        // Store workflow message in session history
        if (data.type === 'chat' || data.type === 'workflow') {
          updatedSession.messages.push({
            type: 'workflow',
            message: data.message,
            timestamp: new Date(),
          });
        }
        
        console.log(`[ChatServer] ✅ Sent message to session ${sessionId}: ${data.message.substring(0, 50)}...`);
        return true;
      } else {
        console.warn(`[ChatServer] WebSocket not open for session ${sessionId} (state: ${updatedSession.ws.readyState})`);
        return false;
      }
    } catch (error) {
      console.error(`[ChatServer] Error sending message to session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Array<{ sessionId: string; workflowId: string; executionId: string; lastActivity: Date }> {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      workflowId: session.workflowId,
      executionId: session.executionId,
      lastActivity: session.lastActivity,
    }));
  }

  /**
   * Destroy a session
   */
  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Close WebSocket if open
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }

      // Clear timeout
      const timeout = this.sessionTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        this.sessionTimeouts.delete(sessionId);
      }

      // Remove callbacks
      this.messageCallbacks.delete(sessionId);

      // Remove session
      this.sessions.delete(sessionId);

      console.log(`[ChatServer] Destroyed session ${sessionId}`);
    }
  }

  /**
   * Clean up all sessions (for shutdown)
   */
  destroy(): void {
    // Clear all timeouts
    for (const timeout of this.sessionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.sessionTimeouts.clear();

    // Close all WebSocket connections
    for (const session of this.sessions.values()) {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }
    }

    // Clear all data
    this.sessions.clear();
    this.messageCallbacks.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('[ChatServer] Destroyed all sessions and closed server');
  }
}

// Singleton instance
let chatServerInstance: ChatServer | null = null;

export function getChatServer(): ChatServer {
  if (!chatServerInstance) {
    chatServerInstance = new ChatServer();
  }
  return chatServerInstance;
}
