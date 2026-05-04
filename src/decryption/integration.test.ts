/**
 * Integration test for Decryption Lambda
 * 
 * Verifies end-to-end functionality by encrypting with encryption Lambda
 * and decrypting with decryption Lambda.
 */

import { handler as encryptHandler } from '../encryption/index';
import { handler as decryptHandler } from './index';
import * as jose from 'jose';

describe('Decryption Lambda - Integration Test', () => {
  let publicKey: jose.JWK;
  let privateKey: jose.JWK;

  beforeAll(async () => {
    // Generate RSA key pair for testing
    const { publicKey: pubKey, privateKey: privKey } = await jose.generateKeyPair('RSA-OAEP-256', {
      modulusLength: 2048,
    });

    publicKey = await jose.exportJWK(pubKey);
    privateKey = await jose.exportJWK(privKey);

    publicKey.use = 'enc';
    privateKey.use = 'enc';
    publicKey.kid = 'test-key-1';
    privateKey.kid = 'test-key-1';

    // Set environment variables
    process.env.KEY_ID = 'test-key-1';
    process.env.LOG_LEVEL = 'ERROR'; // Reduce noise in tests
  });

  afterAll(() => {
    delete process.env.KEY_ID;
    delete process.env.LOG_LEVEL;
  });

  it('should successfully decrypt a token encrypted by encryption Lambda', async () => {
    // Mock KeyManager to return our test keys
    const KeyManager = require('../shared/keyManager').KeyManager;
    KeyManager.prototype.getPublicKey = jest.fn().mockResolvedValue(publicKey);
    KeyManager.prototype.getPrivateKey = jest.fn().mockResolvedValue(privateKey);

    // Step 1: Encrypt data
    const originalPayload = {
      userId: '12345',
      email: 'test@example.com',
      sensitiveData: {
        ssn: '123-45-6789',
        creditCard: '4111111111111111'
      }
    };

    const encryptEvent = {
      body: JSON.stringify(originalPayload),
      requestContext: {
        requestId: 'encrypt-test-123'
      }
    };

    const encryptResponse = await encryptHandler(encryptEvent);
    expect(encryptResponse.statusCode).toBe(200);

    const encryptBody = JSON.parse(encryptResponse.body);
    expect(encryptBody).toHaveProperty('token');
    const token = encryptBody.token;

    // Step 2: Decrypt token
    const decryptEvent = {
      body: JSON.stringify({ token }),
      requestContext: {
        requestId: 'decrypt-test-123'
      }
    };

    const decryptResponse = await decryptHandler(decryptEvent);
    expect(decryptResponse.statusCode).toBe(200);

    // Step 3: Verify decrypted data matches original
    const decryptedPayload = JSON.parse(decryptResponse.body);
    expect(decryptedPayload).toEqual(originalPayload);
  });

  it('should return 400 for invalid token format', async () => {
    const KeyManager = require('../shared/keyManager').KeyManager;
    KeyManager.prototype.getPrivateKey = jest.fn().mockResolvedValue(privateKey);

    const decryptEvent = {
      body: JSON.stringify({ token: 'invalid.token.format' }),
      requestContext: {
        requestId: 'invalid-format-test'
      }
    };

    const response = await decryptHandler(decryptEvent);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('must have exactly 5 parts');
  });

  it('should return 400 for missing token', async () => {
    const KeyManager = require('../shared/keyManager').KeyManager;
    KeyManager.prototype.getPrivateKey = jest.fn().mockResolvedValue(privateKey);

    const decryptEvent = {
      body: JSON.stringify({}),
      requestContext: {
        requestId: 'missing-token-test'
      }
    };

    const response = await decryptHandler(decryptEvent);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('Token is required');
  });

  it('should return 400 for token with wrong algorithms', async () => {
    const KeyManager = require('../shared/keyManager').KeyManager;
    KeyManager.prototype.getPrivateKey = jest.fn().mockResolvedValue(privateKey);

    // Create a token with wrong algorithms
    const header = { alg: 'RSA1_5', enc: 'A128GCM' };
    const headerJson = JSON.stringify(header);
    const headerBase64 = Buffer.from(headerJson).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const invalidToken = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;

    const decryptEvent = {
      body: JSON.stringify({ token: invalidToken }),
      requestContext: {
        requestId: 'wrong-alg-test'
      }
    };

    const response = await decryptHandler(decryptEvent);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('RSA-OAEP-256 and A256GCM');
  });

  it('should handle complex nested payloads', async () => {
    const KeyManager = require('../shared/keyManager').KeyManager;
    KeyManager.prototype.getPublicKey = jest.fn().mockResolvedValue(publicKey);
    KeyManager.prototype.getPrivateKey = jest.fn().mockResolvedValue(privateKey);

    const complexPayload = {
      level1: {
        level2: {
          level3: {
            data: 'deep nested value',
            array: [1, 2, 3, 4, 5],
            boolean: true,
            null: null
          }
        }
      },
      timestamp: '2024-01-01T00:00:00Z',
      numbers: [1.5, 2.7, 3.14159],
      mixed: {
        string: 'text',
        number: 42,
        array: ['a', 'b', 'c']
      }
    };

    // Encrypt
    const encryptEvent = {
      body: JSON.stringify(complexPayload),
      requestContext: { requestId: 'complex-encrypt' }
    };

    const encryptResponse = await encryptHandler(encryptEvent);
    expect(encryptResponse.statusCode).toBe(200);

    const token = JSON.parse(encryptResponse.body).token;

    // Decrypt
    const decryptEvent = {
      body: JSON.stringify({ token }),
      requestContext: { requestId: 'complex-decrypt' }
    };

    const decryptResponse = await decryptHandler(decryptEvent);
    expect(decryptResponse.statusCode).toBe(200);

    const decrypted = JSON.parse(decryptResponse.body);
    expect(decrypted).toEqual(complexPayload);
  });

  it('should include Content-Type header in all responses', async () => {
    const KeyManager = require('../shared/keyManager').KeyManager;
    KeyManager.prototype.getPrivateKey = jest.fn().mockResolvedValue(privateKey);

    const decryptEvent = {
      body: JSON.stringify({ token: 'invalid' }),
      requestContext: { requestId: 'header-test' }
    };

    const response = await decryptHandler(decryptEvent);
    
    expect(response.headers).toHaveProperty('Content-Type');
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
