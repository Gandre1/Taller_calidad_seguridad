/**
 * Property-Based Tests for InputValidator Module
 * 
 * Uses fast-check to verify correctness properties across many generated inputs.
 * Validates: Requirements 1.2, 1.3, 5.1, 5.2, 5.5
 */

import * as fc from 'fast-check';
import { InputValidator } from './InputValidator';

describe('InputValidator Property-Based Tests', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  // ============================================================================
  // Custom Generators
  // ============================================================================

  /**
   * Generator for valid JSON payloads with at least one field
   */
  const arbitraryValidPayload = (): fc.Arbitrary<any> => {
    return fc.oneof(
      // Simple objects with various field types
      fc.record({
        userId: fc.string(),
        email: fc.emailAddress(),
        data: fc.anything()
      }),
      // Nested objects
      fc.record({
        user: fc.record({
          id: fc.uuid(),
          name: fc.string(),
          profile: fc.record({
            age: fc.integer({ min: 0, max: 120 }),
            country: fc.string()
          })
        })
      }),
      // Arrays with elements
      fc.array(fc.anything(), { minLength: 1 }),
      // Objects with mixed types
      fc.record({
        string: fc.string(),
        number: fc.integer(),
        boolean: fc.boolean(),
        array: fc.array(fc.integer()),
        nested: fc.record({
          key: fc.string()
        })
      }),
      // Objects with special characters
      fc.record({
        data: fc.string(),
        timestamp: fc.date().map(d => d.toISOString()),
        metadata: fc.object()
      })
    );
  };

  /**
   * Generator for empty payloads (empty strings, whitespace)
   */
  const arbitraryEmptyPayload = (): fc.Arbitrary<string> => {
    return fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('\t'),
      fc.constant('\n'),
      fc.constant('  \t\n  ')
    );
  };

  /**
   * Generator for invalid JSON strings
   */
  const arbitraryInvalidJSON = (): fc.Arbitrary<string> => {
    return fc.oneof(
      fc.constant('not json'),
      fc.constant('{invalid}'),
      fc.constant('{"key": "value"'), // Missing closing brace
      fc.constant('{"key": }'), // Missing value
      fc.constant('{key: "value"}'), // Unquoted key
      fc.constant("{'key': 'value'}"), // Single quotes
      fc.constant('undefined'),
      fc.constant('NaN'),
      fc.string().filter(s => {
        try {
          JSON.parse(s);
          return false; // Valid JSON, filter out
        } catch {
          return s.trim() !== ''; // Invalid JSON, keep it
        }
      })
    );
  };

  /**
   * Generator for JSON payloads without fields (empty objects/arrays)
   */
  const arbitraryEmptyJSONPayload = (): fc.Arbitrary<string> => {
    return fc.oneof(
      fc.constant('{}'),
      fc.constant('[]'),
      fc.constant('null')
    );
  };

  /**
   * Generator for payloads exceeding 6MB
   * Creates payloads slightly over the 6MB limit
   */
  const arbitraryOversizedPayload = (): fc.Arbitrary<string> => {
    return fc.integer({ min: 1, max: 1024 * 1024 }).map(extraBytes => {
      const maxSize = 6 * 1024 * 1024;
      const targetSize = maxSize + extraBytes;
      
      // Create a JSON structure that exceeds 6MB
      const jsonStructure = '{"data":""}';
      const availableSpace = targetSize - jsonStructure.length;
      const data = 'x'.repeat(availableSpace);
      
      return JSON.stringify({ data });
    });
  };

  /**
   * Generator for any invalid payload (combines all invalid types)
   */
  const arbitraryInvalidPayload = (): fc.Arbitrary<string> => {
    return fc.oneof(
      arbitraryEmptyPayload(),
      arbitraryInvalidJSON(),
      arbitraryEmptyJSONPayload(),
      arbitraryOversizedPayload()
    );
  };

  // ============================================================================
  // Property 3: Validación de Entrada
  // **Validates: Requirements 1.2, 1.3, 5.1, 5.2, 5.5**
  // ============================================================================

  describe('Property 3: Validación de Entrada', () => {
    /**
     * Feature: lambda-encryption-decryption, Property 3: Validación de Entrada
     * 
     * For any invalid input (malformed JSON, empty payload, payload without fields, 
     * payload >6MB), Lambda_Encriptacion MUST:
     * - Return HTTP status code 400 (or 413 for oversized)
     * - Include a descriptive error message
     * - NOT process the encryption
     */

    test('valid payloads always pass validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidPayload(),
          async (payload) => {
            const body = JSON.stringify(payload);
            
            // Skip if the stringified payload exceeds 6MB
            if (Buffer.byteLength(body, 'utf8') > 6 * 1024 * 1024) {
              return;
            }
            
            const result = validator.validatePayload(body);
            
            // Valid payloads should pass validation
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.payload).toBeDefined();
            
            // Payload should be correctly parsed
            // Note: JSON.stringify/parse may transform some values (e.g., undefined -> null)
            // So we compare the stringified versions
            expect(JSON.stringify(result.payload)).toEqual(body);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('empty payloads always fail validation with descriptive error', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryEmptyPayload(),
          async (emptyPayload) => {
            const result = validator.validatePayload(emptyPayload);
            
            // Empty payloads should fail validation
            expect(result.valid).toBe(false);
            
            // Should include descriptive error message
            expect(result.error).toBeDefined();
            expect(result.error).toContain('empty');
            expect(result.error).toContain('Validation failed');
            
            // Should not return a payload
            expect(result.payload).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('invalid JSON always fails validation with descriptive error', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidJSON(),
          async (invalidJSON) => {
            const result = validator.validatePayload(invalidJSON);
            
            // Invalid JSON should fail validation
            expect(result.valid).toBe(false);
            
            // Should include descriptive error message about JSON
            expect(result.error).toBeDefined();
            expect(result.error).toContain('JSON');
            expect(result.error).toContain('Validation failed');
            
            // Should not return a payload
            expect(result.payload).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('payloads without fields always fail validation with descriptive error', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryEmptyJSONPayload(),
          async (emptyJSON) => {
            const result = validator.validatePayload(emptyJSON);
            
            // Payloads without fields should fail validation
            expect(result.valid).toBe(false);
            
            // Should include descriptive error message
            expect(result.error).toBeDefined();
            expect(result.error).toContain('field');
            expect(result.error).toContain('Validation failed');
            
            // Should not return a payload
            expect(result.payload).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('payloads exceeding 6MB always fail validation with descriptive error', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryOversizedPayload(),
          async (oversizedPayload) => {
            const result = validator.validatePayload(oversizedPayload);
            
            // Oversized payloads should fail validation
            expect(result.valid).toBe(false);
            
            // Should include descriptive error message about size
            expect(result.error).toBeDefined();
            expect(result.error).toContain('6MB');
            expect(result.error).toContain('size');
            expect(result.error).toContain('Validation failed');
            
            // Should not return a payload
            expect(result.payload).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all invalid payloads fail validation and return error', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidPayload(),
          async (invalidPayload) => {
            const result = validator.validatePayload(invalidPayload);
            
            // All invalid payloads should fail validation
            expect(result.valid).toBe(false);
            
            // Should include a descriptive error message
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            if (result.error) {
              expect(result.error.length).toBeGreaterThan(0);
              expect(result.error).toContain('Validation failed');
            }
            
            // Should not return a payload
            expect(result.payload).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validation errors are descriptive and specific', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            arbitraryEmptyPayload().map(p => ({ type: 'empty', payload: p })),
            arbitraryInvalidJSON().map(p => ({ type: 'invalid-json', payload: p })),
            arbitraryEmptyJSONPayload().map(p => ({ type: 'no-fields', payload: p })),
            arbitraryOversizedPayload().map(p => ({ type: 'oversized', payload: p }))
          ),
          async ({ type, payload }) => {
            const result = validator.validatePayload(payload);
            
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            
            // Error message should be specific to the type of validation failure
            switch (type) {
              case 'empty':
                expect(result.error).toMatch(/empty/i);
                break;
              case 'invalid-json':
                expect(result.error).toMatch(/JSON/i);
                break;
              case 'no-fields':
                expect(result.error).toMatch(/field/i);
                break;
              case 'oversized':
                expect(result.error).toMatch(/6MB|size/i);
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validation never throws exceptions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // Any string input
          async (input) => {
            // Validation should never throw, always return a result
            expect(() => validator.validatePayload(input)).not.toThrow();
            
            const result = validator.validatePayload(input);
            
            // Result should always have a valid field
            expect(result).toHaveProperty('valid');
            expect(typeof result.valid).toBe('boolean');
            
            // If invalid, should have error message
            if (!result.valid) {
              expect(result.error).toBeDefined();
              expect(typeof result.error).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('checkPayloadSize correctly identifies oversized payloads', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 * 1024 * 1024 }), // 0 to 10MB
          async (size) => {
            const payload = 'x'.repeat(size);
            const result = validator.checkPayloadSize(payload);
            
            const maxSize = 6 * 1024 * 1024;
            const actualSize = Buffer.byteLength(payload, 'utf8');
            
            // Result should match whether size is within limit
            if (actualSize <= maxSize) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('checkPayloadContent correctly identifies empty payloads', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant({}),
            fc.constant([]),
            fc.constant(null),
            fc.constant(undefined),
            fc.string(),
            fc.integer(),
            fc.boolean()
          ),
          async (payload) => {
            const result = validator.checkPayloadContent(payload);
            
            // Should return false for empty objects, arrays, null, undefined, primitives
            if (
              payload === null ||
              payload === undefined ||
              typeof payload !== 'object' ||
              (Array.isArray(payload) && payload.length === 0) ||
              (!Array.isArray(payload) && Object.keys(payload).length === 0)
            ) {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('checkPayloadContent accepts objects with fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.record({ key: fc.string() }, { requiredKeys: ['key'] }),
            fc.array(fc.anything(), { minLength: 1 }),
            fc.dictionary(fc.string(), fc.anything()).filter(obj => Object.keys(obj).length > 0)
          ),
          async (payload) => {
            const result = validator.checkPayloadContent(payload);
            
            // Should return true for objects/arrays with content
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validation is consistent for the same input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (input) => {
            // Validate the same input multiple times
            const result1 = validator.validatePayload(input);
            const result2 = validator.validatePayload(input);
            const result3 = validator.validatePayload(input);
            
            // Results should be identical
            expect(result1.valid).toBe(result2.valid);
            expect(result2.valid).toBe(result3.valid);
            expect(result1.error).toBe(result2.error);
            expect(result2.error).toBe(result3.error);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('UTF-8 multi-byte characters are handled correctly in size validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000000 }),
          fc.oneof(
            fc.constant('😀'), // 4-byte emoji
            fc.constant('中'), // 3-byte Chinese character
            fc.constant('é'),  // 2-byte accented character
            fc.constant('a')   // 1-byte ASCII
          ),
          async (count, char) => {
            const payload = char.repeat(count);
            const body = JSON.stringify({ data: payload });
            
            const actualSize = Buffer.byteLength(body, 'utf8');
            const maxSize = 6 * 1024 * 1024;
            
            const result = validator.validatePayload(body);
            
            // Validation should correctly handle multi-byte characters
            if (actualSize <= maxSize) {
              // Should pass if within limit
              expect(result.valid).toBe(true);
            } else {
              // Should fail if exceeds limit
              expect(result.valid).toBe(false);
              expect(result.error).toContain('6MB');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
