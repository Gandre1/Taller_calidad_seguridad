/**
 * Unit tests for JWEDecryptor
 * 
 * Tests the decryption engine for JWE tokens
 */

import { JWEDecryptor } from './JWEDecryptor';
import { JWEEncryptor } from '../encryption/JWEEncryptor';
import * as jose from 'jose';

describe('JWEDecryptor', () => {
  let publicKey: jose.JWK;
  let privateKey: jose.JWK;

  beforeAll(async () => {
    // Generate RSA key pair for testing
    const { publicKey: pubKey, privateKey: privKey } = await jose.generateKeyPair('RSA-OAEP-256', {
      modulusLength: 2048,
    });

    publicKey = await jose.exportJWK(pubKey);
    privateKey = await jose.exportJWK(privKey);

    // Add required fields
    publicKey.use = 'enc';
    privateKey.use = 'enc';
  });

  describe('constructor', () => {
    it('should create instance with valid private key', () => {
      expect(() => new JWEDecryptor(privateKey)).not.toThrow();
    });

    it('should throw error with invalid private key (missing d)', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.d;

      expect(() => new JWEDecryptor(invalidKey)).toThrow(
        'Invalid private key format: Key must be a valid JWK with required fields'
      );
    });

    it('should throw error with public key instead of private key', () => {
      expect(() => new JWEDecryptor(publicKey)).toThrow(
        'Invalid private key format: Key must be a valid JWK with required fields'
      );
    });

    it('should throw error with null key', () => {
      expect(() => new JWEDecryptor(null as any)).toThrow(
        'Invalid private key format: Key must be a valid JWK with required fields'
      );
    });
  });

  describe('decrypt', () => {
    it('should decrypt valid JWE token and return original payload', async () => {
      const payload = {
        userId: '12345',
        email: 'test@example.com',
        data: { sensitive: 'information' }
      };

      // Encrypt with JWEEncryptor
      const encryptor = new JWEEncryptor(publicKey);
      const token = await encryptor.encrypt(payload);

      // Decrypt with JWEDecryptor
      const decryptor = new JWEDecryptor(privateKey);
      const decrypted = await decryptor.decrypt(token);

      expect(decrypted).toEqual(payload);
    });

    it('should handle complex nested payloads', async () => {
      const payload = {
        level1: {
          level2: {
            level3: {
              data: 'deep nested value',
              array: [1, 2, 3, 4, 5]
            }
          }
        },
        timestamp: '2024-01-01T00:00:00Z'
      };

      const encryptor = new JWEEncryptor(publicKey);
      const token = await encryptor.encrypt(payload);

      const decryptor = new JWEDecryptor(privateKey);
      const decrypted = await decryptor.decrypt(token);

      expect(decrypted).toEqual(payload);
    });

    it('should throw error with corrupted token', async () => {
      const decryptor = new JWEDecryptor(privateKey);
      const corruptedToken = 'eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.corrupted.data.here.tag';

      await expect(decryptor.decrypt(corruptedToken)).rejects.toThrow('Decryption failed');
    });

    it('should throw error with invalid token format', async () => {
      const decryptor = new JWEDecryptor(privateKey);
      const invalidToken = 'not.a.valid.token';

      await expect(decryptor.decrypt(invalidToken)).rejects.toThrow('Decryption failed');
    });

    it('should throw error when using wrong private key', async () => {
      // Generate a different key pair
      const { privateKey: wrongPrivKey } = await jose.generateKeyPair('RSA-OAEP-256', {
        modulusLength: 2048,
      });
      const wrongPrivateKey = await jose.exportJWK(wrongPrivKey);
      wrongPrivateKey.use = 'enc';

      const payload = { data: 'test' };

      // Encrypt with original public key
      const encryptor = new JWEEncryptor(publicKey);
      const token = await encryptor.encrypt(payload);

      // Try to decrypt with wrong private key
      const decryptor = new JWEDecryptor(wrongPrivateKey);
      await expect(decryptor.decrypt(token)).rejects.toThrow('Decryption failed');
    });

    it('should throw error with empty token', async () => {
      const decryptor = new JWEDecryptor(privateKey);

      await expect(decryptor.decrypt('')).rejects.toThrow('Decryption failed');
    });
  });

  describe('validateKey', () => {
    it('should return true for valid private key', () => {
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(privateKey)).toBe(true);
    });

    it('should return false for public key (missing private fields)', () => {
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(publicKey)).toBe(false);
    });

    it('should return false for key with wrong kty', () => {
      const invalidKey = { ...privateKey, kty: 'EC' };
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing n', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.n;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing e', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.e;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing d', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.d;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing p', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.p;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing q', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.q;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing dp', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.dp;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing dq', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.dq;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key missing qi', () => {
      const invalidKey = { ...privateKey };
      delete invalidKey.qi;
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for key with wrong use field', () => {
      const invalidKey = { ...privateKey, use: 'sig' };
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should return false for null key', () => {
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey(null as any)).toBe(false);
    });

    it('should return false for non-object key', () => {
      const decryptor = new JWEDecryptor(privateKey);
      expect(decryptor.validateKey('not an object' as any)).toBe(false);
    });
  });
});
