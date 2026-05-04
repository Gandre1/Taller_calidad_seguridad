/**
 * Unit tests for TokenValidator
 * 
 * Tests validation of decryption Lambda token input:
 * - JWE format validation (5 parts)
 * - Algorithm validation (RSA-OAEP-256, A256GCM)
 * - Header decoding and inspection
 * 
 * Validates Requirements: 3.2, 3.3, 5.3, 5.4
 */

import { TokenValidator } from './TokenValidator';

describe('TokenValidator', () => {
  let validator: TokenValidator;

  beforeEach(() => {
    validator = new TokenValidator();
  });

  describe('validateJWEFormat', () => {
    it('should accept valid JWE token with 5 parts', () => {
      const token = 'header.encryptedKey.iv.ciphertext.tag';
      const result = validator.validateJWEFormat(token);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.token).toBe(token);
    });

    it('should reject empty string token', () => {
      const result = validator.validateJWEFormat('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Token cannot be empty');
      expect(result.token).toBeUndefined();
    });

    it('should reject whitespace-only token', () => {
      const result = validator.validateJWEFormat('   ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Token cannot be empty');
      expect(result.token).toBeUndefined();
    });

    it('should reject token with only 1 part', () => {
      const result = validator.validateJWEFormat('onlyonepart');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: JWE token must have exactly 5 parts, found 1');
      expect(result.token).toBeUndefined();
    });

    it('should reject token with 3 parts', () => {
      const result = validator.validateJWEFormat('part1.part2.part3');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: JWE token must have exactly 5 parts, found 3');
      expect(result.token).toBeUndefined();
    });

    it('should reject token with 4 parts', () => {
      const result = validator.validateJWEFormat('part1.part2.part3.part4');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: JWE token must have exactly 5 parts, found 4');
      expect(result.token).toBeUndefined();
    });

    it('should reject token with 6 parts', () => {
      const result = validator.validateJWEFormat('part1.part2.part3.part4.part5.part6');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: JWE token must have exactly 5 parts, found 6');
      expect(result.token).toBeUndefined();
    });

    it('should reject token with empty parts', () => {
      const result = validator.validateJWEFormat('header..iv.ciphertext.tag');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: JWE token parts cannot be empty');
      expect(result.token).toBeUndefined();
    });

    it('should reject token with all empty parts', () => {
      const result = validator.validateJWEFormat('....');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: JWE token parts cannot be empty');
      expect(result.token).toBeUndefined();
    });

    it('should accept token with base64url encoded parts', () => {
      const token = 'eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.encrypted.iv.ciphertext.tag';
      const result = validator.validateJWEFormat(token);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.token).toBe(token);
    });

    it('should accept token with long base64url parts', () => {
      const longPart = 'a'.repeat(1000);
      const token = `${longPart}.${longPart}.${longPart}.${longPart}.${longPart}`;
      const result = validator.validateJWEFormat(token);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.token).toBe(token);
    });
  });

  describe('validateAlgorithms', () => {
    // Helper function to create a token with specific algorithms
    const createTokenWithAlgorithms = (alg: string, enc: string): string => {
      const header = { alg, enc };
      const headerJson = JSON.stringify(header);
      const headerBase64 = Buffer.from(headerJson).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      return `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
    };

    it('should accept token with correct algorithms (RSA-OAEP-256 and A256GCM)', () => {
      const token = createTokenWithAlgorithms('RSA-OAEP-256', 'A256GCM');
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(true);
    });

    it('should reject token with incorrect alg algorithm', () => {
      const token = createTokenWithAlgorithms('RSA-OAEP', 'A256GCM');
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with incorrect enc algorithm', () => {
      const token = createTokenWithAlgorithms('RSA-OAEP-256', 'A128GCM');
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with both incorrect algorithms', () => {
      const token = createTokenWithAlgorithms('RSA1_5', 'A128CBC-HS256');
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with missing alg field', () => {
      const header = { enc: 'A256GCM' };
      const headerJson = JSON.stringify(header);
      const headerBase64 = Buffer.from(headerJson).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
      
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with missing enc field', () => {
      const header = { alg: 'RSA-OAEP-256' };
      const headerJson = JSON.stringify(header);
      const headerBase64 = Buffer.from(headerJson).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
      
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with invalid base64 header', () => {
      const token = 'not-valid-base64!@#$.encryptedKey.iv.ciphertext.tag';
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with non-JSON header', () => {
      const headerBase64 = Buffer.from('not json').toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
      
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });

    it('should reject token with less than 5 parts', () => {
      const token = createTokenWithAlgorithms('RSA-OAEP-256', 'A256GCM');
      const shortToken = token.split('.').slice(0, 3).join('.');
      
      const result = validator.validateAlgorithms(shortToken);

      expect(result).toBe(false);
    });

    it('should reject empty token', () => {
      const result = validator.validateAlgorithms('');

      expect(result).toBe(false);
    });

    it('should handle header with additional fields', () => {
      const header = { 
        alg: 'RSA-OAEP-256', 
        enc: 'A256GCM',
        kid: 'key-id-123',
        typ: 'JWT'
      };
      const headerJson = JSON.stringify(header);
      const headerBase64 = Buffer.from(headerJson).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
      
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(true);
    });

    it('should be case-sensitive for algorithm names', () => {
      const token = createTokenWithAlgorithms('rsa-oaep-256', 'a256gcm');
      const result = validator.validateAlgorithms(token);

      expect(result).toBe(false);
    });
  });

  describe('integration: validateJWEFormat and validateAlgorithms', () => {
    const createValidToken = (): string => {
      const header = { alg: 'RSA-OAEP-256', enc: 'A256GCM' };
      const headerJson = JSON.stringify(header);
      const headerBase64 = Buffer.from(headerJson).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      return `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
    };

    it('should validate both format and algorithms for a valid token', () => {
      const token = createValidToken();
      
      const formatResult = validator.validateJWEFormat(token);
      const algorithmsValid = validator.validateAlgorithms(token);

      expect(formatResult.valid).toBe(true);
      expect(algorithmsValid).toBe(true);
    });

    it('should reject token that passes format but fails algorithm validation', () => {
      const header = { alg: 'RSA1_5', enc: 'A128GCM' };
      const headerJson = JSON.stringify(header);
      const headerBase64 = Buffer.from(headerJson).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
      
      const formatResult = validator.validateJWEFormat(token);
      const algorithmsValid = validator.validateAlgorithms(token);

      expect(formatResult.valid).toBe(true);
      expect(algorithmsValid).toBe(false);
    });

    it('should reject token that fails format validation', () => {
      const token = 'only.three.parts';
      
      const formatResult = validator.validateJWEFormat(token);

      expect(formatResult.valid).toBe(false);
      // No need to check algorithms if format is invalid
    });
  });
});
