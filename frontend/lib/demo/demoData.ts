import { z } from 'zod';

// Zod schemas mirroring src/core/agent_schemas.py

export const AgentEventType = {
  TOOL_CALL: 'tool_call',
  MEMORY_ACCESS: 'memory_access',
  ACTION: 'action',
  SPEECH: 'speech',
  DIVERGENCE: 'divergence',
} as const;

export type AgentEventType = typeof AgentEventType[keyof typeof AgentEventType];

// CONSTANTS for Security Limits
const MAX_STRING_LENGTH = 10000;
const MAX_ARRAY_LENGTH = 100;
const MAX_NESTED_ITEMS = 50;

const BaseAgentEventSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  timestamp: z.string().datetime(), // ISO 8601 string
});

export const ToolCallEventSchema = BaseAgentEventSchema.extend({
  event_type: z.literal(AgentEventType.TOOL_CALL),
  tool_name: z.string().max(256),
  // WARNING: 'arguments' contains untrusted input. keys/values must be treated with caution.
  // Potential Prototype Pollution risk if used with Object.assign/spread.
  arguments: z.record(z.unknown()), 
  result: z.unknown().optional(),
  duration_ms: z.number().min(0),
  success: z.boolean(),
  exception_type: z.string().max(256).optional().nullable(),
});

export const MemoryAccessEventSchema = BaseAgentEventSchema.extend({
  event_type: z.literal(AgentEventType.MEMORY_ACCESS),
  operation: z.enum(['read', 'write', 'delete']),
  key: z.string().max(256),
  // WARNING: 'value_preview' is untrusted user input. Must be sanitized before rendering.
  value_preview: z.string().max(MAX_STRING_LENGTH).optional().nullable(),
  sensitive_detected: z.boolean(),
  success: z.boolean(),
  exception_type: z.string().max(256).optional().nullable(),
});

export const ActionRecordSchema = BaseAgentEventSchema.extend({
  event_type: z.literal(AgentEventType.ACTION),
  action_type: z.string().max(64),
  description: z.string().max(MAX_STRING_LENGTH),
  target: z.string().max(500),
  related_tool_calls: z.array(z.string().uuid()).max(MAX_NESTED_ITEMS).optional(),
});

export const SpeechRecordSchema = BaseAgentEventSchema.extend({
  event_type: z.literal(AgentEventType.SPEECH),
  // WARNING: 'content' is untrusted user input (LLM output). Must be sanitized before rendering (XSS risk).
  content: z.string().max(MAX_STRING_LENGTH),
  intent: z.string().max(500).optional().nullable(),
  is_response_to_user: z.boolean(),
});

export const DivergenceEventSchema = BaseAgentEventSchema.extend({
  event_type: z.literal(AgentEventType.DIVERGENCE),
  speech_intent: z.string().max(500),
  actual_action: z.string().max(1000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  explanation: z.string().max(2000),
  confidence_score: z.number().min(0).max(1),
});

export const AgentEventSchema = z.discriminatedUnion('event_type', [
  ToolCallEventSchema,
  MemoryAccessEventSchema,
  ActionRecordSchema,
  SpeechRecordSchema,
  DivergenceEventSchema,
]);

// Evaluation Types
export const OWASPAgenticRisk = z.enum([
  'ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05',
  'ASI06', 'ASI07', 'ASI08', 'ASI09', 'ASI10'
]);

export const OWASP_AGENTIC_RISK_LABELS: Record<z.infer<typeof OWASPAgenticRisk>, string> = {
  ASI01: 'Prompt Injection',
  ASI02: 'Insecure Output Handling',
  ASI03: 'Training Data Poisoning',
  ASI04: 'Model Denial of Service',
  ASI05: 'Supply Chain Vulnerabilities',
  ASI06: 'Sensitive Information Disclosure',
  ASI07: 'Insecure Plugin Design',
  ASI08: 'Excessive Agency',
  ASI09: 'Over-reliance',
  ASI10: 'Model Theft',
};

// Plain language descriptions for accessibility (aria-description, tooltips)
export const OWASP_AGENTIC_RISK_DESCRIPTIONS: Record<z.infer<typeof OWASPAgenticRisk>, string> = {
  ASI01: 'The model can be tricked by crafted prompts into ignoring its instructions or leaking data.',
  ASI02: 'The system may output content that is not safely handled or validated before use.',
  ASI03: 'Training data may be manipulated to change model behavior in harmful ways.',
  ASI04: 'The model can be overloaded or misused to degrade availability or performance.',
  ASI05: 'Dependencies and plugins used by the agent may introduce security weaknesses.',
  ASI06: 'The agent may expose or infer sensitive or personal information.',
  ASI07: 'Tools or plugins integrated with the agent may be designed or used insecurely.',
  ASI08: 'The agent has too much autonomous control and can act beyond intended scope.',
  ASI09: 'Users or systems may rely too heavily on the agent without appropriate oversight.',
  ASI10: 'The model or its parameters may be stolen or exfiltrated.',
};

export const AGENT_EVENT_TYPE_LABELS: Record<AgentEventType, string> = {
  tool_call: 'Tool call',
  memory_access: 'Memory access',
  action: 'Action',
  speech: 'Speech',
  divergence: 'Divergence',
};

export const DIVERGENCE_SEVERITY_LABELS: Record<z.infer<typeof DivergenceEventSchema>['severity'], string> = {
  LOW: 'Low severity',
  MEDIUM: 'Medium severity',
  HIGH: 'High severity',
};

export function getRiskBand(score: number): 'Low' | 'Medium' | 'High' {
  if (score <= 3) return 'Low';
  if (score <= 7) return 'Medium';
  return 'High';
}

export const ViolationResultSchema = z.object({
  detected: z.boolean(),
  severity: z.number().min(1).max(10),
  evidence: z.string().max(2000),
  recommendation: z.string().max(1000),
  owasp_category: OWASPAgenticRisk,
});

export const AgentJudgeScoreSchema = z.object({
  base_score: z.object({
    score: z.number(),
    reasoning: z.string().max(5000),
  }),
  owasp_violations: z.array(ViolationResultSchema).max(MAX_ARRAY_LENGTH),
  tool_abuse_score: z.number().min(0).max(10),
  tool_abuse_details: z.string().max(1000),
  memory_safety_score: z.number().min(0).max(10),
  memory_safety_details: z.string().max(1000),
  divergence_count: z.number().min(0),
  divergence_examples: z.array(DivergenceEventSchema).max(10), // Limit examples
  overall_agent_risk: z.number().min(0).max(10),
  recommendations: z.array(z.string().max(500)).max(MAX_ARRAY_LENGTH),
});

export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type MemoryAccessEvent = z.infer<typeof MemoryAccessEventSchema>;
export type ActionRecord = z.infer<typeof ActionRecordSchema>;
export type SpeechRecord = z.infer<typeof SpeechRecordSchema>;
export type DivergenceEvent = z.infer<typeof DivergenceEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentJudgeScore = z.infer<typeof AgentJudgeScoreSchema>;

export const DemoDataSchema = z.object({
  events: z.array(AgentEventSchema),
  evaluation: AgentJudgeScoreSchema.optional(),
  metadata: z.object({
    generated_at: z.string(),
    description: z.string().max(500),
    scenario: z.string().max(100),
  }),
});

export type DemoData = z.infer<typeof DemoDataSchema>;

export class DemoDataValidationError extends Error {
  constructor(public zodError: z.ZodError) {
    super('Demo data validation failed');
    this.name = 'DemoDataValidationError';
  }
}
