// frontend/hooks/useProgressSync.ts
// Syncs onboarding progress with actual user activity

"use client";

import { useEffect } from "react";
import { useOnboardingStore } from "@/stores/onboarding";
import { useBattleHistoryStore } from "@/stores/battleHistory";
import { useTestingModeStore } from "@/stores/testingMode";

/**
 * Hook that auto-completes onboarding steps based on actual user activity.
 * Should be used in a layout component so it runs globally.
 */
export function useProgressSync() {
  const mode = useTestingModeStore((s) => s.mode);
  const battleHistory = useBattleHistoryStore((s) => s.battles);
  const setStepCompleted = useOnboardingStore((s) => s.setStepCompleted);

  useEffect(() => {
    // Only sync for llm-testing mode
    if (mode !== "llm-testing") return;

    const completedBattles = battleHistory.filter((b) => b.status === "completed");
    const inProgressBattles = battleHistory.filter((b) => b.status === "in_progress");
    const hasBattles = battleHistory.length > 0;

    // Auto-complete steps based on battle history
    if (hasBattles) {
      // If any battle exists, user has at least started configuration
      setStepCompleted("llm-testing", "llm-select-target", true);
      setStepCompleted("llm-testing", "llm-config-attacker", true);
    }

    if (inProgressBattles.length > 0 || completedBattles.length > 0) {
      // Battle was run
      setStepCompleted("llm-testing", "llm-run-battle", true);
    }

    if (completedBattles.length > 0) {
      // At least one battle completed - results available
      setStepCompleted("llm-testing", "llm-review-results", true);
    }
  }, [mode, battleHistory, setStepCompleted]);
}
