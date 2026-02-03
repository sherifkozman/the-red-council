import { describe, it, expect } from 'vitest';
import {
  // String validation
  validateString,
  validateOptionalString,
  validateInputText,
  validateName,
  validateDescription,
  // Identifier validation
  validateTemplateId,
  isValidTemplateId,
  validateSessionId,
  isValidSessionId,
  validateApiKey,
  // Filename validation
  validateFilename,
  sanitizeFilename,
  isSafeFilename,
  // URL validation
  validateUrl,
  isValidUrl,
  isInternalUrl,
  // Tag validation
  validateTag,
  validateTags,
  // OWASP validation
  validateOWASPCategoryId,
  isValidOWASPCategoryId,
  // Numeric validation
  validateSeverity,
  validatePositiveInteger,
  validateRange,
  // Date validation
  validateDateString,
  validateNotFuture,
  // Compound validation
  validateAll,
} from './validate';

describe('String Validation', () => {
  describe('validateString', () => {
    it('validates non-empty strings', () => {
      expect(validateString('hello', 100)).toEqual({ valid: true });
      expect(validateString('a', 100)).toEqual({ valid: true });
    });

    it('rejects null and undefined', () => {
      expect(validateString(null, 100).valid).toBe(false);
      expect(validateString(undefined, 100).valid).toBe(false);
    });

    it('rejects non-strings', () => {
      expect(validateString(123, 100).valid).toBe(false);
      expect(validateString({}, 100).valid).toBe(false);
      expect(validateString([], 100).valid).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(validateString('', 100).valid).toBe(false);
      expect(validateString('   ', 100).valid).toBe(false);
    });

    it('enforces length limits', () => {
      expect(validateString('hello', 3).valid).toBe(false);
      expect(validateString('hello', 5).valid).toBe(true);
    });

    it('includes field name in error messages', () => {
      const result = validateString(null, 100, 'Username');
      expect(result.error).toContain('Username');
    });
  });

  describe('validateOptionalString', () => {
    it('allows empty values', () => {
      expect(validateOptionalString(null, 100)).toEqual({ valid: true });
      expect(validateOptionalString(undefined, 100)).toEqual({ valid: true });
      expect(validateOptionalString('', 100)).toEqual({ valid: true });
    });

    it('validates non-empty values', () => {
      expect(validateOptionalString('hello', 100)).toEqual({ valid: true });
      expect(validateOptionalString('too long', 3).valid).toBe(false);
    });
  });

  describe('validateInputText', () => {
    it('validates input text with default limits', () => {
      expect(validateInputText('hello').valid).toBe(true);
      expect(validateInputText('a'.repeat(10000)).valid).toBe(true);
      expect(validateInputText('a'.repeat(10001)).valid).toBe(false);
    });
  });

  describe('validateName', () => {
    it('validates names with default limits', () => {
      expect(validateName('My Name').valid).toBe(true);
      expect(validateName('a'.repeat(256)).valid).toBe(true);
      expect(validateName('a'.repeat(257)).valid).toBe(false);
    });
  });

  describe('validateDescription', () => {
    it('allows empty descriptions', () => {
      expect(validateDescription('').valid).toBe(true);
      expect(validateDescription(null).valid).toBe(true);
    });

    it('validates non-empty descriptions', () => {
      expect(validateDescription('A description').valid).toBe(true);
      expect(validateDescription('a'.repeat(2001)).valid).toBe(false);
    });
  });
});

describe('Identifier Validation', () => {
  describe('validateTemplateId', () => {
    it('validates correct template IDs', () => {
      expect(validateTemplateId('template_001')).toEqual({ valid: true });
      expect(validateTemplateId('template-001')).toEqual({ valid: true });
      expect(validateTemplateId('template.v1')).toEqual({ valid: true });
      expect(validateTemplateId('ABC123')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateTemplateId(123).valid).toBe(false);
      expect(validateTemplateId(null).valid).toBe(false);
    });

    it('rejects empty IDs', () => {
      expect(validateTemplateId('').valid).toBe(false);
    });

    it('rejects IDs exceeding max length', () => {
      expect(validateTemplateId('a'.repeat(129)).valid).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(validateTemplateId('template with spaces').valid).toBe(false);
      expect(validateTemplateId('template/path').valid).toBe(false);
      expect(validateTemplateId('<script>').valid).toBe(false);
    });
  });

  describe('isValidTemplateId', () => {
    it('returns boolean for valid IDs', () => {
      expect(isValidTemplateId('valid_id')).toBe(true);
      expect(isValidTemplateId('invalid id')).toBe(false);
    });
  });

  describe('validateSessionId', () => {
    it('validates UUID v4 format', () => {
      expect(validateSessionId('123e4567-e89b-4d3c-8456-426614174000')).toEqual({ valid: true });
      expect(validateSessionId('550e8400-e29b-41d4-a716-446655440000')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateSessionId(123).valid).toBe(false);
    });

    it('rejects invalid UUIDs', () => {
      expect(validateSessionId('not-a-uuid').valid).toBe(false);
      expect(validateSessionId('123e4567-e89b-1d3c-8456-426614174000').valid).toBe(false);
    });
  });

  describe('isValidSessionId', () => {
    it('returns boolean for valid session IDs', () => {
      expect(isValidSessionId('123e4567-e89b-4d3c-8456-426614174000')).toBe(true);
      expect(isValidSessionId('invalid')).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    it('validates correct API keys', () => {
      expect(validateApiKey('sk-abcd1234')).toEqual({ valid: true });
      expect(validateApiKey('12345678')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateApiKey(123).valid).toBe(false);
    });

    it('rejects empty keys', () => {
      expect(validateApiKey('').valid).toBe(false);
    });

    it('rejects keys too short or too long', () => {
      expect(validateApiKey('short').valid).toBe(false);
      expect(validateApiKey('a'.repeat(129)).valid).toBe(false);
    });
  });
});

describe('Filename Validation', () => {
  describe('validateFilename', () => {
    it('validates correct filenames', () => {
      expect(validateFilename('report.json')).toEqual({ valid: true });
      expect(validateFilename('my-file_001.txt')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateFilename(123).valid).toBe(false);
    });

    it('rejects empty filenames', () => {
      expect(validateFilename('').valid).toBe(false);
    });

    it('rejects filenames exceeding max length', () => {
      expect(validateFilename('a'.repeat(256)).valid).toBe(false);
    });

    it('rejects path traversal attempts', () => {
      expect(validateFilename('../secret').valid).toBe(false);
      expect(validateFilename('path/to/file').valid).toBe(false);
      expect(validateFilename('path\\to\\file').valid).toBe(false);
    });
  });

  describe('sanitizeFilename', () => {
    it('sanitizes filenames', () => {
      expect(sanitizeFilename('file name.txt')).toBe('file_name_txt');
      expect(sanitizeFilename('report@2024')).toBe('report_2024');
    });

    it('limits length', () => {
      expect(sanitizeFilename('a'.repeat(100), 20).length).toBeLessThanOrEqual(20);
    });

    it('removes leading/trailing underscores', () => {
      expect(sanitizeFilename('_file_')).toBe('file');
    });
  });

  describe('isSafeFilename', () => {
    it('returns true for safe filenames', () => {
      expect(isSafeFilename('report_001')).toBe(true);
      expect(isSafeFilename('my-file')).toBe(true);
    });

    it('returns false for unsafe filenames', () => {
      expect(isSafeFilename('')).toBe(false);
      expect(isSafeFilename('file.txt')).toBe(false);
    });
  });
});

describe('URL Validation', () => {
  describe('validateUrl', () => {
    it('validates correct URLs', () => {
      expect(validateUrl('https://example.com')).toEqual({
        valid: true,
        url: expect.any(URL),
        isInternal: false,
      });
      expect(validateUrl('http://api.example.com/v1')).toEqual({
        valid: true,
        url: expect.any(URL),
        isInternal: false,
      });
    });

    it('rejects non-strings', () => {
      expect(validateUrl(123).valid).toBe(false);
    });

    it('rejects empty URLs', () => {
      expect(validateUrl('').valid).toBe(false);
    });

    it('rejects URLs exceeding max length', () => {
      expect(validateUrl('https://example.com/' + 'a'.repeat(2048)).valid).toBe(false);
    });

    it('rejects invalid URL format', () => {
      expect(validateUrl('not-a-url').valid).toBe(false);
    });

    it('rejects non-HTTP(S) protocols', () => {
      expect(validateUrl('ftp://example.com').valid).toBe(false);
      expect(validateUrl('file:///etc/passwd').valid).toBe(false);
    });

    it('rejects internal/private addresses (SSRF prevention)', () => {
      expect(validateUrl('http://localhost').valid).toBe(false);
      expect(validateUrl('http://127.0.0.1').valid).toBe(false);
      expect(validateUrl('http://10.0.0.1').valid).toBe(false);
      expect(validateUrl('http://192.168.1.1').valid).toBe(false);
      expect(validateUrl('http://172.16.0.1').valid).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('returns boolean for URL validity', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('invalid')).toBe(false);
    });
  });

  describe('isInternalUrl', () => {
    it('detects internal URLs', () => {
      expect(isInternalUrl('http://localhost')).toBe(true);
      expect(isInternalUrl('http://127.0.0.1')).toBe(true);
    });

    it('returns false for public URLs', () => {
      expect(isInternalUrl('https://example.com')).toBe(false);
    });
  });
});

describe('Tag Validation', () => {
  describe('validateTag', () => {
    it('validates correct tags', () => {
      expect(validateTag('security')).toEqual({ valid: true });
      expect(validateTag('prompt-injection')).toEqual({ valid: true });
      expect(validateTag('tag with spaces')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateTag(123).valid).toBe(false);
    });

    it('rejects empty tags', () => {
      expect(validateTag('').valid).toBe(false);
      expect(validateTag('   ').valid).toBe(false);
    });

    it('rejects tags exceeding max length', () => {
      expect(validateTag('a'.repeat(51)).valid).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(validateTag('tag_underscore').valid).toBe(false);
      expect(validateTag('tag<script>').valid).toBe(false);
    });
  });

  describe('validateTags', () => {
    it('validates correct tag arrays', () => {
      expect(validateTags(['security', 'testing'])).toEqual({ valid: true });
    });

    it('rejects non-arrays', () => {
      expect(validateTags('not-array' as any).valid).toBe(false);
    });

    it('rejects too many tags', () => {
      const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      expect(validateTags(manyTags).valid).toBe(false);
    });

    it('rejects duplicate tags (case-insensitive)', () => {
      expect(validateTags(['Security', 'security']).valid).toBe(false);
    });

    it('validates individual tags', () => {
      expect(validateTags(['valid', 'tag_invalid']).valid).toBe(false);
    });
  });
});

describe('OWASP Category Validation', () => {
  describe('validateOWASPCategoryId', () => {
    it('validates correct OWASP category IDs', () => {
      expect(validateOWASPCategoryId('ASI01')).toEqual({ valid: true });
      expect(validateOWASPCategoryId('ASI10')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateOWASPCategoryId(123).valid).toBe(false);
    });

    it('rejects invalid category IDs', () => {
      expect(validateOWASPCategoryId('ASI00').valid).toBe(false);
      expect(validateOWASPCategoryId('ASI11').valid).toBe(false);
      expect(validateOWASPCategoryId('INVALID').valid).toBe(false);
    });
  });

  describe('isValidOWASPCategoryId', () => {
    it('returns true for valid IDs', () => {
      expect(isValidOWASPCategoryId('ASI01')).toBe(true);
      expect(isValidOWASPCategoryId('ASI05')).toBe(true);
    });

    it('returns false for invalid IDs', () => {
      expect(isValidOWASPCategoryId('invalid')).toBe(false);
    });
  });
});

describe('Numeric Validation', () => {
  describe('validateSeverity', () => {
    it('validates correct severity values', () => {
      expect(validateSeverity(0)).toEqual({ valid: true });
      expect(validateSeverity(5)).toEqual({ valid: true });
      expect(validateSeverity(10)).toEqual({ valid: true });
    });

    it('rejects non-numbers', () => {
      expect(validateSeverity('5').valid).toBe(false);
      expect(validateSeverity(NaN).valid).toBe(false);
    });

    it('rejects out-of-range values', () => {
      expect(validateSeverity(-1).valid).toBe(false);
      expect(validateSeverity(11).valid).toBe(false);
    });
  });

  describe('validatePositiveInteger', () => {
    it('validates non-negative integers', () => {
      expect(validatePositiveInteger(0)).toEqual({ valid: true });
      expect(validatePositiveInteger(100)).toEqual({ valid: true });
    });

    it('rejects non-numbers', () => {
      expect(validatePositiveInteger('5').valid).toBe(false);
    });

    it('rejects non-integers', () => {
      expect(validatePositiveInteger(5.5).valid).toBe(false);
    });

    it('rejects negative numbers', () => {
      expect(validatePositiveInteger(-1).valid).toBe(false);
    });
  });

  describe('validateRange', () => {
    it('validates values in range', () => {
      expect(validateRange(5, 0, 10)).toEqual({ valid: true });
      expect(validateRange(0, 0, 10)).toEqual({ valid: true });
      expect(validateRange(10, 0, 10)).toEqual({ valid: true });
    });

    it('rejects values out of range', () => {
      expect(validateRange(-1, 0, 10).valid).toBe(false);
      expect(validateRange(11, 0, 10).valid).toBe(false);
    });

    it('rejects non-numbers', () => {
      expect(validateRange('5' as any, 0, 10).valid).toBe(false);
    });
  });
});

describe('Date Validation', () => {
  describe('validateDateString', () => {
    it('validates correct date strings', () => {
      expect(validateDateString('2024-01-15')).toEqual({ valid: true });
      expect(validateDateString('2024-01-15T10:30:00Z')).toEqual({ valid: true });
    });

    it('rejects non-strings', () => {
      expect(validateDateString(123).valid).toBe(false);
    });

    it('rejects invalid date formats', () => {
      expect(validateDateString('not-a-date').valid).toBe(false);
      expect(validateDateString('2024-13-45').valid).toBe(false);
    });
  });

  describe('validateNotFuture', () => {
    it('allows past dates', () => {
      expect(validateNotFuture(new Date('2020-01-01'))).toEqual({ valid: true });
    });

    it('allows current date', () => {
      expect(validateNotFuture(new Date())).toEqual({ valid: true });
    });

    it('rejects far future dates', () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      expect(validateNotFuture(farFuture).valid).toBe(false);
    });

    it('allows dates within tolerance', () => {
      const slightFuture = new Date(Date.now() + 30 * 60 * 1000); // 30 min in future
      expect(validateNotFuture(slightFuture)).toEqual({ valid: true });
    });

    it('handles string dates', () => {
      expect(validateNotFuture('2020-01-01')).toEqual({ valid: true });
    });

    it('rejects invalid dates', () => {
      expect(validateNotFuture('invalid').valid).toBe(false);
    });
  });
});

describe('Compound Validation', () => {
  describe('validateAll', () => {
    it('returns valid when all validations pass', () => {
      const result = validateAll([
        { result: { valid: true }, field: 'name' },
        { result: { valid: true }, field: 'email' },
      ]);
      expect(result).toEqual({ valid: true });
    });

    it('collects all errors', () => {
      const result = validateAll([
        { result: { valid: false, error: 'Name required' }, field: 'name' },
        { result: { valid: false, error: 'Email invalid' }, field: 'email' },
        { result: { valid: true }, field: 'age' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
      expect(result.error).toContain('email');
    });

    it('includes field names in errors', () => {
      const result = validateAll([
        { result: { valid: false, error: 'required' }, field: 'Username' },
      ]);
      expect(result.error).toContain('Username');
    });
  });
});
