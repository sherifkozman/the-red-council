// frontend/hooks/useArenaState.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ArenaState, SSEEvent } from "@/lib/types";

export function useArenaState(runId: string | null) {
  const [state, setState] = useState<ArenaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback((id: string) => {
    // 1. Force close any existing connection before re-opening
    if (eventSourceRef.current) {
      console.log(`Closing existing stream for run ${id}`);
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsComplete(false);
    setError(null);

    const url = `http://localhost:8000/runs/${id}/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        // 2. Wrap parsing in try/catch for robustness
        const payload: SSEEvent = JSON.parse(event.data);
        
        // 3. Validate payload structure
        if (!payload || typeof payload !== 'object' || !payload.type) {
          console.warn("Received malformed SSE payload:", payload);
          return;
        }

        switch (payload.type) {
          case "event":
            if (payload.data) {
              setState(payload.data);
            }
            break;
          case "complete":
            setIsComplete(true);
            es.close();
            break;
          case "error":
            setError(payload.error || "An unknown error occurred during execution.");
            es.close();
            break;
          case "timeout":
            setError("Tactical uplink timed out. System state preserved.");
            es.close();
            break;
          default:
            console.debug("Received unhandled SSE event type:", payload.type);
        }
      } catch (err) {
        console.error("Critical: Failed to parse SSE event data:", err);
      }
    };

    es.onerror = () => {
      // 4. Handle connection errors - don't just log, update UI
      console.error("SSE stream uplink severed.");
      setError("Tactical uplink severed. Reconnecting...");
      es.close();
    };
  }, []);

  useEffect(() => {
    if (runId) {
      connect(runId);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [runId, connect]);

  return { state, error, isComplete };
}
