#!/bin/bash
set -e

TMPDIR=$(mktemp -d)
trap "rm -rf \"$TMPDIR\"" EXIT

# Create source with spaces in path
SRC="$TMPDIR/my source dir"
DST="$TMPDIR/my dest dir"
mkdir -p "$SRC"
echo "hello" > "$SRC/file.txt"
mkdir -p "$SRC/sub folder"
echo "world" > "$SRC/sub folder/nested.txt"

# Run deploy
bash deploy.sh "$SRC" "$DST"

# Verify
[ -f "$DST/file.txt" ] || { echo "FAIL: file.txt missing"; exit 1; }
[ -f "$DST/sub folder/nested.txt" ] || { echo "FAIL: nested.txt missing"; exit 1; }
echo "PASS: 09-shell-script"
