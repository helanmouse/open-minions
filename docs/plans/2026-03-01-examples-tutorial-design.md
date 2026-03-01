# Examples Tutorial Design

## Goal

Create an `examples/` directory that serves as both user tutorial and e2e test fixture for Open Minions. Each example is a self-contained mini-project with real code, a bilingual task description, and automated verification.

## Architecture

- **Organization**: By capability group (getting-started, by-language, by-task-type, advanced, cli-patterns)
- **Dual purpose**: Users run examples manually as tutorials; `npm run test:e2e` runs them all as integration tests
- **Bilingual**: README in English, `task.txt` provides both Chinese and English task descriptions
- **Complexity**: Mixed — getting-started is minimal (<50 lines), advanced uses real project snippets (50-200 lines)
- **Languages**: TypeScript, Python, C/C++, Go, Java, Shell (7 languages)

## Per-Example Structure

Each example directory contains:

```
examples/<group>/<example-name>/
├── README.md              # English: what it demonstrates, how to run, what to verify
├── task.txt               # Task description (English)
├── task.zh.txt            # Task description (Chinese)
├── verify.sh              # Automated verification script (exit 0 = pass)
├── .minion-example.json   # Metadata: difficulty, language, tags, estimated tokens
└── <source files>         # The actual project fixture
```

## Directory Structure

```
examples/
├── README.md                              # Entry point + index
├── init.sh                                # Initialize all examples as git repos
│
├── 01-hello-world/                        # Simplest task — create a file
├── 02-fix-a-bug/                          # Python division bug fix
│
├── 03-typescript-api/                     # Express POST endpoint
├── 04-python-cli/                         # CSV UTF-8 encoding bug
├── 05-c-ring-buffer/                      # Implement from header spec
├── 06-cpp-linked-list/                    # Add sort method to linked list
├── 07-go-concurrency/                     # Fix race condition
├── 08-java-maven/                         # Add feature to Maven project
├── 09-shell-script/                       # Fix deployment script
│
├── 10-react-component/                    # Frontend + npm dependency install
├── 11-refactor-extract/                   # Extract module, keep tests passing
├── 12-perf-optimize/                      # Memory optimization
├── 13-fullstack-debug/                    # Cross-module bug tracing
├── 14-multi-service/                      # Python+TS microservices
│
├── 15-rust-cli/                           # Implement CLI from TODO stubs
├── 16-detached-mode/                      # Background task + list/status/stop
├── 17-custom-config/                      # Container presets + LLM switching
└── 18-remote-repo/                        # --repo <github-url>
```

## Capability Coverage Matrix

| # | Example | Lang | Task Type | CLI Feature | Sandbox Tools |
|---|---------|------|-----------|-------------|---------------|
| 01 | hello-world | — | Create file | `run -y` | write, bash |
| 02 | fix-a-bug | Python | Bug fix | `run --repo .` | read, edit, bash |
| 03 | typescript-api | TS | New feature | `run --timeout` | read, write, edit, bash |
| 04 | python-cli | Python | Bug fix (vague) | `run` (interactive) | grep, read, edit, bash |
| 05 | c-ring-buffer | C | Implement | `run -y` | read, write, bash |
| 06 | cpp-linked-list | C++ | New feature | `run -y` | read, edit, bash |
| 07 | go-concurrency | Go | Concurrency bug | `run -y` | grep, find, read, edit |
| 08 | java-maven | Java | New feature | `run -y` | read, write, edit, bash |
| 09 | shell-script | Shell | Bug fix | `run -y` | read, edit, bash |
| 10 | react-component | TS/React | New feature+deps | `run -y` | bash(npm), write, edit |
| 11 | refactor-extract | TS | Refactor | `run -y` | grep, find, read, edit, write |
| 12 | perf-optimize | Python | Performance | `run -y` | read, edit, bash |
| 13 | fullstack-debug | TS | Cross-module debug | `run` | grep, find, ls, read, edit |
| 14 | multi-service | Py+TS | Cross-service fix | `run -y` | grep, find, ls, read, edit |
| 15 | rust-cli | Rust | Implement TODO | `run --timeout 10` | read, write, bash |
| 16 | detached-mode | TS | New feature | `-d`, `list/status/stop` | all |
| 17 | custom-config | Python | Bug fix | presets, `setup`, `config` | read, edit, bash |
| 18 | remote-repo | — | Guide only | `--repo <url>` | — |

## Example Details

### 01-hello-world

**Purpose**: Verify installation works. User sees first result in 30 seconds.

**Fixture**: Empty project with only a README.

**Task (EN)**: "Create a hello.py that prints 'Hello from Minion!' and a test_hello.py that verifies the output."

**Task (ZH)**: "创建 hello.py 打印 'Hello from Minion!'，并创建 test_hello.py 验证输出。"

**Verify**: `python hello.py | grep -q "Hello" && python -m pytest test_hello.py`

---

### 02-fix-a-bug

**Purpose**: Show basic bug fix workflow — read, diagnose, edit.

**Fixture**: Python calculator module. `divide()` uses `//` (integer division) instead of `/`.

```python
# calculator.py
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a // b  # BUG: should be a / b
```

Test expects `divide(7, 2) == 3.5` but gets `3`.

**Task (EN)**: "test_divide is failing — divide() returns wrong value. Fix the bug."

**Task (ZH)**: "test_divide 测试失败了，divide 函数返回值不对。修复这个 bug。"

**Verify**: `python -m pytest`

---

### 03-typescript-api

**Purpose**: TypeScript project, add new feature with tests.

**Fixture**: Express app with GET /api/todos, vitest + supertest configured.

**Task (EN)**: "Add POST /api/todos endpoint. Accept { title, done }, store in memory array with auto-increment id, return 201. Add supertest tests."

**Task (ZH)**: "添加 POST /api/todos 端点，接收 { title, done }，存入内存数组（自增 id），返回 201。添加 supertest 测试。"

**Verify**: `npm test`

---

### 04-python-cli

**Purpose**: Vague bug description — agent must diagnose autonomously.

**Fixture**: CSV exporter that writes without `encoding='utf-8'`. Test checks Chinese characters in output.

```python
# csv_exporter.py — BUG: missing encoding='utf-8'
with open(output_file, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=data[0].keys())
```

**Task (EN)**: "The CSV export has a bug — users report garbled Chinese characters in output. Fix it."

**Task (ZH)**: "CSV 导出功能有 bug，用户反馈导出的文件中文乱码。修复它。"

**Verify**: `python -m pytest`

---

### 05-c-ring-buffer

**Purpose**: C project, implement functions from header spec.

**Fixture**: `ring_buffer.h` with full API declarations, `ring_buffer.c` with empty function bodies, `test_ring_buffer.c` with tests, `Makefile`.

**Task (EN)**: "Implement all functions in ring_buffer.c according to ring_buffer.h. Pass `make test`."

**Task (ZH)**: "根据 ring_buffer.h 的接口定义，实现 ring_buffer.c 中的所有函数。通过 make test。"

**Verify**: `make test`

---

### 06-cpp-linked-list

**Purpose**: C++ project, add method to existing class.

**Fixture**: `linked_list.h/cpp` with insert/remove/print. Missing `sort()`. `test_linked_list.cpp` tests sort. `Makefile` with C++17.

**Task (EN)**: "Add a sort() method to LinkedList that sorts nodes in ascending order. Pass `make test`."

**Task (ZH)**: "给 LinkedList 添加 sort() 方法，按升序排列节点。通过 make test。"

**Verify**: `make test`

---

### 07-go-concurrency

**Purpose**: Go project, diagnose and fix race condition.

**Fixture**: HTTP server with shared `map[string]string` without mutex. Test uses `-race` flag.

**Task (EN)**: "This HTTP server panics under load. Find and fix the race condition."

**Task (ZH)**: "这个 HTTP 服务有并发安全问题，压测时偶尔 panic。找到问题并修复。"

**Verify**: `go test -race ./...`

---

### 08-java-maven

**Purpose**: Java/Maven project, add feature with JUnit tests.

**Fixture**: Maven project with `StringUtils.java` (has `reverse`, `capitalize`). Missing `isPalindrome`. Test expects it.

**Task (EN)**: "Add isPalindrome(String) to StringUtils. Case-insensitive, ignore spaces. Pass `mvn test`."

**Task (ZH)**: "给 StringUtils 添加 isPalindrome 方法，忽略大小写和空格。通过 mvn test。"

**Verify**: `mvn test`

---

### 09-shell-script

**Purpose**: Shell script bug fix — unquoted variables fail with spaces in paths.

**Fixture**: `deploy.sh` with `cp -r $SOURCE_DIR/*` (unquoted). `test_deploy.sh` creates path with spaces.

**Task (EN)**: "deploy.sh fails when directory paths contain spaces. Fix the script."

**Task (ZH)**: "deploy.sh 在目录路径包含空格时会失败。修复这个脚本。"

**Verify**: `bash test_deploy.sh`

---

### 10-react-component

**Purpose**: Frontend project, agent installs npm dependency (@dnd-kit).

**Fixture**: React + Vite project. `TodoList.tsx` renders static list. Need drag-and-drop sorting.

**Task (EN)**: "Add drag-and-drop sorting to TodoList using @dnd-kit/sortable. Update state on reorder. Add tests."

**Task (ZH)**: "给 TodoList 添加拖拽排序功能，使用 @dnd-kit/sortable，拖拽后更新顺序。添加测试。"

**Verify**: `npm test`

---

### 11-refactor-extract

**Purpose**: Refactoring — split monolith file while keeping tests green.

**Fixture**: `monolith.ts` (~200 lines) with mixed concerns: validation, formatting, calculation. `monolith.test.ts` with 10+ tests all passing.

**Task (EN)**: "Refactor monolith.ts: extract validation into validator.ts, formatting into formatter.ts. Keep all existing tests passing."

**Task (ZH)**: "重构 monolith.ts：把验证逻辑提取到 validator.ts，格式化逻辑提取到 formatter.ts。保持所有测试通过。"

**Verify**: `npm test`

---

### 12-perf-optimize

**Purpose**: Performance optimization with measurable constraint.

**Fixture**: `data_pipeline.py` loads entire CSV via `pd.read_csv()`. Test sets 100MB memory limit with `resource.setrlimit`.

**Task (EN)**: "data_pipeline.py runs out of memory on large files. Optimize to handle GB-scale files with constant memory."

**Task (ZH)**: "data_pipeline.py 处理大文件时内存溢出。优化它使其能处理 GB 级文件。"

**Verify**: `python -m pytest`

---

### 13-fullstack-debug

**Purpose**: Cross-module bug tracing across controller → service → route.

**Fixture**: Express backend with `userController.ts`, `emailService.ts` (bug: `user.mail` instead of `user.email`), `userRoutes.ts`. Integration test mocks SMTP.

**Task (EN)**: "Users don't receive welcome emails after registration. Trace the full chain from form submission to email sending. Find and fix the bug."

**Task (ZH)**: "用户注册后没有收到欢迎邮件。排查从表单提交到邮件发送的完整链路，找到并修复问题。"

**Verify**: `npm test`

---

### 14-multi-service

**Purpose**: Multi-language microservices, cross-service debugging.

**Fixture**: `data-service/` (Python Flask — sometimes returns text/plain instead of JSON) + `api-gateway/` (TS Express — doesn't handle non-JSON responses). Each has own tests.

**Task (EN)**: "API gateway returns 500 intermittently when calling data-service. Debug cross-service communication and fix both services."

**Task (ZH)**: "API 网关调用数据服务时偶尔返回 500。排查并修复跨服务通信问题。"

**Verify**: `cd data-service && python -m pytest && cd ../api-gateway && npm test`

---

### 15-rust-cli

**Purpose**: Rust/Cargo project, implement from TODO stubs.

**Fixture**: `Cargo.toml` with serde_json dep, `src/lib.rs` and `src/main.rs` with `todo!()` placeholders, `tests/integration.rs` with stdin→stdout and --indent tests.

**Task (EN)**: "Implement the JSON formatter CLI: read from stdin, format with --indent flag (default 2), output to stdout. Fill TODO in main.rs and lib.rs. Pass cargo test."

**Task (ZH)**: "实现 JSON 格式化 CLI：从 stdin 读取，用 --indent 参数格式化（默认 2），输出到 stdout。补全 TODO。通过 cargo test。"

**Verify**: `cargo test`

---

### 16-detached-mode

**Purpose**: Demonstrate `-d` background mode + task management commands.

**Fixture**: Simple TS project. README is the main content — a step-by-step tutorial.

**Tutorial steps in README**:
1. `minion run -y -d "Add deepMerge function to utils.ts with tests"` — launch background
2. `minion list` — see task in list
3. `minion status <id>` — check progress
4. `minion stop <id>` — (optional) cancel
5. Wait for completion, then `npm test`

**Verify**: `minion status <id>` shows done + `npm test` passes

---

### 17-custom-config

**Purpose**: Container presets (git identity, timezone) + LLM provider switching.

**Fixture**: Simple Python project with a date formatting bug. README is the main tutorial.

**Tutorial covers**:
- `minion setup` — interactive TUI
- `~/.minion/config.json` presets: git.userName, git.userEmail, timezone
- Environment variable config: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`
- `minion config` — view current settings
- Verify git identity in commit log after task

**Task (EN)**: "Fix the date formatting bug in app.py"

**Task (ZH)**: "修复 app.py 中的日期格式化 bug"

**Verify**: `python -m pytest` + `git log --format="%an" -1` shows custom name

---

### 18-remote-repo

**Purpose**: `--repo <github-url>` for remote repositories. Guide only, no fixture.

**README tutorial covers**:
- `minion run -y --repo https://github.com/user/repo "task description"`
- Workflow: auto-clone → sandbox → patch → apply → push
- `--timeout` for remote repos (network latency)
- Checking results with `minion status`

**Verify**: User checks remote branch for changes.

---

## init.sh — One-Click Initialization

```bash
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
```

## examples/README.md Overview

Top-level README serves as entry point:

1. **Prerequisites** — Docker running, Node.js 22+, `minion setup` completed
2. **Quick Start** — Run `./init.sh`, then `cd 01-hello-world && minion run -y "$(cat task.txt)"`
3. **Example Index** — Table with name, difficulty, language, task type, CLI features
4. **How It Works** — git init → minion run → verify.sh
5. **Tips** — Choosing providers, timeout settings, reading patch output

## Implementation Notes

1. **Self-contained** — Each example must not depend on other examples or project root files
2. **Tests pre-written** — Agent's job is to fix/implement code, not write tests
3. **Dependencies complete** — package.json / requirements.txt / Makefile must list everything
4. **Bugs must be real** — Running tests on the fixture must actually fail
5. **Bilingual** — task.txt (English), task.zh.txt (Chinese), README bilingual
6. **verify.sh idempotent** — Exit 0 on success, non-zero on failure, can run multiple times
7. **Provider-agnostic** — Examples work with any LLM provider, not hardcoded to specific one

## E2E Test Runner Integration

Add `test/e2e/runner.ts` that:
1. Scans `examples/[0-9][0-9]-*/` directories
2. For each: creates temp copy, `git init`, runs `minion run -y`, executes `verify.sh`
3. Reports pass/fail per example
4. Skips guide-only examples (18-remote-repo)
5. Timeout: 5 min per example

```json
// package.json script
{ "test:e2e": "vitest --run test/e2e/ --timeout 300000" }
```
