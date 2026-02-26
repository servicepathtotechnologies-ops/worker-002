// Chatbot Page Generator Service
// Generates static HTML pages for chatbot workflows

import * as fs from 'fs';
import * as path from 'path';

export interface ChatbotPageConfig {
  workflowId: string;
  workflowName: string;
  endpointUrl: string;
  pageUrl: string;
  embedUrl?: string;
  memoryEnabled?: boolean;
  authEnabled?: boolean;
  isEmbed?: boolean;
}

export class ChatbotPageGenerator {
  /**
   * Check if workflow is a chatbot workflow
   * Must have:
   * 1. Chatbot-capable trigger (HTTP / Webhook / Chat Input / API)
   * 2. AI Agent or chatbot logic node
   * 3. Response-producing node
   */
  isChatbotWorkflow(workflow: {
    nodes: any[];
    edges: any[];
  }): boolean {
    const nodes = workflow.nodes || [];
    
    // Check for chatbot-capable trigger
    const hasChatbotTrigger = nodes.some(node => {
      const nodeType = node.type || node.data?.type || '';
      const typeLower = nodeType.toLowerCase();
      return typeLower.includes('webhook') ||
             typeLower.includes('http') ||
             typeLower.includes('chat') ||
             typeLower.includes('api') ||
             typeLower === 'manual_trigger'; // Manual trigger can be used for chatbot
    });
    
    // Check for AI Agent or chatbot logic node
    const hasAIAgent = nodes.some(node => {
      const nodeType = node.type || node.data?.type || '';
      const typeLower = nodeType.toLowerCase();
      return typeLower.includes('ai_agent') ||
             typeLower.includes('chat_model') ||
             typeLower.includes('openai') ||
             typeLower.includes('claude') ||
             typeLower.includes('gemini') ||
             typeLower.includes('chatbot');
    });
    
    // Check for response-producing node
    const hasResponseNode = nodes.some(node => {
      const nodeType = node.type || node.data?.type || '';
      const typeLower = nodeType.toLowerCase();
      return typeLower.includes('respond') ||
             typeLower.includes('output') ||
             typeLower.includes('log_output') ||
             typeLower.includes('webhook_response');
    });
    
    return hasChatbotTrigger && hasAIAgent && hasResponseNode;
  }

  /**
   * Generate static HTML page for chatbot workflow
   * Supports memory, auth, and embed modes
   */
  generateChatbotPage(config: ChatbotPageConfig): string {
    const { workflowId, workflowName, endpointUrl, memoryEnabled = true, authEnabled = false, isEmbed = false } = config;
    
    const embedStyle = isEmbed ? '#f5f5f5' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const embedLayout = isEmbed ? 'margin: 0; padding: 0;' : 'display: flex; justify-content: center; align-items: center; padding: 20px;';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(workflowName)} - Chatbot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: ${embedStyle};
            height: 100vh;
            ${embedLayout}
        }
        
        .chatbot-container {
            width: 100%;
            max-width: 800px;
            height: 90vh;
            max-height: 700px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 18px;
            font-weight: 600;
        }
        
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f8f9fa;
        }
        
        .message {
            margin-bottom: 16px;
            display: flex;
            animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .message.user {
            justify-content: flex-end;
        }
        
        .message.bot {
            justify-content: flex-start;
        }
        
        .message-content {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            line-height: 1.4;
        }
        
        .message.user .message-content {
            background: #667eea;
            color: white;
            border-bottom-right-radius: 4px;
        }
        
        .message.bot .message-content {
            background: white;
            color: #333;
            border: 1px solid #e0e0e0;
            border-bottom-left-radius: 4px;
        }
        
        .chat-input-container {
            padding: 20px;
            background: white;
            border-top: 1px solid #e0e0e0;
            display: flex;
            gap: 12px;
        }
        
        .chat-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 24px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
        }
        
        .chat-input:focus {
            border-color: #667eea;
        }
        
        .send-button {
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 24px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .send-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        .send-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .loading-indicator {
            display: none;
            padding: 12px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        
        .loading-indicator.active {
            display: block;
        }
        
        .error-message {
            background: #fee;
            color: #c33;
            padding: 12px 16px;
            border-radius: 8px;
            margin: 8px 20px;
            border: 1px solid #fcc;
        }
        
        .empty-state {
            text-align: center;
            color: #999;
            padding: 40px 20px;
        }
        
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="chatbot-container">
        <div class="chat-header">
            ${this.escapeHtml(workflowName)}
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <div>Start a conversation</div>
            </div>
        </div>
        
        <div class="loading-indicator" id="loadingIndicator">
            Thinking...
        </div>
        
        <div class="chat-input-container">
            <input 
                type="text" 
                class="chat-input" 
                id="chatInput" 
                placeholder="Type your message..."
                autocomplete="off"
            />
            <button class="send-button" id="sendButton">Send</button>
        </div>
    </div>
    
    <script>
        const endpointUrl = ${JSON.stringify(endpointUrl)};
        const workflowId = ${JSON.stringify(workflowId)};
        const memoryEnabled = ${memoryEnabled ? 'true' : 'false'};
        const isEmbed = ${isEmbed ? 'true' : 'false'};
        
        // Generate or retrieve session ID (persist in localStorage for memory)
        let sessionId = localStorage.getItem('chatbot_session_' + workflowId);
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chatbot_session_' + workflowId, sessionId);
        }
        
        // Load conversation history from localStorage if memory enabled
        let conversationHistory = [];
        if (memoryEnabled) {
            const stored = localStorage.getItem('chatbot_history_' + workflowId + '_' + sessionId);
            if (stored) {
                try {
                    conversationHistory = JSON.parse(stored);
                    // Restore messages to UI
                    conversationHistory.forEach(msg => {
                        if (msg.role === 'user' || msg.role === 'assistant') {
                            addMessage(msg.content, msg.role === 'user');
                        }
                    });
                } catch (e) {
                    console.error('Error loading conversation history:', e);
                }
            }
        }
        
        // Handle iframe messaging for embed mode
        if (isEmbed && window.parent !== window) {
            window.addEventListener('message', (event) => {
                if (event.data.type === 'chatbot_message' && event.data.workflowId === workflowId) {
                    sendMessageFromExternal(event.data.message);
                }
            });
            
            // Notify parent that chatbot is ready
            window.parent.postMessage({ type: 'chatbot_ready', workflowId: workflowId }, '*');
        }
        
        const chatMessages = document.getElementById('chatMessages');
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');
        const loadingIndicator = document.getElementById('loadingIndicator');
        
        function addMessage(text, isUser) {
            const emptyState = chatMessages.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (isUser ? 'user' : 'bot');
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = text;
            
            messageDiv.appendChild(contentDiv);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = message || 'An error occurred. Please try again.';
            chatMessages.appendChild(errorDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        async function sendMessage() {
            const message = chatInput.value.trim();
            if (!message) return;
            sendMessageFromExternal(message);
        }
        
        async function sendMessageFromExternal(message) {
            // Add user message
            addMessage(message, true);
            if (chatInput) chatInput.value = '';
            if (sendButton) sendButton.disabled = true;
            if (loadingIndicator) loadingIndicator.classList.add('active');
            
            // Store user message in memory if enabled
            if (memoryEnabled) {
                conversationHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
                localStorage.setItem('chatbot_history_' + workflowId + '_' + sessionId, JSON.stringify(conversationHistory));
            }
            
            try {
                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        session_id: sessionId,
                        user_message: message
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to get response');
                }
                
                const data = await response.json();
                
                // Extract reply from response
                let reply = '';
                if (data.reply) {
                    reply = data.reply;
                } else if (data.message) {
                    reply = data.message;
                } else if (data.response) {
                    reply = data.response;
                } else if (typeof data === 'string') {
                    reply = data;
                } else {
                    // Try to extract from nested structure
                    reply = JSON.stringify(data);
                }
                
                addMessage(reply, false);
                
                // Store assistant reply in memory if enabled
                if (memoryEnabled) {
                    conversationHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
                    // Keep only last 50 messages to avoid localStorage size limits
                    if (conversationHistory.length > 50) {
                        conversationHistory = conversationHistory.slice(-50);
                    }
                    localStorage.setItem('chatbot_history_' + workflowId + '_' + sessionId, JSON.stringify(conversationHistory));
                }
                
                // Notify parent if embed mode
                if (isEmbed && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'chatbot_response',
                        workflowId: workflowId,
                        reply: reply
                    }, '*');
                }
            } catch (error) {
                console.error('Chat error:', error);
                showError('Failed to send message. Please try again.');
            } finally {
                if (sendButton) sendButton.disabled = false;
                if (loadingIndicator) loadingIndicator.classList.remove('active');
                if (chatInput) chatInput.focus();
            }
        }
        
        sendButton.addEventListener('click', sendMessage);
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Focus input on load
        chatInput.focus();
    </script>
</body>
</html>`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    // Node.js environment - escape HTML
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get chatbot page URL for a workflow
   */
  getChatbotPageUrl(workflowId: string, baseUrl?: string): string {
    const base = baseUrl || process.env.PUBLIC_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
    return `${base}/workflows/${workflowId}/page`;
  }

  /**
   * Get chatbot embed URL for a workflow
   */
  getChatbotEmbedUrl(workflowId: string, baseUrl?: string): string {
    const base = baseUrl || process.env.PUBLIC_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
    return `${base}/workflows/${workflowId}/embed`;
  }

  /**
   * Get chatbot endpoint URL for a workflow
   */
  getChatbotEndpointUrl(workflowId: string, baseUrl?: string): string {
    const base = baseUrl || process.env.PUBLIC_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
    return `${base}/api/chatbot/${workflowId}/message`;
  }
}

// Export singleton instance
export const chatbotPageGenerator = new ChatbotPageGenerator();
