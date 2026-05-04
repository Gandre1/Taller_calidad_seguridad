/**
 * Unit Tests for KeyManager Module
 * 
 * Tests key retrieval, caching, retry logic, and JWK validation.
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { KeyManager, JsonWebKey, KeyManagerConfig } from './keyManager';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

// Create mock for SecretsManagerClient
const secretsManagerMock = mockClient(SecretsManagerClient);

describe('KeyManager', () => {
  let keyManager: KeyManager;
  let consoleLogSpy: jest.SpyInstance;

  // Sample valid public key JWK
  const validPublicKey: JsonWebKey = {
    kty: 'RSA',
    use: 'enc',
    kid: 'test-key-2024',
    n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx',
    e: 'AQAB'
  };

  // Sample valid private key JWK
  const validPrivateKey: JsonWebKey = {
    kty: 'RSA',
    use: 'enc',
    kid: 'test-key-2024',
    n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx',
    e: 'AQAB',
    d: 'X4cTteJY_gn4FYPsXB8rdXix5vwsg1FLN5E3EaG6RJoVH-HLLKD9',
    p: '83i-7IvMGXoMXCskv73TKr8637FiO7Z27zv8oj6pbWUQyLPBQxtS',
    q: '3dfOR9cuYq-0S-mkFLzgItgMEfFzB2q3hWehMuG0oCuqnb3vobLy',
    dp: 'G4sPXkc6Ya9y8oJW9_ILj4xuppu0lzi_H7VTkS8xj5SdX3coE0o',
    dq: 's9lAH9fggBsoFR8Oac2R_E2gw282rT2kGOAhvIllETE1efrA6hu',
    qi: 'GyM_p6JrXySiz1toFgKbWV-JdI3jQ4ypu9rbMWx3rQJBfmt0FoY'
  };

  beforeEach(() => {
    // Reset the mock before each test
    secretsManagerMock.reset();
    
    // Spy on console.log to capture log output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Create a new KeyManager instance with test configuration
    // This ensures a fresh cache for each test
    const config: KeyManagerConfig = {
      region: 'us-east-1',
      maxRetries: 3,
      initialRetryDelay: 100
    };
    keyManager = new KeyManager(config);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    keyManager.clearCache();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const km = new KeyManager();
      expect(km).toBeInstanceOf(KeyManager);
      expect(km.getCacheSize()).toBe(0);
    });

    it('should initialize with custom configuration', () => {
      const config: KeyManagerConfig = {
        region: 'eu-west-1',
        maxRetries: 5,
        initialRetryDelay: 200
      };
      const km = new KeyManager(config);
      expect(km).toBeInstanceOf(KeyManager);
    });

    it('should use AWS_REGION from environment if not provided', () => {
      process.env.AWS_REGION = 'ap-southeast-1';
      const km = new KeyManager();
      expect(km).toBeInstanceOf(KeyManager);
      delete process.env.AWS_REGION;
    });

    it('should support custom endpoint for testing', () => {
      const config: KeyManagerConfig = {
        endpoint: 'http://localhost:4566'
      };
      const km = new KeyManager(config);
      expect(km).toBeInstanceOf(KeyManager);
    });
  });

  describe('Public Key Retrieval (Requirement 2.1)', () => {
    it('should successfully retrieve public key from Secrets Manager', async () => {
      // Mock successful response from Secrets Manager
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      const key = await keyManager.getPublicKey('test-public-key');

      expect(key).toEqual(validPublicKey);
      expect(secretsManagerMock).toHaveReceivedCommandWith(GetSecretValueCommand, {
        SecretId: 'test-public-key'
      });
    });

    it('should throw error when SecretString is empty', async () => {
      // Mock returns response with empty SecretString - this should trigger validation error
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: '',
        $metadata: {}
      });

      await expect(keyManager.getPublicKey('test-key-empty')).rejects.toThrow();
    });

    it('should throw error when secret contains invalid JSON', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: 'not-valid-json',
        $metadata: {}
      });

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow();
    });

    it('should log key retrieval events', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      await keyManager.getPublicKey('test-public-key');

      // Check that logs were generated
      expect(consoleLogSpy).toHaveBeenCalled();
      
      // Find the success log
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const successLog = logs.find(log => 
        log.message === 'Public key retrieved and cached successfully'
      );
      expect(successLog).toBeDefined();
      expect(successLog?.context.keyId).toBe('test-public-key');
    });
  });

  describe('Private Key Retrieval (Requirement 4.1)', () => {
    it('should successfully retrieve private key from Secrets Manager', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPrivateKey)
      });

      const key = await keyManager.getPrivateKey('test-private-key');

      expect(key).toEqual(validPrivateKey);
      expect(secretsManagerMock).toHaveReceivedCommandWith(GetSecretValueCommand, {
        SecretId: 'test-private-key'
      });
    });

    it('should log private key retrieval without exposing key material (Requirement 4.6)', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPrivateKey)
      });

      await keyManager.getPrivateKey('test-private-key');

      // Check all logs to ensure private key material is not logged
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      
      logs.forEach(log => {
        const logString = JSON.stringify(log);
        // Ensure private key components are not in logs
        expect(logString).not.toContain(validPrivateKey.d);
        expect(logString).not.toContain(validPrivateKey.p);
        expect(logString).not.toContain(validPrivateKey.q);
        expect(logString).not.toContain(validPrivateKey.dp);
        expect(logString).not.toContain(validPrivateKey.dq);
        expect(logString).not.toContain(validPrivateKey.qi);
      });
    });

    it('should include keyId but not key material in success log', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPrivateKey)
      });

      await keyManager.getPrivateKey('test-private-key');

      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const successLog = logs.find(log => 
        log.message === 'Private key retrieved and cached successfully'
      );
      
      expect(successLog).toBeDefined();
      expect(successLog?.context.keyId).toBe('test-private-key');
      expect(successLog?.context.d).toBeUndefined();
      expect(successLog?.context.privateKey).toBeUndefined();
    });
  });

  describe('Retry Logic with Exponential Backoff (Requirements 2.2, 4.2)', () => {
    it('should retry up to 3 times with exponential backoff', async () => {
      let attemptCount = 0;
      
      secretsManagerMock.on(GetSecretValueCommand).callsFake(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return {
          SecretString: JSON.stringify(validPublicKey)
        };
      });

      const startTime = Date.now();
      const key = await keyManager.getPublicKey('test-key');
      const endTime = Date.now();

      expect(key).toEqual(validPublicKey);
      expect(attemptCount).toBe(3);
      
      // Verify exponential backoff timing (100ms + 200ms = 300ms minimum)
      expect(endTime - startTime).toBeGreaterThanOrEqual(300);
    });

    it('should succeed on first attempt without retries', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      const startTime = Date.now();
      const key = await keyManager.getPublicKey('test-key');
      const endTime = Date.now();

      expect(key).toEqual(validPublicKey);
      // Should complete quickly without retries
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should log retry attempts', async () => {
      let attemptCount = 0;
      
      secretsManagerMock.on(GetSecretValueCommand).callsFake(() => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary failure');
        }
        return {
          SecretString: JSON.stringify(validPublicKey)
        };
      });

      await keyManager.getPublicKey('test-key');

      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const retryLogs = logs.filter(log => log.message.includes('retrying'));
      
      expect(retryLogs.length).toBeGreaterThan(0);
      expect(retryLogs[0].context.delay).toBeDefined();
    });
  });

  describe('Failure After Retries Exhausted (Requirements 2.3, 4.3)', () => {
    it('should fail after 3 retry attempts', async () => {
      secretsManagerMock.on(GetSecretValueCommand).rejects(
        new Error('Secrets Manager unavailable')
      );

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow();

      // Verify it attempted 4 times total (initial + 3 retries)
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 4);
    });

    it('should log error after retries exhausted', async () => {
      secretsManagerMock.on(GetSecretValueCommand).rejects(
        new Error('Secrets Manager unavailable')
      );

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow();

      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const errorLog = logs.find(log => 
        log.message.includes('failed after') && log.message.includes('retries')
      );
      
      expect(errorLog).toBeDefined();
      expect(errorLog?.level).toBe('ERROR');
    });

    it('should throw KEY_RETRIEVAL_ERROR type', async () => {
      secretsManagerMock.on(GetSecretValueCommand).rejects(
        new Error('Network error')
      );

      try {
        await keyManager.getPublicKey('test-key');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Failed to retrieve key from Secrets Manager');
        expect(error.type).toBe('KEY_RETRIEVAL_ERROR');
      }
    });
  });

  describe('Key Caching (Requirements 2.4, 4.4)', () => {
    it('should cache public key after first retrieval', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      // First call - should fetch from Secrets Manager
      await keyManager.getPublicKey('test-key');
      expect(keyManager.getCacheSize()).toBe(1);

      // Second call - should use cache
      await keyManager.getPublicKey('test-key');
      
      // Should only call Secrets Manager once
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    it('should cache private key after first retrieval', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPrivateKey)
      });

      // First call
      await keyManager.getPrivateKey('test-key');
      expect(keyManager.getCacheSize()).toBe(1);

      // Second call - should use cache
      await keyManager.getPrivateKey('test-key');
      
      // Should only call Secrets Manager once
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    it('should cache different keys separately', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      await keyManager.getPublicKey('key-1');
      await keyManager.getPublicKey('key-2');

      expect(keyManager.getCacheSize()).toBe(2);
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 2);
    });

    it('should use cache on second retrieval', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      // First call - fetches from Secrets Manager
      await keyManager.getPublicKey('test-key');
      
      // Second call - should use cache (no additional Secrets Manager call)
      await keyManager.getPublicKey('test-key');

      // Should only have called Secrets Manager once
      expect(secretsManagerMock).toHaveReceivedCommandTimes(GetSecretValueCommand, 1);
    });

    it('should clear cache when clearCache is called', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      await keyManager.getPublicKey('test-key');
      expect(keyManager.getCacheSize()).toBe(1);

      keyManager.clearCache();
      expect(keyManager.getCacheSize()).toBe(0);
    });
  });

  describe('JWK Validation - Valid Keys (Requirement 2.5, 4.5)', () => {
    it('should accept valid public key with all required fields', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      const key = await keyManager.getPublicKey('test-key');
      expect(key).toEqual(validPublicKey);
    });

    it('should accept valid private key with all required fields', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPrivateKey)
      });

      const key = await keyManager.getPrivateKey('test-key');
      expect(key).toEqual(validPrivateKey);
    });

    it('should accept public key with optional fields', async () => {
      const keyWithOptionals: JsonWebKey = {
        ...validPublicKey,
        alg: 'RSA-OAEP-256'
      };

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(keyWithOptionals)
      });

      const key = await keyManager.getPublicKey('test-key');
      expect(key).toEqual(keyWithOptionals);
    });
  });

  describe('JWK Validation - Invalid Keys (Requirement 2.5, 4.5)', () => {
    it('should reject key with missing kty field', async () => {
      const invalidKey = { ...validPublicKey };
      delete (invalidKey as any).kty;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow(
        'Invalid key: kty must be "RSA"'
      );
    });

    it('should reject key with wrong kty value', async () => {
      const invalidKey = { ...validPublicKey, kty: 'EC' };

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow(
        'Invalid key: kty must be "RSA"'
      );
    });

    it('should reject public key with missing n field', async () => {
      const invalidKey = { ...validPublicKey };
      delete (invalidKey as any).n;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid modulus (n)'
      );
    });

    it('should reject public key with missing e field', async () => {
      const invalidKey = { ...validPublicKey };
      delete (invalidKey as any).e;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid exponent (e)'
      );
    });

    it('should reject public key with non-string n field', async () => {
      const invalidKey = { ...validPublicKey, n: 12345 as any };

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid modulus (n)'
      );
    });

    it('should reject private key with missing d field', async () => {
      const invalidKey = { ...validPrivateKey };
      delete (invalidKey as any).d;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid private exponent (d)'
      );
    });

    it('should reject private key with missing p field', async () => {
      const invalidKey = { ...validPrivateKey };
      delete (invalidKey as any).p;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid first prime factor (p)'
      );
    });

    it('should reject private key with missing q field', async () => {
      const invalidKey = { ...validPrivateKey };
      delete (invalidKey as any).q;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid second prime factor (q)'
      );
    });

    it('should reject private key with missing dp field', async () => {
      const invalidKey = { ...validPrivateKey };
      delete (invalidKey as any).dp;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid first factor CRT exponent (dp)'
      );
    });

    it('should reject private key with missing dq field', async () => {
      const invalidKey = { ...validPrivateKey };
      delete (invalidKey as any).dq;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid second factor CRT exponent (dq)'
      );
    });

    it('should reject private key with missing qi field', async () => {
      const invalidKey = { ...validPrivateKey };
      delete (invalidKey as any).qi;

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid first CRT coefficient (qi)'
      );
    });

    it('should reject private key with non-string private components', async () => {
      const invalidKey = { ...validPrivateKey, d: 12345 as any };

      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(invalidKey)
      } as any);

      await expect(keyManager.getPrivateKey('test-key')).rejects.toThrow(
        'Invalid key: missing or invalid private exponent (d)'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      secretsManagerMock.on(GetSecretValueCommand).rejects(
        new Error('Network timeout')
      );

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow();
    });

    it('should handle AWS service errors', async () => {
      const error: any = new Error('Secret not found');
      error.name = 'ResourceNotFoundException';
      
      secretsManagerMock.on(GetSecretValueCommand).rejects(error);

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow();
    });

    it('should log errors without exposing sensitive information', async () => {
      secretsManagerMock.on(GetSecretValueCommand).rejects(
        new Error('Internal AWS error with sensitive data')
      );

      await expect(keyManager.getPublicKey('test-key')).rejects.toThrow();

      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const errorLogs = logs.filter(log => log.level === 'ERROR');
      
      expect(errorLogs.length).toBeGreaterThan(0);
      errorLogs.forEach(log => {
        // Ensure no key material in error logs
        expect(log.context.key).toBeUndefined();
        expect(log.context.secretValue).toBeUndefined();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle concurrent requests for same key', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify(validPublicKey)
      });

      // Make multiple concurrent requests
      const promises = [
        keyManager.getPublicKey('test-key'),
        keyManager.getPublicKey('test-key'),
        keyManager.getPublicKey('test-key')
      ];

      const results = await Promise.all(promises);

      // All should return the same key
      results.forEach(key => {
        expect(key).toEqual(validPublicKey);
      });

      // Should have made multiple calls (no cache on first concurrent requests)
      // but subsequent calls should use cache
      expect(secretsManagerMock).toHaveReceivedCommand(GetSecretValueCommand);
    });

    it('should handle mixed public and private key requests', async () => {
      secretsManagerMock
        .on(GetSecretValueCommand, { SecretId: 'public-key' })
        .resolves({ SecretString: JSON.stringify(validPublicKey) })
        .on(GetSecretValueCommand, { SecretId: 'private-key' })
        .resolves({ SecretString: JSON.stringify(validPrivateKey) });

      const publicKey = await keyManager.getPublicKey('public-key');
      const privateKey = await keyManager.getPrivateKey('private-key');

      expect(publicKey).toEqual(validPublicKey);
      expect(privateKey).toEqual(validPrivateKey);
      expect(keyManager.getCacheSize()).toBe(2);
    });
  });
});
