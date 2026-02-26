/**
 * Real-time Visualization Service
 * Provides WebSocket-based real-time updates to UI clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';
import { ExecutionStateManager, ExecutionStateUpdate } from './execution-state-manager';

export interface VisualConfig {
  borderColor: string;
  icon: string;
  animation?: string;
  progress?: number;
  badges?: Array<{ label: string; value: string | number }>;
  glow?: boolean;
  pulse?: boolean;
}

export interface ClientConnection {
  ws: WebSocket;
  executionIds: Set<string>;
  connectedAt: number;
}

/**
 * Visualization Service
 * Manages WebSocket connections and broadcasts execution updates
 */
export class VisualizationService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private executionStreams: Map<string, any> = new Map();
  private stateManager: ExecutionStateManager;

  constructor(stateManager: ExecutionStateManager) {
    super();
    this.stateManager = stateManager;
    
    // Subscribe to state manager updates
    this.setupStateManagerSubscriptions();
  }

  /**
   * Setup subscriptions to execution state manager
   */
  private setupStateManagerSubscriptions(): void {
    this.stateManager.on('execution_initialized', (execution) => {
      this.executionStreams.set(execution.executionId, execution);
      this.broadcastExecutionSnapshot(execution.executionId, execution);
    });

    this.stateManager.on('node_state_updated', ({ executionId, nodeState }) => {
      this.broadcastNodeUpdate(executionId, nodeState.nodeId, nodeState);
    });
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/executions',
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleClientConnection(ws, req);
    });

    console.log('[VisualizationService] WebSocket server initialized at /ws/executions');
  }

  /**
   * Handle new client connection
   */
  private handleClientConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();
    const executionId = this.extractExecutionId(req.url);

    const connection: ClientConnection = {
      ws,
      executionIds: new Set(),
      connectedAt: Date.now(),
    };

    if (executionId) {
      connection.executionIds.add(executionId);
    }

    this.clients.set(clientId, connection);

    // Send connection confirmation
    this.sendToClient(clientId, {
      type: 'CONNECTED',
      clientId,
      executionId,
      timestamp: Date.now(),
    });

    // Stream existing execution state if available
    if (executionId) {
      const execution = this.stateManager.getExecutionState(executionId);
      if (execution) {
        this.sendExecutionSnapshot(clientId, executionId, execution);
      }
    }

    // Setup message handler
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(clientId, message);
      } catch (error) {
        console.error('[VisualizationService] Error parsing client message:', error);
      }
    });

    // Setup close handler
    ws.on('close', () => {
      this.removeClient(clientId);
    });

    // Setup error handler
    ws.on('error', (error) => {
      console.error(`[VisualizationService] Client ${clientId} error:`, error);
      this.removeClient(clientId);
    });

    console.log(`[VisualizationService] Client connected: ${clientId}${executionId ? ` (watching ${executionId})` : ''}`);
  }

  /**
   * Handle client messages
   */
  private handleClientMessage(clientId: string, message: any): void {
    const connection = this.clients.get(clientId);
    if (!connection) return;

    switch (message.type) {
      case 'SUBSCRIBE':
        if (message.executionId) {
          connection.executionIds.add(message.executionId);
          const execution = this.stateManager.getExecutionState(message.executionId);
          if (execution) {
            this.sendExecutionSnapshot(clientId, message.executionId, execution);
          }
        }
        break;

      case 'UNSUBSCRIBE':
        if (message.executionId) {
          connection.executionIds.delete(message.executionId);
        }
        break;

      case 'PING':
        this.sendToClient(clientId, { type: 'PONG', timestamp: Date.now() });
        break;
    }
  }

  /**
   * Broadcast node update to all clients watching this execution
   */
  broadcastNodeUpdate(executionId: string, nodeId: string, nodeState: any): void {
    const visualConfig = this.generateVisualConfig(nodeState);

    const message = {
      type: 'NODE_UPDATE',
      data: {
        executionId,
        nodeId,
        status: nodeState.status,
        visual: visualConfig,
        timestamp: nodeState.timestamp,
        duration: nodeState.duration,
        progress: nodeState.progress,
        error: nodeState.error,
      },
    };

    this.broadcastToExecution(executionId, message);
  }

  /**
   * Broadcast execution snapshot
   */
  private broadcastExecutionSnapshot(executionId: string, execution: any): void {
    this.broadcastToExecution(executionId, {
      type: 'EXECUTION_SNAPSHOT',
      data: {
        executionId,
        status: execution.status,
        progress: execution.progress,
        totalNodes: execution.totalNodes,
        completedNodes: execution.completedNodes,
        startTime: execution.startTime,
        duration: execution.duration,
      },
    });
  }

  /**
   * Send execution snapshot to specific client
   */
  private sendExecutionSnapshot(clientId: string, executionId: string, execution: any): void {
    const nodeStates = Array.from(execution.nodes.values()).map((nodeState: any) => ({
      nodeId: nodeState.nodeId,
      nodeName: nodeState.nodeName,
      status: nodeState.status,
      visual: this.generateVisualConfig(nodeState),
      timestamp: nodeState.timestamp,
      duration: nodeState.duration,
      progress: nodeState.progress,
    }));

    this.sendToClient(clientId, {
      type: 'EXECUTION_SNAPSHOT',
      data: {
        executionId,
        status: execution.status,
        progress: execution.progress,
        totalNodes: execution.totalNodes,
        completedNodes: execution.completedNodes,
        startTime: execution.startTime,
        duration: execution.duration,
        nodes: nodeStates,
      },
    });
  }

  /**
   * Generate visual configuration for node state
   */
  generateVisualConfig(nodeState: any): VisualConfig {
    const status = nodeState.status || 'idle';
    
    const configs: Record<string, VisualConfig> = {
      idle: {
        borderColor: '#9ca3af',
        icon: 'circle',
        badges: [],
      },
      pending: {
        borderColor: '#9ca3af',
        icon: 'clock',
        badges: [],
      },
      running: {
        borderColor: '#3b82f6',
        icon: 'play',
        animation: 'pulse-running',
        glow: true,
        badges: nodeState.duration ? [
          { label: 'Duration', value: `${nodeState.duration}ms` },
        ] : [],
      },
      success: {
        borderColor: '#10b981',
        icon: 'check',
        badges: nodeState.duration ? [
          { label: 'Duration', value: `${nodeState.duration}ms` },
        ] : [],
      },
      error: {
        borderColor: '#ef4444',
        icon: 'x',
        animation: 'pulse-error',
        pulse: true,
        badges: nodeState.duration ? [
          { label: 'Duration', value: `${nodeState.duration}ms` },
          { label: 'Error', value: nodeState.error || 'Unknown' },
        ] : [],
      },
      skipped: {
        borderColor: '#f59e0b',
        icon: 'skip',
        badges: [],
      },
    };

    const baseConfig = configs[status] || configs.idle;

    // Add progress badge if available
    if (nodeState.progress !== undefined && nodeState.progress > 0) {
      baseConfig.badges = [
        ...(baseConfig.badges || []),
        { label: 'Progress', value: `${nodeState.progress}%` },
      ];
    }

    return baseConfig;
  }

  /**
   * Get status color
   */
  private getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      idle: '#9ca3af',
      pending: '#9ca3af',
      running: '#3b82f6',
      success: '#10b981',
      error: '#ef4444',
      skipped: '#f59e0b',
    };
    return colors[status] || colors.idle;
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      idle: 'circle',
      pending: 'clock',
      running: 'play',
      success: 'check',
      error: 'x',
      skipped: 'skip',
    };
    return icons[status] || icons.idle;
  }

  /**
   * Get status animation
   */
  private getStatusAnimation(status: string): string | undefined {
    if (status === 'running') return 'pulse-running';
    if (status === 'error') return 'pulse-error';
    return undefined;
  }

  /**
   * Broadcast message to all clients watching an execution
   */
  private broadcastToExecution(executionId: string, message: any): void {
    let sentCount = 0;
    
    this.clients.forEach((connection, clientId) => {
      if (connection.executionIds.has(executionId)) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    });

    if (sentCount > 0) {
      this.emit('broadcast', { executionId, message, clientCount: sentCount });
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): boolean {
    const connection = this.clients.get(clientId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[VisualizationService] Error sending to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Remove client connection
   */
  private removeClient(clientId: string): void {
    const connection = this.clients.get(clientId);
    if (connection) {
      connection.ws.removeAllListeners();
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
      this.clients.delete(clientId);
      console.log(`[VisualizationService] Client disconnected: ${clientId}`);
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract execution ID from URL
   */
  private extractExecutionId(url: string | undefined): string | null {
    if (!url) return null;
    
    const match = url.match(/[?&]executionId=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalClients: number;
    activeExecutions: number;
    totalConnections: number;
  } {
    const activeExecutions = new Set<string>();
    this.clients.forEach(connection => {
      connection.executionIds.forEach(id => activeExecutions.add(id));
    });

    return {
      totalClients: this.clients.size,
      activeExecutions: activeExecutions.size,
      totalConnections: this.clients.size,
    };
  }

  /**
   * Shutdown service
   */
  shutdown(): void {
    // Close all client connections
    this.clients.forEach((connection) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
    });
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
