/**
 * Atomic-like write utilities for browser localStorage.
 *
 * True atomic writes (temp file + rename) aren't possible in browser localStorage.
 * This module provides the closest alternatives:
 *
 * 1. Optimistic Locking: Version-based concurrency control
 * 2. Batch Updates: Multiple changes as single transaction
 * 3. Rollback Support: Undo failed partial updates
 *
 * For server-side atomic writes, see the API route at /api/config.
 */

import { safeLocalStorage } from './safeLocalStorage';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Data structure with version for optimistic locking.
 */
export interface VersionedData<T> {
  /** The actual data */
  data: T;
  /** Version number for optimistic locking */
  version: number;
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Result of an atomic operation.
 */
export interface AtomicResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The data after operation (if successful) */
  data?: T;
  /** New version number (if successful) */
  version?: number;
  /** Error message (if failed) */
  error?: string;
  /** Whether a conflict occurred */
  conflict?: boolean;
}

/**
 * Batch operation definition.
 */
export interface BatchOperation {
  /** Storage key */
  key: string;
  /** Operation type */
  type: 'set' | 'remove';
  /** Value for 'set' operations */
  value?: unknown;
}

/**
 * Result of a batch operation.
 */
export interface BatchResult {
  /** Whether all operations succeeded */
  success: boolean;
  /** Number of operations completed */
  completed: number;
  /** Total operations attempted */
  total: number;
  /** Error message if any operation failed */
  error?: string;
  /** Whether rollback was performed */
  rolledBack?: boolean;
}

// ============================================================================
// OPTIMISTIC LOCKING
// ============================================================================

/**
 * Read data with version for optimistic locking.
 */
export function readVersioned<T>(key: string): VersionedData<T> | null {
  const stored = safeLocalStorage.getItem<VersionedData<T>>(key);
  return stored;
}

/**
 * Write data with optimistic locking.
 * Fails if the current version doesn't match expected version.
 *
 * @param key Storage key
 * @param data Data to write
 * @param expectedVersion Expected current version (0 for new items)
 * @returns Result with new version or conflict error
 */
export function writeVersioned<T>(
  key: string,
  data: T,
  expectedVersion: number
): AtomicResult<T> {
  try {
    const current = readVersioned<T>(key);
    const currentVersion = current?.version ?? 0;

    // Check for version conflict
    if (currentVersion !== expectedVersion) {
      return {
        success: false,
        error: `Version conflict: expected ${expectedVersion}, found ${currentVersion}`,
        conflict: true,
      };
    }

    // Write with incremented version
    const newVersion = currentVersion + 1;
    const versioned: VersionedData<T> = {
      data,
      version: newVersion,
      updatedAt: new Date().toISOString(),
    };

    safeLocalStorage.setItem(key, versioned);

    return {
      success: true,
      data,
      version: newVersion,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Compare-and-swap operation.
 * Only updates if current value matches expected.
 *
 * @param key Storage key
 * @param expectedValue Expected current value (compared with JSON.stringify)
 * @param newValue New value to write
 * @returns Result indicating success or mismatch
 */
export function compareAndSwap<T>(
  key: string,
  expectedValue: T | null,
  newValue: T
): AtomicResult<T> {
  try {
    const current = safeLocalStorage.getItem<T>(key);

    // Compare serialized values
    const currentSerialized = JSON.stringify(current);
    const expectedSerialized = JSON.stringify(expectedValue);

    if (currentSerialized !== expectedSerialized) {
      return {
        success: false,
        error: 'Value mismatch: current value differs from expected',
        conflict: true,
      };
    }

    safeLocalStorage.setItem(key, newValue);

    return {
      success: true,
      data: newValue,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Execute multiple storage operations as a batch.
 * If any operation fails, attempts to rollback all changes.
 *
 * @param operations Array of operations to execute
 * @returns Result with success status and rollback info
 */
export function batchWrite(operations: BatchOperation[]): BatchResult {
  if (operations.length === 0) {
    return { success: true, completed: 0, total: 0 };
  }

  // Capture current state for potential rollback
  const rollbackState: Map<string, string | null> = new Map();

  try {
    // Save current state of all keys we'll modify
    for (const op of operations) {
      if (!rollbackState.has(op.key)) {
        const current = localStorage.getItem(op.key);
        rollbackState.set(op.key, current);
      }
    }

    // Execute all operations
    let completed = 0;
    for (const op of operations) {
      if (op.type === 'set') {
        safeLocalStorage.setItem(op.key, op.value);
      } else if (op.type === 'remove') {
        safeLocalStorage.removeItem(op.key);
      }
      completed++;
    }

    return {
      success: true,
      completed,
      total: operations.length,
    };
  } catch (error) {
    // Attempt rollback
    let rolledBack = true;
    try {
      for (const [key, value] of rollbackState) {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      }
    } catch {
      rolledBack = false;
    }

    return {
      success: false,
      completed: 0,
      total: operations.length,
      error: error instanceof Error ? error.message : 'Unknown error',
      rolledBack,
    };
  }
}

// ============================================================================
// TRANSACTION-LIKE OPERATIONS
// ============================================================================

/**
 * Transaction context for grouping operations.
 */
export class StorageTransaction {
  private operations: BatchOperation[] = [];
  private committed = false;
  private rolledBackState: Map<string, string | null> | null = null;

  /**
   * Add a set operation to the transaction.
   */
  set(key: string, value: unknown): this {
    if (this.committed) {
      throw new Error('Transaction already committed');
    }
    this.operations.push({ key, type: 'set', value });
    return this;
  }

  /**
   * Add a remove operation to the transaction.
   */
  remove(key: string): this {
    if (this.committed) {
      throw new Error('Transaction already committed');
    }
    this.operations.push({ key, type: 'remove' });
    return this;
  }

  /**
   * Commit all operations in the transaction.
   */
  commit(): BatchResult {
    if (this.committed) {
      return {
        success: false,
        completed: 0,
        total: this.operations.length,
        error: 'Transaction already committed',
      };
    }

    // Capture rollback state
    this.rolledBackState = new Map();
    for (const op of this.operations) {
      if (!this.rolledBackState.has(op.key)) {
        const current = typeof window !== 'undefined'
          ? localStorage.getItem(op.key)
          : null;
        this.rolledBackState.set(op.key, current);
      }
    }

    const result = batchWrite(this.operations);
    if (result.success) {
      this.committed = true;
    }
    return result;
  }

  /**
   * Rollback the transaction (only works after commit attempt).
   */
  rollback(): boolean {
    if (!this.rolledBackState) {
      return false;
    }

    try {
      for (const [key, value] of this.rolledBackState) {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      }
      this.committed = false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the number of pending operations.
   */
  get size(): number {
    return this.operations.length;
  }

  /**
   * Check if transaction has been committed.
   */
  get isCommitted(): boolean {
    return this.committed;
  }
}

/**
 * Create a new storage transaction.
 */
export function createTransaction(): StorageTransaction {
  return new StorageTransaction();
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Retry an operation with exponential backoff.
 * Useful for handling temporary conflicts.
 *
 * @param operation Function that returns an AtomicResult
 * @param maxRetries Maximum retry attempts
 * @param baseDelayMs Base delay between retries (doubles each retry)
 */
export async function retryWithBackoff<T>(
  operation: () => AtomicResult<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 50
): Promise<AtomicResult<T>> {
  let lastResult: AtomicResult<T>;
  let delay = baseDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = operation();

    if (lastResult.success || !lastResult.conflict) {
      return lastResult;
    }

    // Only retry on conflicts
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  return lastResult!;
}

/**
 * Read-modify-write with automatic retry on conflict.
 *
 * @param key Storage key
 * @param modifier Function to modify the current value
 * @param maxRetries Maximum retry attempts on conflict
 */
export async function readModifyWrite<T>(
  key: string,
  modifier: (current: T | null) => T,
  maxRetries: number = 3
): Promise<AtomicResult<T>> {
  return retryWithBackoff(() => {
    const current = readVersioned<T>(key);
    const currentVersion = current?.version ?? 0;
    const currentData = current?.data ?? null;

    const newData = modifier(currentData);
    return writeVersioned(key, newData, currentVersion);
  }, maxRetries);
}
