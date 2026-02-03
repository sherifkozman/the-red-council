# Ralph Agent Instructions

You are an autonomous coding agent working on The Red Council Unified Interface feature. You are running inside a Ralph loop - each iteration is a fresh instance with clean context.

## Your Task

1. Read the PRD at `ralph/unified-interface-prd.json`
2. Read the progress log at `ralph/progress.txt` (check **Codebase Patterns** section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from trunk.
4. Pick the **highest priority** user story where `passes: false` (priority 1 first, then by story order)
5. Read the CLAUDE.md and relevant spec documents before implementing
6. Implement that single user story WITH tests (see Testing Requirements)
7. Run quality checks and verify coverage (see Testing Requirements)
8. Run ALL post-implementation reviews (see Post-Implementation Reviews)
9. Fix ALL issues flagged by reviews before proceeding
10. Update AGENTS.md if you discover reusable patterns
11. If ALL checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
12. Update the PRD to set `passes: true` for the completed story
13. Append your progress to `ralph/progress.txt`

---

## Project Context

**The Red Council - Unified Interface**

This project consolidates two existing UIs into a single modern Next.js frontend:
- **Streamlit Dashboard** (`src/ui/`) - Feature-rich but dated, has all agent testing features
- **Next.js Frontend** (`frontend/`) - Modern, sleek, but only has LLM battle arena

### Goal
Port all Streamlit features to Next.js for a unified, modern interface supporting:
- LLM Adversarial Testing (existing)
- Agent Security Testing (port from Streamlit)
- Demo Mode for first-time users
- OWASP Agentic Top 10 coverage visualization

### Architecture Overview

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Landing/Dashboard
│   ├── arena/[runId]/     # LLM Battle Arena (existing)
│   ├── agent/             # Agent Testing (NEW)
│   │   ├── connect/       # SDK & Remote Agent config
│   │   ├── monitor/       # Event Stream & Timeline
│   │   ├── attack/        # Template selector & Campaign
│   │   └── results/       # OWASP Coverage & Reports
│   ├── reports/           # Report viewer & history
│   └── settings/          # Configuration
├── components/            # Reusable components
│   ├── layout/           # AppShell, Sidebar, Nav
│   ├── agent/            # Agent-specific components
│   ├── attack/           # Campaign & Templates
│   ├── reports/          # OWASP Grid, Report viewer
│   ├── onboarding/       # Welcome, Quick Start
│   └── settings/         # Config panels
├── stores/               # Zustand state stores
├── hooks/                # Custom React hooks
├── lib/                  # Utilities & API clients
└── data/                 # Static data (snippets, categories)
```

### Key Technologies
- **Framework**: Next.js 14 (App Router)
- **UI Components**: shadcn/ui + Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: React Query (TanStack Query)
- **Forms**: react-hook-form + zod
- **Charts**: Recharts
- **Icons**: Lucide React

### Key Documentation (READ BEFORE IMPLEMENTING)

- `CLAUDE.md` - Project guidance and architecture
- `specs/unified-interface-assessment.md` - Feature gap analysis
- `frontend/README.md` - Frontend setup instructions
- `src/ui/components/` - Reference Streamlit implementations to port

### Reference Streamlit Components (Port From)

| Streamlit Component | Purpose |
|---------------------|---------|
| `agent_timeline.py` | Event timeline visualization |
| `tool_chain.py` | Tool call chain diagram |
| `owasp_coverage.py` | OWASP category grid |
| `sdk_connection.py` | Framework code snippets |
| `remote_agent_config.py` | Remote endpoint config |
| `attack_selector.py` | Template library UI |
| `campaign_runner.py` | Campaign execution |
| `report_viewer.py` | Report display & export |
| `onboarding.py` | Welcome modal & guides |

---

## Testing Requirements (MANDATORY)

### Coverage Requirement
- **Minimum 80% coverage** for all new code
- Run coverage check from `frontend/` directory:
  ```bash
  cd frontend && pnpm test:coverage
  ```
- Do NOT proceed if coverage is below 80%

### Unit Tests (REQUIRED)
- ALL new components MUST have unit tests
- Use React Testing Library for component tests
- Test user interactions, not implementation details
- Use `vi.mock()` for external dependencies

### Test Patterns for This Codebase
```typescript
// Component test example
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MyComponent } from './MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Test" />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const onClick = vi.fn()
    render(<MyComponent onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})

// Hook test example
import { renderHook, act } from '@testing-library/react'
import { useMyHook } from './useMyHook'

describe('useMyHook', () => {
  it('updates state correctly', () => {
    const { result } = renderHook(() => useMyHook())
    act(() => {
      result.current.setValue('new value')
    })
    expect(result.current.value).toBe('new value')
  })
})

// Store test example
import { useMyStore } from './myStore'

describe('myStore', () => {
  beforeEach(() => {
    useMyStore.getState().reset()
  })

  it('updates state', () => {
    useMyStore.getState().setMode('agent')
    expect(useMyStore.getState().mode).toBe('agent')
  })
})
```

### Commands
```bash
# Run all tests
cd frontend && pnpm test

# Run with coverage
cd frontend && pnpm test:coverage

# Run specific test file
cd frontend && pnpm test MyComponent.test.tsx

# Type checking
cd frontend && pnpm type-check

# Linting
cd frontend && pnpm lint

# Build check
cd frontend && pnpm build
```

---

## Post-Implementation Reviews (MANDATORY)

After implementation passes tests, run these reviews **IN ORDER**. Do NOT commit until ALL pass.

### 1. Code Review (Quality + Correctness)

```bash
council-simple run critic --mode review "Code review for [Story ID]: Check React best practices, component composition, hook usage, TypeScript types, accessibility in [list files]" --json
```

**Fix ALL issues before proceeding.**

### 2. Silent Failure Detection (Error Handling)

```bash
council-simple run critic --mode review "Silent failure hunt for [Story ID]: Check for unhandled promise rejections, missing error boundaries, empty catch blocks, missing loading/error states in [list files]" --json
```

**Fix ALL silent failure issues before proceeding.**

### 3. Security Review (CRITICAL)

```bash
council-simple run critic --mode security "Security audit for [Story ID]: Check for XSS vulnerabilities, unsafe innerHTML, missing input sanitization, exposed secrets, CORS issues in [list files]" --json
```

**Fix ALL security issues before proceeding.**

### 4. Accessibility Review

```bash
council-simple run critic --mode review "Accessibility review for [Story ID]: Check ARIA labels, keyboard navigation, color contrast, screen reader compatibility in [list files]" --json
```

**Apply accessibility improvements.**

### Review Checklist

Before committing, confirm:
- [ ] All tests pass with 80%+ coverage
- [ ] TypeScript has no errors (`pnpm type-check`)
- [ ] ESLint passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Code review issues resolved
- [ ] No silent failures
- [ ] Security review passed
- [ ] Accessibility checked

---

## CRITICAL: Non-Interactive Commands

You are running unattended. All commands MUST be non-interactive.

### Node/pnpm Commands
- **Install**: `cd frontend && pnpm install`
- **Test**: `cd frontend && pnpm test`
- **Build**: `cd frontend && pnpm build`
- **Lint**: `cd frontend && pnpm lint`
- **Type check**: `cd frontend && pnpm type-check`

### Package Management
- **Add package**: `cd frontend && pnpm add package-name`
- **Add dev package**: `cd frontend && pnpm add -D package-name`

### Git Commands
- Never use `-i` flags (no `git rebase -i`, `git add -i`)
- Never invoke editors (no `git commit` without `-m`)
- Always use `--yes`, `-y`, or `--force` where available

If a command prompts for input, it will hang forever. Always use the non-interactive variant.

---

## Progress Report Format

APPEND to `ralph/progress.txt` (never replace, always append):

```
## [Date/Time] - [Story ID]
- What was implemented
- Components created/modified
- Test coverage achieved: X%
- Reviews completed: code-review, silent-failure, security, accessibility
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes.

---

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of `ralph/progress.txt`:

```
## Codebase Patterns
- shadcn/ui components in frontend/components/ui/
- Zustand stores use immer middleware for immutable updates
- All API calls go through React Query hooks in frontend/hooks/
- Use cn() utility from lib/utils for className merging
- Form validation with zod schemas in frontend/lib/schemas/
```

Only add patterns that are **general and reusable**, not story-specific details.

---

## Component Guidelines

### shadcn/ui Usage
```bash
# Add new shadcn component
cd frontend && pnpm dlx shadcn-ui@latest add button
```

### File Naming
- Components: `PascalCase.tsx` (e.g., `ModeSelector.tsx`)
- Hooks: `camelCase.ts` (e.g., `useEventStream.ts`)
- Stores: `camelCase.ts` (e.g., `testingMode.ts`)
- Utils: `camelCase.ts` (e.g., `sanitize.ts`)

### Component Structure
```typescript
// Standard component template
'use client' // Only if using hooks/interactivity

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface MyComponentProps {
  title: string
  className?: string
}

export function MyComponent({ title, className }: MyComponentProps) {
  return (
    <div className={cn('base-styles', className)}>
      {title}
    </div>
  )
}
```

---

## Quality Requirements Summary

- ALL commits must pass quality checks (vitest, eslint, tsc, build)
- ALL new code must have 80%+ test coverage
- ALL components must be accessible (ARIA, keyboard nav)
- ALL code must pass 4 review stages before commit
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns
- Use TypeScript strict mode
- Sanitize all user input (XSS prevention)

---

## Stop Condition

**CRITICAL: Complete ONE story, then STOP.**

After completing a user story:
1. Update PRD to set `passes: true`
2. Append progress to `ralph/progress.txt`
3. Check if ALL stories have `passes: true`

If ALL stories are complete, output this EXACT signal on its own line:

    RALPH_SIGNAL_ALL_STORIES_COMPLETE

If there are still stories with `passes: false`:
- **STOP immediately. Do NOT continue to the next story.**
- End your response. The bash loop will start a fresh iteration.
- The next iteration will pick up the next story with clean context.

---

## Failure Recovery

If you encounter failures, follow these recovery steps:

### Test Failures
1. Read the full error output carefully
2. Check if it's a missing dependency: `cd frontend && pnpm add <package>`
3. Check if it's a type error: fix TypeScript issues first
4. Fix the root cause, don't just skip the test

### Council Not Available
If `council` command is not available:
1. Run linting manually: `cd frontend && pnpm lint --fix`
2. Run type checking: `cd frontend && pnpm type-check`
3. Perform manual code review focusing on security

### Git Conflicts
1. Never use interactive git commands
2. If conflicts exist: `git status` to identify, then resolve manually
3. Stage files explicitly: `git add <specific-files>`

### Stuck or Context Exhausted
1. DO NOT continue partial work
2. STOP and let the next iteration continue
3. Document what was attempted in progress.txt

### Node Environment
1. Ensure Node 18+: `node --version`
2. Install deps: `cd frontend && pnpm install`
3. Clear cache if needed: `cd frontend && rm -rf node_modules .next && pnpm install`

---

## Important Reminders

- **ONE story per iteration - then EXIT**
- **80% test coverage minimum - no exceptions**
- **TypeScript strict mode - no `any` types**
- **All 4 reviews must pass before commit**
- Commit after each story (keep CI green)
- Read Codebase Patterns in progress.txt BEFORE starting
- Read CLAUDE.md and spec documents BEFORE implementing
- Use non-interactive commands ALWAYS
- Update AGENTS.md with discovered patterns
- Small, focused changes are better than large ones
- Port logic from Streamlit components, not copy-paste
- **If stuck, STOP and EXIT** - next iteration will continue with fresh context
