/**
 * OWASP Agentic Top 10 categories and their descriptions.
 * Reference: https://owasp.org/www-project-top-10-for-large-language-model-applications/
 */

export interface OWASPCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  shortDescription: string;
}

export const OWASP_CATEGORIES: OWASPCategory[] = [
  {
    id: 'ASI01',
    code: 'ASI01',
    name: 'Excessive Agency',
    description:
      'When an AI agent is granted capabilities that go beyond what is necessary for its intended purpose, it can take actions that are unintended, harmful, or violate user trust.',
    shortDescription: 'Agent has more capabilities than needed',
  },
  {
    id: 'ASI02',
    code: 'ASI02',
    name: 'Inadequate Oversight',
    description:
      'Insufficient human oversight or confirmation mechanisms before the agent takes impactful actions, leading to unreviewed or unauthorized operations.',
    shortDescription: 'Insufficient human oversight',
  },
  {
    id: 'ASI03',
    code: 'ASI03',
    name: 'Vulnerable Integrations',
    description:
      'Insecure connections to external tools, APIs, or services that can be exploited to compromise the agent or leak sensitive data.',
    shortDescription: 'Insecure external connections',
  },
  {
    id: 'ASI04',
    code: 'ASI04',
    name: 'Prompt Injection',
    description:
      'Malicious instructions embedded in data sources that the agent processes, causing it to deviate from its intended behavior.',
    shortDescription: 'Malicious instructions in data',
  },
  {
    id: 'ASI05',
    code: 'ASI05',
    name: 'Improper Authorization',
    description:
      'Failure to properly verify that the agent has appropriate permissions before performing actions on behalf of users or systems.',
    shortDescription: 'Missing permission checks',
  },
  {
    id: 'ASI06',
    code: 'ASI06',
    name: 'Data Disclosure',
    description:
      'Unintended exposure of sensitive information through agent responses, tool outputs, or logging mechanisms.',
    shortDescription: 'Sensitive data exposure',
  },
  {
    id: 'ASI07',
    code: 'ASI07',
    name: 'Insecure Memory',
    description:
      'Vulnerabilities in how the agent stores and retrieves information across sessions, potentially allowing memory injection or poisoning attacks.',
    shortDescription: 'Memory injection/poisoning',
  },
  {
    id: 'ASI08',
    code: 'ASI08',
    name: 'Goal Misalignment',
    description:
      'The agent pursues objectives that differ from the intended goals, potentially due to manipulation or flawed reward signals.',
    shortDescription: 'Agent pursues wrong objectives',
  },
  {
    id: 'ASI09',
    code: 'ASI09',
    name: 'Weak Guardrails',
    description:
      'Safety mechanisms that can be bypassed, disabled, or circumvented through creative prompting or exploitation.',
    shortDescription: 'Bypassable safety mechanisms',
  },
  {
    id: 'ASI10',
    code: 'ASI10',
    name: 'Over-Trust in LLMs',
    description:
      'Blindly trusting LLM outputs without verification, leading to acceptance of hallucinations or manipulated responses.',
    shortDescription: 'Unverified LLM outputs',
  },
];

/**
 * Map from OWASP code to category for quick lookup
 */
export const OWASP_CATEGORY_MAP: Record<string, OWASPCategory> = Object.fromEntries(
  OWASP_CATEGORIES.map((cat) => [cat.code, cat])
);

/**
 * Display names for OWASP categories (code + short name)
 */
export const OWASP_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  OWASP_CATEGORIES.map((cat) => [cat.code, `${cat.code} - ${cat.name}`])
);

/**
 * Source types for attack templates
 */
export type TemplateSource = 'HarmBench' | 'PyRIT' | 'garak' | 'AgentDojo' | 'InjecAgent' | 'Custom';

export const TEMPLATE_SOURCES: TemplateSource[] = [
  'HarmBench',
  'PyRIT',
  'garak',
  'AgentDojo',
  'InjecAgent',
  'Custom',
];

/**
 * Source display configuration
 */
export const SOURCE_CONFIG: Record<TemplateSource, { label: string; color: string }> = {
  HarmBench: { label: 'HarmBench', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  PyRIT: { label: 'PyRIT', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  garak: { label: 'garak', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  AgentDojo: { label: 'AgentDojo', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  InjecAgent: { label: 'InjecAgent', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  Custom: { label: 'Custom', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' },
};

/**
 * Attack template interface matching backend schema
 */
export interface AttackTemplate {
  id: string;
  prompt: string;
  expected_behavior: string;
  severity: number;
  owasp_categories: string[];
  requires_tool_access: boolean;
  requires_memory_access: boolean;
  source: TemplateSource;
}

/**
 * Validate template ID format
 */
const VALID_TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_\-.]{1,128}$/;

export function isValidTemplateId(id: string): boolean {
  return VALID_TEMPLATE_ID_PATTERN.test(id);
}

/**
 * Sanitize template ID - replace invalid characters
 */
export function sanitizeTemplateId(id: string): string {
  const sanitized = id.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 128);
  return sanitized || 'unknown';
}

/**
 * Get severity color class based on severity level
 */
export function getSeverityColor(severity: number): string {
  if (severity >= 8) return 'text-red-600 dark:text-red-400';
  if (severity >= 5) return 'text-orange-600 dark:text-orange-400';
  if (severity >= 3) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

/**
 * Get severity badge variant
 */
export function getSeverityBadgeVariant(severity: number): 'destructive' | 'secondary' | 'outline' {
  if (severity >= 7) return 'destructive';
  if (severity >= 4) return 'secondary';
  return 'outline';
}
