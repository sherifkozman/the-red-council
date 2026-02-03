import demoEventsRaw from '@/data/demo-events.json';
import { DemoData, DemoDataSchema, AgentEventSchema, DemoDataValidationError } from './demoData';

// Valid UUID v4
export const DEMO_SESSION_ID = '12345678-1234-4123-8123-1234567890ab';
export const MAX_EVENTS = 5000;

/**
 * Checks if an error is an AbortError.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Processes raw demo data, validating it and updating timestamps.
 * NOTE: Timestamps are normalized to UTC ISO strings relative to the current time.
 * NOTE: session_id is overwritten with DEMO_SESSION_ID for all events.
 */
export function processDemoData(raw: unknown): DemoData {
  // Validate raw data against schema to ensure type safety
  const parseResult = DemoDataSchema.safeParse(raw);

  if (!parseResult.success) {
    throw new DemoDataValidationError(parseResult.error);
  }

  const data = parseResult.data;
  
  if (data.events.length > MAX_EVENTS) {
    throw new Error(`Demo data exceeds maximum events (${MAX_EVENTS})`);
  }
  
  if (data.events.length === 0) {
    return data;
  }

  // Rewrite timestamps to be relative to now
  // We want the last event to be "just now" to make the demo feel live
  const now = new Date();
  const lastEventTime = new Date(data.events[data.events.length - 1].timestamp).getTime();
  const timeOffset = now.getTime() - lastEventTime;

  const events = data.events.map((event, index) => {
    const modified = {
      ...event,
      timestamp: new Date(new Date(event.timestamp).getTime() + timeOffset).toISOString(),
      session_id: DEMO_SESSION_ID
    };
    
    // Re-validate to ensure mutation didn't break schema contracts
    const result = AgentEventSchema.safeParse(modified);
    if (!result.success) {
      throw new Error(`Event validation failed at index ${index} (id: ${event.id}): ${result.error.message}`);
    }
    return result.data;
  });

  return {
    ...data,
    events,
    evaluation: data.evaluation
  };
}

/**
 * Loads the demo session data with simulated latency.
 * Supports cancellation via AbortSignal.
 * 
 * @throws {DemoDataValidationError} When JSON schema validation fails
 * @throws {Error} When event count exceeds MAX_EVENTS or re-validation fails
 * @throws {DOMException} When aborted (name: 'AbortError')
 */
export async function loadDemoData(signal?: AbortSignal): Promise<DemoData> {
  // Simulate network latency to test loading states
  await new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }

    const timer = setTimeout(resolve, 800);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

  try {
    return processDemoData(demoEventsRaw);
  } catch (error) {
    // Re-throw to ensure caller handles it
    // Logic here could be expanded to log to analytics
    throw error;
  }
}