/**
 * Property-based tests for TokenValidator
 * 
 * Feature: lambda-encryption-decryption, Property 4: Validación de Token
 * 
 * Validates that for ANY invalid token (incorrect format, incorrect algorithms,
 * corrupted token, missing token), the TokenValidator MUST:
 * - Return validation error
 * - Include descriptive error message
 * - NOT process the decryption
 * 
 * Validates Requirements: 3.2, 3.3, 5.3, 5.4, 5.5
 */

import * as fc from 'fast-check';
import { TokenValidator } from './TokenValidator';

describe('TokenValidator - Property-Based Tests', () => {
  let validator: TokenValidator;

  beforeEach(() => {
    validator = new TokenValidator();
  });

  // Helper to create a valid JWE token with specific algorithms
  const createTokenWithAlgorithms = (alg: string, enc: string): string => {
    const header = { alg, enc };
    const headerJson = JSON.stringify(header);
    const headerBase64 = Buffer.from(headerJson).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
  };

  // Arbitrary generators for invalid tokens
  const arbitraryEmptyToken = () => fc.constantFrom('', '   ', '\t', '\n');

  const arbitraryWrongPartCount = () => fc.oneof(
    fc.constant('single'),
    fc.constant('two.parts'),
    fc.constant('three.parts.here'),
    fc.constant('four.parts.here.now'),
    fc.constant('six.parts.here.now.extra.one')
  );

  const arbitraryTokenWithEmptyParts = () => fc.constantFrom(
    '....',
    'header..iv.ciphertext.tag',
    '.encryptedKey.iv.ciphertext.tag',
    'header.encryptedKey..ciphertext.tag',
    'header.encryptedKey.iv..tag',
    'header.encryptedKey.iv.ciphertext.'
  );

  const arbitraryInvalidAlgorithm = () => fc.record({
    alg: fc.constantFrom('RSA1_5', 'RSA-OAEP', 'ECDH-ES', 'A256KW', 'dir'),
    enc: fc.constantFrom('A128GCM', 'A192GCM', 'A128CBC-HS256', 'A192CBC-HS384', 'A256CBC-HS512')
  }).filter(({ alg, enc }) => !(alg === 'RSA-OAEP-256' && enc === 'A256GCM'));

  const arbitraryMalformedHeader = () => fc.oneof(
    fc.constant('not-valid-base64!@#$'),
    fc.constant('!!!invalid!!!'),
    fc.string().map(s => Buffer.from(s).toString('base64').replace(/=/g, ''))
  );

  describe('Property 4.1: Empty or whitespace tokens are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject any empty or whitespace-only token', () => {
      fc.assert(
        fc.property(arbitraryEmptyToken(), (token) => {
          const result = validator.validateJWEFormat(token);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('Token cannot be empty');
          expect(result.token).toBeUndefined();
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.2: Tokens with incorrect part count are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject any token that does not have exactly 5 parts', () => {
      fc.assert(
        fc.property(arbitraryWrongPartCount(), (token) => {
          const result = validator.validateJWEFormat(token);
          const partCount = token.split('.').length;
          
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('must have exactly 5 parts');
          expect(result.error).toContain(`found ${partCount}`);
          expect(result.token).toBeUndefined();
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.3: Tokens with empty parts are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject any token with one or more empty parts', () => {
      fc.assert(
        fc.property(arbitraryTokenWithEmptyParts(), (token) => {
          const result = validator.validateJWEFormat(token);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('parts cannot be empty');
          expect(result.token).toBeUndefined();
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.4: Tokens with incorrect algorithms are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject any token with algorithms other than RSA-OAEP-256 and A256GCM', () => {
      fc.assert(
        fc.property(arbitraryInvalidAlgorithm(), ({ alg, enc }) => {
          const token = createTokenWithAlgorithms(alg, enc);
          const result = validator.validateAlgorithms(token);
          
          expect(result).toBe(false);
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.5: Tokens with malformed headers are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject any token with a malformed or non-JSON header', () => {
      fc.assert(
        fc.property(arbitraryMalformedHeader(), (malformedHeader) => {
          const token = `${malformedHeader}.encryptedKey.iv.ciphertext.tag`;
          const result = validator.validateAlgorithms(token);
          
          expect(result).toBe(false);
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.6: Valid format tokens with correct algorithms are always accepted', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should accept any token with 5 non-empty parts and correct algorithms', () => {
      const arbitraryValidToken = () => fc.record({
        header: fc.constant(createTokenWithAlgorithms('RSA-OAEP-256', 'A256GCM').split('.')[0]),
        encryptedKey: fc.base64String({ minLength: 10, maxLength: 100 }),
        iv: fc.base64String({ minLength: 10, maxLength: 50 }),
        ciphertext: fc.base64String({ minLength: 10, maxLength: 200 }),
        tag: fc.base64String({ minLength: 10, maxLength: 50 })
      }).map(({ header, encryptedKey, iv, ciphertext, tag }) => 
        `${header}.${encryptedKey}.${iv}.${ciphertext}.${tag}`
      );

      fc.assert(
        fc.property(arbitraryValidToken(), (token) => {
          const formatResult = validator.validateJWEFormat(token);
          const algorithmsValid = validator.validateAlgorithms(token);
          
          expect(formatResult.valid).toBe(true);
          expect(formatResult.error).toBeUndefined();
          expect(formatResult.token).toBe(token);
          expect(algorithmsValid).toBe(true);
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.7: Tokens with missing algorithm fields are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject tokens with missing alg or enc fields in header', () => {
      const arbitraryIncompleteHeader = () => fc.oneof(
        fc.constant({ enc: 'A256GCM' }),  // Missing alg
        fc.constant({ alg: 'RSA-OAEP-256' }),  // Missing enc
        fc.constant({})  // Missing both
      );

      fc.assert(
        fc.property(arbitraryIncompleteHeader(), (header) => {
          const headerJson = JSON.stringify(header);
          const headerBase64 = Buffer.from(headerJson).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
          const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
          
          const result = validator.validateAlgorithms(token);
          
          expect(result).toBe(false);
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.8: Algorithm validation is case-sensitive', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should reject tokens with incorrect case in algorithm names', () => {
      const arbitraryCaseVariation = () => fc.record({
        alg: fc.constantFrom('rsa-oaep-256', 'RSA-oaep-256', 'Rsa-Oaep-256'),
        enc: fc.constantFrom('a256gcm', 'A256gcm', 'a256GCM')
      });

      fc.assert(
        fc.property(arbitraryCaseVariation(), ({ alg, enc }) => {
          const token = createTokenWithAlgorithms(alg, enc);
          const result = validator.validateAlgorithms(token);
          
          expect(result).toBe(false);
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.9: Validation errors always include descriptive messages', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should always provide descriptive error messages for invalid tokens', () => {
      const arbitraryInvalidToken = () => fc.oneof(
        arbitraryEmptyToken(),
        arbitraryWrongPartCount(),
        arbitraryTokenWithEmptyParts()
      );

      fc.assert(
        fc.property(arbitraryInvalidToken(), (token) => {
          const result = validator.validateJWEFormat(token);
          
          if (!result.valid) {
            expect(result.error).toBeDefined();
            expect(result.error).toMatch(/Validation failed:/);
            expect(result.error!.length).toBeGreaterThan(20); // Descriptive message
          }
        }),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 4.10: Valid tokens with additional header fields are accepted', () => {
    // Feature: lambda-encryption-decryption, Property 4: Validación de Token
    it('should accept tokens with correct algorithms and additional header fields', () => {
      const arbitraryAdditionalFields = () => fc.record({
        kid: fc.string({ minLength: 1, maxLength: 50 }),
        typ: fc.constantFrom('JWT', 'JWE'),
        cty: fc.constantFrom('application/json', 'text/plain')
      });

      fc.assert(
        fc.property(arbitraryAdditionalFields(), (additionalFields) => {
          const header = { 
            alg: 'RSA-OAEP-256', 
            enc: 'A256GCM',
            ...additionalFields
          };
          const headerJson = JSON.stringify(header);
          const headerBase64 = Buffer.from(headerJson).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
          const token = `${headerBase64}.encryptedKey.iv.ciphertext.tag`;
          
          const formatResult = validator.validateJWEFormat(token);
          const algorithmsValid = validator.validateAlgorithms(token);
          
          expect(formatResult.valid).toBe(true);
          expect(algorithmsValid).toBe(true);
        }),
        { numRuns: 25 }
      );
    });
  });
});
