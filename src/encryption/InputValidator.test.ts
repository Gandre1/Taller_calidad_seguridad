/**
 * Unit tests for InputValidator
 * 
 * Tests validation of encryption Lambda input:
 * - Valid JSON parsing
 * - Payload size limits (6MB)
 * - Payload content requirements
 * 
 * Validates Requirements: 1.2, 1.3, 5.1, 5.2
 */

import { InputValidator } from './InputValidator';

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('validatePayload', () => {
    it('should accept valid JSON payload with data', () => {
      const body = JSON.stringify({ userId: '123', email: 'test@example.com' });
      const result = validator.validatePayload(body);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.payload).toEqual({ userId: '123', email: 'test@example.com' });
    });

    it('should reject empty string payload', () => {
      const result = validator.validatePayload('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload cannot be empty');
      expect(result.payload).toBeUndefined();
    });

    it('should reject whitespace-only payload', () => {
      const result = validator.validatePayload('   ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload cannot be empty');
      expect(result.payload).toBeUndefined();
    });

    it('should reject invalid JSON', () => {
      const result = validator.validatePayload('not valid json');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload must be a valid JSON object');
      expect(result.payload).toBeUndefined();
    });

    it('should reject malformed JSON', () => {
      const result = validator.validatePayload('{"key": "value"');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload must be a valid JSON object');
      expect(result.payload).toBeUndefined();
    });

    it('should reject empty JSON object', () => {
      const result = validator.validatePayload('{}');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload must contain at least one field with data');
      expect(result.payload).toBeUndefined();
    });

    it('should reject empty JSON array', () => {
      const result = validator.validatePayload('[]');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload must contain at least one field with data');
      expect(result.payload).toBeUndefined();
    });

    it('should accept JSON array with elements', () => {
      const body = JSON.stringify([1, 2, 3]);
      const result = validator.validatePayload(body);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.payload).toEqual([1, 2, 3]);
    });

    it('should reject payload exceeding 6MB', () => {
      // Create a payload slightly over 6MB
      const largeData = 'x'.repeat(6 * 1024 * 1024 + 1);
      const body = JSON.stringify({ data: largeData });
      const result = validator.validatePayload(body);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation failed: Payload size exceeds 6MB limit');
      expect(result.payload).toBeUndefined();
    });

    it('should accept payload at exactly 6MB limit', () => {
      // Create a payload at exactly 6MB (accounting for JSON structure)
      const targetSize = 6 * 1024 * 1024;
      const jsonStructure = '{"data":""}';
      const availableSpace = targetSize - jsonStructure.length;
      const data = 'x'.repeat(availableSpace);
      const body = JSON.stringify({ data });

      const result = validator.validatePayload(body);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.payload).toHaveProperty('data');
    });

    it('should accept nested JSON objects', () => {
      const body = JSON.stringify({
        user: {
          id: '123',
          profile: {
            name: 'Test User',
            email: 'test@example.com'
          }
        }
      });
      const result = validator.validatePayload(body);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.payload).toHaveProperty('user');
    });
  });

  describe('checkPayloadSize', () => {
    it('should return true for small payloads', () => {
      const body = JSON.stringify({ key: 'value' });
      expect(validator.checkPayloadSize(body)).toBe(true);
    });

    it('should return true for payload at 6MB limit', () => {
      const data = 'x'.repeat(6 * 1024 * 1024);
      expect(validator.checkPayloadSize(data)).toBe(true);
    });

    it('should return false for payload exceeding 6MB', () => {
      const data = 'x'.repeat(6 * 1024 * 1024 + 1);
      expect(validator.checkPayloadSize(data)).toBe(false);
    });

    it('should handle UTF-8 multi-byte characters correctly', () => {
      // UTF-8 emoji characters take multiple bytes
      const emoji = '😀'.repeat(2 * 1024 * 1024); // Each emoji is 4 bytes
      const sizeInBytes = Buffer.byteLength(emoji, 'utf8');
      
      expect(validator.checkPayloadSize(emoji)).toBe(sizeInBytes <= 6 * 1024 * 1024);
    });
  });

  describe('checkPayloadContent', () => {
    it('should return true for object with fields', () => {
      expect(validator.checkPayloadContent({ key: 'value' })).toBe(true);
    });

    it('should return true for object with multiple fields', () => {
      expect(validator.checkPayloadContent({ 
        key1: 'value1', 
        key2: 'value2',
        key3: 123 
      })).toBe(true);
    });

    it('should return false for empty object', () => {
      expect(validator.checkPayloadContent({})).toBe(false);
    });

    it('should return false for null', () => {
      expect(validator.checkPayloadContent(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validator.checkPayloadContent(undefined)).toBe(false);
    });

    it('should return false for primitive string', () => {
      expect(validator.checkPayloadContent('string')).toBe(false);
    });

    it('should return false for primitive number', () => {
      expect(validator.checkPayloadContent(123)).toBe(false);
    });

    it('should return false for primitive boolean', () => {
      expect(validator.checkPayloadContent(true)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(validator.checkPayloadContent([])).toBe(false);
    });

    it('should return true for array with elements', () => {
      expect(validator.checkPayloadContent([1, 2, 3])).toBe(true);
    });

    it('should return true for object with nested structures', () => {
      expect(validator.checkPayloadContent({
        user: {
          id: '123',
          profile: {
            name: 'Test'
          }
        }
      })).toBe(true);
    });
  });
});
