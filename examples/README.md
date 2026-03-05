# Open Minions — Examples

Hands-on examples that show how to use Open Minions for real coding tasks.
Each example is a self-contained project with a task prompt and a verification script.

## Prerequisites

- **Docker** — running and accessible (`docker info` should work)
- **Node.js 22+**
- **Open Minions** installed (`npm install` from the repo root)
- **LLM configured** — run `minion setup` to pick a provider and model

## Quick Start

```bash
# 1. Initialize all example repos
./examples/init.sh

# 2. Try the first example
cd examples/01-hello-world
minion run "$(cat task.txt)"

# 3. Verify the result
./verify.sh
```

## Example Index

| #  | Name             | Difficulty | Language   | Task Type                  |
|----|------------------|------------|------------|----------------------------|
| 01 | hello-world      | Easy       | Python     | Create file                |
| 02 | fix-a-bug        | Easy       | Python     | Bug fix                    |
| 03 | typescript-api   | Easy       | TypeScript | New feature                |
| 04 | python-cli       | Medium     | Python     | Bug fix (vague)            |
| 05 | c-ring-buffer    | Medium     | C          | Implement from spec        |
| 06 | cpp-linked-list  | Medium     | C++        | Add method                 |
| 07 | go-concurrency   | Medium     | Go         | Race condition fix         |
| 08 | java-maven       | Medium     | Java       | Add method                 |
| 09 | shell-script     | Easy       | Shell      | Bug fix                    |
| 10 | react-component  | Hard       | React/TS   | Frontend + npm deps        |
| 11 | refactor-extract | Medium     | TypeScript | Refactoring                |
| 12 | perf-optimize    | Hard       | Python     | Memory optimization        |
| 13 | fullstack-debug  | Hard       | TypeScript | Cross-module debug         |
| 14 | multi-service    | Hard       | Python+TS  | Cross-service fix          |
| 15 | rust-cli         | Medium     | Rust       | Implement TODO stubs       |
| 16 | detached-mode    | Easy       | TypeScript | Background mode tutorial   |
| 17 | custom-config    | Easy       | Python     | Config tutorial            |
| 18 | remote-repo      | Guide      | —          | Remote repo guide          |

## How It Works

Every example directory follows the same pattern:

1. **`init.sh`** (top-level) turns each example into a git repo so Minions can operate on it.
2. **`task.txt`** describes the coding task in plain English.
3. **`minion run task.txt`** sends the task to the agent, which clones the repo into a Docker sandbox, writes code, runs tests, and delivers a patch.
4. **`verify.sh`** checks that the agent's output is correct.

```
examples/01-hello-world/
├── task.txt        # "Create a Python script that prints Hello, World!"
├── verify.sh       # Runs the script and checks stdout
└── ...             # Any starter files the example needs
```

## Tips

- Run `./examples/init.sh` once after cloning. It is idempotent — safe to re-run.
- Each example is independent. Skip around to whatever interests you.
- If an example fails, check `minion logs` for the sandbox journal.
- To reset an example: `cd examples/01-hello-world && git checkout .`
