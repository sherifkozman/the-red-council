import { describe, it, expect } from 'vitest';
import { loadDemoData, processDemoData, DEMO_SESSION_ID, MAX_EVENTS, isAbortError } from './loadDemoSession';
import { DemoDataSchema, DemoDataValidationError } from './demoData';

describe('loadDemoSession', () => {
  it('loads valid demo data matching the schema', async () => {
    const data = await loadDemoData();
    const result = DemoDataSchema.safeParse(data);
    if (!result.success) {
      console.error(JSON.stringify(result.error, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('updates timestamps to be relative to now', async () => {
    const data = await loadDemoData();
    const lastEvent = data.events[data.events.length - 1];
    const lastEventTime = new Date(lastEvent.timestamp).getTime();
    const now = Date.now();
    
    // Should be within 2 seconds of now (allowing for execution time)
    expect(Math.abs(now - lastEventTime)).toBeLessThan(2000);
  });

  it('sets the correct session ID for all events', async () => {
    const data = await loadDemoData();
    data.events.forEach(event => {
      expect(event.session_id).toBe(DEMO_SESSION_ID);
    });
  });

  it('includes evaluation data', async () => {
    const data = await loadDemoData();
    expect(data.evaluation).toBeDefined();
    expect(data.evaluation?.overall_agent_risk).toBeGreaterThan(0);
    expect(data.evaluation?.owasp_violations.length).toBeGreaterThan(0);
  });

  it('preserves event order', async () => {
    const data = await loadDemoData();
    for (let i = 1; i < data.events.length; i++) {
      const prev = new Date(data.events[i-1].timestamp).getTime();
      const curr = new Date(data.events[i].timestamp).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('supports abort signal', async () => {
    const controller = new AbortController();
    const promise = loadDemoData(controller.signal);
    controller.abort();
    try {
      await promise;
    } catch (error) {
      expect(isAbortError(error)).toBe(true);
    }
  });

  it('isAbortError identifies DOMException AbortError', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('Aborted'))).toBe(false);
    expect(isAbortError('Aborted')).toBe(false);
  });

  describe('processDemoData', () => {
    it('throws DemoDataValidationError on invalid schema', () => {
      const invalidData = { events: 'not-an-array' };
      expect(() => processDemoData(invalidData)).toThrow(DemoDataValidationError);
    });

    it('throws error if events exceed limit', () => {
      const manyEvents = Array(MAX_EVENTS + 1).fill({
        id: '00000000-0000-0000-0000-000000000000',
        session_id: '00000000-0000-0000-0000-000000000000',
        timestamp: new Date().toISOString(),
        event_type: 'speech',
        content: 'test',
        is_response_to_user: true
      });
      
      const hugeData = {
        metadata: {
          generated_at: new Date().toISOString(),
          description: 'Huge',
          scenario: 'Test'
        },
        events: manyEvents
      };
      
      expect(() => processDemoData(hugeData)).toThrow(`Demo data exceeds maximum events (${MAX_EVENTS})`);
    });

    it('handles empty events list gracefully', () => {
      const emptyData = {
        metadata: {
          generated_at: new Date().toISOString(),
          description: 'Empty',
          scenario: 'Test'
        },
        events: []
      };
      const result = processDemoData(emptyData);
      expect(result.events).toHaveLength(0);
    });
  });
});