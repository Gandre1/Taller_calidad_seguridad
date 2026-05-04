/**
 * Property-Based Tests for Logger Module
 * 
 * Uses fast-check to verify correctness properties across many generated inputs.
 * Validates: Requirements 4.6, 6.1, 6.2, 6.3, 6.5
 */

import * as fc from 'fast-check';
import { Logger, LogLevel, LogContext } from './logger';

describe('Logger Property-Based Tests', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // ============================================================================
  // Custom Generators
  // ============================================================================

  /**
   * Generator for sensitive data that should be sanitized
   */
  const arbitrarySensitiveData = (): fc.Arbitrary<Record<string, any>> => {
    return fc.record({
      // Payloads
      payload: fc.oneof(
        fc.object(),
        fc.string(),
        fc.record({ userId: fc.string(), data: fc.anything() })
      ),
      
      // Tokens
      token: fc.oneof(
        fc.string({ minLength: 20 }),
        fc.constant('eyJhbGciOiJSU0EtT0FFUC0yNTYi...')
      ),
      token_jwe: fc.string({ minLength: 20 }),
      jweToken: fc.string({ minLength: 20 }),
      
      // Keys
      privateKey: fc.record({
        kty: fc.constant('RSA'),
        d: fc.string(),
        p: fc.string(),
        q: fc.string()
      }),
      publicKey: fc.record({
        kty: fc.constant('RSA'),
        n: fc.string(),
        e: fc.constant('AQAB')
      }),
      
      // JWK private components
      d: fc.string(),
      p: fc.string(),
      q: fc.string(),
      dp: fc.string(),
      dq: fc.string(),
      qi: fc.string(),
      
      // Other sensitive fields
      secret: fc.string(),
      password: fc.string(),
      authorization: fc.string(),
      ssn: fc.string(),
      creditCard: fc.string()
    }, { requiredKeys: [] }); // At least one field will be present
  };

  /**
   * Generator for nested objects with sensitive data
   */
  const arbitraryNestedSensitiveData = (): fc.Arbitrary<any> => {
    return fc.letrec(tie => ({
      leaf: fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null)
      ),
      sensitive: fc.record({
        token: fc.string(),
        key: fc.string(),
        secret: fc.string()
      }, { requiredKeys: [] }),
      node: fc.record({
        data: fc.oneof(tie('leaf'), tie('sensitive')),
        nested: fc.option(tie('sensitive'), { nil: undefined })
      })
    })).node;
  };

  /**
   * Generator for valid log contexts with required fields
   */
  const arbitraryLogContext = (): fc.Arbitrary<LogContext> => {
    return fc.record({
      requestId: fc.uuid(),
      timestamp: fc.date().map(d => d.toISOString()),
      functionName: fc.oneof(
        fc.constant('lambda-encryption'),
        fc.constant('lambda-decryption'),
        fc.string({ minLength: 1, maxLength: 50 })
      ),
      // Optional additional fields
      executionTime: fc.option(fc.integer({ min: 0, max: 30000 }), { nil: undefined }),
      result: fc.option(fc.oneof(fc.constant('success'), fc.constant('error')), { nil: undefined }),
      operation: fc.option(fc.string(), { nil: undefined })
    });
  };

  /**
   * Generator for log contexts with sensitive data mixed in
   */
  const arbitraryLogContextWithSensitiveData = (): fc.Arbitrary<LogContext> => {
    return fc.record({
      requestId: fc.uuid(),
      timestamp: fc.date().map(d => d.toISOString()),
      functionName: fc.string({ minLength: 1 }),
      // Mix in sensitive data
      payload: fc.option(fc.object(), { nil: undefined }),
      token: fc.option(fc.string(), { nil: undefined }),
      privateKey: fc.option(fc.object(), { nil: undefined }),
      secret: fc.option(fc.string(), { nil: undefined })
    }) as fc.Arbitrary<LogContext>;
  };

  /**
   * Generator for various log levels
   */
  const arbitraryLogLevel = (): fc.Arbitrary<LogLevel> => {
    return fc.oneof(
      fc.constant(LogLevel.DEBUG),
      fc.constant(LogLevel.INFO),
      fc.constant(LogLevel.WARN),
      fc.constant(LogLevel.ERROR)
    );
  };

  /**
   * Generator for log messages
   */
  const arbitraryLogMessage = (): fc.Arbitrary<string> => {
    return fc.oneof(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.constant('Operation completed'),
      fc.constant('Encryption started'),
      fc.constant('Decryption failed'),
      fc.constant('Key retrieved successfully')
    );
  };

  /**
   * Generator for Error objects
   */
  const arbitraryError = (): fc.Arbitrary<Error> => {
    return fc.record({
      name: fc.oneof(
        fc.constant('ValidationError'),
        fc.constant('EncryptionError'),
        fc.constant('DecryptionError'),
        fc.constant('KeyRetrievalError'),
        fc.string()
      ),
      message: fc.string({ minLength: 1, maxLength: 200 })
    }).map(({ name, message }) => {
      const error = new Error(message);
      error.name = name;
      return error;
    });
  };

  // ============================================================================
  // Property 6: Sanitización de Logs
  // **Validates: Requirements 4.6, 6.2, 6.5**
  // ============================================================================

  describe('Property 6: Sanitización de Logs', () => {
    /**
     * Feature: lambda-encryption-decryption, Property 6: Sanitización de Logs
     * 
     * For any invocation of Lambda functions, logs MUST NOT contain:
     * - Original payload content
     * - Complete JWE tokens
     * - Cryptographic key material (especially private keys)
     * - User sensitive data
     */
    test('logs never contain sensitive payload data', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          arbitraryLogContext(),
          arbitrarySensitiveData(),
          async (message, baseContext, sensitiveData) => {
            const logger = new Logger(LogLevel.INFO);
            
            // Mix sensitive data into context
            const contextWithSensitive = {
              ...baseContext,
              ...sensitiveData
            };
            
            logger.info(message, contextWithSensitive);
            
            // Verify log was created
            expect(consoleLogSpy).toHaveBeenCalled();
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Check that sensitive fields are redacted
            const checkSanitized = (obj: any, path: string = ''): void => {
              if (obj === null || obj === undefined) return;
              
              if (typeof obj === 'object') {
                for (const [key, value] of Object.entries(obj)) {
                  const lowerKey = key.toLowerCase();
                  
                  // Check if this is a sensitive field
                  const sensitiveKeys = [
                    'payload', 'token', 'token_jwe', 'tokenjwe', 'jwetoken',
                    'privatekey', 'publickey', 'private_key', 'public_key',
                    'secret', 'password', 'authorization',
                    'd', 'p', 'q', 'dp', 'dq', 'qi',
                    'ssn', 'creditcard', 'credit_card'
                  ];
                  
                  if (sensitiveKeys.includes(lowerKey)) {
                    // Sensitive field should be redacted
                    expect(value).toBe('[REDACTED]');
                  } else if (typeof value === 'object' && value !== null) {
                    // Recursively check nested objects
                    checkSanitized(value, `${path}.${key}`);
                  }
                }
              }
            };
            
            if (logEntry.context) {
              checkSanitized(logEntry.context);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logs never contain JWE tokens', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          arbitraryLogContext(),
          fc.string({ minLength: 50, maxLength: 500 }), // Simulate JWE token
          async (message, baseContext, jweToken) => {
            const logger = new Logger(LogLevel.INFO);
            
            const contextWithToken = {
              ...baseContext,
              token: jweToken,
              token_jwe: jweToken
            };
            
            logger.info(message, contextWithToken);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Token fields should be redacted
            if (logEntry.context.token !== undefined) {
              expect(logEntry.context.token).toBe('[REDACTED]');
            }
            if (logEntry.context.token_jwe !== undefined) {
              expect(logEntry.context.token_jwe).toBe('[REDACTED]');
            }
            
            // The actual token value should not appear in the log
            expect(logOutput).not.toContain(jweToken);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logs never contain private key material', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          arbitraryLogContext(),
          fc.record({
            kty: fc.constant('RSA'),
            n: fc.string({ minLength: 20 }),
            e: fc.constant('AQAB'),
            d: fc.string({ minLength: 20 }),
            p: fc.string({ minLength: 20 }),
            q: fc.string({ minLength: 20 }),
            dp: fc.string({ minLength: 20 }),
            dq: fc.string({ minLength: 20 }),
            qi: fc.string({ minLength: 20 })
          }),
          async (message, baseContext, privateKey) => {
            const logger = new Logger(LogLevel.INFO);
            
            const contextWithKey = {
              ...baseContext,
              privateKey,
              jwk: privateKey
            };
            
            logger.info(message, contextWithKey);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Private key object should be redacted
            expect(logEntry.context.privateKey).toBe('[REDACTED]');
            
            // JWK private components (d, p, q, dp, dq, qi) should be redacted
            if (logEntry.context.jwk) {
              expect(logEntry.context.jwk.d).toBe('[REDACTED]');
              expect(logEntry.context.jwk.p).toBe('[REDACTED]');
              expect(logEntry.context.jwk.q).toBe('[REDACTED]');
              expect(logEntry.context.jwk.dp).toBe('[REDACTED]');
              expect(logEntry.context.jwk.dq).toBe('[REDACTED]');
              expect(logEntry.context.jwk.qi).toBe('[REDACTED]');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logs sanitize nested sensitive data', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          arbitraryLogContext(),
          arbitraryNestedSensitiveData(),
          async (message, baseContext, nestedData) => {
            const logger = new Logger(LogLevel.INFO);
            
            const contextWithNested = {
              ...baseContext,
              nestedData
            };
            
            logger.info(message, contextWithNested);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            
            // Parse should succeed (valid JSON)
            expect(() => JSON.parse(logOutput)).not.toThrow();
            
            const logEntry = JSON.parse(logOutput);
            
            // Recursively check that sensitive fields are redacted
            const hasSensitiveValue = (obj: any): boolean => {
              if (obj === null || obj === undefined || typeof obj !== 'object') {
                return false;
              }
              
              for (const [key, value] of Object.entries(obj)) {
                const lowerKey = key.toLowerCase();
                if (['token', 'key', 'secret'].includes(lowerKey)) {
                  if (value !== '[REDACTED]') {
                    return true; // Found unsanitized sensitive field
                  }
                }
                if (typeof value === 'object' && value !== null) {
                  if (hasSensitiveValue(value)) {
                    return true;
                  }
                }
              }
              return false;
            };
            
            // Should not have any unsanitized sensitive values
            expect(hasSensitiveValue(logEntry.context)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('error logs do not expose sensitive data in context', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          arbitraryError(),
          arbitraryLogContextWithSensitiveData(),
          async (message, error, context) => {
            const logger = new Logger(LogLevel.ERROR);
            
            logger.error(message, error, context);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Check that sensitive fields in context are redacted
            if (logEntry.context.payload !== undefined) {
              expect(logEntry.context.payload).toBe('[REDACTED]');
            }
            if (logEntry.context.token !== undefined) {
              expect(logEntry.context.token).toBe('[REDACTED]');
            }
            if (logEntry.context.privateKey !== undefined) {
              expect(logEntry.context.privateKey).toBe('[REDACTED]');
            }
            if (logEntry.context.secret !== undefined) {
              expect(logEntry.context.secret).toBe('[REDACTED]');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // Property 7: Completitud de Logs
  // **Validates: Requirements 6.1, 6.3**
  // ============================================================================

  describe('Property 7: Completitud de Logs', () => {
    /**
     * Feature: lambda-encryption-decryption, Property 7: Completitud de Logs
     * 
     * For any invocation of Lambda functions, logs MUST include:
     * - Invocation timestamp
     * - Unique request ID
     * - Operation result (success/error)
     * - Execution time
     * - Error type (if applicable)
     */
    test('all logs include required context fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogLevel(),
          arbitraryLogMessage(),
          arbitraryLogContext(),
          async (level, message, context) => {
            const logger = new Logger(level);
            
            // Log at the specified level
            switch (level) {
              case LogLevel.DEBUG:
                logger.debug(message, context);
                break;
              case LogLevel.INFO:
                logger.info(message, context);
                break;
              case LogLevel.WARN:
                logger.warn(message, context);
                break;
              case LogLevel.ERROR:
                // For ERROR level, we need an Error object
                logger.error(message, new Error('Test error'), context);
                break;
            }
            
            // If log was filtered out by level, skip validation
            if (consoleLogSpy.mock.calls.length === 0) {
              return;
            }
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Verify required fields are present
            expect(logEntry.timestamp).toBeDefined();
            expect(typeof logEntry.timestamp).toBe('string');
            expect(new Date(logEntry.timestamp).getTime()).toBeGreaterThan(0);
            
            // Verify context includes required fields
            expect(logEntry.context).toBeDefined();
            expect(logEntry.context.requestId).toBeDefined();
            expect(typeof logEntry.context.requestId).toBe('string');
            expect(logEntry.context.requestId.length).toBeGreaterThan(0);
            
            expect(logEntry.context.timestamp).toBeDefined();
            expect(typeof logEntry.context.timestamp).toBe('string');
            
            expect(logEntry.context.functionName).toBeDefined();
            expect(typeof logEntry.context.functionName).toBe('string');
            expect(logEntry.context.functionName.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logs include execution time when provided in context', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          fc.uuid(),
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 30000 }), // Ensure executionTime is defined (not 0 or undefined)
          async (message, requestId, functionName, executionTime) => {
            // Clear spy for each property iteration
            consoleLogSpy.mockClear();
            
            const logger = new Logger(LogLevel.INFO);
            
            const context: LogContext = {
              requestId,
              timestamp: new Date().toISOString(),
              functionName,
              executionTime
            };
            
            logger.info(message, context);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Execution time should be preserved (sanitize doesn't affect numbers)
            expect(logEntry.context.executionTime).toBe(executionTime);
            expect(typeof logEntry.context.executionTime).toBe('number');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logs include result status when provided in context', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          fc.uuid(),
          fc.string({ minLength: 1 }),
          fc.oneof(fc.constant('success'), fc.constant('error'), fc.constant('pending')),
          async (message, requestId, functionName, result) => {
            // Clear spy for each property iteration
            consoleLogSpy.mockClear();
            
            const logger = new Logger(LogLevel.INFO);
            
            const context: LogContext = {
              requestId,
              timestamp: new Date().toISOString(),
              functionName,
              result
            };
            
            logger.info(message, context);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Result should be preserved (sanitize doesn't affect non-sensitive strings)
            expect(logEntry.context.result).toBe(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('error logs include error type and message', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          fc.string({ minLength: 1, maxLength: 50 }), // Error name
          fc.string({ minLength: 1, maxLength: 200 }), // Error message
          arbitraryLogContext(),
          async (message, errorName, errorMessage, context) => {
            // Clear spy for each property iteration
            consoleLogSpy.mockClear();
            
            const logger = new Logger(LogLevel.ERROR);
            
            const error = new Error(errorMessage);
            error.name = errorName;
            
            logger.error(message, error, context);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // Error information should be present
            expect(logEntry.error).toBeDefined();
            expect(logEntry.error.name).toBeDefined();
            expect(typeof logEntry.error.name).toBe('string');
            expect(logEntry.error.name.length).toBeGreaterThan(0);
            
            expect(logEntry.error.message).toBeDefined();
            expect(typeof logEntry.error.message).toBe('string');
            expect(logEntry.error.message.length).toBeGreaterThan(0);
            
            // Error name and message should match the original error
            expect(logEntry.error.name).toBe(errorName);
            expect(logEntry.error.message).toBe(errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all logs are valid JSON', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogLevel(),
          arbitraryLogMessage(),
          arbitraryLogContext(),
          async (level, message, context) => {
            const logger = new Logger(level);
            
            // Log at the specified level
            if (level === LogLevel.ERROR) {
              logger.error(message, new Error('Test'), context);
            } else {
              logger.info(message, context);
            }
            
            // If log was filtered out, skip
            if (consoleLogSpy.mock.calls.length === 0) {
              return;
            }
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            
            // Should be valid JSON
            expect(() => JSON.parse(logOutput)).not.toThrow();
            
            const logEntry = JSON.parse(logOutput);
            
            // Should have expected structure
            expect(logEntry.level).toBeDefined();
            expect(logEntry.message).toBeDefined();
            expect(logEntry.timestamp).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logs preserve non-sensitive context fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLogMessage(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.oneof(fc.constant('success'), fc.constant('error')),
          fc.integer({ min: 1, max: 5000 }),
          async (message, requestId, functionName, userId, operation, status, executionTime) => {
            // Clear spy for each property iteration
            consoleLogSpy.mockClear();
            
            const logger = new Logger(LogLevel.INFO);
            
            const context: LogContext = {
              requestId,
              timestamp: new Date().toISOString(),
              functionName,
              userId,
              operation,
              status,
              executionTime
            };
            
            logger.info(message, context);
            
            const logOutput = consoleLogSpy.mock.calls[0][0];
            const logEntry = JSON.parse(logOutput);
            
            // All non-sensitive fields should be preserved
            expect(logEntry.context.requestId).toBe(requestId);
            expect(logEntry.context.functionName).toBe(functionName);
            expect(logEntry.context.userId).toBe(userId);
            expect(logEntry.context.operation).toBe(operation);
            expect(logEntry.context.status).toBe(status);
            expect(logEntry.context.executionTime).toBe(executionTime);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
