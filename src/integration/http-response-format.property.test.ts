/**
 * Property-Based Tests for HTTP Response Format
 * 
 * Feature: lambda-encryption-decryption, Property 9: Formato de Respuesta HTTP
 * 
 * Uses fast-check to verify that all HTTP responses from Lambda functions
 * have the correct format regardless of input or outcome.
 * 
 * **Validates: Requirements 1.6, 3.6, 8.4**
 */

import * as fc from 'fast-check';
import { handler as encryptionHandler, EncryptionEvent } from '../encryption/index';
import { handler as decryptionHandler, DecryptionEvent } from '../decryption/index';
import { KeyManager } from '../shared/keyManager';
import * as jose from 'jose';

// Mock console.log to avoid noise during tests
const originalConsoleLog = console.log;

describe('HTTP Response Format Property-Based Tests', () => {
  let validPublicKey: jose.JWK;
  let validPrivateKey: jose.JWK;

  beforeAll(async () => {
    // Generate test RSA key pair
    const { publicKey, privateKey } = await jose.generateKeyPair('RSA-OAEP-256', {
      modulusLength: 2048
    });

    // Export keys to JWK format
    validPublicKey = await jose.exportJWK(publicKey);
    validPrivateKey = await jose.exportJWK(privateKey);
    
    validPublicKey.use = 'enc';
    validPublicKey.kid = 'test-key-http-response';
    validPrivateKey.use = 'enc';
    validPrivateKey.kid = 'test-key-http-response';

    // Set environment variables
    process.env.KEY_ID = 'test-key-http-response';
    process.env.LOG_LEVEL = 'ERROR'; // Reduce log noise during tests

    // Mock KeyManager globally
    jest.spyOn(KeyManager.prototype, 'getPublicKey').mockResolvedValue(validPublicKey as any);
    jest.spyOn(KeyManager.prototype, 'getPrivateKey').mockResolvedValue(validPrivateKey as any);

    // Mock console.log to reduce noise
    console.log = jest.fn();
  });

  afterAll(() => {
    delete process.env.KEY_ID;
    delete process.env.LOG_LEVEL;
    jest.restoreAllMocks();
    console.log = originalConsoleLog;
  });

  // ============================================================================
  // Custom Generators
  // ============================================================================

  /**
   * Generator for valid encryption events
   */
  const arbitraryValidEncryptionEvent = (): fc.Arbitrary<EncryptionEvent> => {
    return fc.record({
      body: fc.oneof(
        // Simple objects
        fc.record({
          userId: fc.string(),
          email: fc.emailAddress(),
          data: fc.anything()
        }).map(obj => JSON.stringify(obj)),
        
        // Complex nested objects
        fc.record({
          user: fc.record({
            id: fc.uuid(),
            profile: fc.record({
              name: fc.string(),
              age: fc.integer({ min: 0, max: 120 })
            })
          }),
          metadata: fc.record({
            timestamp: fc.date().map(d => d.toISOString()),
            source: fc.string()
          })
        }).map(obj => JSON.stringify(obj)),
        
        // Arrays
        fc.array(fc.anything(), { minLength: 1, maxLength: 5 }).map(arr => JSON.stringify(arr)),
        
        // Primitives
        fc.string().map(str => JSON.stringify(str)),
        fc.integer().map(num => JSON.stringify(num)),
        fc.boolean().map(bool => JSON.stringify(bool))
      ),
      headers: fc.option(fc.record({
        'Content-Type': fc.constant('application/json')
      }), { nil: undefined }),
      requestContext: fc.option(fc.record({
        requestId: fc.uuid()
      }), { nil: undefined })
    });
  };

  /**
   * Generator for invalid encryption events (should produce 400 errors)
   */
  const arbitraryInvalidEncryptionEvent = (): fc.Arbitrary<EncryptionEvent> => {
    return fc.record({
      body: fc.oneof(
        // Invalid JSON
        fc.constant('not json'),
        fc.constant('{"incomplete": '),
        fc.constant(''),
        
        // Empty payload
        fc.constant('{}'),
        
        // Null/undefined payload
        fc.constant('null'),
        fc.constant('undefined')
      ),
      headers: fc.option(fc.record({
        'Content-Type': fc.constant('application/json')
      }), { nil: undefined }),
      requestContext: fc.option(fc.record({
        requestId: fc.uuid()
      }), { nil: undefined })
    });
  };

  /**
   * Generator for invalid decryption events (should produce 400 errors)
   */
  const arbitraryInvalidDecryptionEvent = (): fc.Arbitrary<DecryptionEvent> => {
    return fc.record({
      body: fc.oneof(
        // Invalid JSON
        fc.constant('not json'),
        fc.constant('{"incomplete": '),
        
        // Missing token
        fc.constant('{}'),
        fc.constant('{"other": "field"}'),
        
        // Invalid token type
        fc.constant('{"token": 123}'),
        fc.constant('{"token": null}'),
        fc.constant('{"token": {}}'),
        
        // Invalid token format
        fc.constant('{"token": "invalid"}'),
        fc.constant('{"token": "a.b.c"}'), // Too few parts
        fc.constant('{"token": "a.b.c.d.e.f"}') // Too many parts
      ),
      headers: fc.option(fc.record({
        'Content-Type': fc.constant('application/json')
      }), { nil: undefined }),
      requestContext: fc.option(fc.record({
        requestId: fc.uuid()
      }), { nil: undefined })
    });
  };

  // ============================================================================
  // Property 9: Formato de Respuesta HTTP
  // **Validates: Requirements 1.6, 3.6, 8.4**
  // ============================================================================

  describe('Property 9: Formato de Respuesta HTTP', () => {
    /**
     * For any invocation of Lambda functions, HTTP responses MUST:
     * - Include header Content-Type: application/json
     * - Have a valid HTTP status code
     * - Contain a valid JSON body
     * - Follow the defined response schema (success or error)
     */

    test('encryption Lambda success responses have correct HTTP format', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidEncryptionEvent(),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Requirement 1.6: Success responses have status code 200
            expect(response.statusCode).toBe(200);
            
            // Requirement 8.4: Must include Content-Type: application/json header
            expect(response.headers).toBeDefined();
            expect(response.headers['Content-Type']).toBe('application/json');
            
            // Body must be valid JSON
            expect(() => JSON.parse(response.body)).not.toThrow();
            
            const parsedBody = JSON.parse(response.body);
            
            // Success response schema: must contain token field
            expect(parsedBody).toHaveProperty('token');
            expect(typeof parsedBody.token).toBe('string');
            expect(parsedBody.token.length).toBeGreaterThan(0);
            
            // Token should have JWE format (5 parts separated by dots)
            const tokenParts = parsedBody.token.split('.');
            expect(tokenParts).toHaveLength(5);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('decryption Lambda success responses have correct HTTP format', async () => {
      // First, we need to create valid JWE tokens for decryption
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidEncryptionEvent(),
          async (encryptionEvent) => {
            // Get a valid token from encryption
            const encryptionResponse = await encryptionHandler(encryptionEvent);
            
            // Skip if encryption failed (focus on successful cases)
            if (encryptionResponse.statusCode !== 200) {
              return;
            }
            
            const encryptionBody = JSON.parse(encryptionResponse.body);
            const token = encryptionBody.token;
            
            // Create decryption event with the valid token
            const decryptionEvent: DecryptionEvent = {
              body: JSON.stringify({ token }),
              headers: { 'Content-Type': 'application/json' },
              requestContext: { requestId: 'test-req-' + Date.now() }
            };
            
            const response = await decryptionHandler(decryptionEvent);
            
            // Requirement 3.6: Success responses have status code 200
            expect(response.statusCode).toBe(200);
            
            // Requirement 8.4: Must include Content-Type: application/json header
            expect(response.headers).toBeDefined();
            expect(response.headers['Content-Type']).toBe('application/json');
            
            // Body must be valid JSON
            expect(() => JSON.parse(response.body)).not.toThrow();
            
            const parsedBody = JSON.parse(response.body);
            
            // Success response schema: should contain the original decrypted data
            expect(parsedBody).toBeDefined();
            
            // The decrypted data should match the original payload
            const originalPayload = JSON.parse(encryptionEvent.body);
            expect(parsedBody).toEqual(originalPayload);
          }
        ),
        { numRuns: 50 } // Fewer runs since this involves two Lambda calls
      );
    });

    test('encryption Lambda error responses have correct HTTP format', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidEncryptionEvent(),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Error responses should have appropriate status codes
            expect([400, 413, 500]).toContain(response.statusCode);
            
            // Requirement 8.4: Must include Content-Type: application/json header
            expect(response.headers).toBeDefined();
            expect(response.headers['Content-Type']).toBe('application/json');
            
            // Body must be valid JSON
            expect(() => JSON.parse(response.body)).not.toThrow();
            
            const parsedBody = JSON.parse(response.body);
            
            // Error response schema: must contain error and code fields
            expect(parsedBody).toHaveProperty('error');
            expect(typeof parsedBody.error).toBe('string');
            expect(parsedBody.error.length).toBeGreaterThan(0);
            
            expect(parsedBody).toHaveProperty('code');
            expect(typeof parsedBody.code).toBe('string');
            expect(parsedBody.code.length).toBeGreaterThan(0);
            
            // May contain requestId for traceability
            if (parsedBody.requestId) {
              expect(typeof parsedBody.requestId).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('decryption Lambda error responses have correct HTTP format', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidDecryptionEvent(),
          async (event) => {
            const response = await decryptionHandler(event);
            
            // Error responses should have appropriate status codes
            expect([400, 500]).toContain(response.statusCode);
            
            // Requirement 8.4: Must include Content-Type: application/json header
            expect(response.headers).toBeDefined();
            expect(response.headers['Content-Type']).toBe('application/json');
            
            // Body must be valid JSON
            expect(() => JSON.parse(response.body)).not.toThrow();
            
            const parsedBody = JSON.parse(response.body);
            
            // Error response schema: must contain error and code fields
            expect(parsedBody).toHaveProperty('error');
            expect(typeof parsedBody.error).toBe('string');
            expect(parsedBody.error.length).toBeGreaterThan(0);
            
            expect(parsedBody).toHaveProperty('code');
            expect(typeof parsedBody.code).toBe('string');
            expect(parsedBody.code.length).toBeGreaterThan(0);
            
            // May contain requestId for traceability
            if (parsedBody.requestId) {
              expect(typeof parsedBody.requestId).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all Lambda responses have valid HTTP status codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            arbitraryValidEncryptionEvent(),
            arbitraryInvalidEncryptionEvent()
          ),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Status code must be a valid HTTP status code
            expect(response.statusCode).toBeGreaterThanOrEqual(200);
            expect(response.statusCode).toBeLessThan(600);
            
            // Common status codes for this application
            const validStatusCodes = [200, 400, 413, 500, 504];
            expect(validStatusCodes).toContain(response.statusCode);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all Lambda responses have required headers structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            arbitraryValidEncryptionEvent(),
            arbitraryInvalidEncryptionEvent()
          ),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Headers must be defined
            expect(response.headers).toBeDefined();
            expect(typeof response.headers).toBe('object');
            expect(response.headers).not.toBeNull();
            
            // Requirement 8.4: Content-Type header is required
            expect(response.headers).toHaveProperty('Content-Type');
            expect(response.headers['Content-Type']).toBe('application/json');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all Lambda responses have valid JSON body', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            arbitraryValidEncryptionEvent(),
            arbitraryInvalidEncryptionEvent()
          ),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Body must be defined
            expect(response.body).toBeDefined();
            expect(typeof response.body).toBe('string');
            
            // Body must be valid JSON
            expect(() => JSON.parse(response.body)).not.toThrow();
            
            const parsedBody = JSON.parse(response.body);
            
            // Body must be an object (not primitive)
            expect(typeof parsedBody).toBe('object');
            expect(parsedBody).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('success responses follow success schema consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidEncryptionEvent(),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Only test successful responses
            if (response.statusCode === 200) {
              const parsedBody = JSON.parse(response.body);
              
              // Success schema for encryption: { token: string }
              expect(Object.keys(parsedBody)).toEqual(['token']);
              expect(typeof parsedBody.token).toBe('string');
              expect(parsedBody.token.length).toBeGreaterThan(0);
              
              // Should not contain error fields
              expect(parsedBody).not.toHaveProperty('error');
              expect(parsedBody).not.toHaveProperty('code');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('error responses follow error schema consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidEncryptionEvent(),
          async (event) => {
            const response = await encryptionHandler(event);
            
            // Only test error responses
            if (response.statusCode !== 200) {
              const parsedBody = JSON.parse(response.body);
              
              // Error schema: { error: string, code: string, requestId?: string }
              expect(parsedBody).toHaveProperty('error');
              expect(parsedBody).toHaveProperty('code');
              
              expect(typeof parsedBody.error).toBe('string');
              expect(typeof parsedBody.code).toBe('string');
              
              // Should not contain success fields
              expect(parsedBody).not.toHaveProperty('token');
              
              // Optional requestId
              if (parsedBody.requestId) {
                expect(typeof parsedBody.requestId).toBe('string');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('responses maintain format consistency across different error types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Validation errors (400)
            fc.record({
              body: fc.constant('invalid json'),
              requestContext: fc.option(fc.record({ requestId: fc.uuid() }), { nil: undefined })
            }),
            
            // Empty payload errors (400)
            fc.record({
              body: fc.constant('{}'),
              requestContext: fc.option(fc.record({ requestId: fc.uuid() }), { nil: undefined })
            })
          ),
          async (event) => {
            const response = await encryptionHandler(event as EncryptionEvent);
            
            // All error responses should have consistent format
            expect(response.headers['Content-Type']).toBe('application/json');
            
            const parsedBody = JSON.parse(response.body);
            
            // Consistent error schema
            expect(parsedBody).toHaveProperty('error');
            expect(parsedBody).toHaveProperty('code');
            expect(typeof parsedBody.error).toBe('string');
            expect(typeof parsedBody.code).toBe('string');
            
            // Error message should not be empty
            expect(parsedBody.error.length).toBeGreaterThan(0);
            expect(parsedBody.code.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('responses handle missing requestContext gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            body: fc.record({
              userId: fc.string(),
              data: fc.string()
            }).map(obj => JSON.stringify(obj)),
            headers: fc.option(fc.record({
              'Content-Type': fc.constant('application/json')
            }), { nil: undefined })
            // Intentionally omit requestContext
          }),
          async (event) => {
            const response = await encryptionHandler(event as EncryptionEvent);
            
            // Should still return valid HTTP response
            expect(response.statusCode).toBeGreaterThanOrEqual(200);
            expect(response.statusCode).toBeLessThan(600);
            expect(response.headers['Content-Type']).toBe('application/json');
            
            // Body should still be valid JSON
            expect(() => JSON.parse(response.body)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});