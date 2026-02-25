# Open Minions

Inspired by [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) and [OpenClaw](https://github.com/nichochar/open-claw)'s design philosophy, Open Minions is an open-source, one-shot, end-to-end AI coding agent system built for GitLab CI/CD workflows.

Give it a task — fix a bug, implement a feature, patch a flaky test — and it writes the code, runs lint, pushes a branch, and opens a Merge Request. No hand-holding required.

## How It Works

```
Engineer triggers task (CLI / GitLab Issue / Webhook)
        │
        ▼
   Gateway Server (Fastify + BullMQ)
        │
        ▼
   Agent Worker (isolated subprocess)
        │
        ├─ Blueprint Engine orchestrates the flow
        │   ├─ Deterministic steps: git clone, lint, push, create MR
        │   └─ Agent steps: LLM writes & fixes code
        │
        ├─ Local lint check (seconds, not minutes)
        │   └─ Fail? LLM auto-fixes → re-lint
        │
        ├─ Push branch → CI runs
        │   └─ Fail? LLM retries (max 2 rounds, then hands back to human)
        │
        └─ Create Merge Request → human reviews
```

## Key Concepts

### Blueprints

Blueprints are YAML-defined workflows that mix **deterministic steps** (zero LLM cost, fully predictable) with **agent steps** (LLM has full freedom to think and use tools). Borrowed from Stripe's architecture — the best of both worlds.

```yaml
# blueprints/fix-issue.yaml
steps:
  - id: clone
    type: deterministic
    action: git_clone

  - id: implement
    type: agent
    tools: [read, write, edit, bash, search_code]
    prompt: "Fix this issue: {{context.issue_description}}"
    max_iterations: 20

  - id: lint
    type: deterministic
    action: run_lint

  - id: push
    type: deterministic
    action: git_push

  - id: create_mr
    type: deterministic
    action: create_merge_request
```

### Pluggable LLMs

Swap between OpenAI, Anthropic, Ollama (local models) via config. No vendor lock-in.

### Unified Tool System

All tools implement a single `AgentTool` interface. Each Blueprint step declares which tools the LLM can access — preventing the agent from doing things it shouldn't (like pushing code during the coding phase).

### Left-Shift Feedback

Inspired by Stripe's approach: catch errors early and cheap.

1. **Local lint** — milliseconds, blocks obvious mistakes before CI
2. **CI tests** — full test suite, but LLM gets max 1-2 retry rounds
3. **Over budget?** — task returns to human. No infinite loops burning tokens.

### Per-Directory Rules

Drop `.minion-rules.md` files anywhere in your repo. The agent loads them dynamically as it navigates your codebase — no context window bloat.

```
your-repo/
├── .minion/
│   ├── config.yaml          # lint/test commands, language
│   └── rules/global.md      # global coding rules
├── src/
│   ├── .minion-rules.md     # src-specific rules
│   └── api/
│       └── .minion-rules.md # api-specific rules
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Redis (for task queue)
- A GitLab account + personal access token

### Install

```bash
git clone https://github.com/helanmouse/open-minions.git
cd open-minions
npm install
cp .env.example .env  # configure your LLM keys and GitLab token
```

### Configure

Edit `.env`:

```bash
LLM_PROVIDER=openai          # openai | anthropic | ollama
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-...
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=glpat-...
REDIS_URL=redis://localhost:6379
```

### Start the server

```bash
npm run dev:server
```

### Submit a task via CLI

```bash
# Fix a GitLab issue
npx minion run \
  -r https://gitlab.com/yourgroup/yourrepo.git \
  -d "Fix the login page crash on empty email" \
  -i 42 \
  -b fix-issue

# Check status
npx minion status <task-id>

# List all tasks
npx minion list
```

### Trigger via GitLab Webhook

1. Go to your GitLab project → Settings → Webhooks
2. Add URL: `https://your-server/api/webhook/gitlab`
3. Select "Issues events"
4. Add the `minion` label to any issue → agent starts automatically

## Architecture

```
┌──────────────────────────────────────────────┐
│               Triggers                        │
│   CLI  │  GitLab Webhook  │  Future: Slack    │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│          Gateway (Fastify + BullMQ)           │
│   Task Queue  │  Scheduler  │  GitLab Client  │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│            Agent Worker (subprocess)          │
│   Blueprint Engine  │  LLM Adapter  │  Tools  │
└──────────────────────────────────────────────┘
```

## Project Setup for Your Repo

Add a `.minion/config.yaml` to any repo you want minions to work on:

```yaml
lint_command: "npm run lint"
test_command: "npm test"
language: "typescript"
```

## Acknowledgments

- [Stripe Minions Blog Part 1](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — the "what" and "why"
- [Stripe Minions Blog Part 2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) — the "how" (Blueprints, Devboxes, Toolshed)
- [OpenClaw](https://github.com/nichochar/open-claw) — Gateway pattern, unified tool interface, composable security layers
- [Goose](https://github.com/block/goose) — Block's open-source coding agent (Stripe's Minions fork from this)

## License

MIT
