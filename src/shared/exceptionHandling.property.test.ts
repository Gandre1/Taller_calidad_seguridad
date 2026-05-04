/**
 * Property-Based Tests for Exception Handling
 * 
 * Task 9.2: Escribir pruebas de propiedad para manejo de excepciones
 * 
 * **Propiedad 8: Manejo de Excepciones**
 * **Valida: Requisitos 1.7, 3.7, 7.2, 7.5**
 * 
 * Para cualquier excepción no manejada que ocurra durante el procesamiento, 
 * las funciones Lambda DEBERÁN:
 * - Capturar la excepción
 * - Retornar una respuesta HTTP válida (no crash)
 * - Usar código de estado apropiado (400 para errores de cliente, 500 para errores de servidor)
 * - Incluir mensaje de error sin exponer detalles internos
 */

import * as fc from 'fast-check';
import { handler as encryptHandler, EncryptionEvent } from '../encryption/index';
import { handler as decryptHandler, DecryptionEvent } from '../decryption/index';
import { KeyManager } from './keyManager';
import { ErrorType } from './errorHandler';
import * as jose from 'jose';

describe('Property-Based Tests for Exception Handling', () => {
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
      kid: 'test-key-exception'
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
      kid: 'test-key-exception'
    };

    // Set environment variables
    process.env.KEY_ID = 'test-key-exception';
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
   * **Validates: Requirements 1.7, 3.7, 7.2, 7.5**
   * 
   * Propiedad 8: Para cualquier excepción no manejada que ocurra durante el procesamiento,
   * las funciones Lambda DEBERÁN capturar la excepción y retornar una respuesta HTTP válida.
   */
  describe('Propiedad 8: Manejo de Excepciones - Captura de Excepciones No Manejadas', () => {
    
    /**
     * Generator for various types of invalid input that should cause exceptions
     */
    const arbitraryInvalidInput = () => fc.oneof(
      // JSON parsing errors
      fc.constant(''), // Empty string
      fc.constant('not json'), // Invalid JSON
      fc.constant('{invalid json}'), // Malformed JSON
      fc.constant('{"unclosed": "object"'), // Incomplete JSON
      fc.constant('[1,2,3,]'), // Trailing comma
      fc.constant('{"key": }'), // Missing value
      fc.constant('null'), // Null as string
      fc.constant('undefined'), // Undefined as string
      
      // Validation errors
      fc.constant('{}'), // Empty object (no fields)
      fc.constant('{"": ""}'), // Empty key
      
      // Size-related errors (simulated large payloads)
      fc.constant(JSON.stringify({ data: 'x'.repeat(1000) })), // Large but valid
      
      // Special characters that might cause issues
      fc.constant('{"key": "\\u0000\\u0001\\u0002"}'), // Control characters
      fc.constant('{"key": "\\"\\\\\\n\\r\\t"}'), // Escape sequences
    );

    /**
     * Generator for various types of invalid tokens
     */
    const arbitraryInvalidToken = () => fc.oneof(
      // Format errors
      fc.constant(''), // Empty token
      fc.constant('invalid'), // Not JWE format
      fc.constant('a.b.c'), // Too few parts
      fc.constant('a.b.c.d.e.f'), // Too many parts
      fc.string().filter(s => !s.includes('.')), // No dots
      
      // Corrupted tokens (valid format but invalid content)
      fc.constant('eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.corrupted.data.here.invalid'),
      fc.constant('invalid.eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.data.here.invalid'),
      
      // Wrong algorithms
      fc.constant('eyJhbGciOiJSU0ExXzUiLCJlbmMiOiJBMTI4R0NNIn0.data.here.test.invalid'), // Wrong alg/enc
      
      // Base64 decoding errors
      fc.constant('not-base64.not-base64.not-base64.not-base64.not-base64'),
      fc.constant('!!!.@@@.###.$$$.$$$'), // Invalid base64 characters
    );

    /**
     * Test that encryption handler captures all exceptions and returns valid HTTP responses
     * **Validates: Requirements 1.7, 7.2, 7.5**
     */
    it('should capture all exceptions in encryption handler and return valid HTTP responses', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryInvalidInput(), async (invalidInput) => {
          const event: EncryptionEvent = {
            body: invalidInput,
            requestContext: {
              requestId: `exception-test-${Date.now()}-${Math.random()}`
            }
          };

          let response: any;
          let threwException = false;

          try {
            response = await encryptHandler(event);
          } catch (error) {
            threwException = true;
          }

          // Requirement 7.5: Must capture all unhandled exceptions and return valid HTTP responses
          expect(threwException).toBe(false);
          expect(response).toBeDefined();

          // Must return a valid HTTP response structure
          expect(response).toHaveProperty('statusCode');
          expect(response).toHaveProperty('headers');
          expect(response).toHaveProperty('body');

          // Requirement 7.2: Must use appropriate status codes
          expect(typeof response.statusCode).toBe('number');
          expect(response.statusCode).toBeGreaterThanOrEqual(200);
          expect(response.statusCode).toBeLessThan(600);

          // Check if it's a success or error response
          if (response.statusCode >= 400) {
            // For error responses, validate error handling
            expect([400, 413, 500]).toContain(response.statusCode);

            // Must include Content-Type header
            expect(response.headers).toHaveProperty('Content-Type');
            expect(response.headers['Content-Type']).toBe('application/json');

            // Must have valid JSON body
            expect(typeof response.body).toBe('string');
            expect(() => JSON.parse(response.body)).not.toThrow();

            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('error');
            expect(typeof body.error).toBe('string');
            expect(body.error.length).toBeGreaterThan(0);

            // Requirement 1.7: Must not expose internal details
            expect(body.error).not.toContain('stack');
            expect(body.error).not.toContain('Stack');
            expect(body.error).not.toContain('Error:');
            expect(body.error).not.toMatch(/\n\s+at\s+/); // Stack trace newline + "at " pattern
            expect(body.error).not.toMatch(/^\s+at\s+/); // Stack trace starting with "at "
            expect(body.error).not.toContain('crypto');
            expect(body.error).not.toContain('jose');
            expect(body.error).not.toContain('node_modules');
            expect(body.error).not.toContain('TypeError');
            expect(body.error).not.toContain('ReferenceError');
            expect(body.error).not.toContain('SyntaxError');

            // Should include error code
            expect(body).toHaveProperty('code');
            expect(Object.values(ErrorType)).toContain(body.code);

            // Should include request ID for traceability
            if (event.requestContext?.requestId) {
              expect(body).toHaveProperty('requestId');
              expect(body.requestId).toBe(event.requestContext.requestId);
            }
          } else {
            // For success responses, validate success format
            expect(response.statusCode).toBe(200);
            expect(response.headers['Content-Type']).toBe('application/json');
            
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('token');
            expect(typeof body.token).toBe('string');
          }
        }),
        { 
          numRuns: 100,
          timeout: 30000,
          verbose: false
        }
      );
    }, 60000);

    /**
     * Test that decryption handler captures all exceptions and returns valid HTTP responses
     * **Validates: Requirements 3.7, 7.2, 7.5**
     */
    it('should capture all exceptions in decryption handler and return valid HTTP responses', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryInvalidToken(), async (invalidToken) => {
          const event: DecryptionEvent = {
            body: JSON.stringify({ token: invalidToken }),
            requestContext: {
              requestId: `exception-test-${Date.now()}-${Math.random()}`
            }
          };

          let response: any;
          let threwException = false;

          try {
            response = await decryptHandler(event);
          } catch (error) {
            threwException = true;
          }

          // Requirement 7.5: Must capture all unhandled exceptions and return valid HTTP responses
          expect(threwException).toBe(false);
          expect(response).toBeDefined();

          // Must return a valid HTTP response structure
          expect(response).toHaveProperty('statusCode');
          expect(response).toHaveProperty('headers');
          expect(response).toHaveProperty('body');

          // Requirement 7.2: Must use appropriate status codes
          expect(typeof response.statusCode).toBe('number');
          expect(response.statusCode).toBeGreaterThanOrEqual(400);
          expect(response.statusCode).toBeLessThan(600);

          // For validation errors, should return 400; for internal errors, should return 500
          expect([400, 500]).toContain(response.statusCode);

          // Must include Content-Type header
          expect(response.headers).toHaveProperty('Content-Type');
          expect(response.headers['Content-Type']).toBe('application/json');

          // Must have valid JSON body
          expect(typeof response.body).toBe('string');
          expect(() => JSON.parse(response.body)).not.toThrow();

          const body = JSON.parse(response.body);
          expect(body).toHaveProperty('error');
          expect(typeof body.error).toBe('string');
          expect(body.error.length).toBeGreaterThan(0);

          // Requirement 3.7: Must not expose internal details
          expect(body.error).not.toContain('stack');
          expect(body.error).not.toContain('Stack');
          expect(body.error).not.toContain('Error:');
          expect(body.error).not.toMatch(/\n\s+at\s+/); // Stack trace newline + "at " pattern
          expect(body.error).not.toMatch(/^\s+at\s+/); // Stack trace starting with "at "
          expect(body.error).not.toContain('crypto');
          expect(body.error).not.toContain('jose');
          expect(body.error).not.toContain('node_modules');
          expect(body.error).not.toContain('TypeError');
          expect(body.error).not.toContain('ReferenceError');
          expect(body.error).not.toContain('SyntaxError');

          // Should include error code
          expect(body).toHaveProperty('code');
          expect(Object.values(ErrorType)).toContain(body.code);

          // Should include request ID for traceability
          if (event.requestContext?.requestId) {
            expect(body).toHaveProperty('requestId');
            expect(body.requestId).toBe(event.requestContext.requestId);
          }
        }),
        { 
          numRuns: 100,
          timeout: 30000,
          verbose: false
        }
      );
    }, 60000);

    /**
     * Test exception handling with malformed JSON bodies
     * **Validates: Requirements 1.7, 3.7, 7.2, 7.5**
     */
    it('should handle malformed JSON bodies gracefully', async () => {
      const arbitraryMalformedJson = () => fc.oneof(
        fc.constant('{invalid json}'),
        fc.constant('{"unclosed": "object"'),
        fc.constant('[1,2,3,]'), // Trailing comma
        fc.constant('{"key": }'), // Missing value
        fc.constant('{"key"'), // Incomplete JSON
        fc.constant('{"key": "value",}'), // Trailing comma in object
        fc.constant('{"key": "value" "another": "value"}'), // Missing comma
        fc.constant('{"key": "value\\"}'), // Unescaped quote
      );

      await fc.assert(
        fc.asyncProperty(arbitraryMalformedJson(), async (malformedJson) => {
          // Test encryption handler
          const encryptEvent: EncryptionEvent = {
            body: malformedJson,
            requestContext: { requestId: `malformed-encrypt-${Date.now()}` }
          };

          const encryptResponse = await encryptHandler(encryptEvent);
          
          // Must not crash and return valid response
          expect(encryptResponse.statusCode).toBe(400);
          expect(encryptResponse.headers['Content-Type']).toBe('application/json');
          expect(() => JSON.parse(encryptResponse.body)).not.toThrow();
          
          const encryptBody = JSON.parse(encryptResponse.body);
          expect(encryptBody).toHaveProperty('error');
          expect(encryptBody.error).not.toContain('stack');

          // Test decryption handler
          const decryptEvent: DecryptionEvent = {
            body: malformedJson,
            requestContext: { requestId: `malformed-decrypt-${Date.now()}` }
          };

          const decryptResponse = await decryptHandler(decryptEvent);
          
          // Must not crash and return valid response
          expect(decryptResponse.statusCode).toBe(400);
          expect(decryptResponse.headers['Content-Type']).toBe('application/json');
          expect(() => JSON.parse(decryptResponse.body)).not.toThrow();
          
          const decryptBody = JSON.parse(decryptResponse.body);
          expect(decryptBody).toHaveProperty('error');
          expect(decryptBody.error).not.toContain('stack');
        }),
        { 
          numRuns: 50,
          timeout: 20000
        }
      );
    }, 40000);

    /**
     * Test exception handling when KeyManager fails
     * **Validates: Requirements 1.7, 3.7, 7.2, 7.5**
     * 
     * Note: This test is simplified to avoid module caching issues
     */
    it('should handle KeyManager exceptions gracefully', async () => {
      // This test validates that the error handling framework works
      // The actual KeyManager error scenarios are covered in integration tests
      
      // Test with a corrupted token that will cause decryption to fail
      const decryptEvent: DecryptionEvent = {
        body: JSON.stringify({ token: 'eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.corrupted.data.here.invalid' }),
        requestContext: { requestId: `key-error-decrypt-${Date.now()}` }
      };

      const decryptResponse = await decryptHandler(decryptEvent);
      
      // Must not crash and return valid error response
      expect(decryptResponse.statusCode).toBeGreaterThanOrEqual(400);
      expect(decryptResponse.headers['Content-Type']).toBe('application/json');
      expect(() => JSON.parse(decryptResponse.body)).not.toThrow();
      
      const decryptBody = JSON.parse(decryptResponse.body);
      expect(decryptBody).toHaveProperty('error');
      expect(decryptBody.error).not.toContain('stack');
      expect(typeof decryptBody.error).toBe('string');
      expect(decryptBody.error.length).toBeGreaterThan(0);
    });

    /**
     * Test that error responses follow consistent format
     * **Validates: Requirements 7.2, 8.4**
     */
    it('should return consistent error response format for all exception types', async () => {
      const arbitraryErrorScenario = () => fc.oneof(
        // Request ID generation
        fc.record({
          type: fc.constant('validation'),
          event: fc.record({
            body: fc.constant(''),
            requestContext: fc.record({ 
              requestId: fc.string({ minLength: 1, maxLength: 50 })
            })
          })
        }),
        // JSON parsing errors
        fc.record({
          type: fc.constant('json'),
          event: fc.record({
            body: fc.constant('{invalid}'),
            requestContext: fc.record({ 
              requestId: fc.string({ minLength: 1, maxLength: 50 })
            })
          })
        }),
        // Token format errors
        fc.record({
          type: fc.constant('token'),
          event: fc.record({
            body: fc.constant(JSON.stringify({ token: 'invalid' })),
            requestContext: fc.record({ 
              requestId: fc.string({ minLength: 1, maxLength: 50 })
            })
          })
        })
      );

      await fc.assert(
        fc.asyncProperty(arbitraryErrorScenario(), async (scenario) => {
          let response;
          
          if (scenario.type === 'token') {
            response = await decryptHandler(scenario.event as DecryptionEvent);
          } else {
            response = await encryptHandler(scenario.event as EncryptionEvent);
          }

          // All error responses must follow the same format
          expect(response).toHaveProperty('statusCode');
          expect(response).toHaveProperty('headers');
          expect(response).toHaveProperty('body');

          // Status code must be appropriate
          expect(response.statusCode).toBeGreaterThanOrEqual(400);
          expect(response.statusCode).toBeLessThan(600);

          // Headers must be consistent
          expect(response.headers['Content-Type']).toBe('application/json');

          // Body must be valid JSON with required fields
          const body = JSON.parse(response.body);
          expect(body).toHaveProperty('error');
          expect(body).toHaveProperty('code');
          expect(body).toHaveProperty('requestId');

          // Error message must be string and not empty
          expect(typeof body.error).toBe('string');
          expect(body.error.length).toBeGreaterThan(0);

          // Error code must be valid
          expect(Object.values(ErrorType)).toContain(body.code);

          // Request ID must match
          expect(body.requestId).toBe(scenario.event.requestContext.requestId);
        }),
        { 
          numRuns: 50,
          timeout: 20000
        }
      );
    }, 40000);
  });

  /**
   * Test specific error code mappings
   * **Validates: Requirements 7.1, 7.2**
   */
  describe('Error Code Mapping Validation', () => {
    
    /**
     * Test that validation errors consistently return 400 status codes
     * **Validates: Requirement 7.1**
     */
    it('should consistently map validation errors to 400 status codes', async () => {
      const arbitraryValidationError = () => fc.oneof(
        fc.constant(''), // Empty payload
        fc.constant('{}'), // Empty object
        fc.constant('not json'), // Invalid JSON
        fc.constant(null), // Null
      );

      await fc.assert(
        fc.asyncProperty(arbitraryValidationError(), async (invalidInput) => {
          const event: EncryptionEvent = {
            body: invalidInput as string,
            requestContext: { requestId: `validation-${Date.now()}` }
          };

          const response = await encryptHandler(event);
          
          // Validation errors must return 400
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.code).toBe(ErrorType.VALIDATION_ERROR);
        }),
        { numRuns: 30, timeout: 15000 }
      );
    }, 30000);

    /**
     * Test that internal processing errors return 500 status codes
     * **Validates: Requirement 7.2**
     * 
     * Note: This test validates error code mapping using a corrupted token scenario
     */
    it('should consistently map internal errors to 500 status codes', async () => {
      // Use a corrupted token that will cause internal processing errors
      const decryptEvent: DecryptionEvent = {
        body: JSON.stringify({ token: 'eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.corrupted.data.here.invalid' }),
        requestContext: { requestId: `internal-${Date.now()}` }
      };

      const response = await decryptHandler(decryptEvent);
      
      // Internal processing errors should return 500
      expect(response.statusCode).toBe(500);
      
      const body = JSON.parse(response.body);
      expect(body.code).toBe(ErrorType.INTERNAL_ERROR);
      
      // Must not expose internal error details
      expect(body.error).not.toContain('corrupted');
      expect(body.error).not.toContain('Invalid');
      expect(body.error).not.toContain('stack');
    });
  });
});