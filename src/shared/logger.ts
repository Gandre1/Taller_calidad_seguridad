/**
 * Logger Module
 * 
 * Provides structured logging with sanitization of sensitive data.
 * Supports configurable log levels and includes context in all logs.
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.5, 9.4
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  requestId: string;
  timestamp: string;
  functionName: string;
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  executionTime?: number;
}

export class Logger {
  private level: LogLevel;
  private levelPriority: Map<LogLevel, number>;

  constructor(level?: LogLevel) {
    // Support LOG_LEVEL from environment variable (Requirement 9.4)
    const envLevel = process.env.LOG_LEVEL as LogLevel;
    this.level = level || envLevel || LogLevel.INFO;

    // Define log level priorities for filtering
    this.levelPriority = new Map([
      [LogLevel.DEBUG, 0],
      [LogLevel.INFO, 1],
      [LogLevel.WARN, 2],
      [LogLevel.ERROR, 3]
    ]);
  }

  /**
   * Log an informational message
   * Requirement 6.1: Register each invocation with timestamp, request ID and result
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log an error message with error details
   * Requirement 6.2: Register error type and context without exposing sensitive data
   */
  error(message: string, error: Error, context?: LogContext): void {
    const sanitizedContext = context ? this.sanitize(context) : undefined;
    
    const logEntry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      context: sanitizedContext,
      error: {
        name: error.name,
        message: error.message,
        // Only include stack trace in DEBUG mode
        ...(this.shouldLog(LogLevel.DEBUG) && { stack: error.stack })
      }
    };

    this.write(logEntry);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const sanitizedContext = context ? this.sanitize(context) : undefined;

    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: sanitizedContext
    };

    this.write(logEntry);
  }

  /**
   * Check if a log level should be logged based on current configuration
   */
  private shouldLog(level: LogLevel): boolean {
    const currentPriority = this.levelPriority.get(this.level) ?? 1;
    const messagePriority = this.levelPriority.get(level) ?? 1;
    return messagePriority >= currentPriority;
  }

  /**
   * Write log entry to console in JSON format
   */
  private write(entry: LogEntry): void {
    // Structured logging in JSON format for CloudWatch
    console.log(JSON.stringify(entry));
  }

  /**
   * Sanitize data to remove sensitive information
   * Requirement 6.5: Do not log Payload content, Token_JWE, or encryption keys
   * Requirement 6.2: Do not expose sensitive data in error logs
   */
  private sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types
    if (typeof data !== 'object') {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }

    // Handle objects
    const sanitized: any = {};
    
    // Exact match sensitive keys (case-insensitive)
    const exactMatchKeys = new Set([
      'payload',
      'token',
      'token_jwe',
      'tokenjwe',
      'jwetoken',
      'privatekey',
      'publickey',
      'private_key',
      'public_key',
      'clave',
      'claveprivada',
      'clavepublica',
      'clave_privada',
      'clave_publica',
      'secret',
      'password',
      'passphrase',
      'authorization',
      'auth',
      'bearer',
      // JWK fields that contain key material
      'd', 'p', 'q', 'dp', 'dq', 'qi',
      // Additional sensitive fields
      'ssn',
      'creditcard',
      'credit_card',
      'cvv',
      'pin'
    ]);

    // Partial match patterns (must contain these substrings)
    const partialMatchPatterns = [
      'token',
      'key',
      'secret',
      'password',
      'auth'
    ];

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Check for exact match first
      let isSensitive = exactMatchKeys.has(lowerKey);
      
      // If not exact match, check for partial matches
      // But exclude common safe fields like 'requestId', 'userId', 'functionName'
      if (!isSensitive) {
        const safeFields = ['requestid', 'userid', 'functionname', 'timestamp', 'executiontime'];
        const isSafeField = safeFields.includes(lowerKey);
        
        if (!isSafeField) {
          // Check if the key contains sensitive patterns
          isSensitive = partialMatchPatterns.some(pattern => {
            // Only match if the pattern is a significant part of the key
            // Avoid matching 'id' in 'requestId' or 'userId'
            if (pattern === 'key' && (lowerKey.endsWith('id') || lowerKey.startsWith('id'))) {
              return false;
            }
            return lowerKey.includes(pattern);
          });
        }
      }

      if (isSensitive) {
        // Replace sensitive data with redacted marker
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Set log level dynamically
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * Create a default logger instance
 */
export function createLogger(level?: LogLevel): Logger {
  return new Logger(level);
}
