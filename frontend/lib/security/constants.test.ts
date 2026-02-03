import { describe, it, expect } from 'vitest';
import {
  // Size limits
  MAX_EVENTS_LIMIT,
  MAX_EXPORT_SIZE_BYTES,
  MAX_SESSION_FILE_SIZE_BYTES,
  MAX_INPUT_TEXT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
  MAX_TEMPLATE_ID_LENGTH,
  MAX_TAGS_COUNT,
  MAX_TAG_LENGTH,
  // Validation patterns
  VALID_TEMPLATE_ID_PATTERN,
  VALID_SESSION_ID_PATTERN,
  VALID_API_KEY_PATTERN,
  SAFE_FILENAME_PATTERN,
  VALID_TAG_PATTERN,
  // URL validation
  ALLOWED_URL_PROTOCOLS,
  BLOCKED_URL_PATTERNS,
  // Rate limiting
  MIN_REQUEST_INTERVAL_MS,
  MAX_REQUESTS_PER_MINUTE,
  INPUT_DEBOUNCE_MS,
  // Timeouts
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_TIMEOUT_MS,
  SESSION_EXPIRY_MS,
  // Severity thresholds
  WARNING_SEVERITY_THRESHOLD,
  CRITICAL_SEVERITY_THRESHOLD,
  MAX_SEVERITY,
  // OWASP
  VALID_OWASP_CATEGORY_IDS,
  // Schema versions
  EXPORT_SCHEMA_VERSION,
  CONFIG_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
} from './constants';

describe('Security Constants', () => {
  describe('Size Limits', () => {
    it('exports MAX_EVENTS_LIMIT', () => {
      expect(MAX_EVENTS_LIMIT).toBe(5000);
    });

    it('exports MAX_EXPORT_SIZE_BYTES (10MB)', () => {
      expect(MAX_EXPORT_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });

    it('exports MAX_SESSION_FILE_SIZE_BYTES (50MB)', () => {
      expect(MAX_SESSION_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
    });

    it('exports MAX_INPUT_TEXT_LENGTH', () => {
      expect(MAX_INPUT_TEXT_LENGTH).toBe(10000);
    });

    it('exports MAX_DESCRIPTION_LENGTH', () => {
      expect(MAX_DESCRIPTION_LENGTH).toBe(2000);
    });

    it('exports MAX_NAME_LENGTH', () => {
      expect(MAX_NAME_LENGTH).toBe(256);
    });

    it('exports MAX_URL_LENGTH', () => {
      expect(MAX_URL_LENGTH).toBe(2048);
    });

    it('exports MAX_TEMPLATE_ID_LENGTH', () => {
      expect(MAX_TEMPLATE_ID_LENGTH).toBe(128);
    });

    it('exports MAX_TAGS_COUNT', () => {
      expect(MAX_TAGS_COUNT).toBe(20);
    });

    it('exports MAX_TAG_LENGTH', () => {
      expect(MAX_TAG_LENGTH).toBe(50);
    });
  });

  describe('Validation Patterns', () => {
    describe('VALID_TEMPLATE_ID_PATTERN', () => {
      it('matches valid template IDs', () => {
        expect(VALID_TEMPLATE_ID_PATTERN.test('template_001')).toBe(true);
        expect(VALID_TEMPLATE_ID_PATTERN.test('template-001')).toBe(true);
        expect(VALID_TEMPLATE_ID_PATTERN.test('template.v1')).toBe(true);
        expect(VALID_TEMPLATE_ID_PATTERN.test('ABC123')).toBe(true);
        expect(VALID_TEMPLATE_ID_PATTERN.test('a')).toBe(true);
      });

      it('rejects invalid template IDs', () => {
        expect(VALID_TEMPLATE_ID_PATTERN.test('')).toBe(false);
        expect(VALID_TEMPLATE_ID_PATTERN.test('template with spaces')).toBe(false);
        expect(VALID_TEMPLATE_ID_PATTERN.test('template/path')).toBe(false);
        expect(VALID_TEMPLATE_ID_PATTERN.test('<script>')).toBe(false);
        expect(VALID_TEMPLATE_ID_PATTERN.test('a'.repeat(129))).toBe(false);
      });
    });

    describe('VALID_SESSION_ID_PATTERN', () => {
      it('matches valid UUID v4', () => {
        expect(VALID_SESSION_ID_PATTERN.test('123e4567-e89b-4d3c-8456-426614174000')).toBe(true);
        expect(VALID_SESSION_ID_PATTERN.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      });

      it('rejects invalid UUIDs', () => {
        expect(VALID_SESSION_ID_PATTERN.test('')).toBe(false);
        expect(VALID_SESSION_ID_PATTERN.test('not-a-uuid')).toBe(false);
        expect(VALID_SESSION_ID_PATTERN.test('123e4567-e89b-1d3c-8456-426614174000')).toBe(false); // wrong version
        expect(VALID_SESSION_ID_PATTERN.test('123e4567-e89b-4d3c-1456-426614174000')).toBe(false); // wrong variant
      });
    });

    describe('VALID_API_KEY_PATTERN', () => {
      it('matches valid API keys', () => {
        expect(VALID_API_KEY_PATTERN.test('sk-abcd1234')).toBe(true);
        expect(VALID_API_KEY_PATTERN.test('rc_key_xyz789')).toBe(true);
        expect(VALID_API_KEY_PATTERN.test('12345678')).toBe(true);
        expect(VALID_API_KEY_PATTERN.test('A'.repeat(128))).toBe(true);
      });

      it('rejects invalid API keys', () => {
        expect(VALID_API_KEY_PATTERN.test('')).toBe(false);
        expect(VALID_API_KEY_PATTERN.test('short')).toBe(false); // < 8 chars
        expect(VALID_API_KEY_PATTERN.test('key with spaces')).toBe(false);
        expect(VALID_API_KEY_PATTERN.test('A'.repeat(129))).toBe(false); // > 128 chars
      });
    });

    describe('SAFE_FILENAME_PATTERN', () => {
      it('matches safe filenames', () => {
        expect(SAFE_FILENAME_PATTERN.test('report_001')).toBe(true);
        expect(SAFE_FILENAME_PATTERN.test('my-file')).toBe(true);
        expect(SAFE_FILENAME_PATTERN.test('ABC123')).toBe(true);
      });

      it('rejects unsafe filenames', () => {
        expect(SAFE_FILENAME_PATTERN.test('')).toBe(false);
        expect(SAFE_FILENAME_PATTERN.test('file.txt')).toBe(false); // dots not allowed
        expect(SAFE_FILENAME_PATTERN.test('../path')).toBe(false);
        expect(SAFE_FILENAME_PATTERN.test('file name')).toBe(false);
      });
    });

    describe('VALID_TAG_PATTERN', () => {
      it('matches valid tags', () => {
        expect(VALID_TAG_PATTERN.test('security')).toBe(true);
        expect(VALID_TAG_PATTERN.test('prompt-injection')).toBe(true);
        expect(VALID_TAG_PATTERN.test('tag with spaces')).toBe(true);
        expect(VALID_TAG_PATTERN.test('ASI01')).toBe(true);
      });

      it('rejects invalid tags', () => {
        expect(VALID_TAG_PATTERN.test('')).toBe(false);
        expect(VALID_TAG_PATTERN.test('tag_underscore')).toBe(false);
        expect(VALID_TAG_PATTERN.test('tag<script>')).toBe(false);
        expect(VALID_TAG_PATTERN.test('a'.repeat(51))).toBe(false);
      });
    });
  });

  describe('URL Validation', () => {
    it('exports allowed protocols', () => {
      expect(ALLOWED_URL_PROTOCOLS).toEqual(['http:', 'https:']);
    });

    it('exports blocked URL patterns for internal addresses', () => {
      expect(BLOCKED_URL_PATTERNS.length).toBeGreaterThan(0);

      // Test some blocked patterns
      const blockedAddresses = [
        'localhost',
        '127.0.0.1',
        '10.0.0.1',
        '172.16.0.1',
        '192.168.1.1',
        '0.0.0.0',
        '::1',
        '169.254.1.1',
      ];

      for (const addr of blockedAddresses) {
        const isBlocked = BLOCKED_URL_PATTERNS.some((p) => p.test(addr));
        expect(isBlocked).toBe(true);
      }
    });

    it('does not block public addresses', () => {
      const publicAddresses = ['google.com', 'api.example.com', '8.8.8.8', '1.1.1.1'];

      for (const addr of publicAddresses) {
        const isBlocked = BLOCKED_URL_PATTERNS.some((p) => p.test(addr));
        expect(isBlocked).toBe(false);
      }
    });
  });

  describe('Rate Limiting', () => {
    it('exports MIN_REQUEST_INTERVAL_MS', () => {
      expect(MIN_REQUEST_INTERVAL_MS).toBe(100);
    });

    it('exports MAX_REQUESTS_PER_MINUTE', () => {
      expect(MAX_REQUESTS_PER_MINUTE).toBe(60);
    });

    it('exports INPUT_DEBOUNCE_MS', () => {
      expect(INPUT_DEBOUNCE_MS).toBe(300);
    });
  });

  describe('Timeouts', () => {
    it('exports DEFAULT_REQUEST_TIMEOUT_MS', () => {
      expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30000);
    });

    it('exports MAX_REQUEST_TIMEOUT_MS', () => {
      expect(MAX_REQUEST_TIMEOUT_MS).toBe(120000);
    });

    it('exports SESSION_EXPIRY_MS (24 hours)', () => {
      expect(SESSION_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('Severity Thresholds', () => {
    it('exports WARNING_SEVERITY_THRESHOLD', () => {
      expect(WARNING_SEVERITY_THRESHOLD).toBe(4);
    });

    it('exports CRITICAL_SEVERITY_THRESHOLD', () => {
      expect(CRITICAL_SEVERITY_THRESHOLD).toBe(8);
    });

    it('exports MAX_SEVERITY', () => {
      expect(MAX_SEVERITY).toBe(10);
    });

    it('has logical threshold ordering', () => {
      expect(WARNING_SEVERITY_THRESHOLD).toBeLessThan(CRITICAL_SEVERITY_THRESHOLD);
      expect(CRITICAL_SEVERITY_THRESHOLD).toBeLessThan(MAX_SEVERITY);
    });
  });

  describe('OWASP Categories', () => {
    it('exports all 10 OWASP Agentic category IDs', () => {
      expect(VALID_OWASP_CATEGORY_IDS).toHaveLength(10);
      expect(VALID_OWASP_CATEGORY_IDS).toContain('ASI01');
      expect(VALID_OWASP_CATEGORY_IDS).toContain('ASI10');
    });

    it('has correct format for all category IDs', () => {
      for (const id of VALID_OWASP_CATEGORY_IDS) {
        expect(id).toMatch(/^ASI\d{2}$/);
      }
    });
  });

  describe('Schema Versions', () => {
    it('exports EXPORT_SCHEMA_VERSION', () => {
      expect(EXPORT_SCHEMA_VERSION).toBe('1.0.0');
    });

    it('exports CONFIG_SCHEMA_VERSION', () => {
      expect(CONFIG_SCHEMA_VERSION).toBe('1.0.0');
    });

    it('exports SESSION_SCHEMA_VERSION', () => {
      expect(SESSION_SCHEMA_VERSION).toBe('1.0.0');
    });

    it('all versions follow semver format', () => {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      expect(EXPORT_SCHEMA_VERSION).toMatch(semverPattern);
      expect(CONFIG_SCHEMA_VERSION).toMatch(semverPattern);
      expect(SESSION_SCHEMA_VERSION).toMatch(semverPattern);
    });
  });
});
