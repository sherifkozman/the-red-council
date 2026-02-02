#!/bin/bash
# Ralph Supervisor - Monitor progress, restart stalled processes, trigger reviews on completion
#
# Usage: ./ralph-supervisor.sh [--check-interval <minutes>]

set -u

# =============================================================================
# Configuration
# =============================================================================
CHECK_INTERVAL_MINUTES=${1:-20}
CHECK_INTERVAL_SECONDS=$((CHECK_INTERVAL_MINUTES * 60))
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PRD_FILE="$SCRIPT_DIR/prd.json"
STATE_FILE="$SCRIPT_DIR/state.json"
SUPERVISOR_LOG="$SCRIPT_DIR/logs/supervisor.log"
TOTAL_STORIES=32

mkdir -p "$SCRIPT_DIR/logs"

# =============================================================================
# Logging
# =============================================================================
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$SUPERVISOR_LOG"
}

# =============================================================================
# Progress Tracking
# =============================================================================
get_completed_count() {
  jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo 0
}

get_remaining_stories() {
  jq -r '[.userStories[] | select(.passes == false) | .id] | join(", ")' "$PRD_FILE" 2>/dev/null || echo "unknown"
}

# =============================================================================
# Process Management
# =============================================================================
kill_ralph_processes() {
  log "Killing stalled Ralph/Claude/Gemini processes..."

  # Kill ralph.sh processes
  pkill -f "ralph.sh" 2>/dev/null || true

  # Kill Claude processes spawned by ralph
  pkill -f "claude.*dangerously-skip-permissions" 2>/dev/null || true

  # Kill Gemini processes spawned by ralph
  pkill -f "gemini.*yolo" 2>/dev/null || true

  sleep 5
  log "Processes killed"
}

start_ralph() {
  log "Starting new Ralph session with Claude..."
  cd "$SCRIPT_DIR"
  nohup ./ralph.sh --cli claude > "logs/ralph-supervisor-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
  log "Ralph started with PID: $!"
}

# =============================================================================
# Review Functions (called when all stories complete)
# =============================================================================
run_completeness_review() {
  log "═══════════════════════════════════════════════════════════════"
  log "REVIEW 1/5: Completeness Check"
  log "═══════════════════════════════════════════════════════════════"

  cd "$REPO_ROOT"
  cat << 'EOF' | claude -p --dangerously-skip-permissions 2>&1 | tee -a "$SUPERVISOR_LOG"
Review the implementation for COMPLETENESS against the PRD.

1. Read ralph/prd.json to get all user stories
2. For each story, verify:
   - The described functionality exists in the codebase
   - Required files/modules are present
   - Core features work as described

3. Create a completeness report:
   - List each story with COMPLETE/INCOMPLETE status
   - For incomplete items, specify what's missing
   - Overall completeness percentage

Output format:
## Completeness Report
| Story | Status | Notes |
|-------|--------|-------|
...

## Summary
- Complete: X/32
- Gaps found: [list any gaps]
EOF
}

run_gaps_review() {
  log "═══════════════════════════════════════════════════════════════"
  log "REVIEW 2/5: Gap Analysis"
  log "═══════════════════════════════════════════════════════════════"

  cd "$REPO_ROOT"
  cat << 'EOF' | claude -p --dangerously-skip-permissions 2>&1 | tee -a "$SUPERVISOR_LOG"
Analyze the codebase for GAPS and missing pieces.

1. Check for:
   - Missing imports or undefined references
   - Incomplete function implementations (TODO, FIXME, NotImplementedError)
   - Missing error handling
   - Incomplete test coverage
   - Missing configuration or environment variables
   - Broken dependencies between modules

2. Review integration points:
   - Do all components connect properly?
   - Are there orphaned or dead-end code paths?
   - Missing API endpoints referenced but not implemented?

3. Create a gap report:

## Gap Analysis Report

### Critical Gaps (blocking functionality)
- [list]

### Minor Gaps (non-blocking but should fix)
- [list]

### Recommendations
- [prioritized list of fixes]
EOF
}

run_security_review() {
  log "═══════════════════════════════════════════════════════════════"
  log "REVIEW 3/5: Security Audit"
  log "═══════════════════════════════════════════════════════════════"

  cd "$REPO_ROOT"
  cat << 'EOF' | claude -p --dangerously-skip-permissions 2>&1 | tee -a "$SUPERVISOR_LOG"
Perform a SECURITY AUDIT of the codebase.

Focus areas (this is an LLM security testing tool):
1. Input validation and sanitization
2. Prompt injection vulnerabilities in the tool itself
3. Secret handling (API keys, credentials)
4. Safe defaults and fail-secure patterns
5. Logging of sensitive data
6. Dependency vulnerabilities (check requirements.txt)
7. Code execution risks (eval, exec, subprocess)
8. File system access controls

Run: council run critic --mode security "Full security audit of The Red Council codebase"

Create a security report:

## Security Audit Report

### Critical Issues (must fix before release)
- [list with file:line references]

### High Issues
- [list]

### Medium Issues
- [list]

### Recommendations
- [list]

### Security Score: X/10
EOF
}

run_quality_review() {
  log "═══════════════════════════════════════════════════════════════"
  log "REVIEW 4/5: Code Quality & Testing"
  log "═══════════════════════════════════════════════════════════════"

  cd "$REPO_ROOT"
  cat << 'EOF' | claude -p --dangerously-skip-permissions 2>&1 | tee -a "$SUPERVISOR_LOG"
Review CODE QUALITY and TEST COVERAGE.

1. Run linting and type checking:
   - ruff check src/
   - mypy src/ (if configured)

2. Run test suite:
   - pytest tests/ -v --tb=short
   - Note any failures

3. Check test coverage:
   - pytest --cov=src --cov-report=term-missing tests/

4. Review code quality:
   - Consistent code style
   - Proper error handling
   - Documentation/docstrings
   - No code smells (long functions, deep nesting, etc.)

Create a quality report:

## Code Quality Report

### Linting Results
- Errors: X
- Warnings: X

### Test Results
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Code Quality Issues
- [list any issues found]

### Quality Score: X/10
EOF
}

run_readiness_review() {
  log "═══════════════════════════════════════════════════════════════"
  log "REVIEW 5/5: Release Readiness"
  log "═══════════════════════════════════════════════════════════════"

  cd "$REPO_ROOT"
  cat << 'EOF' | claude -p --dangerously-skip-permissions 2>&1 | tee -a "$SUPERVISOR_LOG"
Assess RELEASE READINESS for The Red Council.

Check:
1. All stories complete (verify ralph/prd.json)
2. All tests passing
3. No critical/high security issues
4. Documentation exists (README, setup instructions)
5. Configuration is documented
6. Dependencies are pinned (requirements.txt)
7. Environment setup is clear

Create a readiness checklist:

## Release Readiness Report

### Checklist
- [ ] All 32 stories complete
- [ ] All tests passing
- [ ] No critical security issues
- [ ] README.md complete
- [ ] Setup instructions work
- [ ] Dependencies pinned
- [ ] Example usage documented
- [ ] Error messages helpful

### Blocking Issues
- [list any blockers]

### Recommended Before Release
- [list nice-to-haves]

### VERDICT: READY / NOT READY

### Next Steps
1. [list]
EOF
}

run_all_reviews() {
  log "╔════════════════════════════════════════════════════════════════════╗"
  log "║           ALL STORIES COMPLETE - STARTING REVIEWS                 ║"
  log "╚════════════════════════════════════════════════════════════════════╝"

  run_completeness_review
  run_gaps_review
  run_security_review
  run_quality_review
  run_readiness_review

  log "╔════════════════════════════════════════════════════════════════════╗"
  log "║              ALL REVIEWS COMPLETE                                 ║"
  log "╚════════════════════════════════════════════════════════════════════╝"
  log "Review logs saved to: $SUPERVISOR_LOG"
}

# =============================================================================
# Main Supervisor Loop
# =============================================================================
main() {
  log "╔════════════════════════════════════════════════════════════════════╗"
  log "║           RALPH SUPERVISOR STARTING                               ║"
  log "╠════════════════════════════════════════════════════════════════════╣"
  log "║ Check interval: ${CHECK_INTERVAL_MINUTES} minutes"
  log "║ Total stories:  $TOTAL_STORIES"
  log "║ Log file:       $SUPERVISOR_LOG"
  log "╚════════════════════════════════════════════════════════════════════╝"

  local last_completed=0
  local stall_count=0
  local MAX_STALLS=2  # Kill after 2 checks with no progress (40 min default)

  while true; do
    local completed
    completed=$(get_completed_count)
    local remaining=$((TOTAL_STORIES - completed))

    log "Progress check: $completed/$TOTAL_STORIES complete ($remaining remaining)"

    # Check if all complete
    if [[ $completed -ge $TOTAL_STORIES ]]; then
      log "ALL STORIES COMPLETE! Starting review sequence..."
      kill_ralph_processes
      run_all_reviews
      log "Supervisor exiting - all work complete"
      exit 0
    fi

    # Check for progress
    if [[ $completed -gt $last_completed ]]; then
      log "Progress made: $last_completed -> $completed"
      last_completed=$completed
      stall_count=0
    else
      ((stall_count++))
      log "No progress detected (stall count: $stall_count/$MAX_STALLS)"

      if [[ $stall_count -ge $MAX_STALLS ]]; then
        log "STALLED! No progress for $((stall_count * CHECK_INTERVAL_MINUTES)) minutes"
        log "Remaining stories: $(get_remaining_stories)"

        kill_ralph_processes
        sleep 10
        start_ralph

        stall_count=0
      fi
    fi

    log "Next check in $CHECK_INTERVAL_MINUTES minutes..."
    sleep $CHECK_INTERVAL_SECONDS
  done
}

# Handle signals
trap 'log "Supervisor interrupted"; exit 0' SIGINT SIGTERM

# Run
main "$@"
