import { TestingMode } from '@/stores/testingMode'

export interface GuideStep {
  id: string
  title: string
  description: string
}

export const GUIDE_STEPS: Record<TestingMode, GuideStep[]> = {
  'llm-testing': [
    {
      id: 'llm-select-target',
      title: 'Select Target Model',
      description: 'Choose the LLM you want to test against adversarial attacks.',
    },
    {
      id: 'llm-config-attacker',
      title: 'Configure Attacker',
      description: 'Set up the attacker model and prompt strategy.',
    },
    {
      id: 'llm-run-battle',
      title: 'Run Battle',
      description: 'Execute the adversarial test and watch the interaction.',
    },
    {
      id: 'llm-review-results',
      title: 'Review Results',
      description: "Analyze the judge's evaluation and final scores.",
    },
  ],
  'agent-testing': [
    {
      id: 'agent-connect',
      title: 'Connect Your Agent',
      description: 'Use the SDK or configure an HTTP endpoint for your agent.',
    },
    {
      id: 'agent-verify',
      title: 'Verify Connection',
      description: 'Run a connection test to ensure the platform can reach your agent.',
    },
    {
      id: 'agent-select-template',
      title: 'Select Attack Template',
      description: 'Choose one or more templates from the attack library.',
    },
    {
      id: 'agent-run-campaign',
      title: 'Run Campaign',
      description: 'Execute the attack campaign against your agent.',
    },
    {
      id: 'agent-view-results',
      title: 'View Results',
      description: 'Inspect the OWASP coverage grid and detailed report.',
    },
  ],
  'demo-mode': [
    {
      id: 'demo-dashboard',
      title: 'Explore Dashboard',
      description: 'Get an overview of system status and recent activity.',
    },
    {
      id: 'demo-timeline',
      title: 'View Timeline',
      description: 'See how agent events are visualized in chronological order.',
    },
    {
      id: 'demo-tool-chain',
      title: 'Inspect Tool Chain',
      description: 'Analyze how tools are used and detect potential loops.',
    },
    {
      id: 'demo-owasp',
      title: 'Check OWASP Coverage',
      description: 'Review the security posture against the Agentic Top 10.',
    },
  ],
}
