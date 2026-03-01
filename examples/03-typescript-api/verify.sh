#!/bin/bash
set -e
npm install --silent
npm test
echo "PASS: 03-typescript-api"
