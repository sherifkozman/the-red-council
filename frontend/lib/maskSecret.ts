/**
 * Masks sensitive data in strings and objects
 * 
 * IMPORTANT: This is for UI-ONLY masking (e.g. screen sharing/demos).
 * It does NOT provide real security as the data has already reached the client.
 */

const SENSITIVE_KEYS = ['target_secret', 'secret', 'password', 'api_key', 'apiKey', 'token'];
const MASK_VALUE = '••••••••';

/**
 * Masks a value, optionally showing the first and last characters as a hint.
 */
export function maskSecretValue(value: string, showHint: boolean = false): string {
  if (!value || value.length === 0) return MASK_VALUE;
  if (showHint && value.length > 4) {
    return `${value[0]}••••${value[value.length - 1]}`;
  }
  return MASK_VALUE;
}

/**
 * Recursively masks sensitive keys in an object.
 */
export function maskSecretsInObject<T extends Record<string, unknown>>(obj: T): T {
  // Deep clone to prevent mutation of original object or shared references
  let masked: T;
  try {
    masked = structuredClone(obj);
  } catch (e) {
    // Fallback if structuredClone fails or is unavailable
    masked = JSON.parse(JSON.stringify(obj));
  }

  const maskRecursive = (current: any) => {
    if (!current || typeof current !== 'object') return;
    
    for (const key of Object.keys(current)) {
      if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        if (typeof current[key] === 'string') {
          current[key] = MASK_VALUE;
        }
      } else if (typeof current[key] === 'object' && current[key] !== null) {
        maskRecursive(current[key]);
      }
    }
  };

  maskRecursive(masked);
  return masked;
}

/**
 * Searches for known secret patterns in a string and redacts them.
 * Also allows passing a specific secret to redact.
 */
export function maskSecretsInString(text: string, knownSecret?: string): string {
  let result = text;
  
  if (knownSecret && knownSecret.length > 0) {
    // Correctly escape regex special chars including brackets
    const escaped = knownSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    result = result.replace(regex, MASK_VALUE);
  }

  // Narrowed generic redactions to avoid false positives
  return result
    .replace(/target_secret["\s:=]+["']?([^"' \s,}]+)["']?/gi, 'target_secret: [REDACTED]')
    .replace(/(?:password|secret)["\s:=]+["']?([^"' \s,}\n]{4,})["']?/gi, (match, p1) => {
        // Only redact if the value looks like a potential secret (at least 4 chars and not common words)
        const commonWords = ['none', 'null', 'false', 'true', 'undefined', 'rules'];
        if (commonWords.includes(p1.toLowerCase())) return match;
        return match.replace(p1, MASK_VALUE);
    });
}
