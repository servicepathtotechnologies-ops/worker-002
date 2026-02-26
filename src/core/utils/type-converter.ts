/**
 * Type Conversion System
 * Converts values between different node output types
 * Ensures data compatibility between connected nodes
 */

import { NodeOutputType, getNodeOutputSchema } from '../types/node-output-types';

export class TypeConverter {
  /**
   * Convert a value to the expected output type
   */
  static convertToType(
    value: any,
    expectedType: NodeOutputType,
    nodeType?: string
  ): any {
    // If already correct type, return as-is
    if (this.getActualType(value) === expectedType) {
      return value;
    }

    // Handle special case: if value is already wrapped in output format, extract data
    if (value && typeof value === 'object' && 'data' in value) {
      value = value.data;
    }

    switch (expectedType) {
      case 'string':
        return this.toString(value, nodeType);
      
      case 'array':
        return this.toArray(value);
      
      case 'object':
        return this.toObject(value);
      
      case 'number':
        return this.toNumber(value);
      
      case 'boolean':
        return this.toBoolean(value);
      
      case 'void':
        return undefined;
      
      default:
        return value;
    }
  }

  /**
   * Convert any value to string
   */
  static toString(value: any, nodeType?: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      // CRITICAL: For output nodes (communication nodes), extract the message/content that was sent
      const outputNodeTypes = ['slack_message', 'email', 'discord', 'google_gmail', 'telegram', 'microsoft_teams', 'whatsapp_cloud', 'twilio', 'linkedin', 'twitter', 'instagram', 'facebook'];
      if (nodeType && outputNodeTypes.includes(nodeType)) {
        // Extract the actual message/content that was sent
        if (value.message_sent) return String(value.message_sent);
        if (value.message) return String(value.message);
        if (value.text) return String(value.text);
        if (value.content) return String(value.content);
        if (value.body) return String(value.body);
        if (value.response_text) return String(value.response_text);
        // If we have a success status, return a success message
        if (value.slack_status === 'success' || value.email_status === 'success') {
          return 'Message sent successfully';
        }
      }
      
      // For AI nodes, extract text response
      if (value.response) return String(value.response);
      if (value.response_text) return String(value.response_text);
      if (value.text) return String(value.text);
      if (value.content) return String(value.content);
      if (value.message) return String(value.message);
      // For AI agent with outputFormat config, check if JSON is requested
      if (nodeType === 'ai_agent' && value.outputFormat === 'json') {
        return JSON.stringify(value, null, 2);
      }
      // Otherwise stringify
      return JSON.stringify(value, null, 2);
    }
    if (Array.isArray(value)) {
      return value.map(item => 
        typeof item === 'object' ? JSON.stringify(item) : String(item)
      ).join('\n');
    }
    return String(value);
  }

  /**
   * Convert any value to array
   */
  static toArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && value !== null) {
      // If object has rows/data/items property, use that
      if (value.rows && Array.isArray(value.rows)) return value.rows;
      if (value.data && Array.isArray(value.data)) return value.data;
      if (value.items && Array.isArray(value.items)) return value.items;
      if (value.results && Array.isArray(value.results)) return value.results;
      // If wrapped in output format, check data field
      if (value.data && Array.isArray(value.data)) return value.data;
      // Convert object to array of values
      return Object.values(value);
    }
    if (typeof value === 'string') {
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // If not JSON, split by newlines or commas
        return value.split(/\n|,/).filter(Boolean).map(s => s.trim());
      }
    }
    // Single value becomes array with one item
    return [value];
  }

  /**
   * Convert any value to object
   */
  static toObject(value: any): object {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value;
    }
    if (Array.isArray(value)) {
      // Convert array to object with indexed keys
      const obj: Record<string, any> = {};
      value.forEach((item, index) => {
        obj[index.toString()] = item;
      });
      return obj;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed;
        }
      } catch {
        // If not JSON, wrap in object
        return { value, text: value };
      }
    }
    // Wrap primitive in object
    return { value };
  }

  /**
   * Convert any value to number
   */
  static toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    }
    if (typeof value === 'object' && value !== null) {
      if (typeof value.count === 'number') return value.count;
      if (typeof value.length === 'number') return value.length;
      if (typeof value.total === 'number') return value.total;
      if (typeof value.rowsAffected === 'number') return value.rowsAffected;
    }
    return 0;
  }

  /**
   * Convert any value to boolean
   */
  static toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
    }
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value).length > 0;
    }
    return Boolean(value);
  }

  /**
   * Get the actual type of a value
   */
  static getActualType(value: any): NodeOutputType {
    if (value === null || value === undefined) return 'void';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object') return 'object';
    return 'object';
  }
}
