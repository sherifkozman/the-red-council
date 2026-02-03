import { describe, it, expect, beforeAll } from 'vitest';
import {
  // HTML sanitization
  sanitizeHtml,
  sanitizeHtmlStrict,
  stripHtml,
  // Text escaping
  escapeHtml,
  unescapeHtml,
  escapeMarkdown,
  escapeJson,
  escapeUrl,
  // String sanitization
  sanitizeText,
  sanitizeName,
  sanitizeDescription,
  sanitizeTag,
  sanitizeTags,
  // Filename sanitization
  sanitizeFilename,
  sanitizeId,
  // URL sanitization
  sanitizeUrl,
  enforceHttps,
  // Configs
  DEFAULT_CONFIG,
  STRICT_CONFIG,
  PLAIN_TEXT_CONFIG,
} from './sanitize';

// Test in browser-like environment (jsdom)
describe('HTML Sanitization', () => {
  describe('sanitizeHtml', () => {
    it('allows safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      expect(sanitizeHtml(input)).toContain('<p>');
      expect(sanitizeHtml(input)).toContain('<strong>');
    });

    it('removes script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('removes event handlers', () => {
      const input = '<img src="x" onerror="alert(\'xss\')">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('allows links with href', () => {
      const input = '<a href="https://example.com">Link</a>';
      expect(sanitizeHtml(input)).toContain('href="https://example.com"');
    });

    it('handles empty/null input', () => {
      expect(sanitizeHtml('')).toBe('');
      expect(sanitizeHtml(null as any)).toBe('');
      expect(sanitizeHtml(undefined as any)).toBe('');
    });

    it('handles non-string input', () => {
      expect(sanitizeHtml(123 as any)).toBe('');
      expect(sanitizeHtml({} as any)).toBe('');
    });

    it('removes iframe and object tags', () => {
      const input = '<iframe src="evil.com"></iframe><object data="malware.swf"></object>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('<object');
    });
  });

  describe('sanitizeHtmlStrict', () => {
    it('allows only basic formatting', () => {
      const input = '<p>Hello <strong>world</strong> <a href="#">link</a></p>';
      const result = sanitizeHtmlStrict(input);
      expect(result).toContain('<strong>');
      expect(result).not.toContain('<a');
      expect(result).not.toContain('<p>');
    });

    it('allows bold, italic, underline', () => {
      const input = '<b>bold</b><i>italic</i><em>em</em><strong>strong</strong><u>underline</u>';
      const result = sanitizeHtmlStrict(input);
      expect(result).toContain('<b>');
      expect(result).toContain('<i>');
      expect(result).toContain('<em>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<u>');
    });
  });

  describe('stripHtml', () => {
    it('removes all HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      expect(stripHtml(input)).toBe('Hello world');
    });

    it('preserves text content', () => {
      const input = '<div>This is <span>some</span> text</div>';
      expect(stripHtml(input)).toBe('This is some text');
    });

    it('handles empty input', () => {
      expect(stripHtml('')).toBe('');
      expect(stripHtml(null as any)).toBe('');
    });
  });
});

describe('Text Escaping', () => {
  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml("'")).toBe('&#039;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
    });

    it('escapes complete XSS attempts', () => {
      const input = '<script>alert("xss")</script>';
      const result = escapeHtml(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('handles empty/null input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as any)).toBe('');
    });
  });

  describe('unescapeHtml', () => {
    it('unescapes HTML entities', () => {
      expect(unescapeHtml('&lt;script&gt;')).toBe('<script>');
      expect(unescapeHtml('&amp;')).toBe('&');
      expect(unescapeHtml('&quot;')).toBe('"');
      expect(unescapeHtml('&#039;')).toBe("'");
      expect(unescapeHtml('&#x27;')).toBe("'");
    });

    it('roundtrips with escapeHtml', () => {
      const original = '<script>alert("xss")</script>';
      expect(unescapeHtml(escapeHtml(original))).toBe(original);
    });

    it('handles empty input', () => {
      expect(unescapeHtml('')).toBe('');
    });
  });

  describe('escapeMarkdown', () => {
    it('escapes markdown special characters', () => {
      expect(escapeMarkdown('**bold**')).toBe('\\*\\*bold\\*\\*');
      expect(escapeMarkdown('_italic_')).toBe('\\_italic\\_');
      expect(escapeMarkdown('[link](url)')).toBe('\\[link\\]\\(url\\)');
      expect(escapeMarkdown('# heading')).toBe('\\# heading');
      expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
    });

    it('handles empty input', () => {
      expect(escapeMarkdown('')).toBe('');
    });
  });

  describe('escapeJson', () => {
    it('escapes JSON special characters', () => {
      expect(escapeJson('"quoted"')).toBe('\\"quoted\\"');
      expect(escapeJson('line\nbreak')).toBe('line\\nbreak');
      expect(escapeJson('tab\there')).toBe('tab\\there');
      expect(escapeJson('back\\slash')).toBe('back\\\\slash');
    });

    it('escapes control characters', () => {
      expect(escapeJson('\x00')).toBe('\\u0000');
      expect(escapeJson('\x1f')).toBe('\\u001f');
    });

    it('handles empty input', () => {
      expect(escapeJson('')).toBe('');
    });
  });

  describe('escapeUrl', () => {
    it('encodes URL-unsafe characters', () => {
      expect(escapeUrl('hello world')).toBe('hello%20world');
      expect(escapeUrl('foo&bar')).toBe('foo%26bar');
      expect(escapeUrl('key=value')).toBe('key%3Dvalue');
    });

    it('handles empty input', () => {
      expect(escapeUrl('')).toBe('');
    });
  });
});

describe('String Sanitization', () => {
  describe('sanitizeText', () => {
    it('trims whitespace', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });

    it('removes control characters', () => {
      expect(sanitizeText('hello\x00world')).toBe('helloworld');
      expect(sanitizeText('test\x1ftext')).toBe('testtext');
    });

    it('preserves newlines and tabs', () => {
      expect(sanitizeText('hello\nworld')).toBe('hello\nworld');
      expect(sanitizeText('hello\tworld')).toBe('hello\tworld');
    });

    it('normalizes unicode whitespace', () => {
      expect(sanitizeText('hello\u00A0world')).toBe('hello world');
    });

    it('limits length', () => {
      expect(sanitizeText('hello', 3)).toBe('hel');
    });

    it('handles empty input', () => {
      expect(sanitizeText('')).toBe('');
      expect(sanitizeText(null as any)).toBe('');
    });
  });

  describe('sanitizeName', () => {
    it('removes newlines', () => {
      expect(sanitizeName('Hello\nWorld')).toBe('Hello World');
    });

    it('collapses multiple spaces', () => {
      expect(sanitizeName('Hello    World')).toBe('Hello World');
    });

    it('trims whitespace', () => {
      expect(sanitizeName('  Name  ')).toBe('Name');
    });

    it('handles empty input', () => {
      expect(sanitizeName('')).toBe('');
    });
  });

  describe('sanitizeDescription', () => {
    it('allows newlines', () => {
      expect(sanitizeDescription('Line1\nLine2')).toContain('\n');
    });

    it('removes control characters', () => {
      expect(sanitizeDescription('text\x00here')).toBe('texthere');
    });
  });

  describe('sanitizeTag', () => {
    it('lowercases tags', () => {
      expect(sanitizeTag('Security')).toBe('security');
    });

    it('removes invalid characters', () => {
      expect(sanitizeTag('tag<script>')).toBe('tagscript');
      expect(sanitizeTag('tag_underscore')).toBe('tagunderscore');
    });

    it('trims whitespace', () => {
      expect(sanitizeTag('  tag  ')).toBe('tag');
    });

    it('limits length', () => {
      expect(sanitizeTag('a'.repeat(100)).length).toBeLessThanOrEqual(50);
    });

    it('handles empty input', () => {
      expect(sanitizeTag('')).toBe('');
    });
  });

  describe('sanitizeTags', () => {
    it('sanitizes each tag', () => {
      expect(sanitizeTags(['Security', 'TESTING'])).toEqual(['security', 'testing']);
    });

    it('removes empty tags', () => {
      expect(sanitizeTags(['valid', '', '  '])).toEqual(['valid']);
    });

    it('removes duplicates', () => {
      expect(sanitizeTags(['tag', 'TAG', 'Tag'])).toEqual(['tag']);
    });

    it('handles non-array input', () => {
      expect(sanitizeTags('not-array' as any)).toEqual([]);
    });
  });
});

describe('Filename Sanitization', () => {
  describe('sanitizeFilename', () => {
    it('removes path separators', () => {
      expect(sanitizeFilename('path/to/file.txt')).not.toContain('/');
      expect(sanitizeFilename('path\\to\\file.txt')).not.toContain('\\');
    });

    it('removes unsafe characters', () => {
      expect(sanitizeFilename('file<>:"|?*.txt')).not.toMatch(/[<>:"|?*]/);
    });

    it('removes control characters', () => {
      expect(sanitizeFilename('file\x00name')).toBe('filename');
    });

    it('collapses multiple underscores', () => {
      expect(sanitizeFilename('file___name')).not.toContain('___');
    });

    it('removes leading/trailing dots and spaces', () => {
      expect(sanitizeFilename('.hidden')).not.toMatch(/^\./);
      expect(sanitizeFilename('file. ')).not.toMatch(/\s+$/);
    });

    it('limits length while preserving extension', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(longName, 50);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).toContain('.txt');
    });

    it('returns "unnamed" for empty input', () => {
      expect(sanitizeFilename('')).toBe('unnamed');
      expect(sanitizeFilename(null as any)).toBe('unnamed');
    });
  });

  describe('sanitizeId', () => {
    it('allows alphanumeric, underscore, hyphen', () => {
      expect(sanitizeId('valid_id-123')).toBe('valid_id-123');
    });

    it('replaces invalid characters with underscore', () => {
      expect(sanitizeId('id with spaces')).toBe('id_with_spaces');
      expect(sanitizeId('id@special#chars')).toBe('id_special_chars');
    });

    it('collapses multiple underscores', () => {
      expect(sanitizeId('id___test')).not.toContain('___');
    });

    it('limits length', () => {
      expect(sanitizeId('a'.repeat(100), 20).length).toBeLessThanOrEqual(20);
    });

    it('handles empty input', () => {
      expect(sanitizeId('')).toBe('');
    });
  });
});

describe('URL Sanitization', () => {
  describe('sanitizeUrl', () => {
    it('allows valid HTTP(S) URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
      expect(sanitizeUrl('http://example.com/path')).toBe('http://example.com/path');
    });

    it('blocks javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
    });

    it('blocks data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('blocks vbscript: URLs', () => {
      expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    });

    it('blocks non-HTTP protocols', () => {
      expect(sanitizeUrl('ftp://example.com')).toBe('');
      expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('allows relative URLs', () => {
      expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
      expect(sanitizeUrl('path/to/page')).toBe('path/to/page');
    });

    it('handles empty input', () => {
      expect(sanitizeUrl('')).toBe('');
      expect(sanitizeUrl(null as any)).toBe('');
    });
  });

  describe('enforceHttps', () => {
    it('upgrades HTTP to HTTPS', () => {
      expect(enforceHttps('http://example.com')).toBe('https://example.com/');
    });

    it('keeps HTTPS unchanged', () => {
      expect(enforceHttps('https://example.com')).toBe('https://example.com/');
    });

    it('returns empty for invalid URLs', () => {
      expect(enforceHttps('javascript:alert(1)')).toBe('');
    });

    it('handles empty input', () => {
      expect(enforceHttps('')).toBe('');
    });
  });
});

describe('Configuration Objects', () => {
  it('exports DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.ALLOWED_TAGS).toContain('p');
    expect(DEFAULT_CONFIG.ALLOWED_TAGS).toContain('a');
  });

  it('exports STRICT_CONFIG', () => {
    expect(STRICT_CONFIG).toBeDefined();
    expect(STRICT_CONFIG.ALLOWED_TAGS).toContain('b');
    expect(STRICT_CONFIG.ALLOWED_TAGS).not.toContain('a');
  });

  it('exports PLAIN_TEXT_CONFIG', () => {
    expect(PLAIN_TEXT_CONFIG).toBeDefined();
    expect(PLAIN_TEXT_CONFIG.ALLOWED_TAGS).toEqual([]);
    expect(PLAIN_TEXT_CONFIG.KEEP_CONTENT).toBe(true);
  });
});
