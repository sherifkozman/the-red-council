#!/bin/bash
# Ralph Watchdog - Auto-restart Ralph if it dies or goes stale
#
# Usage: ./ralph-watchdog.sh [--cli <claude|gemini>] [--stale-timeout <seconds>]
#
# This script monitors Ralph and restarts it if:
# - The process dies unexpectedly
# - The heartbeat goes stale (no updates for stale-timeout seconds)
# - All stories are complete (clean exit)

set -u

# =============================================================================
# Configuration
# =============================================================================
CLI="claude"
STALE_TIMEOUT=600           # 10 minutes without heartbeat = dead
CHECK_INTERVAL=30           # Check every 30 seconds
MAX_RESTARTS=10             # Max automatic restarts before giving up
RESTART_DELAY=60            # Wait 60 seconds before restarting

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
  case $1 in
    --cli)
      CLI="$2"
      shift 2
      ;;
    --stale-timeout)
      STALE_TIMEOUT="$2"
      shift 2
      ;;
    --max-restarts)
      MAX_RESTARTS="$2"
      shift 2
      ;;
    -h|--help)
      cat << EOF
Ralph Watchdog - Auto-restart Ralph if it dies

Usage: ./ralph-watchdog.sh [OPTIONS]

Options:
  --cli <cli>              AI CLI to use: claude or gemini (default: claude)
  --stale-timeout <secs>   Seconds without heartbeat before restart (default: 600)
  --max-restarts <n>       Max automatic restarts before giving up (default: 10)
  -h, --help               Show this help message

The watchdog will:
1. Start Ralph if not running
2. Monitor heartbeat file for activity
3. Restart Ralph if process dies or heartbeat goes stale
4. Stop when all stories complete or max restarts reached

Examples:
  ./ralph-watchdog.sh --cli claude
  ./ralph-watchdog.sh --cli gemini --stale-timeout 900
  nohup ./ralph-watchdog.sh --cli claude > watchdog.log 2>&1 &
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
STATE_FILE="$SCRIPT_DIR/state.json"
HEARTBEAT_FILE="$SCRIPT_DIR/.heartbeat"
PRD_FILE="$SCRIPT_DIR/unified-interface-prd.json"
WATCHDOG_LOG="$SCRIPT_DIR/logs/watchdog.log"

mkdir -p "$SCRIPT_DIR/logs"

# =============================================================================
# Logging
# =============================================================================
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$WATCHDOG_LOG"
}

# =============================================================================
# Check Functions
# =============================================================================

get_ralph_pid() {
  if [[ -f "$STATE_FILE" ]]; then
    jq -r '.pid // 0' "$STATE_FILE" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

is_ralph_alive() {
  local pid
  pid=$(get_ralph_pid)
  if [[ "$pid" != "0" ]] && [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  return 1
}

is_heartbeat_stale() {
  if [[ ! -f "$HEARTBEAT_FILE" ]]; then
    return 0  # No heartbeat = stale
  fi

  local last_beat now age
  last_beat=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
  [[ ! "$last_beat" =~ ^[0-9]+$ ]] && last_beat=0
  now=$(date +%s)
  age=$((now - last_beat))

  if [[ $age -gt $STALE_TIMEOUT ]]; then
    return 0  # Stale
  fi
  return 1  # Fresh
}

is_all_complete() {
  if [[ -f "$STATE_FILE" ]]; then
    local status
    status=$(jq -r '.status // ""' "$STATE_FILE" 2>/dev/null)
    if [[ "$status" == "completed" ]]; then
      return 0
    fi
  fi

  if [[ -f "$PRD_FILE" ]]; then
    local remaining
    remaining=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
    if [[ "$remaining" == "0" ]]; then
      return 0
    fi
  fi

  return 1
}

get_status() {
  if [[ -f "$STATE_FILE" ]]; then
    jq -r '.status // "unknown"' "$STATE_FILE" 2>/dev/null
  else
    echo "not_started"
  fi
}

# =============================================================================
# Control Functions
# =============================================================================

start_ralph() {
  log "Starting Ralph with CLI: $CLI"
  cd "$SCRIPT_DIR"
  nohup ./ralph.sh --cli "$CLI" > "logs/ralph-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
  local new_pid=$!
  log "Ralph started with PID: $new_pid"
  sleep 5  # Give it time to initialize
}

stop_ralph() {
  local pid
  pid=$(get_ralph_pid)
  if [[ "$pid" != "0" ]] && [[ -n "$pid" ]]; then
    log "Stopping Ralph (PID: $pid)"
    kill -TERM "$pid" 2>/dev/null || true
    sleep 3
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

# =============================================================================
# Main Loop
# =============================================================================

log "═══════════════════════════════════════════════════════════════"
log " Ralph Watchdog Starting"
log " CLI: $CLI"
log " Stale timeout: ${STALE_TIMEOUT}s"
log " Max restarts: $MAX_RESTARTS"
log " Check interval: ${CHECK_INTERVAL}s"
log "═══════════════════════════════════════════════════════════════"

restart_count=0

trap 'log "Watchdog interrupted"; stop_ralph; exit 0' SIGINT SIGTERM

while true; do
  # Check if all stories complete
  if is_all_complete; then
    log "✅ All stories complete! Watchdog exiting."
    exit 0
  fi

  # Check if max restarts reached
  if [[ $restart_count -ge $MAX_RESTARTS ]]; then
    log "❌ Max restarts ($MAX_RESTARTS) reached. Giving up."
    log "   Check logs and restart manually: ./ralph.sh --cli $CLI"
    exit 1
  fi

  # Check if Ralph is alive
  if ! is_ralph_alive; then
    local status
    status=$(get_status)

    if [[ "$status" == "completed" ]]; then
      log "✅ Ralph completed successfully"
      exit 0
    elif [[ "$status" == "interrupted" ]]; then
      log "⚠️  Ralph was interrupted. Restarting in ${RESTART_DELAY}s..."
      sleep $RESTART_DELAY
      ((restart_count++))
      start_ralph
    elif [[ "$status" == "max_iterations" ]]; then
      log "⚠️  Ralph hit max iterations. Restarting with more iterations..."
      sleep $RESTART_DELAY
      ((restart_count++))
      start_ralph
    else
      log "⚠️  Ralph not running (status: $status). Starting..."
      ((restart_count++))
      start_ralph
    fi
  fi

  # Check heartbeat staleness
  if is_ralph_alive && is_heartbeat_stale; then
    local age=0
    if [[ -f "$HEARTBEAT_FILE" ]]; then
      local last_beat
      last_beat=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
      [[ "$last_beat" =~ ^[0-9]+$ ]] && age=$(($(date +%s) - last_beat))
    fi
    log "⚠️  Heartbeat stale (${age}s old). Ralph may be stuck."
    log "   Killing and restarting..."
    stop_ralph
    sleep $RESTART_DELAY
    ((restart_count++))
    start_ralph
  fi

  # Status update
  if is_ralph_alive; then
    local completed remaining
    completed=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
    remaining=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
    log "📊 Status: $(get_status) | Progress: $completed done, $remaining remaining | Restarts: $restart_count/$MAX_RESTARTS"
  fi

  sleep $CHECK_INTERVAL
done
