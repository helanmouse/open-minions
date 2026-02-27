#!/usr/bin/env bash
set -e

PI_RUNTIME="${PI_RUNTIME:-/opt/pi-runtime}"
MINIONS_RUN="/minion-run"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $*"; }
err() { echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $*" >&2; }

# Detect Node.js — only dependency required in container
ensure_node() {
  if command -v node &> /dev/null; then
    log "Node.js: $(node -v)"
    return 0
  fi

  warn "Node.js not found, attempting installation..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq nodejs npm
  elif command -v apk &> /dev/null; then
    apk add -q nodejs npm
  elif command -v yum &> /dev/null; then
    yum install -y -q nodejs npm
  else
    err "Cannot install Node.js. Please use an image with Node.js."
    exit 1
  fi

  log "Node.js installed: $(node -v)"
}

# Verify pi-runtime mount
verify_pi_runtime() {
  if [ ! -d "$PI_RUNTIME/node_modules/@mariozechner/pi-ai" ]; then
    err "pi-runtime not mounted or incomplete: $PI_RUNTIME"
    err "Ensure Docker starts with: -v ~/.minion/pi-runtime:/opt/pi-runtime:ro"
    exit 1
  fi
  log "pi-runtime ready (mounted from host)"
}

# Start sandbox agent
start_agent() {
  if [ -f "$MINIONS_RUN/.env" ]; then
    log "Loading LLM credentials..."
    set -a
    source "$MINIONS_RUN/.env"
    set +a
  fi

  local agent_bin="$PI_RUNTIME/sandbox-main.js"
  if [ ! -f "$agent_bin" ]; then
    err "sandbox-main.js not found: $agent_bin"
    err "Run 'npm run build:sandbox' to build sandbox entry point"
    exit 1
  fi

  log "Starting Sandbox Agent..."
  exec node "$agent_bin" --config "$MINIONS_RUN/context.json"
}

main() {
  log "=== Minions Sandbox Bootstrap ==="
  log "PI_RUNTIME: $PI_RUNTIME"
  log "MINIONS_RUN: $MINIONS_RUN"

  ensure_node
  verify_pi_runtime
  start_agent
}

main "$@"
