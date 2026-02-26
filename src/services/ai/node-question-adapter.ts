/**
 * Node Question Adapter
 * Bridges the old node-input-questions.ts system with the new node-question-order.ts system
 * Provides backward compatibility while enabling the new user-friendly ordering
 */

import { NodeQuestion } from './node-input-questions';
import { 
  QuestionDefinition, 
  getQuestionConfig, 
  getOrderedQuestions,
  getNextQuestion,
  NODE_QUESTION_CONFIGS 
} from './node-question-order';
import { WorkflowNode } from '../../core/types/ai-types';

/**
 * Convert new QuestionDefinition to old NodeQuestion format
 * For backward compatibility with existing code
 */
export function convertToLegacyFormat(
  question: QuestionDefinition,
  nodeType: string
): NodeQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    target: question.field,
    type: mapQuestionType(question.type),
    required: question.required,
    options: question.options?.map(opt => opt.value || opt.label || ''),
  };
}

/**
 * Map new question types to old question types
 */
function mapQuestionType(
  newType: QuestionDefinition['type']
): NodeQuestion['type'] {
  const typeMap: Record<string, NodeQuestion['type']> = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'select': 'select',
    'email': 'string',
    'json': 'json',
    'code': 'string',
    'datetime': 'string',
    'credential': 'string', // Credential handled separately
  };

  return typeMap[newType] || 'string';
}

/**
 * Get questions for a node using the new ordered system
 * Falls back to legacy system if node type not found
 */
export function getQuestionsForNodeOrdered(
  node: WorkflowNode,
  answeredFields: Record<string, any> = {}
): NodeQuestion[] {
  const nodeType = (node.data as any)?.type || node.type;
  
  // Try new system first
  const config = getQuestionConfig(nodeType);
  if (config) {
    const orderedQuestions = getOrderedQuestions(nodeType, answeredFields);
    return orderedQuestions.map(q => convertToLegacyFormat(q, nodeType));
  }

  // Fallback to legacy system
  try {
    const { getQuestionsForNode } = require('./node-input-questions');
    return getQuestionsForNode(node);
  } catch {
    // If legacy system not available, return empty array
    return [];
  }
}

/**
 * Get next question using the new ordered system
 * Returns null if all questions answered
 */
export function getNextQuestionForNode(
  node: WorkflowNode,
  answeredFields: Record<string, any> = {}
): NodeQuestion | null {
  const nodeType = (node.data as any)?.type || node.type;
  const config = getQuestionConfig(nodeType);
  
  if (!config) {
    // Fallback to legacy: return first unanswered required question
    try {
      const { getQuestionsForNode, NodeQuestion } = require('./node-input-questions');
      const questions: NodeQuestion[] = getQuestionsForNode(node);
      return questions.find((q: NodeQuestion) => {
        if (!q.required) return false;
        const value = answeredFields[q.target];
        return value === undefined || value === null || value === '';
      }) || null;
    } catch {
      return null;
    }
  }

  // Use new system
  const nextQuestion = getNextQuestion(nodeType, answeredFields);
  
  if (!nextQuestion) return null;
  
  return convertToLegacyFormat(nextQuestion, nodeType);
}

/**
 * Check if node needs credential selection
 */
export function requiresCredential(nodeType: string): boolean {
  const config = getQuestionConfig(nodeType);
  return config?.requiresCredential || false;
}

/**
 * Get credential provider for a node type
 */
export function getCredentialProvider(nodeType: string): string | null {
  const config = getQuestionConfig(nodeType);
  return config?.credentialProvider || null;
}

/**
 * Get all questions in order, including conditional logic
 * This is the main function to use for new implementations
 */
export function getAllQuestionsOrdered(
  nodeType: string,
  answeredFields: Record<string, any> = {}
): QuestionDefinition[] {
  return getOrderedQuestions(nodeType, answeredFields);
}

/**
 * Migrate old node questions to new format
 * Useful for one-time migration scripts
 */
export function migrateNodeQuestions(): void {
  const { NODE_QUESTIONS } = require('./node-input-questions');
  const migrated: Record<string, number> = {};

  console.log('🔄 Migrating node questions to new ordered format...\n');

  for (const [nodeType, questions] of Object.entries(NODE_QUESTIONS)) {
    const newConfig = NODE_QUESTION_CONFIGS[nodeType];
    const questionsArray = questions as any[];
    
    if (newConfig) {
      migrated[nodeType] = newConfig.questions.length;
      console.log(`✅ ${nodeType}: ${questionsArray.length} → ${newConfig.questions.length} questions`);
    } else {
      console.log(`⚠️  ${nodeType}: No new config found (${questionsArray.length} questions)`);
    }
  }

  console.log(`\n✅ Migration complete: ${Object.keys(migrated).length} node types migrated`);
}
