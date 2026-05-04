/**
 * Unit Tests for ErrorHandler
 * 
 * Tests:
 * - Mapping of each error type to correct HTTP status code
 * - Error messages do not contain sensitive information
 * - Capture of unhandled exceptions
 * 
 * Validates: Requirements 7.1, 7.2, 7.5
 */

import { ErrorHandler, ErrorType, AppError } from './errorHandler';

describe('ErrorHandler', () => {
  const mockRequestId = 'test-request-123';

  describe('Error Type to HTTP Status Code Mapping', () => {
    /**
     * Requirement 7.1: Validation errors return 400
     */
    test('should map VALIDATION_ERROR to 400', () => {
      const error: AppError = {
        type: ErrorType.VALIDATION_ERROR,
        message: 'Invalid input',
        statusCode: 400
      };

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(400);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid input');
      expect(body.code).toBe(ErrorType.VALIDATION_ERROR);
      expect(body.requestId).toBe(mockRequestId);
    });

    /**
     * Requirement 7.2: Internal errors return 500
     */
    test('should map INTERNAL_ERROR to 500', () => {
      const error: AppError = {
        type: ErrorType.INTERNAL_ERROR,
        message: 'Internal error occurred',
        statusCode: 500
      };

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error occurred');
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
    });

    /**
     * Requirement 1.7: Encryption errors return 500
     */
    test('should map ENCRYPTION_ERROR to 500', () => {
      const error: AppError = {
        type: ErrorType.ENCRYPTION_ERROR,
        message: 'Failed to encrypt data',
        statusCode: 500
      };

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to encrypt data');
      expect(body.code).toBe(ErrorType.ENCRYPTION_ERROR);
    });

    /**
     * Requirement 3.7: Decryption errors return 500
     */
    test('should map DECRYPTION_ERROR to 500', () => {
      const error: AppError = {
        type: ErrorType.DECRYPTION_ERROR,
        message: 'Failed to decrypt token',
        statusCode: 500
      };

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to decrypt token');
      expect(body.code).toBe(ErrorType.DECRYPTION_ERROR);
    });

    /**
     * Requirement 7.2: Key retrieval errors return 500
     */
    test('should map KEY_RETRIEVAL_ERROR to 500', () => {
      const error: AppError = {
        type: ErrorType.KEY_RETRIEVAL_ERROR,
        message: 'Failed to retrieve encryption key',
        statusCode: 500
      };

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to retrieve encryption key');
      expect(body.code).toBe(ErrorType.KEY_RETRIEVAL_ERROR);
    });

    /**
     * Requirement 7.3: Timeout errors return 504
     */
    test('should map TIMEOUT_ERROR to 504', () => {
      const error: AppError = {
        type: ErrorType.TIMEOUT_ERROR,
        message: 'Request timeout',
        statusCode: 504
      };

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(504);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Request timeout');
      expect(body.code).toBe(ErrorType.TIMEOUT_ERROR);
    });

    /**
     * Requirement 1.3: Payload too large returns 413
     */
    test('should map payload too large error to 413', () => {
      const error = ErrorHandler.createPayloadTooLargeError();

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(413);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Payload exceeds maximum size of 6MB');
      expect(body.code).toBe(ErrorType.VALIDATION_ERROR);
    });
  });

  describe('Error Message Sanitization', () => {
    /**
     * Requirement 7.2: Error messages should not contain sensitive information
     */
    test('should not expose stack traces in error messages', () => {
      const error = new Error('Database connection failed at host 10.0.0.1:5432 with password abc123');

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      
      // Should return generic message, not the detailed error
      expect(body.error).toBe('An internal error occurred while processing your request');
      expect(body.error).not.toContain('10.0.0.1');
      expect(body.error).not.toContain('abc123');
      expect(body.error).not.toContain('Database');
    });

    /**
     * Requirement 7.2: Internal errors should use generic messages
     */
    test('should use generic message for internal errors', () => {
      const error = ErrorHandler.createInternalError();

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('An internal error occurred while processing your request');
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
    });

    /**
     * Requirement 1.7, 3.7: Encryption/Decryption errors should not expose details
     */
    test('should not expose encryption implementation details', () => {
      const error = ErrorHandler.createEncryptionError();

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to encrypt data');
      expect(body.error).not.toContain('RSA');
      expect(body.error).not.toContain('key');
      expect(body.error).not.toContain('algorithm');
    });

    /**
     * Requirement 3.7: Decryption errors should not expose details
     */
    test('should not expose decryption implementation details', () => {
      const error = ErrorHandler.createDecryptionError();

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to decrypt token');
      expect(body.error).not.toContain('private key');
      expect(body.error).not.toContain('JWE');
      expect(body.error).not.toContain('algorithm');
    });

    /**
     * Requirement 7.2: Key retrieval errors should not expose AWS details
     */
    test('should not expose key retrieval implementation details', () => {
      const error = ErrorHandler.createKeyRetrievalError();

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to retrieve encryption key');
      expect(body.error).not.toContain('Secrets Manager');
      expect(body.error).not.toContain('AWS');
      expect(body.error).not.toContain('arn:');
    });

    /**
     * Requirement 7.2: Validation errors can be descriptive but not expose internals
     */
    test('should allow descriptive validation error messages', () => {
      const error = ErrorHandler.createValidationError('Payload must be a valid JSON object');

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Payload must be a valid JSON object');
      expect(body.code).toBe(ErrorType.VALIDATION_ERROR);
    });
  });

  describe('Unhandled Exception Capture', () => {
    /**
     * Requirement 7.5: Capture all unhandled exceptions and return valid HTTP responses
     */
    test('should capture standard Error objects and return 500', () => {
      const error = new Error('Unexpected error occurred');

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('An internal error occurred while processing your request');
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
      expect(body.requestId).toBe(mockRequestId);
    });

    /**
     * Requirement 7.5: Handle TypeError exceptions
     */
    test('should capture TypeError and return 500', () => {
      const error = new TypeError('Cannot read property of undefined');

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('An internal error occurred while processing your request');
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
    });

    /**
     * Requirement 7.5: Handle ReferenceError exceptions
     */
    test('should capture ReferenceError and return 500', () => {
      const error = new ReferenceError('Variable is not defined');

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('An internal error occurred while processing your request');
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
    });

    /**
     * Requirement 7.5: Handle unknown error objects
     */
    test('should handle unknown error objects and return 500', () => {
      const error = { someProperty: 'some value' };

      const response = ErrorHandler.handle(error as any, mockRequestId);

      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('An internal error occurred while processing your request');
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
    });

    /**
     * Requirement 7.5: Always return valid HTTP response structure
     */
    test('should always return valid HTTP response structure', () => {
      const errors = [
        new Error('Test error'),
        new TypeError('Type error'),
        ErrorHandler.createValidationError('Validation failed'),
        ErrorHandler.createInternalError(),
        { random: 'object' }
      ];

      errors.forEach((error) => {
        const response = ErrorHandler.handle(error as any, mockRequestId);

        // Verify response structure
        expect(response).toHaveProperty('statusCode');
        expect(response).toHaveProperty('headers');
        expect(response).toHaveProperty('body');
        expect(response.headers['Content-Type']).toBe('application/json');
        
        // Verify body is valid JSON
        expect(() => JSON.parse(response.body)).not.toThrow();
        
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('code');
        expect(typeof body.error).toBe('string');
        expect(Object.values(ErrorType)).toContain(body.code);
      });
    });
  });

  describe('Helper Methods', () => {
    /**
     * Test createValidationError helper
     */
    test('createValidationError should create correct AppError', () => {
      const error = ErrorHandler.createValidationError('Invalid payload format');

      expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid payload format');
      expect(error.statusCode).toBe(400);
    });

    /**
     * Test createInternalError helper with custom message
     */
    test('createInternalError should create correct AppError with custom message', () => {
      const error = ErrorHandler.createInternalError('Custom internal error');

      expect(error.type).toBe(ErrorType.INTERNAL_ERROR);
      expect(error.message).toBe('Custom internal error');
      expect(error.statusCode).toBe(500);
    });

    /**
     * Test createInternalError helper with default message
     */
    test('createInternalError should use default message when none provided', () => {
      const error = ErrorHandler.createInternalError();

      expect(error.type).toBe(ErrorType.INTERNAL_ERROR);
      expect(error.message).toBe('An internal error occurred while processing your request');
      expect(error.statusCode).toBe(500);
    });

    /**
     * Test createEncryptionError helper
     */
    test('createEncryptionError should create correct AppError', () => {
      const error = ErrorHandler.createEncryptionError('Encryption failed');

      expect(error.type).toBe(ErrorType.ENCRYPTION_ERROR);
      expect(error.message).toBe('Encryption failed');
      expect(error.statusCode).toBe(500);
    });

    /**
     * Test createDecryptionError helper
     */
    test('createDecryptionError should create correct AppError', () => {
      const error = ErrorHandler.createDecryptionError('Decryption failed');

      expect(error.type).toBe(ErrorType.DECRYPTION_ERROR);
      expect(error.message).toBe('Decryption failed');
      expect(error.statusCode).toBe(500);
    });

    /**
     * Test createKeyRetrievalError helper
     */
    test('createKeyRetrievalError should create correct AppError', () => {
      const error = ErrorHandler.createKeyRetrievalError('Key not found');

      expect(error.type).toBe(ErrorType.KEY_RETRIEVAL_ERROR);
      expect(error.message).toBe('Key not found');
      expect(error.statusCode).toBe(500);
    });

    /**
     * Test createTimeoutError helper
     */
    test('createTimeoutError should create correct AppError', () => {
      const error = ErrorHandler.createTimeoutError('Operation timed out');

      expect(error.type).toBe(ErrorType.TIMEOUT_ERROR);
      expect(error.message).toBe('Operation timed out');
      expect(error.statusCode).toBe(504);
    });

    /**
     * Test createPayloadTooLargeError helper
     */
    test('createPayloadTooLargeError should create correct AppError', () => {
      const error = ErrorHandler.createPayloadTooLargeError();

      expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Payload exceeds maximum size of 6MB');
      expect(error.statusCode).toBe(413);
    });
  });

  describe('Response Format', () => {
    /**
     * Requirement 8.4: Responses should include Content-Type header
     */
    test('should include Content-Type: application/json header', () => {
      const error = ErrorHandler.createValidationError('Test error');

      const response = ErrorHandler.handle(error, mockRequestId);

      expect(response.headers).toHaveProperty('Content-Type');
      expect(response.headers['Content-Type']).toBe('application/json');
    });

    /**
     * Test response includes requestId when provided
     */
    test('should include requestId in response body when provided', () => {
      const error = ErrorHandler.createValidationError('Test error');

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body.requestId).toBe(mockRequestId);
    });

    /**
     * Test response excludes requestId when not provided
     */
    test('should not include requestId in response body when not provided', () => {
      const error = ErrorHandler.createValidationError('Test error');

      const response = ErrorHandler.handle(error);

      const body = JSON.parse(response.body);
      expect(body.requestId).toBeUndefined();
    });

    /**
     * Test response body structure
     */
    test('should return response body with correct structure', () => {
      const error = ErrorHandler.createValidationError('Test error');

      const response = ErrorHandler.handle(error, mockRequestId);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
      expect(body).toHaveProperty('requestId');
      expect(typeof body.error).toBe('string');
      expect(typeof body.code).toBe('string');
    });
  });
});
