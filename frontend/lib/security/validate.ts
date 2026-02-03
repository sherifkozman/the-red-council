/**
 * Validation utilities for user input, URLs, and identifiers.
 * Provides type-safe validation functions with descriptive error messages.
 */

import {
  VALID_TEMPLATE_ID_PATTERN,
  VALID_SESSION_ID_PATTERN,
  VALID_API_KEY_PATTERN,
  VALID_TAG_PATTERN,
  SAFE_FILENAME_PATTERN,
  ALLOWED_URL_PROTOCOLS,
  BLOCKED_URL_PATTERNS,
  MAX_URL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_INPUT_TEXT_LENGTH,
  MAX_TEMPLATE_ID_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS_COUNT,
  VALID_OWASP_CATEGORY_IDS,
  MAX_SEVERITY,
  type OWASPCategoryId,
} from './constants';

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface UrlValidationResult extends ValidationResult {
  url?: URL;
  isInternal?: boolean;
}

// ============================================================================
// STRING VALIDATION
// ============================================================================

/**
 * Validate that a string is non-empty and within length limits.
 */
export function validateString(
  value: unknown,
  maxLength: number,
  fieldName: string = 'Value'
): ValidationResult {
  if (value === null || value === undefined) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} characters`,
    };
  }

  return { valid: true };
}

/**
 * Validate an optional string (allows empty/null but validates if present).
 */
export function validateOptionalString(
  value: unknown,
  maxLength: number,
  fieldName: string = 'Value'
): ValidationResult {
  if (value === null || value === undefined || value === '') {
    return { valid: true };
  }

  return validateString(value, maxLength, fieldName);
}

/**
 * Validate user input text (descriptions, comments, etc.).
 */
export function validateInputText(
  value: unknown,
  fieldName: string = 'Input'
): ValidationResult {
  return validateString(value, MAX_INPUT_TEXT_LENGTH, fieldName);
}

/**
 * Validate a name field (titles, labels, etc.).
 */
export function validateName(
  value: unknown,
  fieldName: string = 'Name'
): ValidationResult {
  return validateString(value, MAX_NAME_LENGTH, fieldName);
}

/**
 * Validate a description field.
 */
export function validateDescription(
  value: unknown,
  fieldName: string = 'Description'
): ValidationResult {
  return validateOptionalString(value, MAX_DESCRIPTION_LENGTH, fieldName);
}

// ============================================================================
// IDENTIFIER VALIDATION
// ============================================================================

/**
 * Validate a template ID matches the expected pattern.
 * Pattern: alphanumeric, underscores, hyphens, dots (1-128 chars)
 */
export function validateTemplateId(id: unknown): ValidationResult {
  if (typeof id !== 'string') {
    return { valid: false, error: 'Template ID must be a string' };
  }

  if (id.length === 0) {
    return { valid: false, error: 'Template ID cannot be empty' };
  }

  if (id.length > MAX_TEMPLATE_ID_LENGTH) {
    return {
      valid: false,
      error: `Template ID exceeds maximum length of ${MAX_TEMPLATE_ID_LENGTH} characters`,
    };
  }

  if (!VALID_TEMPLATE_ID_PATTERN.test(id)) {
    return {
      valid: false,
      error: 'Template ID contains invalid characters (allowed: a-z, A-Z, 0-9, _, -, .)',
    };
  }

  return { valid: true };
}

/**
 * Check if a template ID is valid (boolean shorthand).
 */
export function isValidTemplateId(id: string): boolean {
  return validateTemplateId(id).valid;
}

/**
 * Validate a session ID (UUID v4 format).
 */
export function validateSessionId(id: unknown): ValidationResult {
  if (typeof id !== 'string') {
    return { valid: false, error: 'Session ID must be a string' };
  }

  if (!VALID_SESSION_ID_PATTERN.test(id)) {
    return { valid: false, error: 'Session ID must be a valid UUID v4' };
  }

  return { valid: true };
}

/**
 * Check if a session ID is valid (boolean shorthand).
 */
export function isValidSessionId(id: string): boolean {
  return validateSessionId(id).valid;
}

/**
 * Validate an API key format.
 */
export function validateApiKey(key: unknown): ValidationResult {
  if (typeof key !== 'string') {
    return { valid: false, error: 'API key must be a string' };
  }

  if (key.length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  if (!VALID_API_KEY_PATTERN.test(key)) {
    return {
      valid: false,
      error: 'API key format is invalid (8-128 alphanumeric characters, _, -)',
    };
  }

  return { valid: true };
}

// ============================================================================
// FILENAME VALIDATION
// ============================================================================

/**
 * Validate a filename for safe download operations.
 */
export function validateFilename(filename: unknown): ValidationResult {
  if (typeof filename !== 'string') {
    return { valid: false, error: 'Filename must be a string' };
  }

  if (filename.length === 0) {
    return { valid: false, error: 'Filename cannot be empty' };
  }

  if (filename.length > 255) {
    return { valid: false, error: 'Filename exceeds maximum length of 255 characters' };
  }

  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Filename contains invalid path characters' };
  }

  return { valid: true };
}

/**
 * Sanitize a string for use as a filename.
 * Replaces invalid characters with underscores.
 */
export function sanitizeFilename(input: string, maxLength: number = 50): string {
  return input
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .slice(0, maxLength);
}

/**
 * Check if a filename is safe for downloads.
 */
export function isSafeFilename(filename: string): boolean {
  return SAFE_FILENAME_PATTERN.test(filename);
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate a URL for remote agent endpoints.
 * Checks protocol, format, and blocks internal/private addresses.
 */
export function validateUrl(url: unknown): UrlValidationResult {
  if (typeof url !== 'string') {
    return { valid: false, error: 'URL must be a string' };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters` };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { valid: false, error: 'URL format is invalid' };
  }

  // Check protocol
  if (!ALLOWED_URL_PROTOCOLS.includes(parsedUrl.protocol as 'http:' | 'https:')) {
    return {
      valid: false,
      error: 'URL must use HTTP or HTTPS protocol',
    };
  }

  // Check for internal/private addresses (SSRF prevention)
  const hostname = parsedUrl.hostname.toLowerCase();
  const isInternal = BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(hostname));

  if (isInternal) {
    return {
      valid: false,
      error: 'URL points to an internal or private address (not allowed for security)',
      url: parsedUrl,
      isInternal: true,
    };
  }

  return { valid: true, url: parsedUrl, isInternal: false };
}

/**
 * Check if a URL is valid for remote agent endpoints (boolean shorthand).
 */
export function isValidUrl(url: string): boolean {
  return validateUrl(url).valid;
}

/**
 * Check if a URL hostname is an internal/private address.
 */
export function isInternalUrl(url: string): boolean {
  const result = validateUrl(url);
  return result.isInternal === true;
}

// ============================================================================
// TAG VALIDATION
// ============================================================================

/**
 * Validate a single tag.
 */
export function validateTag(tag: unknown): ValidationResult {
  if (typeof tag !== 'string') {
    return { valid: false, error: 'Tag must be a string' };
  }

  const trimmed = tag.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Tag cannot be empty' };
  }

  if (trimmed.length > MAX_TAG_LENGTH) {
    return {
      valid: false,
      error: `Tag exceeds maximum length of ${MAX_TAG_LENGTH} characters`,
    };
  }

  if (!VALID_TAG_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Tag contains invalid characters (allowed: a-z, A-Z, 0-9, spaces, -)',
    };
  }

  return { valid: true };
}

/**
 * Validate an array of tags.
 */
export function validateTags(tags: unknown): ValidationResult {
  if (!Array.isArray(tags)) {
    return { valid: false, error: 'Tags must be an array' };
  }

  if (tags.length > MAX_TAGS_COUNT) {
    return {
      valid: false,
      error: `Too many tags (maximum: ${MAX_TAGS_COUNT})`,
    };
  }

  for (let i = 0; i < tags.length; i++) {
    const tagResult = validateTag(tags[i]);
    if (!tagResult.valid) {
      return { valid: false, error: `Tag ${i + 1}: ${tagResult.error}` };
    }
  }

  // Check for duplicates (case-insensitive)
  const lowerTags = tags.map((t) => String(t).toLowerCase().trim());
  const uniqueTags = new Set(lowerTags);
  if (uniqueTags.size !== tags.length) {
    return { valid: false, error: 'Tags contain duplicates' };
  }

  return { valid: true };
}

// ============================================================================
// OWASP CATEGORY VALIDATION
// ============================================================================

/**
 * Validate an OWASP category ID.
 */
export function validateOWASPCategoryId(id: unknown): ValidationResult {
  if (typeof id !== 'string') {
    return { valid: false, error: 'OWASP category ID must be a string' };
  }

  if (!VALID_OWASP_CATEGORY_IDS.includes(id as OWASPCategoryId)) {
    return {
      valid: false,
      error: `Invalid OWASP category ID: ${id}. Valid IDs: ${VALID_OWASP_CATEGORY_IDS.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Check if an OWASP category ID is valid (boolean shorthand).
 */
export function isValidOWASPCategoryId(id: string): id is OWASPCategoryId {
  return VALID_OWASP_CATEGORY_IDS.includes(id as OWASPCategoryId);
}

// ============================================================================
// NUMERIC VALIDATION
// ============================================================================

/**
 * Validate a severity value (0-10).
 */
export function validateSeverity(value: unknown): ValidationResult {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { valid: false, error: 'Severity must be a number' };
  }

  if (value < 0 || value > MAX_SEVERITY) {
    return {
      valid: false,
      error: `Severity must be between 0 and ${MAX_SEVERITY}`,
    };
  }

  return { valid: true };
}

/**
 * Validate a positive integer.
 */
export function validatePositiveInteger(
  value: unknown,
  fieldName: string = 'Value'
): ValidationResult {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }

  if (!Number.isInteger(value)) {
    return { valid: false, error: `${fieldName} must be an integer` };
  }

  if (value < 0) {
    return { valid: false, error: `${fieldName} must be non-negative` };
  }

  return { valid: true };
}

/**
 * Validate a value is within a range.
 */
export function validateRange(
  value: unknown,
  min: number,
  max: number,
  fieldName: string = 'Value'
): ValidationResult {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }

  if (value < min || value > max) {
    return {
      valid: false,
      error: `${fieldName} must be between ${min} and ${max}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// DATE VALIDATION
// ============================================================================

/**
 * Validate a date string (ISO 8601 format).
 */
export function validateDateString(value: unknown): ValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Date must be a string' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: 'Date format is invalid' };
  }

  return { valid: true };
}

/**
 * Validate a timestamp is not in the future (with tolerance).
 * Allows a small buffer (1 hour) for clock skew.
 */
export function validateNotFuture(
  date: Date | string,
  toleranceMs: number = 60 * 60 * 1000
): ValidationResult {
  const timestamp = typeof date === 'string' ? new Date(date) : date;

  if (Number.isNaN(timestamp.getTime())) {
    return { valid: false, error: 'Invalid date' };
  }

  const maxAllowed = Date.now() + toleranceMs;
  if (timestamp.getTime() > maxAllowed) {
    return { valid: false, error: 'Date is in the future' };
  }

  return { valid: true };
}

// ============================================================================
// COMPOUND VALIDATORS
// ============================================================================

/**
 * Run multiple validators and collect all errors.
 */
export function validateAll(
  validations: Array<{ result: ValidationResult; field?: string }>
): ValidationResult {
  const errors: string[] = [];

  for (const { result, field } of validations) {
    if (!result.valid && result.error) {
      errors.push(field ? `${field}: ${result.error}` : result.error);
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  return { valid: true };
}
