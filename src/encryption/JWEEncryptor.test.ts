/**
 * Unit Tests for JWEEncryptor
 * 
 * Tests the encryption engine for JWT-JWE operations
 * Validates: Requirements 1.1, 1.4, 1.5, 2.5, 8.1, 8.3
 */

import { JWEEncryptor } from './JWEEncryptor';
import * as jose from 'jose';

describe('JWEEncryptor', () => {
  let validPublicKey: jose.JWK;
  let validPrivateKey: jose.JWK;

  beforeAll(async () => {
    // Generate a test RSA key pair for testing
    const { publicKey, privateKey } = await jose.generateKeyPair('RSA-OAEP-256', {
      modulusLength: 2048
    });

    // Export keys to JWK format
    validPublicKey = await jose.exportJWK(publicKey);
    validPublicKey.use = 'enc';
    validPublicKey.kid = 'test-key-1';

    validPrivateKey = await jose.exportJWK(privateKey);
    validPrivateKey.use = 'enc';
    validPrivateKey.kid = 'test-key-1';
  });

  describe('Constructor', () => {
    it('should create an instance with valid public key', () => {
      expect(() => new JWEEncryptor(validPublicKey)).not.toThrow();
    });

    it('should throw error with invalid key', () => {
      const invalidKey = { kty: 'invalid' } as jose.JWK;
      expect(() => new JWEEncryptor(invalidKey)).toThrow('Invalid public key format');
    });

    it('should throw error with null key', () => {
      expect(() => new JWEEncryptor(null as any)).toThrow('Invalid public key format');
    });

    it('should throw error with undefined key', () => {
      expect(() => new JWEEncryptor(undefined as any)).toThrow('Invalid public key format');
    });
  });

  describe('validateKey', () => {
    let encryptor: JWEEncryptor;

    beforeEach(() => {
      encryptor = new JWEEncryptor(validPublicKey);
    });

    it('should validate a correct RSA public key', () => {
      expect(encryptor.validateKey(validPublicKey)).toBe(true);
    });

    it('should reject key with missing kty', () => {
      const invalidKey = { ...validPublicKey, kty: undefined } as any;
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should reject key with wrong kty', () => {
      const invalidKey = { ...validPublicKey, kty: 'EC' } as jose.JWK;
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should reject key with missing n (modulus)', () => {
      const invalidKey = { ...validPublicKey, n: undefined } as any;
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should reject key with empty n', () => {
      const invalidKey = { ...validPublicKey, n: '' };
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should reject key with missing e (exponent)', () => {
      const invalidKey = { ...validPublicKey, e: undefined } as any;
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should reject key with empty e', () => {
      const invalidKey = { ...validPublicKey, e: '' };
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should reject key with wrong use field', () => {
      const invalidKey = { ...validPublicKey, use: 'sig' };
      expect(encryptor.validateKey(invalidKey)).toBe(false);
    });

    it('should accept key without use field', () => {
      const keyWithoutUse = { ...validPublicKey };
      delete keyWithoutUse.use;
      expect(encryptor.validateKey(keyWithoutUse)).toBe(true);
    });

    it('should reject null key', () => {
      expect(encryptor.validateKey(null as any)).toBe(false);
    });

    it('should reject undefined key', () => {
      expect(encryptor.validateKey(undefined as any)).toBe(false);
    });

    it('should reject non-object key', () => {
      expect(encryptor.validateKey('not an object' as any)).toBe(false);
    });
  });

  describe('encrypt', () => {
    let encryptor: JWEEncryptor;

    beforeEach(() => {
      encryptor = new JWEEncryptor(validPublicKey);
    });

    it('should encrypt a simple payload successfully', async () => {
      const payload = { userId: '12345', email: 'test@example.com' };
      const token = await encryptor.encrypt(payload);

      // Verify token is a string
      expect(typeof token).toBe('string');

      // Verify token has JWE compact format (5 parts separated by dots)
      const parts = token.split('.');
      expect(parts).toHaveLength(5);

      // Verify each part is non-empty
      parts.forEach(part => {
        expect(part.length).toBeGreaterThan(0);
      });
    });

    it('should encrypt complex nested payload', async () => {
      const payload = {
        userId: '12345',
        email: 'user@example.com',
        sensitiveData: {
          ssn: '123-45-6789',
          creditCard: '4111111111111111',
          nested: {
            deep: {
              value: 'secret'
            }
          }
        },
        array: [1, 2, 3, 'test']
      };

      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should use RSA-OAEP-256 and A256GCM algorithms', async () => {
      const payload = { test: 'data' };
      const token = await encryptor.encrypt(payload);

      // Decode the protected header (first part of JWE)
      const parts = token.split('.');
      const protectedHeaderB64 = parts[0]!;
      const protectedHeader = JSON.parse(
        Buffer.from(protectedHeaderB64, 'base64').toString('utf8')
      );

      // Verify algorithms (Requirements 1.4, 1.5)
      expect(protectedHeader.alg).toBe('RSA-OAEP-256');
      expect(protectedHeader.enc).toBe('A256GCM');
    });

    it('should produce different tokens for same payload (due to random IV)', async () => {
      const payload = { test: 'data' };
      const token1 = await encryptor.encrypt(payload);
      const token2 = await encryptor.encrypt(payload);

      // Tokens should be different due to random initialization vector
      expect(token1).not.toBe(token2);
    });

    it('should encrypt empty object', async () => {
      const payload = {};
      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should encrypt array payload', async () => {
      const payload = [1, 2, 3, 'test', { nested: true }];
      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should encrypt string payload', async () => {
      const payload = 'simple string';
      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should encrypt number payload', async () => {
      const payload = 42;
      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should encrypt boolean payload', async () => {
      const payload = true;
      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should encrypt null payload', async () => {
      const payload = null;
      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);
    });

    it('should allow decryption with corresponding private key', async () => {
      const payload = { userId: '12345', email: 'test@example.com' };
      const token = await encryptor.encrypt(payload);

      // Decrypt using the private key
      const privateKey = await jose.importJWK(validPrivateKey, 'RSA-OAEP-256');
      const { plaintext } = await jose.compactDecrypt(token, privateKey);
      const decrypted = JSON.parse(new TextDecoder().decode(plaintext));

      // Verify round-trip (Requirement 8.5)
      expect(decrypted).toEqual(payload);
    });

    it('should handle large payloads', async () => {
      // Create a payload close to 1MB
      const largeData = 'x'.repeat(1024 * 1024); // 1MB of data
      const payload = { data: largeData };

      const token = await encryptor.encrypt(payload);
      expect(token.split('.')).toHaveLength(5);

      // Verify it can be decrypted
      const privateKey = await jose.importJWK(validPrivateKey, 'RSA-OAEP-256');
      const { plaintext } = await jose.compactDecrypt(token, privateKey);
      const decrypted = JSON.parse(new TextDecoder().decode(plaintext));
      expect(decrypted).toEqual(payload);
    });

    it('should handle special characters in payload', async () => {
      const payload = {
        text: 'Special chars: áéíóú ñ 中文 日本語 한글 🚀 emoji',
        symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
      };

      const token = await encryptor.encrypt(payload);

      // Verify decryption preserves special characters
      const privateKey = await jose.importJWK(validPrivateKey, 'RSA-OAEP-256');
      const { plaintext } = await jose.compactDecrypt(token, privateKey);
      const decrypted = JSON.parse(new TextDecoder().decode(plaintext));
      expect(decrypted).toEqual(payload);
    });
  });

  describe('RFC 7516 Compliance', () => {
    let encryptor: JWEEncryptor;

    beforeEach(() => {
      encryptor = new JWEEncryptor(validPublicKey);
    });

    it('should generate RFC 7516 compliant JWE tokens', async () => {
      const payload = { test: 'data' };
      const token = await encryptor.encrypt(payload);

      // RFC 7516 specifies JWE Compact Serialization format:
      // BASE64URL(UTF8(JWE Protected Header)) || '.' ||
      // BASE64URL(JWE Encrypted Key) || '.' ||
      // BASE64URL(JWE Initialization Vector) || '.' ||
      // BASE64URL(JWE Ciphertext) || '.' ||
      // BASE64URL(JWE Authentication Tag)

      const parts = token.split('.');
      expect(parts).toHaveLength(5);

      // Verify each part is valid base64url
      parts.forEach(part => {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      });

      // Verify protected header is valid JSON
      const protectedHeader = JSON.parse(
        Buffer.from(parts[0]!, 'base64').toString('utf8')
      );
      expect(protectedHeader).toHaveProperty('alg');
      expect(protectedHeader).toHaveProperty('enc');
    });
  });
});
