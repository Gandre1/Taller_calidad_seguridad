/**
 * End-to-End Integration Property Tests
 * 
 * Implements property-based tests for the complete encryption-decryption system.
 * Tests the round-trip property, exception handling, and HTTP response format.
 * 
 * Task 9: Implementar pruebas de integración end-to-end
 * Sub-tasks: 9.1, 9.2, 9.3
 */

import * as fc from 'fast-check';
import { handler as encryptHandler, EncryptionEvent } from '../encryption/index';
import { handler as decryptHandler, DecryptionEvent } from '../decryption/index';
import { KeyManager } from '../shared/keyManager';
import * as jose from 'jose';

describe('End-to-End Integration Property Tests', () => {
  let publicKey: jose.JWK;
  let privateKey: jose.JWK;
  let originalGetPublicKey: jest.SpyInstance;
  let originalGetPrivateKey: jest.SpyInstance;

  beforeAll(async () => {
    // Generate RSA key pair for testing
    const { publicKey: pubKey, privateKey: privKey } = await jose.generateKeyPair('RSA-OAEP-256', {
      modulusLength: 2048,
    });

    const exportedPublicKey = await jose.exportJWK(pubKey);
    const exportedPrivateKey = await jose.exportJWK(privKey);

    publicKey = {
      kty: exportedPublicKey.kty!,
      n: exportedPublicKey.n!,
      e: exportedPublicKey.e!,
      use: 'enc',
      kid: 'test-key-e2e'
    };

    privateKey = {
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
      kid: 'test-key-e2e'
    };

    // Set environment variables
    process.env.KEY_ID = 'test-key-e2e';
    process.env.LOG_LEVEL = 'ERROR'; // Reduce noise in tests
  });

  beforeEach(() => {
    // Mock KeyManager methods to return our test keys
    originalGetPublicKey = jest.spyOn(KeyManager.prototype, 'getPublicKey')
      .mockResolvedValue(publicKey as any);
    originalGetPrivateKey = jest.spyOn(KeyManager.prototype, 'getPrivateKey')
      .mockResolvedValue(privateKey as any);
  });

  afterEach(() => {
    // Restore original methods
    originalGetPublicKey.mockRestore();
    originalGetPrivateKey.mockRestore();
  });

  afterAll(() => {
    delete process.env.KEY_ID;
    delete process.env.LOG_LEVEL;
  });

  /**
   * Property 1: Round-trip de Encriptación-Desencriptación
   * **Validates: Requirements 3.1, 8.5**
   * 
   * For any valid JSON payload, encrypting with Lambda_Encryption and then
   * decrypting with Lambda_Decryption MUST produce data identical to the original payload.
   */
  describe('Property 1: Round-trip de Encriptación-Desencriptación', () => {
    // Generator for valid payloads
    const arbitraryValidPayload = () => fc.record({
      userId: fc.string({ minLength: 1, maxLength: 50 }),
      email: fc.emailAddress(),
      timestamp: fc.date().map(d => d.toISOString()),
      data: fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.record({
          nested: fc.string(),
          value: fc.integer()
        })
      ),
      array: fc.array(fc.oneof(fc.string(), fc.integer()), { maxLength: 10 }),
      optional: fc.option(fc.string())
    });

    it('should preserve data integrity through encryption-decryption round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryValidPayload(), async (payload) => {
          // Step 1: Encrypt payload
          const encryptEvent: EncryptionEvent = {
            body: JSON.stringify(payload),
            requestContext: {
              requestId: `test-${Date.now()}`
            }
          };

          const encryptResponse = await encryptHandler(encryptEvent);
          
          // Verify encryption succeeded
          expect(encryptResponse.statusCode).toBe(200);
          expect(encryptResponse.headers['Content-Type']).toBe('application/json');
          
          const encryptBody = JSON.parse(encryptResponse.body);
          expect(encryptBody).toHaveProperty('token');
          expect(typeof encryptBody.token).toBe('string');

          // Step 2: Decrypt token
          const decryptEvent: DecryptionEvent = {
            body: JSON.stringify({ token: encryptBody.token }),
            requestContext: {
              requestId: `test-${Date.now()}`
            }
          };

          const decryptResponse = await decryptHandler(decryptEvent);
          
          // Verify decryption succeeded
          expect(decryptResponse.statusCode).toBe(200);
          expect(decryptResponse.headers['Content-Type']).toBe('application/json');

          // Step 3: Verify data integrity
          const decryptedPayload = JSON.parse(decryptResponse.body);
          expect(decryptedPayload).toEqual(payload);
        }),
        { 
          numRuns: 100,
          timeout: 30000 // 30 seconds timeout for property tests
        }
      );
    }, 60000); // 60 seconds test timeout

    it('should handle complex nested payloads in round-trip', async () => {
      const arbitraryComplexPayload = () => fc.record({
        level1: fc.record({
          level2: fc.record({
            level3: fc.record({
              data: fc.string(),
              numbers: fc.array(fc.float(), { maxLength: 5 }),
              boolean: fc.boolean(),
              nullValue: fc.constant(null)
            })
          })
        }),
        mixedArray: fc.array(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.record({ nested: fc.boolean() })
          ),
          { maxLength: 8 }
        ),
        unicode: fc.string().filter(s => s.length > 0),
        specialChars: fc.constant('Special chars: áéíóú ñ ¿¡ @#$%^&*()'),
        emptyObject: fc.constant({}),
        emptyArray: fc.constant([])
      });

      await fc.assert(
        fc.asyncProperty(arbitraryComplexPayload(), async (payload) => {
          const encryptEvent: EncryptionEvent = {
            body: JSON.stringify(payload),
            requestContext: { requestId: `complex-${Date.now()}` }
          };

          const encryptResponse = await encryptHandler(encryptEvent);
          expect(encryptResponse.statusCode).toBe(200);

          const token = JSON.parse(encryptResponse.body).token;

          const decryptEvent: DecryptionEvent = {
            body: JSON.stringify({ token }),
            requestContext: { requestId: `complex-${Date.now()}` }
          };

          const decryptResponse = await decryptHandler(decryptEvent);
          expect(decryptResponse.statusCode).toBe(200);

          const decrypted = JSON.parse(decryptResponse.body);
          expect(decrypted).toEqual(payload);
        }),
        { numRuns: 50, timeout: 30000 }
      );
    }, 60000);
  });

  /**
   * Property 8: Manejo de Excepciones
   * **Validates: Requirements 1.7, 3.7, 7.2, 7.5**
   * 
   * For any unhandled exception during processing, Lambda functions MUST:
   * - Capture the exception
   * - Return a valid HTTP response (not crash)
   * - Use appropriate status code (400 for client errors, 500 for server errors)
   * - Include error message without exposing internal details
   */
  describe('Property 8: Manejo de Excepciones', () => {
    // Generator for invalid payloads that should cause validation errors
    const arbitraryInvalidPayload = () => fc.oneof(
      fc.constant(''), // Empty string
      fc.constant('not json'), // Invalid JSON
      fc.constant('{}'), // Empty object (no fields)
      fc.constant(null), // Null
      fc.constant(undefined) // Undefined
    );

    // Generator for invalid tokens that should cause validation errors
    const arbitraryInvalidToken = () => fc.oneof(
      fc.constant(''), // Empty token
      fc.constant('invalid'), // Not JWE format
      fc.constant('a.b.c'), // Too few parts
      fc.constant('a.b.c.d.e.f'), // Too many parts
      fc.string().filter(s => !s.includes('.')) // No dots
    );

    it('should handle validation exceptions gracefully in encryption', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryInvalidPayload(), async (invalidPayload) => {
          const event: EncryptionEvent = {
            body: invalidPayload as string,
            requestContext: { requestId: `invalid-${Date.now()}` }
          };

          const response = await encryptHandler(event);

          // Must return valid HTTP response, not crash
          expect(response).toHaveProperty('statusCode');
          expect(response).toHaveProperty('headers');
          expect(response).toHaveProperty('body');

          // Must use appropriate status code (400 for validation errors)
          expect(response.statusCode).toBe(400);

          // Must include Content-Type header
          expect(response.headers['Content-Type']).toBe('application/json');

          // Must have valid JSON body
          expect(() => JSON.parse(response.body)).not.toThrow();

          const body = JSON.parse(response.body);
          expect(body).toHaveProperty('error');
          expect(typeof body.error).toBe('string');

          // Must not expose internal details
          expect(body.error).not.toContain('stack');
          expect(body.error).not.toContain('internal');
          expect(body.error).not.toContain('crypto');
        }),
        { numRuns: 50, timeout: 15000 }
      );
    }, 30000);

    it('should handle validation exceptions gracefully in decryption', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryInvalidToken(), async (invalidToken) => {
          const event: DecryptionEvent = {
            body: JSON.stringify({ token: invalidToken }),
            requestContext: { requestId: `invalid-${Date.now()}` }
          };

          const response = await decryptHandler(event);

          // Must return valid HTTP response, not crash
          expect(response).toHaveProperty('statusCode');
          expect(response).toHaveProperty('headers');
          expect(response).toHaveProperty('body');

          // Must use appropriate status code (400 for validation errors)
          expect(response.statusCode).toBe(400);

          // Must include Content-Type header
          expect(response.headers['Content-Type']).toBe('application/json');

          // Must have valid JSON body
          expect(() => JSON.parse(response.body)).not.toThrow();

          const body = JSON.parse(response.body);
          expect(body).toHaveProperty('error');
          expect(typeof body.error).toBe('string');

          // Must not expose internal details
          expect(body.error).not.toContain('stack');
          expect(body.error).not.toContain('internal');
          expect(body.error).not.toContain('crypto');
        }),
        { numRuns: 50, timeout: 15000 }
      );
    }, 30000);

    it('should handle malformed JSON gracefully', async () => {
      const arbitraryMalformedJson = () => fc.oneof(
        fc.constant('{invalid json}'),
        fc.constant('{"unclosed": "object"'),
        fc.constant('[1,2,3,]'), // Trailing comma
        fc.constant('{"key": }'), // Missing value
        fc.constant('{"key"') // Incomplete JSON
      );

      await fc.assert(
        fc.asyncProperty(arbitraryMalformedJson(), async (malformedJson) => {
          // Test encryption handler
          const encryptEvent: EncryptionEvent = {
            body: malformedJson,
            requestContext: { requestId: `malformed-${Date.now()}` }
          };

          const encryptResponse = await encryptHandler(encryptEvent);
          expect(encryptResponse.statusCode).toBe(400);
          expect(() => JSON.parse(encryptResponse.body)).not.toThrow();

          // Test decryption handler
          const decryptEvent: DecryptionEvent = {
            body: malformedJson,
            requestContext: { requestId: `malformed-${Date.now()}` }
          };

          const decryptResponse = await decryptHandler(decryptEvent);
          expect(decryptResponse.statusCode).toBe(400);
          expect(() => JSON.parse(decryptResponse.body)).not.toThrow();
        }),
        { numRuns: 30, timeout: 15000 }
      );
    }, 30000);
  });

  /**
   * Property 9: Formato de Respuesta HTTP
   * **Validates: Requirements 1.6, 3.6, 8.4**
   * 
   * For any invocation of Lambda functions, HTTP responses MUST:
   * - Include Content-Type: application/json header
   * - Have a valid HTTP status code
   * - Contain a valid JSON body
   * - Follow the defined response schema (success or error)
   */
  describe('Property 9: Formato de Respuesta HTTP', () => {
    const arbitraryPayload = () => fc.record({
      data: fc.string(),
      number: fc.integer()
    });

    it('should always return valid HTTP response format for encryption', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryPayload(), async (payload) => {
          const event: EncryptionEvent = {
            body: JSON.stringify(payload),
            requestContext: { requestId: `format-${Date.now()}` }
          };

          const response = await encryptHandler(event);

          // Must have valid HTTP status code
          expect(typeof response.statusCode).toBe('number');
          expect(response.statusCode).toBeGreaterThanOrEqual(200);
          expect(response.statusCode).toBeLessThan(600);

          // Must include Content-Type header
          expect(response.headers).toHaveProperty('Content-Type');
          expect(response.headers['Content-Type']).toBe('application/json');

          // Must have valid JSON body
          expect(typeof response.body).toBe('string');
          expect(() => JSON.parse(response.body)).not.toThrow();

          const body = JSON.parse(response.body);
          expect(typeof body).toBe('object');
          expect(body).not.toBeNull();

          // Must follow response schema
          if (response.statusCode === 200) {
            expect(body).toHaveProperty('token');
            expect(typeof body.token).toBe('string');
          } else {
            expect(body).toHaveProperty('error');
            expect(typeof body.error).toBe('string');
          }
        }),
        { numRuns: 50, timeout: 15000 }
      );
    }, 30000);

    it('should always return valid HTTP response format for decryption', async () => {
      // First encrypt a payload to get a valid token
      const testPayload = { test: 'data', number: 42 };
      const encryptEvent: EncryptionEvent = {
        body: JSON.stringify(testPayload),
        requestContext: { requestId: 'setup' }
      };
      const encryptResponse = await encryptHandler(encryptEvent);
      const validToken = JSON.parse(encryptResponse.body).token;

      const arbitraryTokenInput = () => fc.oneof(
        fc.constant(validToken), // Valid token
        fc.constant('invalid.token'), // Invalid token
        fc.constant('') // Empty token
      );

      await fc.assert(
        fc.asyncProperty(arbitraryTokenInput(), async (token) => {
          const event: DecryptionEvent = {
            body: JSON.stringify({ token }),
            requestContext: { requestId: `format-${Date.now()}` }
          };

          const response = await decryptHandler(event);

          // Must have valid HTTP status code
          expect(typeof response.statusCode).toBe('number');
          expect(response.statusCode).toBeGreaterThanOrEqual(200);
          expect(response.statusCode).toBeLessThan(600);

          // Must include Content-Type header
          expect(response.headers).toHaveProperty('Content-Type');
          expect(response.headers['Content-Type']).toBe('application/json');

          // Must have valid JSON body
          expect(typeof response.body).toBe('string');
          expect(() => JSON.parse(response.body)).not.toThrow();

          const body = JSON.parse(response.body);
          expect(typeof body).toBe('object');
          expect(body).not.toBeNull();

          // Must follow response schema
          if (response.statusCode === 200) {
            // Success response should contain decrypted data
            expect(body).toEqual(testPayload);
          } else {
            // Error response should contain error message
            expect(body).toHaveProperty('error');
            expect(typeof body.error).toBe('string');
          }
        }),
        { numRuns: 30, timeout: 15000 }
      );
    }, 30000);

    it('should include request ID in error responses', async () => {
      const arbitraryRequestId = () => fc.string({ minLength: 1, maxLength: 50 });

      await fc.assert(
        fc.asyncProperty(arbitraryRequestId(), async (requestId) => {
          const event: EncryptionEvent = {
            body: '', // Invalid payload to trigger error
            requestContext: { requestId }
          };

          const response = await encryptHandler(event);
          expect(response.statusCode).toBe(400);

          const body = JSON.parse(response.body);
          expect(body).toHaveProperty('requestId');
          expect(body.requestId).toBe(requestId);
        }),
        { numRuns: 30, timeout: 10000 }
      );
    }, 20000);

    it('should include error code in error responses', async () => {
      const arbitraryInvalidInput = () => fc.oneof(
        fc.constant(''), // Empty (validation error)
        fc.constant('not json'), // Invalid JSON (validation error)
        fc.constant('{}') // Empty object (validation error)
      );

      await fc.assert(
        fc.asyncProperty(arbitraryInvalidInput(), async (invalidInput) => {
          const event: EncryptionEvent = {
            body: invalidInput,
            requestContext: { requestId: `code-${Date.now()}` }
          };

          const response = await encryptHandler(event);
          expect(response.statusCode).toBe(400);

          const body = JSON.parse(response.body);
          expect(body).toHaveProperty('code');
          expect(typeof body.code).toBe('string');
          expect(body.code).toBe('VALIDATION_ERROR');
        }),
        { numRuns: 30, timeout: 10000 }
      );
    }, 20000);
  });
});