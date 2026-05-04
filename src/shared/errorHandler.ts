/**
 * ErrorHandler Module
 * 
 * Provides centralized error handling with mapping to HTTP responses.
 * Ensures error messages do not expose internal details.
 * 
 * Validates: Requirements 1.7, 3.7, 7.1, 7.2, 7.5
 */

/**
 * Enumeration of all error types in the system
 */
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  DECRYPTION_ERROR = 'DECRYPTION_ERROR',
  KEY_RETRIEVAL_ERROR = 'KEY_RETRIEVAL_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Application error interface with type and HTTP status code
 */
export interface AppError {
  type: ErrorType;
  message: string;
  statusCode: number;
  details?: any;
}

/**
 * HTTP response structure for Lambda functions
 */
export interface ErrorResponse {
  statusCode: number;
  headers: {
    'Content-Type': string;
  };
  body: string;
}

/**
 * ErrorHandler class for centralized error handling
 */
export class ErrorHandler {
  /**
   * Handle an error and convert it to an HTTP response
   * Requirement 7.1: Map validation errors to 400
   * Requirement 7.2: Map internal errors to 500 with generic message
   * Requirement 7.5: Capture all unhandled exceptions and return valid HTTP responses
   */
  static handle(error: Error | AppError, requestId?: string): ErrorResponse {
    // Check if it's an AppError with known type
    if (this.isAppError(error)) {
      return this.createErrorResponse(
        error.statusCode,
        error.message,
        error.type,
        requestId
      );
    }

    // Handle unknown errors as internal errors
    // Requirement 1.7, 3.7: Do not expose internal details
    return this.createErrorResponse(
      500,
      'An internal error occurred while processing your request',
      ErrorType.INTERNAL_ERROR,
      requestId
    );
  }

  /**
   * Create a validation error
   * Requirement 7.1: Validation errors return 400 with descriptive message
   */
  static createValidationError(message: string): AppError {
    return {
      type: ErrorType.VALIDATION_ERROR,
      message,
      statusCode: 400
    };
  }

  /**
   * Create an internal error
   * Requirement 7.2: Internal errors return 500 with generic message
   */
  static createInternalError(message?: string): AppError {
    return {
      type: ErrorType.INTERNAL_ERROR,
      message: message || 'An internal error occurred while processing your request',
      statusCode: 500
    };
  }

  /**
   * Create an encryption error
   * Requirement 1.7: Encryption errors return 500 without exposing details
   */
  static createEncryptionError(message?: string): AppError {
    return {
      type: ErrorType.ENCRYPTION_ERROR,
      message: message || 'Failed to encrypt data',
      statusCode: 500
    };
  }

  /**
   * Create a decryption error
   * Requirement 3.7: Decryption errors return 500 without exposing details
   */
  static createDecryptionError(message?: string): AppError {
    return {
      type: ErrorType.DECRYPTION_ERROR,
      message: message || 'Failed to decrypt token',
      statusCode: 500
    };
  }

  /**
   * Create a key retrieval error
   * Requirement 7.2: Key retrieval errors return 500 with generic message
   */
  static createKeyRetrievalError(message?: string): AppError {
    return {
      type: ErrorType.KEY_RETRIEVAL_ERROR,
      message: message || 'Failed to retrieve encryption key',
      statusCode: 500
    };
  }

  /**
   * Create a timeout error
   * Requirement 7.3: Timeout errors return 504
   */
  static createTimeoutError(message?: string): AppError {
    return {
      type: ErrorType.TIMEOUT_ERROR,
      message: message || 'Request timeout',
      statusCode: 504
    };
  }

  /**
   * Create a payload too large error
   * Requirement 1.3: Payload >6MB returns 413
   */
  static createPayloadTooLargeError(message?: string): AppError {
    return {
      type: ErrorType.VALIDATION_ERROR,
      message: message || 'Payload exceeds maximum size of 6MB',
      statusCode: 413
    };
  }

  /**
   * Type guard to check if error is an AppError
   */
  private static isAppError(error: any): error is AppError {
    return (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'message' in error &&
      'statusCode' in error &&
      Object.values(ErrorType).includes(error.type)
    );
  }

  /**
   * Create a standardized error response
   * Requirement 8.4: Return responses with appropriate Content-Type headers
   */
  private static createErrorResponse(
    statusCode: number,
    message: string,
    errorType: ErrorType,
    requestId?: string
  ): ErrorResponse {
    const errorBody: any = {
      error: message,
      code: errorType
    };

    // Include requestId if available for traceability
    if (requestId) {
      errorBody.requestId = requestId;
    }

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorBody)
    };
  }
}
