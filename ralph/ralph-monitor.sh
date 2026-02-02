#!/bin/bash
# Ralph Monitor - Real-time progress dashboard for The Red Council
#
# Usage: ./ralph-monitor.sh [--watch] [--json]
#
# Options:
#   --watch    Continuously refresh (default: single snapshot)
#   --json     Output raw JSON state only
#   --tail N   Show last N lines of current log (default: 20)

set -u

# =============================================================================
# Configuration
# =============================================================================
WATCH_MODE=false
JSON_MODE=false
TAIL_LINES=20
REFRESH_INTERVAL=5

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --watch|-w)
      WATCH_MODE=true
      shift
      ;;
    --json|-j)
      JSON_MODE=true
      shift
      ;;
    --tail|-t)
      [[ -z "${2:-}" ]] && { echo "Error: --tail requires a numeric value"; exit 1; }
      [[ ! "$2" =~ ^[0-9]+$ ]] && { echo "Error: --tail must be a positive integer"; exit 1; }
      TAIL_LINES="$2"
      shift 2
      ;;
    --interval|-i)
      [[ -z "${2:-}" ]] && { echo "Error: --interval requires a numeric value"; exit 1; }
      [[ ! "$2" =~ ^[0-9]+$ ]] && { echo "Error: --interval must be a positive integer"; exit 1; }
      REFRESH_INTERVAL="$2"
      shift 2
      ;;
    -h|--help)
      cat << EOF
Ralph Monitor - Real-time progress dashboard for The Red Council

Usage: ./ralph-monitor.sh [OPTIONS]

Options:
  -w, --watch          Continuously refresh display
  -j, --json           Output raw JSON state only
  -t, --tail N         Show last N lines of current log (default: 20)
  -i, --interval N     Refresh interval in seconds (default: 5)
  -h, --help           Show this help message

Examples:
  ./ralph-monitor.sh              # Single snapshot
  ./ralph-monitor.sh --watch      # Live dashboard
  ./ralph-monitor.sh --json       # Machine-readable output
  ./ralph-monitor.sh --tail 50    # Show more log lines
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# =============================================================================
# Directory Setup
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
STATE_FILE="$SCRIPT_DIR/state.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
HEARTBEAT_FILE="$SCRIPT_DIR/.heartbeat"
LOGS_DIR="$SCRIPT_DIR/logs"

# =============================================================================
# Utility Functions
# =============================================================================

# Format seconds as human-readable duration
format_duration() {
  local seconds=$1
  local hours=$((seconds / 3600))
  local minutes=$(((seconds % 3600) / 60))
  local secs=$((seconds % 60))

  if [[ $hours -gt 0 ]]; then
    printf "%dh %dm %ds" $hours $minutes $secs
  elif [[ $minutes -gt 0 ]]; then
    printf "%dm %ds" $minutes $secs
  else
    printf "%ds" $secs
  fi
}

# Check if ralph is running
is_ralph_running() {
  if [[ ! -f "$STATE_FILE" ]]; then
    return 1
  fi

  local pid
  pid=$(jq -r '.pid // 0' "$STATE_FILE" 2>/dev/null)

  if [[ "$pid" != "0" ]] && [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  return 1
}

# Check heartbeat freshness
heartbeat_status() {
  if [[ ! -f "$HEARTBEAT_FILE" ]]; then
    echo "no_heartbeat"
    return
  fi

  local last_beat now age
  last_beat=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
  [[ ! "$last_beat" =~ ^[0-9]+$ ]] && last_beat=0
  now=$(date +%s)
  age=$((now - last_beat))

  if [[ $age -lt 120 ]]; then
    echo "healthy (${age}s ago)"
  elif [[ $age -lt 600 ]]; then
    echo "stale (${age}s ago)"
  else
    echo "DEAD (${age}s ago)"
  fi
}

# Get the most recent log file
get_current_log() {
  if [[ -d "$LOGS_DIR" ]]; then
    find "$LOGS_DIR" -name "iteration-*.log" -type f 2>/dev/null | sort | tail -1
  fi
}

# =============================================================================
# Display Functions
# =============================================================================

show_json() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE"
  else
    echo '{"status": "not_started", "error": "No state file found"}'
  fi
}

show_dashboard() {
  if [[ "$WATCH_MODE" == "true" ]]; then
    clear
  fi

  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║       THE RED COUNCIL - Ralph Monitor $(date '+%Y-%m-%d %H:%M:%S')        ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""

  if [[ ! -f "$STATE_FILE" ]]; then
    echo "  ⚠️  No state file found. Ralph may not have started yet."
    echo ""
    echo "  To start Ralph:"
    echo "    ./ralph.sh --cli claude"
    echo "    ./ralph.sh --cli gemini"
    echo ""
    return
  fi

  if ! jq empty "$STATE_FILE" 2>/dev/null; then
    echo "  ⚠️  State file contains invalid JSON. It may be corrupted."
    echo ""
    return
  fi

  # Parse state
  local status cli iteration max_iter remaining completed total elapsed error pid
  status=$(jq -r '.status // "unknown"' "$STATE_FILE")
  cli=$(jq -r '.cli // "unknown"' "$STATE_FILE")
  iteration=$(jq -r '.current_iteration // 0' "$STATE_FILE")
  max_iter=$(jq -r '.max_iterations // 0' "$STATE_FILE")
  remaining=$(jq -r '.remaining_stories // "?"' "$STATE_FILE")
  completed=$(jq -r '.completed_stories // 0' "$STATE_FILE")
  total=$(jq -r '.total_stories // 0' "$STATE_FILE")
  elapsed=$(jq -r '.elapsed_seconds // 0' "$STATE_FILE")
  error=$(jq -r '.error // ""' "$STATE_FILE")
  pid=$(jq -r '.pid // 0' "$STATE_FILE")

  # Status line
  local status_indicator
  case "$status" in
    completed)       status_indicator="✅ COMPLETED" ;;
    running)         status_indicator="🔄 RUNNING" ;;
    retrying)        status_indicator="🔁 RETRYING" ;;
    interrupted)     status_indicator="⛔ INTERRUPTED" ;;
    starting)        status_indicator="🚀 STARTING" ;;
    max_iterations)  status_indicator="⚠️  MAX ITERATIONS" ;;
    *)               status_indicator="❓ $status" ;;
  esac

  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│ STATUS                                                              │"
  echo "├─────────────────────────────────────────────────────────────────────┤"
  printf "│  %-67s │\n" "$status_indicator"
  printf "│  CLI: %-61s │\n" "$cli"
  printf "│  PID: %-61s │\n" "$pid ($(is_ralph_running && echo 'alive' || echo 'not running'))"
  printf "│  Heartbeat: %-55s │\n" "$(heartbeat_status)"
  if [[ -n "$error" ]] && [[ "$error" != "null" ]] && [[ "$error" != "" ]]; then
    printf "│  Error: %-59s │\n" "${error:0:59}"
  fi
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo ""

  # Progress
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│ PROGRESS                                                            │"
  echo "├─────────────────────────────────────────────────────────────────────┤"
  printf "│  Iteration: %-55s │\n" "$iteration / $max_iter"
  printf "│  Stories:   %-55s │\n" "$completed completed, $remaining remaining (of $total)"
  printf "│  Duration:  %-55s │\n" "$(format_duration "$elapsed")"

  # Progress bar
  if [[ "$total" -gt 0 ]] && [[ "$total" =~ ^[0-9]+$ ]] && [[ "$completed" =~ ^[0-9]+$ ]]; then
    local pct=$((completed * 100 / total))
    local bar_width=50
    local filled=$((pct * bar_width / 100))
    local empty=$((bar_width - filled))
    local bar=$(printf "%${filled}s" | tr ' ' '█')$(printf "%${empty}s" | tr ' ' '░')
    printf "│  [%s] %3d%%           │\n" "$bar" "$pct"
  fi
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo ""

  # Story Status
  if [[ -f "$PRD_FILE" ]] && jq empty "$PRD_FILE" 2>/dev/null; then
    echo "┌─────────────────────────────────────────────────────────────────────┐"
    echo "│ STORIES                                                             │"
    echo "├─────────────────────────────────────────────────────────────────────┤"

    # Show completed stories (last 3)
    local completed_stories
    completed_stories=$(jq -r '.userStories[] | select(.passes == true) | "  ✅ \(.id): \(.title)"' "$PRD_FILE" 2>/dev/null | tail -3)
    if [[ -n "$completed_stories" ]]; then
      echo "│ Recently Completed:                                                 │"
      while IFS= read -r line; do
        printf "│  %-66s │\n" "${line:0:66}"
      done <<< "$completed_stories"
    fi

    # Show next pending stories (first 3)
    local pending_stories
    pending_stories=$(jq -r '.userStories[] | select(.passes == false) | "  ⏳ \(.id): \(.title)"' "$PRD_FILE" 2>/dev/null | head -3)
    if [[ -n "$pending_stories" ]]; then
      echo "│ Next Pending:                                                       │"
      while IFS= read -r line; do
        printf "│  %-66s │\n" "${line:0:66}"
      done <<< "$pending_stories"
    fi

    echo "└─────────────────────────────────────────────────────────────────────┘"
    echo ""
  fi

  # Recent log output
  local current_log
  current_log=$(get_current_log)
  if [[ -n "$current_log" ]] && [[ -f "$current_log" ]]; then
    echo "┌─────────────────────────────────────────────────────────────────────┐"
    printf "│ CURRENT LOG: %-54s │\n" "$(basename "$current_log")"
    echo "├─────────────────────────────────────────────────────────────────────┤"

    tail -n "$TAIL_LINES" "$current_log" 2>/dev/null | while IFS= read -r line; do
      local truncated="${line:0:66}"
      printf "│ %-67s │\n" "$truncated"
    done

    echo "└─────────────────────────────────────────────────────────────────────┘"
    echo ""
  fi

  # Footer
  echo "─────────────────────────────────────────────────────────────────────────"
  if [[ "$WATCH_MODE" == "true" ]]; then
    echo "  Refreshing every ${REFRESH_INTERVAL}s. Press Ctrl+C to exit."
  else
    echo "  Use --watch for live updates. Use --json for machine-readable output."
  fi
  echo ""
}

# =============================================================================
# Main
# =============================================================================

if [[ "$JSON_MODE" == "true" ]]; then
  show_json
  exit 0
fi

if [[ "$WATCH_MODE" == "true" ]]; then
  trap 'echo ""; echo "Monitor stopped."; exit 0' SIGINT SIGTERM

  while true; do
    show_dashboard
    sleep "$REFRESH_INTERVAL"
  done
else
  show_dashboard
fi
