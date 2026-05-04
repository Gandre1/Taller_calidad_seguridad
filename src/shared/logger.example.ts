/**
 * Logger Usage Examples
 * 
 * This file demonstrates how to use the Logger module in Lambda functions.
 */

import { LogLevel, LogContext, createLogger } from './logger';

// Example 1: Basic usage with default configuration
function example1() {
  const logger = createLogger();
  
  logger.info('Lambda function invoked');
  logger.warn('Approaching memory limit');
  logger.debug('Processing payload'); // Won't log if level is INFO
}

// Example 2: Using with Lambda context
function example2() {
  const logger = createLogger(LogLevel.INFO);
  
  const context: LogContext = {
    requestId: 'abc-123-def-456',
    timestamp: new Date().toISOString(),
    functionName: 'lambda-encryption',
    operation: 'encrypt',
    payloadSize: 1024
  };
  
  logger.info('Encryption started', context);
}

// Example 3: Error logging with sanitization
function example3() {
  const logger = createLogger();
  
  try {
    // Some operation that fails
    throw new Error('Encryption failed: Invalid key format');
  } catch (error) {
    const context: LogContext = {
      requestId: 'abc-123-def-456',
      timestamp: new Date().toISOString(),
      functionName: 'lambda-encryption',
      // These sensitive fields will be automatically sanitized
      token: 'eyJhbGciOiJSU0EtT0FFUC0yNTYi...',
      privateKey: { kty: 'RSA', d: 'secret' }
    };
    
    logger.error('Operation failed', error as Error, context);
    // Output will have token and privateKey as [REDACTED]
  }
}

// Example 4: Performance metrics logging
function example4() {
  const logger = createLogger();
  const startTime = Date.now();
  
  // Perform some operation
  
  const executionTime = Date.now() - startTime;
  const context: LogContext = {
    requestId: 'abc-123-def-456',
    timestamp: new Date().toISOString(),
    functionName: 'lambda-encryption',
    executionTime,
    status: 'success'
  };
  
  logger.info('Operation completed', context);
}

// Example 5: Using environment variable for log level
function example5() {
  // Set LOG_LEVEL=DEBUG in Lambda environment variables
  // The logger will automatically use that level
  const logger = createLogger();
  
  logger.debug('This will only show if LOG_LEVEL=DEBUG');
  logger.info('This will show if LOG_LEVEL is DEBUG or INFO');
}

// Example 6: Dynamic log level adjustment
function example6() {
  const logger = createLogger(LogLevel.INFO);
  
  logger.debug('This will not log'); // Level is INFO
  
  // Change level dynamically
  logger.setLevel(LogLevel.DEBUG);
  
  logger.debug('This will log now'); // Level is now DEBUG
}

// Example 7: Logging with nested sensitive data
function example7() {
  const logger = createLogger();
  
  const context: LogContext = {
    requestId: 'abc-123-def-456',
    timestamp: new Date().toISOString(),
    functionName: 'lambda-encryption',
    request: {
      userId: '12345',
      operation: 'encrypt',
      // Nested sensitive data will be sanitized
      credentials: {
        token: 'secret-token',
        apiKey: 'api-key-123'
      }
    }
  };
  
  logger.info('Request received', context);
  // Output will have token and apiKey as [REDACTED]
}

export {
  example1,
  example2,
  example3,
  example4,
  example5,
  example6,
  example7
};
