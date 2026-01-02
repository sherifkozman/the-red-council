# Backlog — The Red Council

**Last Updated:** 2026-01-01
**Status:** Post-Launch UI Polish

---

## Open Issues

### UI/UX Bugs (P0-P1)

- [ ] **State Machine Not Updating** (P0)
  - Top progress bar stays on ATTACK, never advances to JUDGE/DEFEND/VERIFY
  - `StateMachine.tsx` not receiving state updates from SSE stream
  - File: `frontend/components/arena/StateMachine.tsx`

- [ ] **Arena Event Log Positioning** (P0)
  - Log panel floats outside grid, bleeds over Attack Sequence panel
  - Positioning inconsistent between initial and active states
  - File: `frontend/components/arena/EventLog.tsx` + parent layout

- [ ] **Secret Visible in Current System Rules** (P1)
  - The actual secret (e.g., "REDCOUNCIL2025") is shown in the UI
  - Security risk during screen sharing/demos
  - Consider masking or hiding the secret value

- [ ] **No Round Progress Indicator** (P1)
  - Missing "Round 2 of 3" or similar indicator
  - User cannot see campaign progress at a glance

### UI/UX Improvements (P2)

- [ ] **No Cancel/Abort Button** (P2)
  - User cannot stop a running campaign
  - Add abort functionality to arena page

- [ ] **Attack Sequence Overflow** (P2)
  - Long attack prompts lack proper truncation/expand
  - Add "Show more" or scrollable container

- [ ] **Inconsistent Panel Heights** (P2)
  - Left panel (Attack Sequence) and Right panel (Response Feed) misaligned
  - Consider CSS grid or flexbox fix

- [ ] **No Visual State Transitions** (P2)
  - States don't animate when transitioning
  - Add subtle animation for ATTACK→JUDGE→DEFEND flow

### Accessibility (P3)

- [ ] **Color Contrast** - Some gray text may fail WCAG AA
- [ ] **ARIA Labels** - Missing on interactive elements
- [ ] **Keyboard Navigation** - Needs verification
- [ ] **Focus Indicators** - Check for visible focus rings

---

## Completed Tasks

### Phase 11: Test Coverage & CI/CD (COMPLETE)
- [x] Phase 11A: Test Coverage Tooling (75% coverage achieved)
- [x] Phase 11B: CI/CD Pipeline (GitHub Actions with SHA pinning)
- [x] Phase 11C: Integration Tests (E2E and API passing)
- [x] Phase 11D: Test Data Management (Isolated fixtures established)
- [x] Added unit tests for Registry, Universal Provider, and Runner.

### Phase 12: Documentation (COMPLETE)
- [x] Phase 12A: README & Quickstart
- [x] Phase 12B: API & Configuration Docs
- [x] Phase 12C: Developer Docs
- [x] Phase 12D: Tutorials (Testing Your First LLM, Custom Attacks, External Targets)
- [x] CHANGELOG.md implemented
