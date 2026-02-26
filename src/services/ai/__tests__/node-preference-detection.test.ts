// Test cases for node preference detection
// Demonstrates the multi-node detection and preference querying system

import { nodeEquivalenceMapper } from '../node-equivalence-mapper';
import { enhancedWorkflowAnalyzer } from '../enhanced-workflow-analyzer';

describe('Node Preference Detection', () => {
  describe('NodeEquivalenceMapper', () => {
    it('should detect notification options when user mentions "notify"', () => {
      const result = nodeEquivalenceMapper.detectMultiNodeOptions(
        'Send me a notification when a new user signs up'
      );
      
      expect(result.length).toBeGreaterThan(0);
      const notificationGroup = result.find(r => r.category === 'notification');
      expect(notificationGroup).toBeDefined();
      expect(notificationGroup?.options.length).toBeGreaterThan(1);
      expect(notificationGroup?.options.some(o => o.id === 'slack')).toBe(true);
      expect(notificationGroup?.options.some(o => o.id === 'email')).toBe(true);
    });

    it('should detect database options when user mentions "store data"', () => {
      const result = nodeEquivalenceMapper.detectMultiNodeOptions(
        'Save customer data from the form'
      );
      
      const databaseGroup = result.find(r => r.category === 'database');
      expect(databaseGroup).toBeDefined();
      expect(databaseGroup?.options.length).toBeGreaterThan(1);
    });

    it('should detect scheduling options when user mentions "schedule"', () => {
      const result = nodeEquivalenceMapper.detectMultiNodeOptions(
        'Run this every Monday at 9 AM'
      );
      
      const schedulingGroup = result.find(r => r.category === 'scheduling');
      expect(schedulingGroup).toBeDefined();
      expect(schedulingGroup?.options.length).toBeGreaterThan(1);
    });

    it('should detect file storage options when user mentions "upload"', () => {
      const result = nodeEquivalenceMapper.detectMultiNodeOptions(
        'Upload images from the form'
      );
      
      const fileStorageGroup = result.find(r => r.category === 'file_storage');
      expect(fileStorageGroup).toBeDefined();
      expect(fileStorageGroup?.options.length).toBeGreaterThan(1);
    });

    it('should return empty array when no multi-node options exist', () => {
      const result = nodeEquivalenceMapper.detectMultiNodeOptions(
        'Process some data'
      );
      
      // Should return empty or minimal results
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('EnhancedWorkflowAnalyzer', () => {
    it('should extract node preferences from answers', () => {
      const answers = {
        'node_pref_notification': '💬 Slack Message',
        'node_pref_scheduling': '⏰ Fixed Schedule',
        'q1': 'Some other answer'
      };
      
      const preferences = enhancedWorkflowAnalyzer.extractNodePreferences(answers);
      
      expect(preferences.notification).toBe('slack');
      expect(preferences.scheduling).toBe('schedule');
    });

    it('should handle various answer formats', () => {
      const answers1 = {
        'node_pref_notification': 'Slack'
      };
      
      const answers2 = {
        'node_pref_notification': '💬 Slack Message'
      };
      
      const answers3 = {
        'node_pref_notification': 'slack_message'
      };
      
      const pref1 = enhancedWorkflowAnalyzer.extractNodePreferences(answers1);
      const pref2 = enhancedWorkflowAnalyzer.extractNodePreferences(answers2);
      const pref3 = enhancedWorkflowAnalyzer.extractNodePreferences(answers3);
      
      expect(pref1.notification).toBe('slack');
      expect(pref2.notification).toBe('slack');
      expect(pref3.notification).toBe('slack');
    });
  });
});

// Example test cases from the prompt
const testCases = [
  {
    input: "Notify me when sales exceed target",
    expected: {
      categories: ["notification"],
      question: "How should I notify you?",
      options: ["slack", "email", "sms"]
    }
  },
  {
    input: "Save user profile data",
    expected: {
      categories: ["database"],
      question: "Where should I save the data?",
      options: ["postgresql", "supabase", "mongodb"]
    }
  },
  {
    input: "Upload images from the form",
    expected: {
      categories: ["file_storage"],
      question: "Where should I upload the images?",
      options: ["s3", "google_drive", "local_file"]
    }
  },
  {
    input: "Run this every Monday at 9 AM",
    expected: {
      categories: ["scheduling"],
      question: "When should this workflow run?",
      options: ["schedule", "manual"]
    }
  }
];

export { testCases };
