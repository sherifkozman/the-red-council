/**
 * Security utilities for the Red Council Unified Interface.
 * Provides centralized validation, sanitization, and security constants.
 */

// Constants
export * from './constants';

// Validation (exclude sanitizeFilename since it's also in sanitize.ts)
export {
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
  // Filename validation (keep validate's version for validation, use sanitize's for sanitization)
  validateFilename,
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
  // Types
  type ValidationResult,
  type UrlValidationResult,
} from './validate';

// Sanitization (include sanitizeFilename)
export * from './sanitize';
