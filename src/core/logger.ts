/**
 * Centralized logging utility
 * Respects LOG_LEVEL environment variable
 * 
 * Usage:
 *   import { logger } from './core/logger';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message');
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

function getLogLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || '').toUpperCase() as LogLevel;
  if (LOG_LEVELS.hasOwnProperty(envLevel)) {
    return envLevel;
  }
  
  // Default: INFO in development, WARN in production
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? 'WARN' : 'INFO';
}

const currentLogLevel = getLogLevel();
const currentLevelValue = LOG_LEVELS[currentLogLevel];

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevelValue;
}

export const logger = {
  debug: (...args: any[]) => {
    if (shouldLog('DEBUG')) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  info: (...args: any[]) => {
    if (shouldLog('INFO')) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (shouldLog('WARN')) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (shouldLog('ERROR')) {
      console.error(...args);
    }
  },
  
  // Special method for verbose workflow logs (only in DEBUG mode)
  workflow: (...args: any[]) => {
    if (shouldLog('DEBUG')) {
      console.log('[WORKFLOW]', ...args);
    }
  },
  
  // Special method for validation logs (only in DEBUG mode or if VALIDATION_LOGGING=true)
  validation: (...args: any[]) => {
    const validationLogging = process.env.VALIDATION_LOGGING === 'true';
    if (shouldLog('DEBUG') || validationLogging) {
      console.log('[VALIDATION]', ...args);
    }
  },
};
