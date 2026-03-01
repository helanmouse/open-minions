#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for dir in "$SCRIPT_DIR"/[0-9][0-9]-*/; do
  [ ! -d "$dir" ] && continue
  if [ ! -d "$dir/.git" ]; then
    echo "Initializing $(basename "$dir")..."
    (cd "$dir" && git init -q && git add . && git commit -m "initial" -q)
  else
    echo "$(basename "$dir") — already initialized"
  fi
done
echo "Done. Run 'minion setup' if you haven't configured your LLM."
