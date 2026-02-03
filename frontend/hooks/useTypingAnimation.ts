"use client";

import { useState, useEffect, useRef } from "react";

interface UseTypingAnimationOptions {
  text: string;
  speed?: number; // ms per character
  startDelay?: number;
  onComplete?: () => void;
  enabled?: boolean;
}

export function useTypingAnimation({
  text,
  speed = 30,
  startDelay = 0,
  onComplete,
  enabled = true,
}: UseTypingAnimationOptions) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setDisplayedText(text);
      setIsComplete(true);
      onComplete?.();
      return;
    }

    setDisplayedText("");
    setIsComplete(false);
    indexRef.current = 0;

    const startTyping = () => {
      setIsTyping(true);

      const typeNextChar = () => {
        if (indexRef.current < text.length) {
          setDisplayedText(text.slice(0, indexRef.current + 1));
          indexRef.current++;
          timeoutRef.current = setTimeout(typeNextChar, speed);
        } else {
          setIsTyping(false);
          setIsComplete(true);
          onComplete?.();
        }
      };

      typeNextChar();
    };

    timeoutRef.current = setTimeout(startTyping, startDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, startDelay, onComplete, enabled]);

  const skipToEnd = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setDisplayedText(text);
    setIsTyping(false);
    setIsComplete(true);
    onComplete?.();
  };

  return { displayedText, isTyping, isComplete, skipToEnd };
}
