/**
 * AWS Secrets Manager Integration Tests
 * 
 * Tests integration with AWS Secrets Manager using mocks and LocalStack simulation.
 * Validates key retrieval, retry logic, and failure scenarios.
 * 
 * Task 9.4: Escribir pruebas de integración con AWS Secrets Manager
 * Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3
 */

import { KeyManager, JsonWebKey } from '../shared/keyManager';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import * as jose from 'jose';

// Create mock for SecretsManagerClient
const secretsManagerMock = mockClient(SecretsManagerClient);

describe('AWS Secrets Manager Integration Tests', () => {
  let keyManager: KeyManager;
  let testPublicKey: JsonWebKey;
  let testPrivateKey: JsonWebKey;

  beforeAll(async () => {
    // Generate test RSA key pair
    const { publicKey, privateKey } = await jose.generateKeyPair('RSA-OAEP-256', {
      modulusLength: 2048,
    });

    const exportedPublicKey = await jose.exportJWK(publicKey);
    const exportedPrivateKey = await jose.exportJWK(privateKey);

    testPublicKey = {
      kty: exportedPublicKey.kty!,
      n: exportedPublicKey.n!,
      e: exportedPublicKey.e!,
      use: 'enc',
      kid: 'test-key-secrets'
    };

    testPrivateKey = {
      kty: exportedPrivateKey.kty!,
      n: exportedPrivateKey.n!,
      e: exportedPrivateKey.e!,
      d: exportedPrivateKey.d!,
      p: exportedPrivateKey.p!,
      q: exportedPrivateKey.q!,
      dp: exportedPrivateKey.dp!,
      dq: exportedPrivateKey.dq!,
      qi: exportedPrivateKey.qi!,
      use: 'enc',
      kid: 'test-key-secrets'
    };

    // Set environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.LOG_LEVEL = 'ERROR'; // Reduce noise in tests
  });

  beforeEach(() => {
    // Reset mock before each test
    secretsManagerMock.reset();
    
    // Create new KeyManager instance for each test
    keyManager = new KeyManager({
      region: 'us-east-1'
    });
  });

  afterAll(() => {
    delete process.env.AWS_REGION;
    delete process.env.LOG_LEVEL;
  });

  describe('Successful Key Retrieval', () => {
    it('should retrieve public key from Secrets Manager successfully', async () => {
      // Requirement 2.1: Retrieve public key from Secrets Manager
      const keyId = 'test-public-key';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(testPublicKey)
      });

      const retrievedKey = await keyManager.getPublicKey(keyId);

      expect(retrievedKey).toEqual(testPublicKey);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
      const commandCall = secretsManagerMock.commandCalls(GetSecretValueCommand)[0];
      expect(commandCall?.args[0].input).toEqual({
        SecretId: keyId
      });
    });

    it('should retrieve private key from Secrets Manager successfully', async () => {
      // Requirement 4.1: Retrieve private key from Secrets Manager
      const keyId = 'test-private-key';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(testPrivateKey)
      });

      const retrievedKey = await keyManager.getPrivateKey(keyId);

      expect(retrievedKey).toEqual(testPrivateKey);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
    });

    it('should cache keys after first retrieval', async () => {
      // Requirement 2.4, 4.4: Cache keys during Lambda container lifecycle
      const keyId = 'test-cache-key';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(testPublicKey)
      });

      // First call should fetch from Secrets Manager
      const firstCall = await keyManager.getPublicKey(keyId);
      expect(firstCall).toEqual(testPublicKey);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);

      // Second call should use cache (no additional Secrets Manager call)
      const secondCall = await keyManager.getPublicKey(keyId);
      expect(secondCall).toEqual(testPublicKey);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1); // Still 1

      // Verify cache is working
      expect(keyManager.getCacheSize()).toBe(1);
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should retry up to 3 times with exponential backoff when Secrets Manager is unavailable', async () => {
      // Requirement 2.2, 4.2: Retry up to 3 times with exponential interval
      const keyId = 'test-retry-key';
      
      // Mock to fail first 2 attempts, succeed on 3rd
      secretsManagerMock
        .on(GetSecretValueCommand)
        .rejectsOnce(new Error('Service unavailable'))
        .rejectsOnce(new Error('Service unavailable'))
        .resolvesOnce({
          SecretString: JSON.stringify(testPublicKey)
        });

      const startTime = Date.now();
      const retrievedKey = await keyManager.getPublicKey(keyId);
      const endTime = Date.now();

      expect(retrievedKey).toEqual(testPublicKey);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(3);

      // Verify exponential backoff timing (100ms + 200ms = 300ms minimum)
      // Allow some tolerance for test execution time
      expect(endTime - startTime).toBeGreaterThanOrEqual(250);
    });

    it('should retry with correct exponential backoff intervals', async () => {
      // Test the specific backoff intervals: 100ms, 200ms, 400ms
      const keyId = 'test-backoff-intervals';
      const retryTimes: number[] = [];
      
      // Mock to fail all attempts
      secretsManagerMock.on(GetSecretValueCommand).callsFake(() => {
        retryTimes.push(Date.now());
        throw new Error('Service unavailable');
      });
      
      try {
        await keyManager.getPublicKey(keyId);
        fail('Should have thrown error after all retries');
      } catch (error: any) {
        expect(error).toHaveProperty('type');
        expect(error.type).toBe('KEY_RETRIEVAL_ERROR');
      }

      // Should have made 4 attempts (initial + 3 retries)
      expect(retryTimes).toHaveLength(4);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(4);

      // Verify backoff intervals (with some tolerance for execution time)
      const intervals = retryTimes.slice(1).map((time, index) => {
        const previousTime = retryTimes[index];
        return previousTime ? time - previousTime : 0;
      });
      
      // First retry: ~100ms
      expect(intervals[0]).toBeGreaterThanOrEqual(80);
      expect(intervals[0]).toBeLessThanOrEqual(150);
      
      // Second retry: ~200ms
      expect(intervals[1]).toBeGreaterThanOrEqual(180);
      expect(intervals[1]).toBeLessThanOrEqual(250);
      
      // Third retry: ~400ms
      expect(intervals[2]).toBeGreaterThanOrEqual(380);
      expect(intervals[2]).toBeLessThanOrEqual(450);
    });

    it('should handle throttling errors with retries', async () => {
      // Test handling of AWS throttling (429 errors)
      const keyId = 'test-throttling';
      
      const throttlingError = new Error('Throttling');
      (throttlingError as any).name = 'ThrottlingException';
      
      secretsManagerMock
        .on(GetSecretValueCommand)
        .rejectsOnce(throttlingError)
        .resolvesOnce({
          SecretString: JSON.stringify(testPublicKey)
        });

      const retrievedKey = await keyManager.getPublicKey(keyId);
      
      expect(retrievedKey).toEqual(testPublicKey);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
    });
  });

  describe('Failure Scenarios', () => {
    it('should fail initialization when key cannot be retrieved after all retries', async () => {
      // Requirement 2.3, 4.3: Fail initialization if key cannot be retrieved after retries
      const keyId = 'test-fail-key';
      
      secretsManagerMock.on(GetSecretValueCommand).rejects(new Error('Persistent failure'));

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
      
      // Should have attempted 4 times (initial + 3 retries)
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(4);
    });

    it('should handle empty secret values', async () => {
      const keyId = 'test-empty-secret';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: undefined // Empty secret
      });

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
    });

    it('should handle invalid JSON in secret values', async () => {
      const keyId = 'test-invalid-json';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: 'invalid json content'
      });

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
    });

    it('should handle malformed JWK in secret values', async () => {
      const keyId = 'test-malformed-jwk';
      
      const malformedKey = {
        kty: 'RSA',
        // Missing required fields n and e
      };
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(malformedKey)
      });

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'VALIDATION_ERROR',
        message: expect.stringContaining('Invalid key')
      });
    });

    it('should handle network errors', async () => {
      const keyId = 'test-network-error';
      
      const networkError = new Error('Network error');
      (networkError as any).code = 'NetworkingError';
      
      secretsManagerMock.on(GetSecretValueCommand).rejects(networkError);

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
    });

    it('should handle access denied errors', async () => {
      const keyId = 'test-access-denied';
      
      const accessError = new Error('Access denied');
      (accessError as any).name = 'AccessDeniedException';
      
      secretsManagerMock.on(GetSecretValueCommand).rejects(accessError);

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
    });

    it('should handle resource not found errors', async () => {
      const keyId = 'test-not-found';
      
      const notFoundError = new Error('Resource not found');
      (notFoundError as any).name = 'ResourceNotFoundException';
      
      secretsManagerMock.on(GetSecretValueCommand).rejects(notFoundError);

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
    });
  });

  describe('Key Validation', () => {
    it('should validate public key format before caching', async () => {
      // Requirement 2.5: Validate key format before using
      const keyId = 'test-validation-public';
      
      const invalidPublicKey = {
        kty: 'EC', // Wrong key type
        n: testPublicKey.n,
        e: testPublicKey.e
      };
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidPublicKey)
      });

      await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'VALIDATION_ERROR',
        message: 'Invalid key: kty must be "RSA"'
      });
    });

    it('should validate private key format before caching', async () => {
      // Requirement 4.5: Validate key format before using
      const keyId = 'test-validation-private';
      
      const invalidPrivateKey = {
        ...testPrivateKey,
        d: undefined // Missing private exponent
      };
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidPrivateKey)
      });

      await expect(keyManager.getPrivateKey(keyId)).rejects.toMatchObject({
        type: 'VALIDATION_ERROR',
        message: expect.stringContaining('Invalid key: missing or invalid private exponent')
      });
    });

    it('should validate all required public key fields', async () => {
      const keyId = 'test-public-fields';
      
      const testCases = [
        { ...testPublicKey, kty: undefined, expectedError: 'kty must be "RSA"' },
        { ...testPublicKey, n: undefined, expectedError: 'missing or invalid modulus' },
        { ...testPublicKey, e: undefined, expectedError: 'missing or invalid exponent' },
        { ...testPublicKey, n: 123, expectedError: 'missing or invalid modulus' }, // Wrong type
        { ...testPublicKey, e: 456, expectedError: 'missing or invalid exponent' } // Wrong type
      ];

      for (const testCase of testCases) {
        secretsManagerMock.reset();
        secretsManagerMock.on(GetSecretValueCommand).resolves({
          SecretString: JSON.stringify(testCase)
        });

        await expect(keyManager.getPublicKey(keyId)).rejects.toMatchObject({
          type: 'VALIDATION_ERROR',
          message: expect.stringContaining(testCase.expectedError)
        });
      }
    });

    it('should validate all required private key fields', async () => {
      const keyId = 'test-private-fields';
      
      const testCases = [
        { ...testPrivateKey, d: undefined, expectedError: 'missing or invalid private exponent' },
        { ...testPrivateKey, p: undefined, expectedError: 'missing or invalid first prime factor' },
        { ...testPrivateKey, q: undefined, expectedError: 'missing or invalid second prime factor' },
        { ...testPrivateKey, dp: undefined, expectedError: 'missing or invalid first factor CRT exponent' },
        { ...testPrivateKey, dq: undefined, expectedError: 'missing or invalid second factor CRT exponent' },
        { ...testPrivateKey, qi: undefined, expectedError: 'missing or invalid first CRT coefficient' }
      ];

      for (const testCase of testCases) {
        secretsManagerMock.reset();
        secretsManagerMock.on(GetSecretValueCommand).resolves({
          SecretString: JSON.stringify(testCase)
        });

        await expect(keyManager.getPrivateKey(keyId)).rejects.toMatchObject({
          type: 'VALIDATION_ERROR',
          message: expect.stringContaining(testCase.expectedError)
        });
      }
    });
  });

  describe('LocalStack Simulation', () => {
    it('should work with LocalStack endpoint configuration', async () => {
      // Test configuration for LocalStack (local AWS simulation)
      const localStackKeyManager = new KeyManager({
        region: 'us-east-1',
        endpoint: 'http://localhost:4566' // LocalStack default endpoint
      });

      const keyId = 'test-localstack-key';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(testPublicKey)
      });

      const retrievedKey = await localStackKeyManager.getPublicKey(keyId);
      
      expect(retrievedKey).toEqual(testPublicKey);
    });

    it('should handle LocalStack connection failures gracefully', async () => {
      const localStackKeyManager = new KeyManager({
        region: 'us-east-1',
        endpoint: 'http://localhost:4566'
      });

      const keyId = 'test-localstack-failure';
      
      const connectionError = new Error('Connection refused');
      (connectionError as any).code = 'ECONNREFUSED';
      
      secretsManagerMock.on(GetSecretValueCommand).rejects(connectionError);

      await expect(localStackKeyManager.getPublicKey(keyId)).rejects.toMatchObject({
        type: 'KEY_RETRIEVAL_ERROR',
        message: 'Failed to retrieve key from Secrets Manager'
      });
    });
  });

  describe('Performance and Caching', () => {
    it('should cache multiple different keys', async () => {
      const keyId1 = 'test-key-1';
      const keyId2 = 'test-key-2';
      
      const key1 = { ...testPublicKey, kid: 'key-1' };
      const key2 = { ...testPublicKey, kid: 'key-2' };
      
      secretsManagerMock
        .on(GetSecretValueCommand, { SecretId: keyId1 })
        .resolves({ SecretString: JSON.stringify(key1) })
        .on(GetSecretValueCommand, { SecretId: keyId2 })
        .resolves({ SecretString: JSON.stringify(key2) });

      // Retrieve both keys
      const retrievedKey1 = await keyManager.getPublicKey(keyId1);
      const retrievedKey2 = await keyManager.getPublicKey(keyId2);

      expect(retrievedKey1).toEqual(key1);
      expect(retrievedKey2).toEqual(key2);
      expect(keyManager.getCacheSize()).toBe(2);

      // Retrieve again to test cache
      const cachedKey1 = await keyManager.getPublicKey(keyId1);
      const cachedKey2 = await keyManager.getPublicKey(keyId2);

      expect(cachedKey1).toEqual(key1);
      expect(cachedKey2).toEqual(key2);
      
      // Should still only have 2 Secrets Manager calls (one per key)
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
    });

    it('should clear cache when requested', async () => {
      const keyId = 'test-clear-cache';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(testPublicKey)
      });

      // Retrieve key to populate cache
      await keyManager.getPublicKey(keyId);
      expect(keyManager.getCacheSize()).toBe(1);

      // Clear cache
      keyManager.clearCache();
      expect(keyManager.getCacheSize()).toBe(0);

      // Next retrieval should fetch from Secrets Manager again
      await keyManager.getPublicKey(keyId);
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
    });

    it('should handle concurrent key retrievals efficiently', async () => {
      const keyId = 'test-concurrent';
      
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(testPublicKey)
      });

      // Make multiple concurrent requests for the same key
      const promises = Array(5).fill(null).map(() => keyManager.getPublicKey(keyId));
      const results = await Promise.all(promises);

      // All should return the same key
      results.forEach(result => {
        expect(result).toEqual(testPublicKey);
      });

      // Should have made multiple calls since cache wasn't populated yet
      // (This tests the race condition handling)
      expect(secretsManagerMock.commandCalls(GetSecretValueCommand).length).toBeGreaterThan(0);
    });
  });
});