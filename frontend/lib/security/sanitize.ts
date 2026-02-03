/**
 * Sanitization utilities for preventing XSS and other injection attacks.
 * Provides centralized sanitization for HTML, markdown, and user-generated content.
 */

import DOMPurify from 'dompurify';
import {
  MAX_INPUT_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from './constants';

// ============================================================================
// TYPES
// ============================================================================

/** DOMPurify configuration type */
interface SanitizeConfig {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
  ADD_ATTR?: string[];
  FORBID_TAGS?: string[];
  FORBID_ATTR?: string[];
  KEEP_CONTENT?: boolean;
  RETURN_TRUSTED_TYPE?: boolean;
}

// ============================================================================
// HTML SANITIZATION
// ============================================================================

/**
 * Configure DOMPurify with safe defaults for this application.
 * Only runs in browser environment.
 */
function createSanitizer(): typeof DOMPurify | null {
  // DOMPurify requires a DOM environment
  if (typeof window === 'undefined') {
    return null;
  }
  return DOMPurify;
}

const sanitizer = createSanitizer();

/**
 * Default DOMPurify configuration: allow safe tags and attributes.
 */
const DEFAULT_CONFIG: SanitizeConfig = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'b',
    'i',
    'em',
    'strong',
    'u',
    's',
    'strike',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'div',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class', 'id', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target', 'rel'],
  // Force external links to open safely
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Strict configuration: only basic formatting allowed.
 */
const STRICT_CONFIG: SanitizeConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br'],
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Plain text configuration: strip all HTML.
 */
const PLAIN_TEXT_CONFIG: SanitizeConfig = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Uses DOMPurify with configurable allowed tags.
 */
export function sanitizeHtml(
  html: string,
  config: SanitizeConfig = DEFAULT_CONFIG
): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // In SSR/Node environment, fall back to escapeHtml
  if (!sanitizer) {
    return escapeHtml(html);
  }

  return sanitizer.sanitize(html, { ...config, RETURN_TRUSTED_TYPE: false }) as string;
}

/**
 * Sanitize HTML with strict settings (basic formatting only).
 */
export function sanitizeHtmlStrict(html: string): string {
  return sanitizeHtml(html, STRICT_CONFIG);
}

/**
 * Strip all HTML tags and return plain text.
 */
export function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // In SSR/Node environment, use regex fallback
  if (!sanitizer) {
    return html.replace(/<[^>]*>/g, '');
  }

  return sanitizer.sanitize(html, { ...PLAIN_TEXT_CONFIG, RETURN_TRUSTED_TYPE: false }) as string;
}

// ============================================================================
// TEXT ESCAPING
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 * Use this for displaying untrusted text in HTML context.
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Unescape HTML entities back to characters.
 * Only use for trusted content that needs to be displayed as text.
 */
export function unescapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'");
}

/**
 * Escape markdown special characters to prevent injection.
 * Use this when embedding user content in markdown documents.
 */
export function escapeMarkdown(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Escape markdown special characters
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}

/**
 * Escape characters for use in JSON strings.
 * Handles control characters and special JSON characters.
 */
export function escapeJson(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1f]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(2, '0');
      return `\\u00${hex}`;
    });
}

/**
 * Escape characters for use in URLs (query parameters).
 */
export function escapeUrl(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return encodeURIComponent(text);
}

// ============================================================================
// STRING SANITIZATION
// ============================================================================

/**
 * Sanitize user input text: trim, limit length, remove control characters.
 */
export function sanitizeText(
  text: string,
  maxLength: number = MAX_INPUT_TEXT_LENGTH
): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return (
    text
      // Remove null bytes and control characters (except newlines/tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize unicode whitespace to regular spaces
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      // Trim whitespace
      .trim()
      // Limit length
      .slice(0, maxLength)
  );
}

/**
 * Sanitize a name field (titles, labels).
 * More restrictive than general text.
 */
export function sanitizeName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return (
    sanitizeText(name, MAX_NAME_LENGTH)
      // Names shouldn't have newlines
      .replace(/[\r\n]/g, ' ')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Sanitize a description field.
 * Allows newlines but still removes control characters.
 */
export function sanitizeDescription(description: string): string {
  if (!description || typeof description !== 'string') {
    return '';
  }

  return sanitizeText(description, MAX_DESCRIPTION_LENGTH);
}

/**
 * Sanitize a tag (lowercase, trim, limited characters).
 */
export function sanitizeTag(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return '';
  }

  return (
    tag
      .toLowerCase()
      .trim()
      // Only allow alphanumeric, spaces, and hyphens
      .replace(/[^a-z0-9 -]/g, '')
      // Collapse spaces
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50)
  );
}

/**
 * Sanitize an array of tags.
 */
export function sanitizeTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const sanitized = tags
    .map(sanitizeTag)
    .filter((tag) => tag.length > 0);

  // Remove duplicates (case-insensitive already since sanitizeTag lowercases)
  return [...new Set(sanitized)];
}

// ============================================================================
// FILENAME SANITIZATION
// ============================================================================

/**
 * Sanitize a string for use as a filename.
 * Removes path separators, special characters, and limits length.
 */
export function sanitizeFilename(
  filename: string,
  maxLength: number = 255
): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }

  let safe = filename
    // Remove path separators
    .replace(/[/\\]/g, '_')
    // Remove null bytes
    .replace(/\x00/g, '')
    // Replace unsafe characters with underscores
    .replace(/[<>:"|?*]/g, '_')
    // Remove control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Collapse multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing dots and spaces (Windows issue)
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .trim();

  // Limit length (leave room for extension)
  if (safe.length > maxLength) {
    const ext = safe.includes('.') ? safe.slice(safe.lastIndexOf('.')) : '';
    const maxBase = maxLength - ext.length;
    safe = safe.slice(0, maxBase) + ext;
  }

  // Fallback if completely empty
  return safe || 'unnamed';
}

/**
 * Sanitize for use as a safe ID in filenames.
 * Only allows alphanumeric, underscores, and hyphens.
 */
export function sanitizeId(id: string, maxLength: number = 50): string {
  if (!id || typeof id !== 'string') {
    return '';
  }

  return id
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLength);
}

// ============================================================================
// URL SANITIZATION
// ============================================================================

/**
 * Sanitize a URL for safe display and linking.
 * Returns empty string if URL is potentially dangerous.
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();

  // Block javascript: and data: URLs
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return '';
  }

  // Validate URL format
  try {
    const parsed = new URL(trimmed);
    // Only allow http(s) and relative URLs
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.toString();
  } catch {
    // Allow relative URLs that start with / or are just paths
    if (trimmed.startsWith('/') || /^[a-zA-Z0-9_/-]+$/.test(trimmed)) {
      return trimmed;
    }
    return '';
  }
}

/**
 * Ensure a URL uses HTTPS (upgrade HTTP to HTTPS).
 */
export function enforceHttps(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const sanitized = sanitizeUrl(url);
  if (!sanitized) {
    return '';
  }

  return sanitized.replace(/^http:/, 'https:');
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export {
  DEFAULT_CONFIG,
  STRICT_CONFIG,
  PLAIN_TEXT_CONFIG,
  type SanitizeConfig,
};
