#!/bin/bash
set -e

SOURCE_DIR=$1
DEST_DIR=$2

if [ -z "$SOURCE_DIR" ] || [ -z "$DEST_DIR" ]; then
  echo "Usage: deploy.sh <source> <dest>"
  exit 1
fi

# BUG: unquoted variables fail when paths contain spaces
mkdir -p $DEST_DIR
cp -r $SOURCE_DIR/* $DEST_DIR/
echo "Deployed $SOURCE_DIR → $DEST_DIR"
