#!/bin/bash
set -e
python3 hello.py | grep -q "Hello"
python3 -m pytest test_hello.py -v
echo "PASS: 01-hello-world"
