"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface DemoEvent {
  at: number;
  type: string;
  [key: string]: unknown;
}

export interface DemoScript<T extends DemoEvent = DemoEvent> {
  meta: {
    duration_ms: number;
    [key: string]: unknown;
  };
  events: T[];
}

interface UseDemoPlaybackOptions<T extends DemoEvent> {
  script: DemoScript<T> | null;
  onEvent?: (event: T) => void;
  onComplete?: () => void;
  autoStart?: boolean;
}

interface UseDemoPlaybackReturn<T extends DemoEvent> {
  currentTime: number;
  isPlaying: boolean;
  isComplete: boolean;
  progress: number;
  currentEvents: T[];
  start: () => void;
  reset: () => void;
}

export function useDemoPlayback<T extends DemoEvent>({
  script,
  onEvent,
  onComplete,
  autoStart = true,
}: UseDemoPlaybackOptions<T>): UseDemoPlaybackReturn<T> {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentEvents, setCurrentEvents] = useState<T[]>([]);

  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const processedEventsRef = useRef<Set<number>>(new Set());

  const duration = script?.meta.duration_ms ?? 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const processEvents = useCallback(
    (time: number) => {
      if (!script) return;

      const newEvents: T[] = [];

      script.events.forEach((event, index) => {
        if (event.at <= time && !processedEventsRef.current.has(index)) {
          processedEventsRef.current.add(index);
          newEvents.push(event);
          onEvent?.(event);
        }
      });

      if (newEvents.length > 0) {
        setCurrentEvents((prev) => [...prev, ...newEvents]);
      }
    },
    [script, onEvent]
  );

  const animate = useCallback(() => {
    if (!startTimeRef.current || !script) return;

    const elapsed = Date.now() - startTimeRef.current;
    setCurrentTime(elapsed);
    processEvents(elapsed);

    if (elapsed >= script.meta.duration_ms) {
      setIsPlaying(false);
      setIsComplete(true);
      onComplete?.();
      return;
    }

    frameRef.current = requestAnimationFrame(animate);
  }, [script, processEvents, onComplete]);

  const start = useCallback(() => {
    if (!script) return;

    startTimeRef.current = Date.now();
    processedEventsRef.current.clear();
    setCurrentEvents([]);
    setCurrentTime(0);
    setIsComplete(false);
    setIsPlaying(true);
  }, [script]);

  const reset = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
    startTimeRef.current = null;
    processedEventsRef.current.clear();
    setCurrentEvents([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsComplete(false);
  }, []);

  // Start animation loop when playing
  useEffect(() => {
    if (isPlaying) {
      frameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Auto-start
  useEffect(() => {
    if (autoStart && script && !isPlaying && !isComplete) {
      start();
    }
  }, [autoStart, script, isPlaying, isComplete, start]);

  return {
    currentTime,
    isPlaying,
    isComplete,
    progress,
    currentEvents,
    start,
    reset,
  };
}
