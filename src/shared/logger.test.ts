/**
 * Unit Tests for Logger Module
 * 
 * Tests logging functionality, sanitization, and log level configuration.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.5, 9.4
 */

import { Logger, LogLevel, LogContext, createLogger } from './logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console.log to capture log output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    // Clear environment variables
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Constructor and Configuration', () => {
    it('should use INFO as default log level', () => {
      const logger = new Logger();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should accept log level in constructor', () => {
      const logger = new Logger(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should read LOG_LEVEL from environment variable (Requirement 9.4)', () => {
      process.env.LOG_LEVEL = 'ERROR';
      const logger = new Logger();
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should prioritize constructor parameter over environment variable', () => {
      process.env.LOG_LEVEL = 'ERROR';
      const logger = new Logger(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should allow setting log level dynamically', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.setLevel(LogLevel.WARN);
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });
  });

  describe('Log Level Filtering', () => {
    it('should log INFO messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should not log DEBUG messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.debug('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log WARN and ERROR when level is WARN', () => {
      const logger = new Logger(LogLevel.WARN);
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message', new Error('Test error'));
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // Only WARN and ERROR
    });

    it('should log all levels when level is DEBUG', () => {
      const logger = new Logger(LogLevel.DEBUG);
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message', new Error('Test error'));
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('Structured Logging (Requirement 6.1)', () => {
    it('should include timestamp in log entries', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.timestamp).toBeDefined();
      expect(new Date(logEntry.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include requestId in context (Requirement 6.1)', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-request-123',
        timestamp: new Date().toISOString(),
        functionName: 'test-function'
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.requestId).toBe('test-request-123');
    });

    it('should include functionName in context (Requirement 6.1)', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-request-123',
        timestamp: new Date().toISOString(),
        functionName: 'lambda-encryption'
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.functionName).toBe('lambda-encryption');
    });

    it('should output logs in JSON format', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Test message');
      
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it('should include log level in output', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe(LogLevel.INFO);
    });
  });

  describe('Error Logging (Requirement 6.2)', () => {
    it('should log error type and message without exposing sensitive data', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = new Error('Encryption failed');
      error.name = 'EncryptionError';
      
      logger.error('Operation failed', error);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.error.name).toBe('EncryptionError');
      expect(logEntry.error.message).toBe('Encryption failed');
    });

    it('should not include stack trace when level is not DEBUG', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');
      
      logger.error('Operation failed', error);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.error.stack).toBeUndefined();
    });

    it('should include stack trace when level is DEBUG', () => {
      const logger = new Logger(LogLevel.DEBUG);
      const error = new Error('Test error');
      
      logger.error('Operation failed', error);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.error.stack).toBeDefined();
    });

    it('should sanitize context in error logs', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        token: 'eyJhbGciOiJSU0EtT0FFUC0yNTYi...'
      };
      
      logger.error('Operation failed', error, context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.token).toBe('[REDACTED]');
    });
  });

  describe('Sanitization (Requirement 6.5)', () => {
    it('should sanitize payload field', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        payload: { sensitive: 'data' }
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.payload).toBe('[REDACTED]');
    });

    it('should sanitize token_jwe field', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        token_jwe: 'eyJhbGciOiJSU0EtT0FFUC0yNTYi...'
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.token_jwe).toBe('[REDACTED]');
    });

    it('should sanitize privateKey field', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        privateKey: { kty: 'RSA', d: 'secret' }
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.privateKey).toBe('[REDACTED]');
    });

    it('should sanitize publicKey field', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        publicKey: { kty: 'RSA', n: 'modulus' }
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.publicKey).toBe('[REDACTED]');
    });

    it('should sanitize nested sensitive fields', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        data: {
          userId: '12345',
          token: 'secret-token',
          metadata: {
            key: 'encryption-key'
          }
        }
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.data.userId).toBe('12345');
      expect(logEntry.context.data.token).toBe('[REDACTED]');
      expect(logEntry.context.data.metadata.key).toBe('[REDACTED]');
    });

    it('should sanitize JWK private key components (d, p, q, dp, dq, qi)', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        jwk: {
          kty: 'RSA',
          n: 'modulus',
          e: 'AQAB',
          d: 'private-exponent',
          p: 'prime1',
          q: 'prime2',
          dp: 'exponent1',
          dq: 'exponent2',
          qi: 'coefficient'
        }
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.jwk.kty).toBe('RSA');
      expect(logEntry.context.jwk.n).toBe('modulus');
      expect(logEntry.context.jwk.e).toBe('AQAB');
      expect(logEntry.context.jwk.d).toBe('[REDACTED]');
      expect(logEntry.context.jwk.p).toBe('[REDACTED]');
      expect(logEntry.context.jwk.q).toBe('[REDACTED]');
      expect(logEntry.context.jwk.dp).toBe('[REDACTED]');
      expect(logEntry.context.jwk.dq).toBe('[REDACTED]');
      expect(logEntry.context.jwk.qi).toBe('[REDACTED]');
    });

    it('should sanitize arrays with sensitive data', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        items: [
          { id: '1', token: 'token1' },
          { id: '2', token: 'token2' }
        ]
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.items[0].id).toBe('1');
      expect(logEntry.context.items[0].token).toBe('[REDACTED]');
      expect(logEntry.context.items[1].id).toBe('2');
      expect(logEntry.context.items[1].token).toBe('[REDACTED]');
    });

    it('should handle null and undefined values', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        nullValue: null,
        undefinedValue: undefined
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.nullValue).toBeNull();
      expect(logEntry.context.undefinedValue).toBeUndefined();
    });

    it('should preserve non-sensitive data', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        userId: '12345',
        operation: 'encrypt',
        status: 'success'
      };
      
      logger.info('Test message', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.userId).toBe('12345');
      expect(logEntry.context.operation).toBe('encrypt');
      expect(logEntry.context.status).toBe('success');
    });
  });

  describe('Performance Metrics (Requirement 6.3)', () => {
    it('should support logging execution time in context', () => {
      const logger = new Logger(LogLevel.INFO);
      const context: LogContext = {
        requestId: 'test-123',
        timestamp: new Date().toISOString(),
        functionName: 'test',
        executionTime: 250
      };
      
      logger.info('Operation completed', context);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context.executionTime).toBe(250);
    });
  });

  describe('createLogger Factory Function', () => {
    it('should create a logger instance', () => {
      const logger = createLogger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should create a logger with specified level', () => {
      const logger = createLogger(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });
  });

  describe('All Log Methods', () => {
    it('should support info() method', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Info message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe(LogLevel.INFO);
      expect(logEntry.message).toBe('Info message');
    });

    it('should support warn() method', () => {
      const logger = new Logger(LogLevel.WARN);
      logger.warn('Warning message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe(LogLevel.WARN);
      expect(logEntry.message).toBe('Warning message');
    });

    it('should support debug() method', () => {
      const logger = new Logger(LogLevel.DEBUG);
      logger.debug('Debug message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe(LogLevel.DEBUG);
      expect(logEntry.message).toBe('Debug message');
    });

    it('should support error() method', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');
      logger.error('Error message', error);
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe(LogLevel.ERROR);
      expect(logEntry.message).toBe('Error message');
      expect(logEntry.error).toBeDefined();
    });
  });
});
