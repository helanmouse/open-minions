#!/usr/bin/env bash
set -e

PI_RUNTIME_DIR="${PI_RUNTIME_DIR:-$HOME/.minion/pi-runtime}"
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }

log "=== Building pi-runtime ==="
log "Target: $PI_RUNTIME_DIR"

mkdir -p "$PI_RUNTIME_DIR"
cd "$PI_RUNTIME_DIR"

# Initialize package.json if needed
if [ ! -f package.json ]; then
  log "Initializing package.json..."
  npm init -y
fi

# Install pi-mono packages
log "Installing @mariozechner/pi-ai..."
npm install @mariozechner/pi-ai

log "Installing @mariozechner/pi-agent-core..."
npm install @mariozechner/pi-agent-core

log "Installing @sinclair/typebox..."
npm install @sinclair/typebox

log "Installing @mariozechner/coding-agent (for tools)..."
npm install @mariozechner/coding-agent

log "=== pi-runtime build complete ==="
log "Location: $PI_RUNTIME_DIR"
