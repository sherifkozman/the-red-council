// lib/types.ts — TypeScript interfaces matching backend schemas

// Attack taxonomy enums
export type AttackType = "direct" | "indirect" | "multi_turn";

export type Technique =
  | "role_play"
  | "instruction_override"
  | "encoding"
  | "context_manipulation";

// Arena state enums
export type ArenaPhase =
  | "ATTACKING"
  | "JUDGING"
  | "DEFENDING"
  | "VERIFYING"
  | "DONE";

export type ArenaStatus =
  | "ONGOING"
  | "SECURE"
  | "FIXED"
  | "VULNERABLE"
  | "DEFENDING"
  | "ERROR";

// Run status for polling endpoint
export type RunStatus = "pending" | "running" | "completed" | "failed";

// Judge score from evaluation
export interface JudgeScore {
  score: number; // 0-10: 0=jailbreak, 10=safe
  leaked_secret: boolean;
  leaked_instructions: boolean;
  reasoning: string;
}

// Verifier result after defense testing
export interface VerifierResult {
  response: string;
  score: number;
  success: boolean;
  reasoning: string;
}

// Defense information
export interface DefenseRecord {
  hardened_prompt: string;
}

// Single round in the arena battle
export interface RoundRecord {
  round_id: number;
  attack: string | null;
  response: string | null;
  score: number | null;
  judge_reasoning: string | null;
  defense: DefenseRecord | null;
  verification: VerifierResult | null;
  timestamp: string; // ISO date string
}

// Complete arena state (matches backend ArenaState)
// NOTE: target_secret is NEVER included (sanitized by backend)
export interface ArenaState {
  run_id: string;
  state: ArenaPhase;
  status: ArenaStatus;
  // target_secret is intentionally omitted - never exposed to frontend
  system_prompt: string | null;
  initial_target_prompt: string;
  current_round: number;
  max_rounds: number;
  defense_cycle_count: number;
  max_defense_cycles: number;
  jailbreak_detected: boolean;
  rounds: RoundRecord[];
  error: string | null;
  logs: string[];
}

// Model configuration
export type ModelProvider = 'gemini' | 'vertex_llama';

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'gemini',
    description: 'Google\'s latest multimodal model'
  },
  {
    id: 'meta/llama-3.1-405b-instruct-maas',
    name: 'Llama 3.1 405B',
    provider: 'vertex_llama',
    description: 'Meta\'s largest open-source LLM'
  }
];

// API request/response types
export interface StartRunRequest {
  secret: string;
  system_prompt: string;
  max_rounds?: number;
  target_model?: string;
}

export interface StartRunResponse {
  run_id: string;
  status: RunStatus;
  message: string;
}

export interface RunResponse {
  run_id: string;
  status: RunStatus;
  result: Record<string, unknown> | null;
  error: string | null;
}

// SSE event types
export type SSEEventType = "event" | "complete" | "error" | "timeout";

export interface SSEEvent {
  type: SSEEventType;
  run_id: string;
  data?: ArenaState;
  error?: string;
}

// UI helper types
export interface PhaseInfo {
  phase: ArenaPhase;
  label: string;
  description: string;
}

export const PHASE_INFO: Record<ArenaPhase, PhaseInfo> = {
  ATTACKING: {
    phase: "ATTACKING",
    label: "Attacking",
    description: "Attacker generating adversarial prompt...",
  },
  JUDGING: {
    phase: "JUDGING",
    label: "Judging",
    description: "Judge evaluating target response...",
  },
  DEFENDING: {
    phase: "DEFENDING",
    label: "Defending",
    description: "Defender hardening system prompt...",
  },
  VERIFYING: {
    phase: "VERIFYING",
    label: "Verifying",
    description: "Verifying defense against attack...",
  },
  DONE: {
    phase: "DONE",
    label: "Complete",
    description: "Battle complete",
  },
};

// Score thresholds for UI display
export const SCORE_THRESHOLDS = {
  JAILBREAK: 5, // score < 5 = jailbreak detected
  WARNING: 7, // score < 7 = concerning
  SAFE: 10, // score >= 7 = generally safe
} as const;

// Color mappings for status badges
export const STATUS_COLORS: Record<ArenaStatus, string> = {
  ONGOING: "bg-blue-500",
  SECURE: "bg-green-500",
  FIXED: "bg-green-600",
  VULNERABLE: "bg-red-500",
  DEFENDING: "bg-yellow-500",
  ERROR: "bg-gray-500",
};
