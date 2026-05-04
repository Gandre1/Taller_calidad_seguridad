/**
 * KeyManager Module
 * 
 * Manages retrieval and caching of encryption keys from AWS Secrets Manager.
 * Implements retry logic with exponential backoff and JWK validation.
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2, 9.3
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  GetSecretValueCommandOutput
} from '@aws-sdk/client-secrets-manager';
import { Logger, createLogger } from './logger';
import { ErrorHandler } from './errorHandler';

/**
 * JSON Web Key (JWK) interface conforming to RFC 7517
 * Requirement 8.3: Use JWK format for keys
 */
export interface JsonWebKey {
  kty: string;           // Key Type (e.g., "RSA")
  use?: string;          // Public Key Use (e.g., "enc")
  kid?: string;          // Key ID
  alg?: string;          // Algorithm (e.g., "RSA-OAEP-256")
  
  // RSA Public Key Parameters
  n: string;             // Modulus
  e: string;             // Exponent
  
  // RSA Private Key Parameters (only for private keys)
  d?: string;            // Private Exponent
  p?: string;            // First Prime Factor
  q?: string;            // Second Prime Factor
  dp?: string;           // First Factor CRT Exponent
  dq?: string;           // Second Factor CRT Exponent
  qi?: string;           // First CRT Coefficient
}

/**
 * Configuration for KeyManager
 */
export interface KeyManagerConfig {
  region?: string;
  maxRetries?: number;
  initialRetryDelay?: number;  // milliseconds
  endpoint?: string;            // For testing with LocalStack
}

/**
 * KeyManager class for managing encryption keys
 */
export class KeyManager {
  private client: SecretsManagerClient;
  private cache: Map<string, JsonWebKey>;
  private logger: Logger;
  private maxRetries: number;
  private initialRetryDelay: number;

  /**
   * Constructor
   * Requirement 9.1: Read configuration from environment variables
   */
  constructor(config?: KeyManagerConfig) {
    const region = config?.region || process.env.AWS_REGION || 'us-east-1';
    
    // Initialize AWS Secrets Manager client
    // Requirement 2.1, 4.1: Implement client for AWS Secrets Manager
    this.client = new SecretsManagerClient({
      region,
      ...(config?.endpoint && { endpoint: config.endpoint })
    });

    // Initialize in-memory cache
    // Requirement 2.4, 4.4: Cache keys during Lambda container lifecycle
    this.cache = new Map<string, JsonWebKey>();

    // Initialize logger
    this.logger = createLogger();

    // Configure retry settings
    // Requirement 2.2, 4.2: Retry up to 3 times with exponential backoff
    this.maxRetries = config?.maxRetries ?? 3;
    this.initialRetryDelay = config?.initialRetryDelay ?? 100; // 100ms
  }

  /**
   * Get public key from cache or Secrets Manager
   * Requirement 2.1: Retrieve public key from Key Manager at initialization
   * Requirement 2.4: Cache public key during Lambda container lifecycle
   */
  async getPublicKey(keyId: string): Promise<JsonWebKey> {
    this.logger.debug('Retrieving public key', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'getPublicKey',
      keyId
    });

    // Check cache first
    const cachedKey = this.cache.get(keyId);
    if (cachedKey) {
      this.logger.debug('Public key found in cache', {
        requestId: 'key-manager',
        timestamp: new Date().toISOString(),
        functionName: 'getPublicKey',
        keyId
      });
      return cachedKey;
    }

    // Fetch from Secrets Manager with retry logic
    // Requirement 2.2: Retry up to 3 times with exponential interval
    const key = await this.retryWithBackoff(
      () => this.fetchFromSecretsManager(keyId)
    );

    // Validate key format
    // Requirement 2.5: Validate key format before using
    this.validatePublicKey(key);

    // Cache the key
    this.cache.set(keyId, key);

    this.logger.info('Public key retrieved and cached successfully', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'getPublicKey',
      keyId
    });

    return key;
  }

  /**
   * Get private key from cache or Secrets Manager
   * Requirement 4.1: Retrieve private key from Key Manager at initialization
   * Requirement 4.4: Cache private key during Lambda container lifecycle
   * Requirement 4.6: Ensure private key is never logged
   */
  async getPrivateKey(keyId: string): Promise<JsonWebKey> {
    this.logger.debug('Retrieving private key', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'getPrivateKey',
      keyId
    });

    // Check cache first
    const cachedKey = this.cache.get(keyId);
    if (cachedKey) {
      this.logger.debug('Private key found in cache', {
        requestId: 'key-manager',
        timestamp: new Date().toISOString(),
        functionName: 'getPrivateKey',
        keyId
      });
      return cachedKey;
    }

    // Fetch from Secrets Manager with retry logic
    // Requirement 4.2: Retry up to 3 times with exponential interval
    const key = await this.retryWithBackoff(
      () => this.fetchFromSecretsManager(keyId)
    );

    // Validate key format
    // Requirement 4.5: Validate key format before using
    this.validatePrivateKey(key);

    // Cache the key
    this.cache.set(keyId, key);

    // Requirement 4.6: Never log private key material
    this.logger.info('Private key retrieved and cached successfully', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'getPrivateKey',
      keyId
      // Note: Key material is NOT logged
    });

    return key;
  }

  /**
   * Fetch key from AWS Secrets Manager
   * Requirement 2.1, 4.1: Retrieve keys from Secrets Manager
   */
  private async fetchFromSecretsManager(secretId: string): Promise<JsonWebKey> {
    try {
      const input: GetSecretValueCommandInput = {
        SecretId: secretId
      };

      const command = new GetSecretValueCommand(input);
      const response: GetSecretValueCommandOutput = await this.client.send(command);

      // Parse the secret string as JSON
      if (!response.SecretString || response.SecretString.trim() === '') {
        throw ErrorHandler.createKeyRetrievalError(
          'Secret value is empty or not a string'
        );
      }

      let key: JsonWebKey;
      try {
        key = JSON.parse(response.SecretString) as JsonWebKey;
      } catch (parseError) {
        throw ErrorHandler.createKeyRetrievalError(
          'Secret contains invalid JSON'
        );
      }

      return key;

    } catch (error) {
      // Re-throw validation errors and key retrieval errors as-is
      if (error && typeof error === 'object' && 'type' in error) {
        throw error; // This is already an AppError
      }

      // Log error without exposing key material
      this.logger.error(
        'Failed to fetch key from Secrets Manager',
        error as Error,
        {
          requestId: 'key-manager',
          timestamp: new Date().toISOString(),
          functionName: 'fetchFromSecretsManager',
          secretId
        }
      );

      throw ErrorHandler.createKeyRetrievalError(
        'Failed to retrieve key from Secrets Manager'
      );
    }
  }

  /**
   * Retry a function with exponential backoff
   * Requirement 2.2, 4.2: Implement retry with exponential backoff (100ms, 200ms, 400ms)
   * Requirement 2.3, 4.3: Fail initialization if key cannot be retrieved after retries
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Attempt the operation
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry validation errors - they won't succeed on retry
        if (error && typeof error === 'object' && 'type' in error) {
          const appError = error as any;
          if (appError.type === 'VALIDATION_ERROR') {
            throw error; // Don't retry validation errors
          }
        }

        // If this was the last attempt, throw the error
        if (attempt === this.maxRetries) {
          this.logger.error(
            `Operation failed after ${this.maxRetries} retries`,
            lastError,
            {
              requestId: 'key-manager',
              timestamp: new Date().toISOString(),
              functionName: 'retryWithBackoff',
              attempt: attempt + 1
            }
          );
          break;
        }

        // Calculate delay with exponential backoff: 100ms, 200ms, 400ms
        const delay = this.initialRetryDelay * Math.pow(2, attempt);

        this.logger.warn(
          `Operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
          {
            requestId: 'key-manager',
            timestamp: new Date().toISOString(),
            functionName: 'retryWithBackoff',
            attempt: attempt + 1,
            delay
          }
        );

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // If we get here, all retries failed
    // Requirement 2.3, 4.3: Fail initialization and log error
    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate public key JWK format
   * Requirement 2.5: Validate key format before using
   * Requirement 8.3: Keys must conform to RFC 7517
   */
  private validatePublicKey(key: JsonWebKey): void {
    // Check required fields for RSA public key
    if (!key.kty || key.kty !== 'RSA') {
      throw ErrorHandler.createValidationError(
        'Invalid key: kty must be "RSA"'
      );
    }

    if (!key.n || typeof key.n !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid modulus (n)'
      );
    }

    if (!key.e || typeof key.e !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid exponent (e)'
      );
    }

    this.logger.debug('Public key validation passed', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'validatePublicKey',
      kty: key.kty,
      kid: key.kid
    });
  }

  /**
   * Validate private key JWK format
   * Requirement 4.5: Validate key format before using
   * Requirement 8.3: Keys must conform to RFC 7517
   */
  private validatePrivateKey(key: JsonWebKey): void {
    // First validate as public key (has public components)
    this.validatePublicKey(key);

    // Check required fields for RSA private key
    if (!key.d || typeof key.d !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid private exponent (d)'
      );
    }

    if (!key.p || typeof key.p !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid first prime factor (p)'
      );
    }

    if (!key.q || typeof key.q !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid second prime factor (q)'
      );
    }

    if (!key.dp || typeof key.dp !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid first factor CRT exponent (dp)'
      );
    }

    if (!key.dq || typeof key.dq !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid second factor CRT exponent (dq)'
      );
    }

    if (!key.qi || typeof key.qi !== 'string') {
      throw ErrorHandler.createValidationError(
        'Invalid key: missing or invalid first CRT coefficient (qi)'
      );
    }

    // Requirement 4.6: Do not log private key material
    this.logger.debug('Private key validation passed', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'validatePrivateKey',
      kty: key.kty,
      kid: key.kid
      // Note: Private key parameters are NOT logged
    });
  }

  /**
   * Clear the key cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Key cache cleared', {
      requestId: 'key-manager',
      timestamp: new Date().toISOString(),
      functionName: 'clearCache'
    });
  }

  /**
   * Get cache size (useful for testing)
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

/**
 * Create a default KeyManager instance
 */
export function createKeyManager(config?: KeyManagerConfig): KeyManager {
  return new KeyManager(config);
}
