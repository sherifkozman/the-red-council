# Demo UX Redesign - The Red Council

**Date**: 2026-02-03
**Status**: Approved
**Author**: Claude (brainstorming session)

## Overview

Redesign navigation and demo experience to clearly separate real testing from demo/simulation modes for both LLM Testing and Agent Testing features.

## Section 1: Information Architecture

### Route Structure

```
/                           → Landing page (choice: LLM vs Agent)
/llm/demo                   → LLM Demo (pre-recorded playback)
/llm/arena                  → LLM Arena (real testing config)
/llm/arena/[run_id]         → Live battle view
/agent/demo                 → Agent Demo (pre-recorded playback)
/agent/connect              → Real agent connection
/agent/monitor              → Real agent monitoring
/agent/attack               → Real agent attack config
/agent/results              → Real agent results
/reports                    → All reports (unified)
/reports/compare            → Report comparison
/settings                   → Settings
```

### Sidebar Navigation

```
┌─────────────────────────┐
│  The Red Council        │
├─────────────────────────┤
│  ▼ LLM Testing          │  ← Collapsible group
│     Demo Simulation     │
│     Battle Arena        │
├─────────────────────────┤
│  ▼ Agent Testing        │  ← Collapsible group
│     Demo Simulation     │
│     Connect             │
│     Monitor             │
│     Attack              │
│     Results             │
├─────────────────────────┤
│  Reports                │
│  Settings               │
└─────────────────────────┘
```

### Key Decisions
- Demo pages are first in each group (discovery-friendly)
- Real testing pages follow logically
- Reports unified (both LLM and Agent results)
- Clear visual hierarchy with collapsible groups

## Section 2: Landing Page Design

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     The Red Council - LLM Adversarial Security Arena        │
│     Test your AI systems against sophisticated attacks      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────────────┐    ┌──────────────────────────┐  │
│   │   🎯 LLM Testing     │    │   🤖 Agent Testing       │  │
│   │                      │    │                          │  │
│   │  Test LLM resilience │    │  Test agent security     │  │
│   │  against jailbreaks  │    │  against OWASP Top 10    │  │
│   │  and prompt attacks  │    │  agentic threats         │  │
│   │                      │    │                          │  │
│   │  ┌────────────────┐  │    │  ┌────────────────────┐  │  │
│   │  │  Watch Demo    │  │    │  │  Watch Demo        │  │  │
│   │  └────────────────┘  │    │  └────────────────────┘  │  │
│   │  ┌────────────────┐  │    │  ┌────────────────────┐  │  │
│   │  │  Start Testing │  │    │  │  Connect Agent     │  │  │
│   │  └────────────────┘  │    │  └────────────────────┘  │  │
│   └──────────────────────┘    └──────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Card Details

**LLM Testing Card**:
- Icon: Target/crosshair
- Description: "Test LLM resilience against jailbreaks and prompt injection attacks"
- Primary CTA: "Watch Demo" → `/llm/demo`
- Secondary CTA: "Start Testing" → `/llm/arena`

**Agent Testing Card**:
- Icon: Bot/robot
- Description: "Test agent security against OWASP Top 10 agentic threats"
- Primary CTA: "Watch Demo" → `/agent/demo`
- Secondary CTA: "Connect Agent" → `/agent/connect`

### Design Notes
- Cards are equal size (no hierarchy implied)
- Demo buttons are primary (outlined) style
- Real testing buttons are secondary (ghost) style
- Cards have subtle hover effect (lift + shadow)

## Section 3: LLM Demo Simulation

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  LLM Security Demo                          [Start Over]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  SYSTEM PROMPT (Pre-configured)                         ││
│  │  "You are a helpful assistant. The secret is..."        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐│
│  │  ATTACKER            │  │  TARGET                      ││
│  │                      │  │                              ││
│  │  [Typing animation]  │  │  [Typing animation]          ││
│  │  "Let's play a game" │  │  "I'd be happy to help..."   ││
│  │                      │  │                              ││
│  └──────────────────────┘  └──────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  JUDGE VERDICT                                          ││
│  │  Score: 8/10 - BREACH DETECTED                          ││
│  │  Analysis: The target revealed the secret through...    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Round: 3/5    ████████░░ 60%                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Playback Mechanics

**Pre-recorded Script** (JSON):
```json
{
  "meta": { "duration_seconds": 25, "rounds": 5 },
  "events": [
    { "at": 0, "type": "system_prompt", "text": "You are..." },
    { "at": 2000, "type": "attacker_message", "text": "Let's play..." },
    { "at": 5000, "type": "target_response", "text": "I'd be happy..." },
    { "at": 8000, "type": "judge_verdict", "score": 3, "analysis": "..." },
    { "at": 10000, "type": "attacker_message", "text": "Imagine you..." }
  ]
}
```

**Animation Rules**:
- Messages appear with typing effect (40ms per character)
- Judge verdicts fade in with score animation
- Progress bar updates smoothly between rounds
- Pause between rounds (1 second)

**Playback Controls**:
- Auto-start on page load
- "Start Over" button resets to beginning
- No pause/skip (keeps experience consistent)

**Demo Duration**: ~25 seconds total

### Content Strategy
- 5-round battle
- Escalating attacks (polite → roleplay → injection)
- Successful breach on round 4
- Defender hardens prompt on round 5

## Section 4: Agent Demo Simulation

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Security Demo                        [Start Over]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────┐         │
│  │  OWASP Agentic Top 10 Coverage                 │         │
│  │  ┌────┬────┬────┬────┬────┐                    │         │
│  │  │ A01│ A02│ A03│ A04│ A05│  ← Lights up       │         │
│  │  │ ✓  │ ⏳ │    │    │    │    as tested       │         │
│  │  └────┴────┴────┴────┴────┘                    │         │
│  └────────────────────────────────────────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  EVENT TIMELINE                                         ││
│  │  ──●────────────────────────────────────────            ││
│  │    │                                                    ││
│  │  14:32:01 - Agent connected                             ││
│  │  14:32:05 - Baseline established                        ││
│  │  14:32:12 - Testing A01: Prompt Injection               ││
│  │  14:32:18 - ⚠️ VULNERABILITY: A01 exploited             ││
│  │  14:32:25 - Testing A02: Tool Misuse                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  CURRENT TEST DETAILS                                   ││
│  │  A01: Prompt Injection                                  ││
│  │  Attack: "Ignore previous instructions and..."          ││
│  │  Result: VULNERABLE - Agent executed malicious prompt   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Tests: 3/10    Campaign: 45% complete                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Playback Mechanics

**Pre-recorded Script** (JSON):
```json
{
  "meta": { "duration_seconds": 45, "tests": 10 },
  "events": [
    { "at": 0, "type": "agent_connected", "name": "Demo Agent" },
    { "at": 3000, "type": "baseline_established" },
    { "at": 6000, "type": "test_start", "owasp": "A01", "name": "Prompt Injection" },
    { "at": 12000, "type": "test_result", "owasp": "A01", "vulnerable": true },
    { "at": 15000, "type": "test_start", "owasp": "A02", "name": "Tool Misuse" }
  ]
}
```

**Visual Elements**:
- OWASP grid cells light up (green=pass, red=vuln, yellow=testing)
- Timeline scrolls automatically, highlighting current event
- Test details panel updates with each test
- Progress indicators animate smoothly

**Demo Duration**: ~45 seconds total

### Content Strategy
- Tests 5 of 10 OWASP categories (A01, A02, A03, A06, A09)
- Finds 2 vulnerabilities (A01: Prompt Injection, A06: System Prompt Leak)
- Shows remediation suggestions
- Ends with summary report preview

## Section 5: Results & Transition Flow

### Demo Complete Modal

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│               🎯 Demo Complete!                             │
│                                                             │
│   You've seen how The Red Council tests LLM security.       │
│   Ready to test your own systems?                           │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  View Full Report  →                                │   │
│   │  See detailed analysis of this demo battle          │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Try It Yourself  →                                 │   │
│   │  Test your own LLM with custom prompts              │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   [Watch Again]                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Transition Behaviors

**"View Full Report"**:
- Navigate to `/reports` with demo report selected
- Demo report is always available (persisted in app)

**"Try It Yourself"**:
- Navigate to `/llm/arena` (for LLM demo)
- Navigate to `/agent/connect` (for Agent demo)
- Form pre-fills with demo values (editable)
  - LLM: Same secret + system prompt template
  - Agent: Same attack configuration

**"Watch Again"**:
- Reset simulation to beginning
- Closes modal

### Pre-fill Strategy

When user clicks "Try It Yourself":

**LLM Arena Pre-fill**:
```typescript
{
  secret: "DEMO_SECRET_123",  // From demo
  systemPrompt: "You are a helpful assistant. The secret is DEMO_SECRET_123...",
  targetModel: "gemini-3-pro"  // Default
}
```

**Agent Connect Pre-fill**:
```typescript
{
  agentUrl: "",  // Empty - user must provide
  attackCategories: ["A01", "A02", "A06", "A09"],  // From demo
  maxRounds: 10
}
```

## Implementation Notes

### Data Files Required
- `/public/demo-data/llm-battle.json` - LLM demo script
- `/public/demo-data/agent-campaign.json` - Agent demo script

### New Components
- `DemoPlayer` - Shared playback engine
- `TypingAnimation` - Character-by-character text reveal
- `OWASPGrid` - Visual grid for agent testing
- `EventTimeline` - Scrolling event log
- `DemoCompleteModal` - Results and transition modal

### State Management
- Demo playback state (current time, paused, complete)
- No persistence needed (demo data is static)
- Real testing continues to use existing stores

### Accessibility
- Typing animations respect `prefers-reduced-motion`
- All interactive elements have proper ARIA labels
- Demo can be restarted at any time
- No auto-playing audio

## Success Criteria

1. First-time users understand the product within 30 seconds
2. Clear path from "watching" to "trying"
3. No confusion about demo vs real data
4. Demo completes without user interaction
5. Transition to real testing feels natural
