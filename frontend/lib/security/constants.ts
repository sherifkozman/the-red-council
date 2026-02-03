/**
 * Security-related constants for the Red Council Unified Interface.
 * Centralized location for all security limits, patterns, and thresholds.
 */

// ============================================================================
// SIZE LIMITS
// ============================================================================

/** Maximum number of events to process/display (prevents OOM attacks) */
export const MAX_EVENTS_LIMIT = 5000;

/** Maximum export file size in bytes (10MB) */
export const MAX_EXPORT_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum session file size in bytes (50MB) */
export const MAX_SESSION_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum input text length for user-provided strings */
export const MAX_INPUT_TEXT_LENGTH = 10000;

/** Maximum description length */
export const MAX_DESCRIPTION_LENGTH = 2000;

/** Maximum name/title length */
export const MAX_NAME_LENGTH = 256;

/** Maximum URL length */
export const MAX_URL_LENGTH = 2048;

/** Maximum template ID length */
export const MAX_TEMPLATE_ID_LENGTH = 128;

/** Maximum tags per item */
export const MAX_TAGS_COUNT = 20;

/** Maximum tag length */
export const MAX_TAG_LENGTH = 50;

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

/**
 * Valid template ID pattern: alphanumeric, underscores, hyphens, dots.
 * Matches Streamlit's VALID_TEMPLATE_ID pattern from attack_selector.py
 */
export const VALID_TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_\-.]{1,128}$/;

/**
 * Valid session ID pattern: UUID v4 format.
 * Used for session identification and file naming.
 */
export const VALID_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valid API key pattern: alphanumeric with optional prefix.
 * Example: sk-abc123, rc_key_xyz789
 */
export const VALID_API_KEY_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

/**
 * Safe filename pattern: alphanumeric, underscores, hyphens.
 * Used for sanitizing filenames before download.
 */
export const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Valid tag pattern: alphanumeric, spaces, hyphens.
 */
export const VALID_TAG_PATTERN = /^[a-zA-Z0-9 \-]{1,50}$/;

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Allowed URL protocols for remote agent endpoints.
 * Only HTTP(S) is allowed for security.
 */
export const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * Blocked URL patterns that should never be used for remote agents.
 * Prevents SSRF attacks by blocking internal/local addresses.
 */
export const BLOCKED_URL_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^169\.254\.\d+\.\d+$/, // Link-local
  /^fc00:/i, // IPv6 private
  /^fd00:/i, // IPv6 private
  /^fe80:/i, // IPv6 link-local
] as const;

// ============================================================================
// RATE LIMITING
// ============================================================================

/** Minimum interval between API requests in milliseconds */
export const MIN_REQUEST_INTERVAL_MS = 100;

/** Maximum requests per minute for polling operations */
export const MAX_REQUESTS_PER_MINUTE = 60;

/** Debounce delay for user input in milliseconds */
export const INPUT_DEBOUNCE_MS = 300;

// ============================================================================
// TIMEOUTS
// ============================================================================

/** Default request timeout in milliseconds */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Maximum allowed timeout for remote agent requests */
export const MAX_REQUEST_TIMEOUT_MS = 120000;

/** Session expiry time in milliseconds (24 hours) */
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// SEVERITY THRESHOLDS
// ============================================================================

/** Severity threshold for warning status in OWASP grid */
export const WARNING_SEVERITY_THRESHOLD = 4;

/** Severity threshold for critical alerts */
export const CRITICAL_SEVERITY_THRESHOLD = 8;

/** Maximum severity value */
export const MAX_SEVERITY = 10;

// ============================================================================
// OWASP CATEGORIES
// ============================================================================

/** Valid OWASP Agentic category IDs */
export const VALID_OWASP_CATEGORY_IDS = [
  'ASI01',
  'ASI02',
  'ASI03',
  'ASI04',
  'ASI05',
  'ASI06',
  'ASI07',
  'ASI08',
  'ASI09',
  'ASI10',
] as const;

export type OWASPCategoryId = (typeof VALID_OWASP_CATEGORY_IDS)[number];

// ============================================================================
// SCHEMA VERSIONS
// ============================================================================

/** Current export schema version for forward compatibility */
export const EXPORT_SCHEMA_VERSION = '1.0.0';

/** Current config schema version for migrations */
export const CONFIG_SCHEMA_VERSION = '1.0.0';

/** Current session schema version */
export const SESSION_SCHEMA_VERSION = '1.0.0';
