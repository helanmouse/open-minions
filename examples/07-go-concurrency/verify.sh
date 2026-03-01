#!/bin/bash
set -e
go test -race -count=1 ./...
echo "PASS: 07-go-concurrency"
