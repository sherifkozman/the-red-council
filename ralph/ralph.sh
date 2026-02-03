#!/bin/bash
# Ralph Wiggum - Autonomous AI Agent Loop for The Red Council
# Based on https://ghuntley.com/ralph/
#
# Usage: ./ralph.sh [--cli <claude|gemini>] [--timeout <seconds>] [max_iterations]
#
# Examples:
#   ./ralph.sh                        # Default: claude, 10 iterations
#   ./ralph.sh --cli gemini           # Use Gemini CLI, 10 iterations
#   ./ralph.sh --cli claude 20        # Use Claude, 20 iterations
#   ./ralph.sh --timeout 3600 5       # 1 hour timeout per iteration, 5 iterations

# Exit on undefined variables only (not on errors - we handle those)
set -u

# =============================================================================
# Configuration
# =============================================================================
CLI="claude"
GEMINI_MODEL="gemini-3-pro-preview"   # Default Gemini model
TARGET_STORY=""                 # Specific story to work on (empty = next by priority)
MAX_ITERATIONS=32               # Match story count
ITERATION_TIMEOUT=2400          # 40 minutes per iteration (complex stories)
MAX_RETRIES=5                   # Retries per iteration on transient failures
RETRY_DELAY_BASE=30             # Base delay for exponential backoff
HEARTBEAT_INTERVAL=60           # Seconds between heartbeat updates
COOLDOWN_BETWEEN_ITERATIONS=10  # Seconds to wait between iterations

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
  case $1 in
    --cli)
      CLI="$2"
      shift 2
      ;;
    --model)
      GEMINI_MODEL="$2"
      shift 2
      ;;
    --story)
      TARGET_STORY="$2"
      shift 2
      ;;
    --timeout)
      ITERATION_TIMEOUT="$2"
      shift 2
      ;;
    --max-retries)
      MAX_RETRIES="$2"
      shift 2
      ;;
    --cooldown)
      COOLDOWN_BETWEEN_ITERATIONS="$2"
      shift 2
      ;;
    -h|--help)
      cat << EOF
Usage: ./ralph.sh [OPTIONS] [max_iterations]

Options:
  --cli <cli>          AI CLI to use: claude or gemini (default: claude)
  --model <model>      Gemini model to use (default: gemini-3-pro-preview)
  --story <id>         Work on specific story only (e.g., TRC-014)
  --timeout <seconds>  Timeout per iteration in seconds (default: 2400)
  --max-retries <n>    Max retries on transient failures (default: 5)
  --cooldown <seconds> Cooldown between iterations (default: 10)
  -h, --help           Show this help message

Examples:
  ./ralph.sh                              # Claude, 32 iterations
  ./ralph.sh --cli gemini                 # Gemini with gemini-3-pro-preview
  ./ralph.sh --cli gemini --story TRC-014 # Work on specific story
  ./ralph.sh --timeout 3600 5             # 1 hour timeout, 5 iterations

Parallel execution (run in separate terminals):
  ./ralph.sh --cli gemini --story TRC-014   # Terminal 1
  ./ralph.sh --cli gemini --story TRC-023   # Terminal 2
  ./ralph.sh --cli gemini --story TRC-016   # Terminal 3

Monitoring:
  ./ralph-monitor.sh                # Real-time progress dashboard
  cat ralph/state.json              # Machine-readable status
  tail -f ralph/logs/iteration-*.log  # Live iteration output
EOF
      exit 0
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      else
        echo "Unknown argument: $1"
        echo "Use --help for usage information"
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate CLI choice
if [[ "$CLI" != "claude" && "$CLI" != "gemini" ]]; then
  echo "Error: Unknown CLI '$CLI'. Use 'claude' or 'gemini'"
  exit 1
fi

# =============================================================================
# Directory Setup
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRD_FILE="$SCRIPT_DIR/unified-interface-prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
STATE_FILE="$SCRIPT_DIR/state.json"
HEARTBEAT_FILE="$SCRIPT_DIR/.heartbeat"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LOGS_DIR="$SCRIPT_DIR/logs"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

# Current state tracking
CURRENT_ITERATION=0
CHILD_PID=""
LOOP_START_TIME=""

# =============================================================================
# Utility Functions
# =============================================================================

log_info() {
  echo "[$(date '+%H:%M:%S')] INFO: $*"
}

log_warn() {
  echo "[$(date '+%H:%M:%S')] WARN: $*" >&2
}

log_error() {
  echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
}

# Update machine-readable state file for external monitoring
update_state() {
  local status="$1"
  local iteration="${2:-$CURRENT_ITERATION}"
  local remaining="${3:-?}"
  local error_msg="${4:-}"
  local elapsed=""

  if [[ -n "$LOOP_START_TIME" ]]; then
    elapsed=$(($(date +%s) - LOOP_START_TIME))
  fi

  # Ensure remaining is a valid number, default to 0 if not
  if ! [[ "$remaining" =~ ^[0-9]+$ ]]; then
    remaining=0
  fi

  local target_story_json="null"
  if [[ -n "$TARGET_STORY" ]]; then
    target_story_json="\"$TARGET_STORY\""
  fi

  cat > "$STATE_FILE" << EOF
{
  "status": "$status",
  "current_iteration": $iteration,
  "max_iterations": $MAX_ITERATIONS,
  "remaining_stories": $remaining,
  "completed_stories": $(jq '[[.epics[].stories[]][] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo 0),
  "total_stories": $(jq '[.epics[].stories[]] | flatten | length' "$PRD_FILE" 2>/dev/null || echo 0),
  "elapsed_seconds": ${elapsed:-0},
  "last_update": "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')",
  "pid": $$,
  "cli": "$CLI",
  "target_story": $target_story_json,
  "error": "$error_msg"
}
EOF
}

# Update heartbeat for external watchdog
update_heartbeat() {
  date +%s > "$HEARTBEAT_FILE"
}

# Classify error type from output and exit code
classify_error() {
  local output="$1"
  local exit_code="$2"

  # Use 2>/dev/null to suppress broken pipe errors from large outputs
  if echo "$output" | grep -qi "rate.limit\|429\|too.many.requests\|overloaded\|capacity\|quota" 2>/dev/null; then
    echo "RATE_LIMIT"
  elif echo "$output" | grep -qi "authentication\|unauthorized\|401\|403\|invalid.api.key\|API_KEY" 2>/dev/null; then
    echo "AUTH_FAILURE"
  elif [[ $exit_code -eq 124 ]]; then
    echo "TIMEOUT"
  elif echo "$output" | grep -qE "^[[:space:]]*RALPH_SIGNAL_ALL_STORIES_COMPLETE[[:space:]]*$" 2>/dev/null; then
    # Must be on its own line - not just mentioned in discussion
    echo "ALL_COMPLETE"
  elif echo "$output" | grep -qi "passes.*true\|story.*complete\|committed\|feat:" 2>/dev/null; then
    echo "ITERATION_SUCCESS"
  elif echo "$output" | grep -qi "connection.refused\|network.error\|ECONNREFUSED\|ETIMEDOUT\|socket.hang.up" 2>/dev/null; then
    echo "NETWORK_ERROR"
  elif echo "$output" | grep -qi "context.length\|token.limit\|conversation.too.long\|turn.limit" 2>/dev/null; then
    echo "CONTEXT_EXHAUSTED"
  elif echo "$output" | grep -qi "internal.server.error\|500\|502\|503\|504" 2>/dev/null; then
    echo "SERVER_ERROR"
  elif [[ $exit_code -eq 0 ]]; then
    echo "SUCCESS"
  else
    echo "UNKNOWN_ERROR"
  fi
}

# Check if error is transient (worth retrying)
is_transient_error() {
  local error_type="$1"
  case "$error_type" in
    RATE_LIMIT|NETWORK_ERROR|TIMEOUT|SERVER_ERROR|CONTEXT_EXHAUSTED)
      return 0  # true - retry these
      ;;
    *)
      return 1  # false - don't retry
      ;;
  esac
}

# Get retry delay based on error type
get_retry_delay() {
  local error_type="$1"
  local base_delay="$2"

  case "$error_type" in
    RATE_LIMIT)
      echo $((base_delay * 4))  # Rate limits need longer waits
      ;;
    SERVER_ERROR)
      echo $((base_delay * 2))  # Server errors need moderate waits
      ;;
    *)
      echo "$base_delay"
      ;;
  esac
}

# =============================================================================
# Signal Handling
# =============================================================================

cleanup() {
  local signal="${1:-UNKNOWN}"
  echo ""
  echo "============================================================"
  echo " Ralph interrupted by $signal at iteration $CURRENT_ITERATION"
  echo "============================================================"

  # Kill child process if running
  if [[ -n "$CHILD_PID" ]] && kill -0 "$CHILD_PID" 2>/dev/null; then
    log_info "Terminating running iteration..."
    kill -TERM "$CHILD_PID" 2>/dev/null
    sleep 2
    kill -KILL "$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  fi

  # Update state
  update_state "interrupted" "$CURRENT_ITERATION" "?" "Interrupted by $signal"

  # Log interruption
  {
    echo ""
    echo "## INTERRUPTED - $(date)"
    echo "Stopped at iteration $CURRENT_ITERATION by $signal"
  } >> "$PROGRESS_FILE"

  exit 130
}

trap 'cleanup SIGINT' SIGINT
trap 'cleanup SIGTERM' SIGTERM
trap 'cleanup EXIT' EXIT

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_check() {
  local errors=0

  log_info "Running pre-flight checks..."

  # Check required files
  if [[ ! -f "$PRD_FILE" ]]; then
    log_error "unified-interface-prd.json not found at $PRD_FILE"
    ((errors++))
  fi

  if [[ ! -f "$PROMPT_FILE" ]]; then
    log_error "prompt.md not found at $PROMPT_FILE"
    ((errors++))
  fi

  # Check required tools
  if ! command -v jq &> /dev/null; then
    log_error "jq not installed. Install with: brew install jq"
    ((errors++))
  fi

  if ! command -v timeout &> /dev/null && ! command -v gtimeout &> /dev/null; then
    log_warn "timeout command not found. Install with: brew install coreutils"
    log_warn "Continuing without timeout protection..."
  fi

  # Check CLI is installed
  case "$CLI" in
    claude)
      if ! command -v claude &> /dev/null; then
        log_error "Claude Code CLI not found. Install from https://claude.ai/code"
        ((errors++))
      fi
      ;;
    gemini)
      if ! command -v gemini &> /dev/null; then
        log_error "Gemini CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
        ((errors++))
      fi
      ;;
  esac

  # Validate PRD is valid JSON
  if [[ -f "$PRD_FILE" ]] && ! jq empty "$PRD_FILE" 2>/dev/null; then
    log_error "Invalid JSON in $PRD_FILE"
    ((errors++))
  fi

  # Check for uncommitted changes (warning only)
  if [[ -d "$REPO_ROOT/.git" ]]; then
    if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
      log_warn "Uncommitted changes detected in repository"
    fi
  fi

  # Verify Python environment
  if [[ -d "$REPO_ROOT/venv" ]]; then
    log_info "Python venv detected at $REPO_ROOT/venv"
  else
    log_warn "No venv found - tests may fail without dependencies"
  fi

  # Validate target story if specified
  if [[ -n "$TARGET_STORY" ]]; then
    local story_exists story_passes
    story_exists=$(jq -r --arg id "$TARGET_STORY" '[.epics[].stories[]][] | select(.id == $id) | .id' "$PRD_FILE" 2>/dev/null)
    if [[ -z "$story_exists" ]]; then
      log_error "Story $TARGET_STORY not found in PRD"
      ((errors++))
    else
      story_passes=$(jq -r --arg id "$TARGET_STORY" '[.epics[].stories[]][] | select(.id == $id) | .passes' "$PRD_FILE" 2>/dev/null)
      if [[ "$story_passes" == "true" ]]; then
        log_warn "Story $TARGET_STORY is already completed (passes: true)"
      fi
    fi
  fi

  if [[ $errors -gt 0 ]]; then
    log_error "Pre-flight check failed with $errors error(s)"
    exit 1
  fi

  log_info "Pre-flight checks passed"
}

# =============================================================================
# Branch Management
# =============================================================================

ensure_correct_branch() {
  if [[ ! -f "$PRD_FILE" ]]; then
    return 0
  fi

  local target_branch
  target_branch=$(jq -r '.metadata.branchName // empty' "$PRD_FILE" 2>/dev/null)

  if [[ -z "$target_branch" ]]; then
    log_warn "No branchName specified in PRD"
    return 0
  fi

  if [[ ! -d "$REPO_ROOT/.git" ]]; then
    log_warn "Not a git repository, skipping branch check"
    return 0
  fi

  local current_branch
  current_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

  if [[ "$current_branch" == "$target_branch" ]]; then
    log_info "Already on branch: $target_branch"
    return 0
  fi

  log_info "Switching to branch: $target_branch (currently on: $current_branch)"

  # Check if branch exists locally
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$target_branch" 2>/dev/null; then
    git -C "$REPO_ROOT" checkout "$target_branch"
  # Check if branch exists on remote
  elif git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/origin/$target_branch" 2>/dev/null; then
    git -C "$REPO_ROOT" checkout -b "$target_branch" "origin/$target_branch"
  else
    log_info "Creating branch $target_branch from main..."
    local base_branch="main"
    if ! git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/main" 2>/dev/null; then
      base_branch="master"
    fi
    git -C "$REPO_ROOT" checkout -b "$target_branch" "$base_branch"
  fi

  log_info "Now on branch: $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
}

# =============================================================================
# Archive Management
# =============================================================================

archive_previous_run() {
  if [[ ! -f "$PRD_FILE" ]] || [[ ! -f "$LAST_BRANCH_FILE" ]]; then
    return 0
  fi

  local current_branch last_branch
  current_branch=$(jq -r '.metadata.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  last_branch=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [[ -z "$current_branch" ]] || [[ -z "$last_branch" ]] || [[ "$current_branch" == "$last_branch" ]]; then
    return 0
  fi

  local date_str folder_name archive_folder
  date_str=$(date +%Y-%m-%d)
  folder_name=$(echo "$last_branch" | sed 's|/|_|g')
  archive_folder="$ARCHIVE_DIR/$date_str-$folder_name"

  log_info "Archiving previous run: $last_branch"
  mkdir -p "$archive_folder"
  [[ -f "$PRD_FILE" ]] && cp "$PRD_FILE" "$archive_folder/"
  [[ -f "$PROGRESS_FILE" ]] && cp "$PROGRESS_FILE" "$archive_folder/"
  [[ -f "$STATE_FILE" ]] && cp "$STATE_FILE" "$archive_folder/"
  [[ -d "$LOGS_DIR" ]] && cp -r "$LOGS_DIR" "$archive_folder/" 2>/dev/null || true
  log_info "Archived to: $archive_folder"
}

# =============================================================================
# Build CLI Command
# =============================================================================

build_command() {
  local iteration="${1:-1}"
  local continue_flag=""
  local story_directive=""

  # After first iteration, try to continue previous session if it exists
  # This helps when Claude hits turn limits mid-story
  if [[ "$iteration" -gt 1 ]] && [[ "$CLI" == "claude" ]]; then
    continue_flag="--continue"
  fi

  # If a specific story is targeted, prepend directive to prompt
  if [[ -n "$TARGET_STORY" ]]; then
    story_directive="IMPORTANT: Work ONLY on story $TARGET_STORY. Ignore all other stories. Complete this specific story, run tests, do reviews, commit, then EXIT.\n\n"
  fi

  case "$CLI" in
    claude)
      # Claude Code: pipe prompt, non-interactive, skip permissions
      # Use --continue after first iteration to resume from turn limits
      if [[ -n "$continue_flag" ]]; then
        echo "cd '$REPO_ROOT' && echo -e '$story_directive' | cat - '$PROMPT_FILE' | claude -p --dangerously-skip-permissions $continue_flag"
      else
        echo "cd '$REPO_ROOT' && echo -e '$story_directive' | cat - '$PROMPT_FILE' | claude -p --dangerously-skip-permissions"
      fi
      ;;
    gemini)
      # Gemini CLI: use --yolo for auto-approve, specify model, pipe prompt via stdin
      echo "cd '$REPO_ROOT' && echo -e '$story_directive' | cat - '$PROMPT_FILE' | gemini --yolo --model '$GEMINI_MODEL'"
      ;;
  esac
}

# =============================================================================
# Run Single Iteration with Retry Logic
# =============================================================================

run_iteration() {
  local iteration=$1
  local attempt=1
  local retry_delay=$RETRY_DELAY_BASE
  local output=""
  local exit_code=0
  local error_type=""
  local iteration_log="$LOGS_DIR/iteration-$iteration-$(date +%Y%m%d-%H%M%S).log"
  local cmd
  cmd=$(build_command "$iteration")

  # Get timeout command (gtimeout on macOS with coreutils)
  local timeout_cmd="timeout"
  if command -v gtimeout &> /dev/null; then
    timeout_cmd="gtimeout"
  elif ! command -v timeout &> /dev/null; then
    timeout_cmd=""  # No timeout available
  fi

  while [[ $attempt -le $MAX_RETRIES ]]; do
    log_info "Attempt $attempt/$MAX_RETRIES for iteration $iteration"
    update_heartbeat

    local start_time
    start_time=$(date +%s)

    # Run with or without timeout
    if [[ -n "$timeout_cmd" ]]; then
      $timeout_cmd --kill-after=60 $ITERATION_TIMEOUT bash -c "$cmd" 2>&1 | tee "$iteration_log"
      exit_code=${PIPESTATUS[0]}
    else
      bash -c "$cmd" 2>&1 | tee "$iteration_log"
      exit_code=${PIPESTATUS[0]}
    fi

    # Read output from log for analysis (after command completes)
    output=$(cat "$iteration_log")

    local end_time duration
    end_time=$(date +%s)
    duration=$((end_time - start_time))

    # Log iteration metadata
    {
      echo ""
      echo "---"
      echo "Exit code: $exit_code"
      echo "Duration: ${duration}s"
      echo "Attempt: $attempt"
    } >> "$iteration_log"

    # Classify the error
    error_type=$(classify_error "$output" "$exit_code")
    log_info "Iteration result: $error_type (exit code: $exit_code, duration: ${duration}s)"

    # Check for completion
    if [[ "$error_type" == "ALL_COMPLETE" ]]; then
      echo "$output"
      return 0
    fi

    # Check for success (non-completion but no error)
    if [[ "$error_type" == "SUCCESS" ]] || [[ "$error_type" == "ITERATION_SUCCESS" ]]; then
      echo "$output"
      return 0
    fi

    # Check if error is transient (worth retrying)
    if is_transient_error "$error_type" && [[ $attempt -lt $MAX_RETRIES ]]; then
      retry_delay=$(get_retry_delay "$error_type" "$retry_delay")
      log_warn "Transient error ($error_type). Waiting ${retry_delay}s before retry..."
      update_state "retrying" "$iteration" "?" "Retry after $error_type (attempt $attempt)"
      sleep $retry_delay
      retry_delay=$((retry_delay * 2))  # Exponential backoff
      ((attempt++))
    else
      # Non-transient error or max retries reached
      if [[ $attempt -ge $MAX_RETRIES ]]; then
        log_error "Max retries ($MAX_RETRIES) reached for iteration $iteration"
      fi
      echo "$output"
      return $exit_code
    fi
  done

  echo "$output"
  return 1
}

# =============================================================================
# Main Loop
# =============================================================================

main() {
  # Create directories
  mkdir -p "$LOGS_DIR" "$ARCHIVE_DIR"

  # Pre-flight checks
  preflight_check

  # Archive previous run if branch changed
  archive_previous_run

  # Track current branch
  if [[ -f "$PRD_FILE" ]]; then
    local current_branch
    current_branch=$(jq -r '.metadata.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
    if [[ -n "$current_branch" ]]; then
      echo "$current_branch" > "$LAST_BRANCH_FILE"
    fi
  fi

  # Ensure we're on the correct branch
  ensure_correct_branch

  # Clean up old logs (keep last 100)
  find "$LOGS_DIR" -name "iteration-*.log" -type f 2>/dev/null | sort | head -n -100 | xargs rm -f 2>/dev/null || true

  # Record start time
  LOOP_START_TIME=$(date +%s)

  # Print banner
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║     RALPH WIGGUM - The Red Council Autonomous Agent Loop          ║"
  echo "╠════════════════════════════════════════════════════════════════════╣"
  echo "║ CLI:              $CLI"
  if [[ "$CLI" == "gemini" ]]; then
    echo "║ Model:            $GEMINI_MODEL"
  fi
  if [[ -n "$TARGET_STORY" ]]; then
    echo "║ Target Story:     $TARGET_STORY (single story mode)"
  fi
  echo "║ Max iterations:   $MAX_ITERATIONS"
  echo "║ Timeout/iter:     ${ITERATION_TIMEOUT}s ($(($ITERATION_TIMEOUT / 60)) min)"
  echo "║ Max retries:      $MAX_RETRIES"
  echo "║ Cooldown:         ${COOLDOWN_BETWEEN_ITERATIONS}s"
  echo "║ PRD:              $PRD_FILE"
  echo "║ Logs:             $LOGS_DIR"
  echo "║ Monitor:          ./ralph-monitor.sh"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo ""

  # Initial state
  local remaining
  remaining=$(jq '[[.epics[].stories[]][] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
  update_state "starting" 0 "$remaining"

  # Main loop
  for i in $(seq 1 $MAX_ITERATIONS); do
    CURRENT_ITERATION=$i
    update_heartbeat

    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║ Ralph Iteration $i of $MAX_ITERATIONS - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "╚════════════════════════════════════════════════════════════════════╝"

    # Check remaining stories
    remaining=$(jq '[[.epics[].stories[]][] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
    local completed
    completed=$(jq '[[.epics[].stories[]][] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo "0")
    local total
    total=$(jq '[.epics[].stories[]] | flatten | length' "$PRD_FILE" 2>/dev/null || echo "0")

    # Get next story
    local next_story
    next_story=$(jq -r '[[.epics[].stories[]][] | select(.passes == false)] | sort_by(.priority) | .[0] | "\(.id): \(.title)"' "$PRD_FILE" 2>/dev/null || echo "?")

    echo " Progress: $completed/$total stories complete, $remaining remaining"
    echo " Next:     $next_story"
    echo ""

    # Exit early if all done
    if [[ "$remaining" == "0" ]]; then
      echo ""
      echo "╔════════════════════════════════════════════════════════════════════╗"
      echo "║ All stories already complete!                                      ║"
      echo "╚════════════════════════════════════════════════════════════════════╝"
      update_state "completed" "$i" 0
      trap - EXIT
      exit 0
    fi

    # If targeting a specific story, check if it's already complete
    if [[ -n "$TARGET_STORY" ]]; then
      local target_passes
      target_passes=$(jq -r --arg id "$TARGET_STORY" '[.epics[].stories[]][] | select(.id == $id) | .passes' "$PRD_FILE" 2>/dev/null)
      if [[ "$target_passes" == "true" ]]; then
        echo ""
        echo "╔════════════════════════════════════════════════════════════════════╗"
        echo "║ Target story $TARGET_STORY is complete!                            ║"
        echo "╚════════════════════════════════════════════════════════════════════╝"
        update_state "completed" "$i" "$remaining"
        trap - EXIT
        exit 0
      fi
    fi

    # Update state
    update_state "running" "$i" "$remaining"

    # Run the iteration
    local output=""
    output=$(run_iteration "$i") || true

    # Check for completion signal (must be on its own line, not just mentioned in discussion)
    # Use grep -E with anchors to ensure it's the actual signal, not just text about it
    if echo "$output" | grep -qE "^[[:space:]]*RALPH_SIGNAL_ALL_STORIES_COMPLETE[[:space:]]*$" 2>/dev/null; then
      echo ""
      echo "╔════════════════════════════════════════════════════════════════════╗"
      echo "║ RALPH COMPLETED ALL TASKS!                                         ║"
      echo "║ Finished at iteration $i of $MAX_ITERATIONS"
      echo "║ Duration: $(( $(date +%s) - LOOP_START_TIME ))s"
      echo "╚════════════════════════════════════════════════════════════════════╝"

      # Log completion
      {
        echo ""
        echo "## COMPLETED - $(date)"
        echo "All stories passed after $i iterations."
        echo "Total duration: $(( $(date +%s) - LOOP_START_TIME ))s"
      } >> "$PROGRESS_FILE"

      update_state "completed" "$i" 0

      # Disable exit trap for clean exit
      trap - EXIT
      exit 0
    fi

    # For --story mode: check if target story was marked complete (even if no exit signal)
    # This handles CLIs like Gemini that complete work but don't exit cleanly
    if [[ -n "$TARGET_STORY" ]]; then
      local target_passes_now
      target_passes_now=$(jq -r --arg id "$TARGET_STORY" '[.epics[].stories[]][] | select(.id == $id) | .passes' "$PRD_FILE" 2>/dev/null)
      if [[ "$target_passes_now" == "true" ]]; then
        echo ""
        echo "╔════════════════════════════════════════════════════════════════════╗"
        echo "║ Target story $TARGET_STORY completed (detected via PRD)!           ║"
        echo "║ Duration: $(( $(date +%s) - LOOP_START_TIME ))s"
        echo "╚════════════════════════════════════════════════════════════════════╝"

        {
          echo ""
          echo "## STORY COMPLETED - $(date)"
          echo "Story $TARGET_STORY passed after $i iterations."
          echo "Total duration: $(( $(date +%s) - LOOP_START_TIME ))s"
        } >> "$PROGRESS_FILE"

        update_state "completed" "$i" "$remaining"
        trap - EXIT
        exit 0
      fi
    fi

    echo ""
    log_info "Iteration $i complete. Cooling down ${COOLDOWN_BETWEEN_ITERATIONS}s before next..."
    sleep $COOLDOWN_BETWEEN_ITERATIONS
  done

  # Max iterations reached
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║ Ralph reached max iterations ($MAX_ITERATIONS)                            ║"
  echo "║ without completing all tasks.                                      ║"
  echo "║ Duration: $(( $(date +%s) - LOOP_START_TIME ))s"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Check status:"
  echo "  jq '.userStories[] | {id, title, passes}' $PRD_FILE"
  echo ""
  echo "View progress:"
  echo "  cat $PROGRESS_FILE"
  echo ""
  echo "Resume:"
  echo "  ./ralph.sh --cli $CLI $((MAX_ITERATIONS * 2))"
  echo ""

  remaining=$(jq '[[.epics[].stories[]][] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
  update_state "max_iterations" "$MAX_ITERATIONS" "$remaining" "Reached max iterations"

  # Disable exit trap for clean exit
  trap - EXIT
  exit 1
}

# Run main
main "$@"
