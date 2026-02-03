import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Types
  VersionedData,
  AtomicResult,
  BatchOperation,
  // Optimistic locking
  readVersioned,
  writeVersioned,
  compareAndSwap,
  // Batch operations
  batchWrite,
  // Transaction
  StorageTransaction,
  createTransaction,
  // Utilities
  retryWithBackoff,
  readModifyWrite,
} from './atomic';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    getStore: () => store,
  };
})();

describe('Atomic Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readVersioned', () => {
    it('returns null for non-existent key', () => {
      const result = readVersioned('nonexistent');
      expect(result).toBeNull();
    });

    it('returns versioned data', () => {
      const data: VersionedData<string> = {
        data: 'test',
        version: 1,
        updatedAt: '2024-01-01T00:00:00Z',
      };
      localStorageMock.setItem('test-key', JSON.stringify(data));

      const result = readVersioned<string>('test-key');

      expect(result).not.toBeNull();
      expect(result?.data).toBe('test');
      expect(result?.version).toBe(1);
    });
  });

  describe('writeVersioned', () => {
    it('writes new data with version 1', () => {
      const result = writeVersioned('test-key', 'test-data', 0);

      expect(result.success).toBe(true);
      expect(result.version).toBe(1);
      expect(result.data).toBe('test-data');
    });

    it('increments version on update', () => {
      // Initial write
      writeVersioned('test-key', 'v1', 0);

      // Update
      const result = writeVersioned('test-key', 'v2', 1);

      expect(result.success).toBe(true);
      expect(result.version).toBe(2);
    });

    it('fails on version conflict', () => {
      // Initial write
      writeVersioned('test-key', 'v1', 0);

      // Try to update with wrong expected version
      const result = writeVersioned('test-key', 'v2', 0);

      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
      expect(result.error).toContain('Version conflict');
    });

    it('stores updatedAt timestamp', () => {
      writeVersioned('test-key', 'test', 0);

      const stored = JSON.parse(localStorageMock.getStore()['test-key']) as VersionedData<string>;
      expect(stored.updatedAt).toBeDefined();
      expect(new Date(stored.updatedAt)).toBeInstanceOf(Date);
    });
  });

  describe('compareAndSwap', () => {
    it('swaps when values match', () => {
      localStorageMock.setItem('test-key', JSON.stringify('old-value'));

      const result = compareAndSwap('test-key', 'old-value', 'new-value');

      expect(result.success).toBe(true);
      expect(result.data).toBe('new-value');
    });

    it('fails when values dont match', () => {
      localStorageMock.setItem('test-key', JSON.stringify('actual-value'));

      const result = compareAndSwap('test-key', 'expected-value', 'new-value');

      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
    });

    it('swaps null to new value', () => {
      const result = compareAndSwap('test-key', null, 'new-value');

      expect(result.success).toBe(true);
      expect(result.data).toBe('new-value');
    });

    it('compares objects by serialized form', () => {
      const obj = { a: 1, b: 2 };
      localStorageMock.setItem('test-key', JSON.stringify(obj));

      const result = compareAndSwap('test-key', { a: 1, b: 2 }, { a: 1, b: 3 });

      expect(result.success).toBe(true);
    });
  });

  describe('batchWrite', () => {
    it('executes empty batch successfully', () => {
      const result = batchWrite([]);

      expect(result.success).toBe(true);
      expect(result.completed).toBe(0);
      expect(result.total).toBe(0);
    });

    it('executes set operations', () => {
      const operations: BatchOperation[] = [
        { key: 'key1', type: 'set', value: 'value1' },
        { key: 'key2', type: 'set', value: 'value2' },
      ];

      const result = batchWrite(operations);

      expect(result.success).toBe(true);
      expect(result.completed).toBe(2);
    });

    it('executes remove operations', () => {
      localStorageMock.setItem('key1', JSON.stringify('value1'));

      const operations: BatchOperation[] = [
        { key: 'key1', type: 'remove' },
      ];

      const result = batchWrite(operations);

      expect(result.success).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('key1');
    });

    it('executes mixed operations', () => {
      localStorageMock.setItem('to-remove', JSON.stringify('value'));

      const operations: BatchOperation[] = [
        { key: 'to-set', type: 'set', value: 'new-value' },
        { key: 'to-remove', type: 'remove' },
      ];

      const result = batchWrite(operations);

      expect(result.success).toBe(true);
      expect(result.completed).toBe(2);
    });
  });

  describe('StorageTransaction', () => {
    it('creates empty transaction', () => {
      const tx = createTransaction();

      expect(tx.size).toBe(0);
      expect(tx.isCommitted).toBe(false);
    });

    it('adds set operations', () => {
      const tx = createTransaction();

      tx.set('key1', 'value1');
      tx.set('key2', 'value2');

      expect(tx.size).toBe(2);
    });

    it('adds remove operations', () => {
      const tx = createTransaction();

      tx.remove('key1');

      expect(tx.size).toBe(1);
    });

    it('supports method chaining', () => {
      const tx = createTransaction()
        .set('key1', 'value1')
        .set('key2', 'value2')
        .remove('key3');

      expect(tx.size).toBe(3);
    });

    it('commits all operations', () => {
      const tx = createTransaction()
        .set('key1', 'value1')
        .set('key2', 'value2');

      const result = tx.commit();

      expect(result.success).toBe(true);
      expect(result.completed).toBe(2);
      expect(tx.isCommitted).toBe(true);
    });

    it('prevents operations after commit', () => {
      const tx = createTransaction()
        .set('key1', 'value1');

      tx.commit();

      expect(() => tx.set('key2', 'value2')).toThrow('Transaction already committed');
    });

    it('prevents double commit', () => {
      const tx = createTransaction()
        .set('key1', 'value1');

      tx.commit();
      const result = tx.commit();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction already committed');
    });

    it('supports rollback', () => {
      // Set initial state
      localStorageMock.setItem('existing', JSON.stringify('original'));

      const tx = createTransaction()
        .set('existing', 'modified')
        .set('new-key', 'new-value');

      tx.commit();

      // Rollback
      const rolled = tx.rollback();

      expect(rolled).toBe(true);
      expect(tx.isCommitted).toBe(false);
    });

    it('rollback fails before commit attempt', () => {
      const tx = createTransaction()
        .set('key1', 'value1');

      const rolled = tx.rollback();

      expect(rolled).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('returns on first success', async () => {
      let attempts = 0;
      const operation = (): AtomicResult<string> => {
        attempts++;
        return { success: true, data: 'result' };
      };

      const result = await retryWithBackoff(operation);

      expect(result.success).toBe(true);
      expect(attempts).toBe(1);
    });

    it('retries on conflict', async () => {
      let attempts = 0;
      const operation = (): AtomicResult<string> => {
        attempts++;
        if (attempts < 3) {
          return { success: false, conflict: true, error: 'conflict' };
        }
        return { success: true, data: 'result' };
      };

      const result = await retryWithBackoff(operation, 3, 1);

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('gives up after max retries', async () => {
      const operation = (): AtomicResult<string> => {
        return { success: false, conflict: true, error: 'conflict' };
      };

      const result = await retryWithBackoff(operation, 2, 1);

      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
    });

    it('does not retry non-conflict errors', async () => {
      let attempts = 0;
      const operation = (): AtomicResult<string> => {
        attempts++;
        return { success: false, error: 'other error' };
      };

      const result = await retryWithBackoff(operation, 3, 1);

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
    });
  });

  describe('readModifyWrite', () => {
    it('creates new value from null', async () => {
      const result = await readModifyWrite<number>(
        'counter',
        (current) => (current ?? 0) + 1
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
    });

    it('modifies existing value', async () => {
      // Set initial value
      writeVersioned('counter', 5, 0);

      const result = await readModifyWrite<number>(
        'counter',
        (current) => (current ?? 0) + 1
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(6);
    });

    it('handles complex modifications', async () => {
      interface State {
        items: string[];
        count: number;
      }

      const initial: State = { items: ['a'], count: 1 };
      writeVersioned('state', initial, 0);

      const result = await readModifyWrite<State>(
        'state',
        (current) => {
          const state = current ?? { items: [], count: 0 };
          return {
            items: [...state.items, 'b'],
            count: state.count + 1,
          };
        }
      );

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual(['a', 'b']);
      expect(result.data?.count).toBe(2);
    });
  });
});
