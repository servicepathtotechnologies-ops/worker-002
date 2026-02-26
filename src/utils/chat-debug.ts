/**
 * Debug utility to trace WebSocket messages for chat integration
 */

export interface ChatDebugLog {
  timestamp: string;
  direction: 'ui_to_workflow' | 'workflow_to_ui';
  sessionId: string;
  message: string;
  success: boolean;
  error?: string;
}

export class ChatDebugLogger {
  private static logs: ChatDebugLog[] = [];
  private static maxLogs = 100; // Keep last 100 logs

  static logUIMessage(sessionId: string, message: string) {
    const log: ChatDebugLog = {
      timestamp: new Date().toISOString(),
      direction: 'ui_to_workflow',
      sessionId,
      message: typeof message === 'string' ? message.substring(0, 100) : 'Non-string message',
      success: true,
    };
    
    this.addLog(log);
    console.log(`[UI→Workflow] ${sessionId}: ${log.message}...`);
  }

  static logAgentResponse(sessionId: string, message: string, success: boolean, error?: string) {
    const log: ChatDebugLog = {
      timestamp: new Date().toISOString(),
      direction: 'workflow_to_ui',
      sessionId,
      message: typeof message === 'string' ? message.substring(0, 100) : 'Non-string message',
      success,
      error,
    };
    
    this.addLog(log);
    const status = success ? '✓' : '✗';
    console.log(`[Workflow→UI] ${sessionId} (${status}): ${log.message}...`);
    
    if (error) {
      console.error(`[Workflow→UI] Error: ${error}`);
    }
  }

  private static addLog(log: ChatDebugLog) {
    this.logs.push(log);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  static getRecentLogs(limit = 10): ChatDebugLog[] {
    return this.logs.slice(-limit);
  }

  static getAllLogs(): ChatDebugLog[] {
    return [...this.logs];
  }

  static checkConnectionHealth(sessionId: string) {
    const recentLogs = this.logs.filter(log => 
      log.sessionId === sessionId && 
      Date.now() - new Date(log.timestamp).getTime() < 30000 // Last 30 seconds
    );
    
    const uiToWorkflow = recentLogs.filter(log => log.direction === 'ui_to_workflow');
    const workflowToUi = recentLogs.filter(log => log.direction === 'workflow_to_ui');
    const successful = recentLogs.filter(log => log.success);
    const failed = recentLogs.filter(log => !log.success);
    
    return {
      sessionId,
      uiToWorkflow: uiToWorkflow.length,
      workflowToUi: workflowToUi.length,
      successful: successful.length,
      failed: failed.length,
      lastMessage: recentLogs[recentLogs.length - 1],
      health: workflowToUi.length > 0 && failed.length === 0 ? 'healthy' : failed.length > 0 ? 'broken' : 'unknown',
    };
  }

  static clearLogs() {
    this.logs = [];
  }

  static getStats() {
    const total = this.logs.length;
    const uiToWorkflow = this.logs.filter(log => log.direction === 'ui_to_workflow').length;
    const workflowToUi = this.logs.filter(log => log.direction === 'workflow_to_ui').length;
    const successful = this.logs.filter(log => log.success).length;
    const failed = this.logs.filter(log => !log.success).length;
    
    return {
      total,
      uiToWorkflow,
      workflowToUi,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
    };
  }
}
