/**
 * Property-Based Tests for KeyManager - JWK Key Validation
 * 
 * Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
 * 
 * Validates that for ANY key in JWK format, the validation functions MUST:
 * - Accept valid keys conforming to RFC 7517
 * - Reject keys with incorrect format
 * - Reject keys with missing required fields (kty, n, e for public; additional d, p, q, dp, dq, qi for private)
 * 
 * Validates Requirements: 2.5, 4.5, 8.3
 */

import * as fc from 'fast-check';
import { KeyManager, JsonWebKey } from './keyManager';

describe('KeyManager - Property-Based Tests for JWK Validation', () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    keyManager = new KeyManager();
  });

  // ============================================================================
  // Custom Generators
  // ============================================================================

  /**
   * Generator for valid RSA public keys conforming to RFC 7517
   */
  const arbitraryValidPublicKey = (): fc.Arbitrary<JsonWebKey> => {
    return fc.record({
      kty: fc.constant('RSA'),
      use: fc.option(fc.constantFrom('enc', 'sig'), { nil: undefined }),
      kid: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      alg: fc.option(fc.constantFrom('RSA-OAEP-256', 'RS256', 'RS384', 'RS512'), { nil: undefined }),
      n: fc.base64String({ minLength: 20, maxLength: 500 }), // Modulus
      e: fc.constantFrom('AQAB', 'AAEAAQ') // Common exponent values
    });
  };

  /**
   * Generator for valid RSA private keys conforming to RFC 7517
   */
  const arbitraryValidPrivateKey = (): fc.Arbitrary<JsonWebKey> => {
    return fc.record({
      kty: fc.constant('RSA'),
      use: fc.option(fc.constantFrom('enc', 'sig'), { nil: undefined }),
      kid: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      alg: fc.option(fc.constantFrom('RSA-OAEP-256', 'RS256', 'RS384', 'RS512'), { nil: undefined }),
      // Public components
      n: fc.base64String({ minLength: 20, maxLength: 500 }),
      e: fc.constantFrom('AQAB', 'AAEAAQ'),
      // Private components
      d: fc.base64String({ minLength: 20, maxLength: 500 }),
      p: fc.base64String({ minLength: 20, maxLength: 300 }),
      q: fc.base64String({ minLength: 20, maxLength: 300 }),
      dp: fc.base64String({ minLength: 20, maxLength: 300 }),
      dq: fc.base64String({ minLength: 20, maxLength: 300 }),
      qi: fc.base64String({ minLength: 20, maxLength: 300 })
    });
  };

  /**
   * Generator for public keys with missing required fields
   */
  const arbitraryInvalidPublicKeyMissingFields = (): fc.Arbitrary<Partial<JsonWebKey>> => {
    return fc.oneof(
      // Missing kty
      fc.record({
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB')
      }),
      // Missing n (modulus)
      fc.record({
        kty: fc.constant('RSA'),
        e: fc.constant('AQAB')
      }),
      // Missing e (exponent)
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 })
      }),
      // Empty object
      fc.constant({})
    );
  };

  /**
   * Generator for public keys with incorrect kty value
   */
  const arbitraryInvalidPublicKeyWrongKty = (): fc.Arbitrary<JsonWebKey> => {
    return fc.record({
      kty: fc.constantFrom('EC', 'oct', 'OKP', 'invalid', ''),
      n: fc.base64String({ minLength: 20 }),
      e: fc.constant('AQAB')
    });
  };

  /**
   * Generator for public keys with invalid field types
   */
  const arbitraryInvalidPublicKeyWrongTypes = (): fc.Arbitrary<any> => {
    return fc.oneof(
      // n is not a string
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        e: fc.constant('AQAB')
      }),
      // e is not a string
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined))
      }),
      // kty is not a string
      fc.record({
        kty: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB')
      })
    );
  };

  /**
   * Generator for private keys with missing private components
   */
  const arbitraryInvalidPrivateKeyMissingPrivateFields = (): fc.Arbitrary<Partial<JsonWebKey>> => {
    return fc.oneof(
      // Missing d
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        p: fc.base64String({ minLength: 20 }),
        q: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // Missing p
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        q: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // Missing q
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        p: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // Missing dp
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        p: fc.base64String({ minLength: 20 }),
        q: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // Missing dq
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        p: fc.base64String({ minLength: 20 }),
        q: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // Missing qi
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        p: fc.base64String({ minLength: 20 }),
        q: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 })
      })
    );
  };

  /**
   * Generator for private keys with invalid private field types
   */
  const arbitraryInvalidPrivateKeyWrongTypes = (): fc.Arbitrary<any> => {
    const invalidValue = fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined)
    );

    return fc.oneof(
      // d is not a string
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: invalidValue,
        p: fc.base64String({ minLength: 20 }),
        q: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // p is not a string
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        p: invalidValue,
        q: fc.base64String({ minLength: 20 }),
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      }),
      // q is not a string
      fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20 }),
        p: fc.base64String({ minLength: 20 }),
        q: invalidValue,
        dp: fc.base64String({ minLength: 20 }),
        dq: fc.base64String({ minLength: 20 }),
        qi: fc.base64String({ minLength: 20 })
      })
    );
  };

  // ============================================================================
  // Property 5: Validación de Claves JWK
  // **Validates: Requirements 2.5, 4.5, 8.3**
  // ============================================================================

  describe('Property 5.1: Valid public keys are always accepted', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should accept any valid RSA public key conforming to RFC 7517', () => {
      fc.assert(
        fc.property(arbitraryValidPublicKey(), (publicKey) => {
          // Access the private method through type assertion for testing
          const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
          
          // Should not throw an error
          expect(() => validatePublicKey(publicKey)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.2: Valid private keys are always accepted', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should accept any valid RSA private key conforming to RFC 7517', () => {
      fc.assert(
        fc.property(arbitraryValidPrivateKey(), (privateKey) => {
          // Access the private method through type assertion for testing
          const validatePrivateKey = (keyManager as any).validatePrivateKey.bind(keyManager);
          
          // Should not throw an error
          expect(() => validatePrivateKey(privateKey)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.3: Public keys with missing required fields are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should reject any public key missing kty, n, or e fields', () => {
      fc.assert(
        fc.property(arbitraryInvalidPublicKeyMissingFields(), (invalidKey) => {
          const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
          
          // Should throw a validation error
          expect(() => validatePublicKey(invalidKey)).toThrow();
          
          try {
            validatePublicKey(invalidKey);
          } catch (error: any) {
            // Error message should be descriptive
            expect(error.message).toBeDefined();
            expect(error.message.length).toBeGreaterThan(10);
            expect(error.message).toMatch(/Invalid key/i);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.4: Public keys with incorrect kty are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should reject any public key with kty other than "RSA"', () => {
      fc.assert(
        fc.property(arbitraryInvalidPublicKeyWrongKty(), (invalidKey) => {
          const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
          
          // Should throw a validation error
          expect(() => validatePublicKey(invalidKey)).toThrow();
          
          try {
            validatePublicKey(invalidKey);
          } catch (error: any) {
            // Error should mention kty
            expect(error.message).toMatch(/kty/i);
            expect(error.message).toMatch(/RSA/i);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.5: Public keys with invalid field types are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should reject any public key with non-string values for required fields', () => {
      fc.assert(
        fc.property(arbitraryInvalidPublicKeyWrongTypes(), (invalidKey) => {
          const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
          
          // Should throw a validation error
          expect(() => validatePublicKey(invalidKey)).toThrow();
          
          try {
            validatePublicKey(invalidKey);
          } catch (error: any) {
            // Error message should indicate the problem
            expect(error.message).toBeDefined();
            expect(error.message).toMatch(/Invalid key/i);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.6: Private keys with missing private components are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should reject any private key missing d, p, q, dp, dq, or qi fields', () => {
      fc.assert(
        fc.property(arbitraryInvalidPrivateKeyMissingPrivateFields(), (invalidKey) => {
          const validatePrivateKey = (keyManager as any).validatePrivateKey.bind(keyManager);
          
          // Should throw a validation error
          expect(() => validatePrivateKey(invalidKey)).toThrow();
          
          try {
            validatePrivateKey(invalidKey);
          } catch (error: any) {
            // Error message should be descriptive
            expect(error.message).toBeDefined();
            expect(error.message.length).toBeGreaterThan(10);
            expect(error.message).toMatch(/Invalid key/i);
            // Should mention one of the missing private components
            expect(error.message).toMatch(/d|p|q|dp|dq|qi/i);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.7: Private keys with invalid private field types are always rejected', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should reject any private key with non-string values for private components', () => {
      fc.assert(
        fc.property(arbitraryInvalidPrivateKeyWrongTypes(), (invalidKey) => {
          const validatePrivateKey = (keyManager as any).validatePrivateKey.bind(keyManager);
          
          // Should throw a validation error
          expect(() => validatePrivateKey(invalidKey)).toThrow();
          
          try {
            validatePrivateKey(invalidKey);
          } catch (error: any) {
            // Error message should indicate the problem
            expect(error.message).toBeDefined();
            expect(error.message).toMatch(/Invalid key/i);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.8: Private keys must have all public key components', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should reject private keys that are missing public key components (kty, n, e)', () => {
      const arbitraryPrivateKeyMissingPublicComponents = () => fc.oneof(
        // Missing n
        fc.record({
          kty: fc.constant('RSA'),
          e: fc.constant('AQAB'),
          d: fc.base64String({ minLength: 20 }),
          p: fc.base64String({ minLength: 20 }),
          q: fc.base64String({ minLength: 20 }),
          dp: fc.base64String({ minLength: 20 }),
          dq: fc.base64String({ minLength: 20 }),
          qi: fc.base64String({ minLength: 20 })
        }),
        // Missing e
        fc.record({
          kty: fc.constant('RSA'),
          n: fc.base64String({ minLength: 20 }),
          d: fc.base64String({ minLength: 20 }),
          p: fc.base64String({ minLength: 20 }),
          q: fc.base64String({ minLength: 20 }),
          dp: fc.base64String({ minLength: 20 }),
          dq: fc.base64String({ minLength: 20 }),
          qi: fc.base64String({ minLength: 20 })
        }),
        // Wrong kty
        fc.record({
          kty: fc.constantFrom('EC', 'oct'),
          n: fc.base64String({ minLength: 20 }),
          e: fc.constant('AQAB'),
          d: fc.base64String({ minLength: 20 }),
          p: fc.base64String({ minLength: 20 }),
          q: fc.base64String({ minLength: 20 }),
          dp: fc.base64String({ minLength: 20 }),
          dq: fc.base64String({ minLength: 20 }),
          qi: fc.base64String({ minLength: 20 })
        })
      );

      fc.assert(
        fc.property(arbitraryPrivateKeyMissingPublicComponents(), (invalidKey) => {
          const validatePrivateKey = (keyManager as any).validatePrivateKey.bind(keyManager);
          
          // Should throw a validation error
          expect(() => validatePrivateKey(invalidKey)).toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.9: Validation errors always include descriptive messages', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should always provide descriptive error messages for invalid keys', () => {
      const arbitraryInvalidKey = () => fc.oneof(
        arbitraryInvalidPublicKeyMissingFields(),
        arbitraryInvalidPublicKeyWrongKty(),
        arbitraryInvalidPublicKeyWrongTypes()
      );

      fc.assert(
        fc.property(arbitraryInvalidKey(), (invalidKey) => {
          const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
          
          try {
            validatePublicKey(invalidKey);
            // If no error is thrown, fail the test
            expect(true).toBe(false);
          } catch (error: any) {
            // Error message should be descriptive
            expect(error.message).toBeDefined();
            expect(error.message.length).toBeGreaterThan(15);
            expect(error.message).toMatch(/Invalid key/i);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.10: Public keys with optional fields are accepted', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should accept public keys with optional fields like use, kid, alg', () => {
      const arbitraryPublicKeyWithOptionalFields = () => fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20, maxLength: 500 }),
        e: fc.constant('AQAB'),
        use: fc.option(fc.constantFrom('enc', 'sig'), { nil: undefined }),
        kid: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        alg: fc.option(fc.constantFrom('RSA-OAEP-256', 'RS256', 'RS384', 'RS512'), { nil: undefined }),
        x5c: fc.option(fc.array(fc.string()), { nil: undefined }),
        x5t: fc.option(fc.string(), { nil: undefined })
      });

      fc.assert(
        fc.property(arbitraryPublicKeyWithOptionalFields(), (publicKey) => {
          const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
          
          // Should not throw an error
          expect(() => validatePublicKey(publicKey)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.11: Private keys with optional fields are accepted', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should accept private keys with optional fields like use, kid, alg', () => {
      const arbitraryPrivateKeyWithOptionalFields = () => fc.record({
        kty: fc.constant('RSA'),
        n: fc.base64String({ minLength: 20, maxLength: 500 }),
        e: fc.constant('AQAB'),
        d: fc.base64String({ minLength: 20, maxLength: 500 }),
        p: fc.base64String({ minLength: 20, maxLength: 300 }),
        q: fc.base64String({ minLength: 20, maxLength: 300 }),
        dp: fc.base64String({ minLength: 20, maxLength: 300 }),
        dq: fc.base64String({ minLength: 20, maxLength: 300 }),
        qi: fc.base64String({ minLength: 20, maxLength: 300 }),
        use: fc.option(fc.constantFrom('enc', 'sig'), { nil: undefined }),
        kid: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        alg: fc.option(fc.constantFrom('RSA-OAEP-256', 'RS256', 'RS384', 'RS512'), { nil: undefined }),
        x5c: fc.option(fc.array(fc.string()), { nil: undefined }),
        x5t: fc.option(fc.string(), { nil: undefined })
      });

      fc.assert(
        fc.property(arbitraryPrivateKeyWithOptionalFields(), (privateKey) => {
          const validatePrivateKey = (keyManager as any).validatePrivateKey.bind(keyManager);
          
          // Should not throw an error
          expect(() => validatePrivateKey(privateKey)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5.12: Validation is consistent across multiple invocations', () => {
    // Feature: lambda-encryption-decryption, Property 5: Validación de Claves JWK
    it('should produce the same validation result for the same key across multiple calls', () => {
      fc.assert(
        fc.property(
          fc.oneof(arbitraryValidPublicKey(), arbitraryInvalidPublicKeyMissingFields()),
          (key) => {
            const validatePublicKey = (keyManager as any).validatePublicKey.bind(keyManager);
            
            // Call validation multiple times
            const results: boolean[] = [];
            for (let i = 0; i < 5; i++) {
              try {
                validatePublicKey(key);
                results.push(true);
              } catch {
                results.push(false);
              }
            }
            
            // All results should be the same
            const firstResult = results[0];
            expect(results.every(r => r === firstResult)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
