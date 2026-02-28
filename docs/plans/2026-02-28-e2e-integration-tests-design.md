# E2E Integration Tests Design

## Overview

Design 10 end-to-end integration tests for the Minions autonomous coding agent. Each test creates a temporary git repository, invokes `minion run` via CLI with a real LLM (Zhipu GLM-5), and verifies the sandbox agent produces working patches.

## Design Decisions

- **LLM**: Real API calls to Zhipu GLM-5 (no mocks)
- **Test repos**: Temporary git repos created per test, cleaned up after
- **Verification**: Functional — patches must apply, code must compile/lint/test
- **Timeout**: 5 minutes per test
- **Driver**: CLI black-box (`npx tsx src/cli/index.ts run -y`)
- **Isolation**: Separate `test:e2e` script, not mixed with unit tests

## Test Matrix

| # | Language | Code Type | Info Level | Task Type |
|---|----------|-----------|------------|-----------|
| 1 | TypeScript | Backend API | Complete | New feature |
| 2 | Python | CLI tool | Incomplete | Bug fix |
| 3 | C | System/Embedded | Complete | Implementation |
| 4 | Go | Backend | Incomplete | Bug fix (concurrency) |
| 5 | TypeScript | Frontend React | Complete | New feature |
| 6 | Python | Data processing | Incomplete | Performance fix |
| 7 | Rust | CLI tool | Complete | Implementation |
| 8 | TypeScript | Fullstack | Incomplete | Bug fix (cross-module) |
| 9 | C | Embedded | Complete | New feature |
| 10 | Multi-lang | Microservices | Incomplete | Bug fix (cross-service) |

## Test Cases

### 1. TypeScript Backend API (Complete Info)

**Fixture**: Express project with `package.json`, `tsconfig.json`, `src/app.ts` (Express app with GET /api/todos), `vitest.config.ts`, existing test file.

**Task**: "给 Express 项目添加 POST /api/todos 端点，接收 { title, done } 存入内存数组，返回 201 + 创建的 todo（含自增 id）。添加对应的 supertest 测试。"

**Verify**: `npm test` passes.

### 2. Python CLI Tool (Incomplete Info)

**Fixture**: Python CLI with `csv_exporter.py` that writes CSV without UTF-8 BOM/encoding, `test_csv_exporter.py` with a failing test that checks Chinese characters in output.

**Task**: "这个 CLI 工具的 csv 导出功能有 bug，用户反馈导出的文件中文乱码。修复它。"

**Verify**: `python -m pytest` passes.

### 3. C Ring Buffer (Complete Info)

**Fixture**: `ring_buffer.h` with struct and function declarations, `ring_buffer.c` with empty function bodies, `test_ring_buffer.c` with tests, `Makefile` with `test` target.

**Task**: "实现 ring_buffer.c 中的 ring_buffer_push 和 ring_buffer_pop 函数，满足头文件定义的接口，通过 Makefile 中的 test target。"

**Verify**: `make test` passes.

### 4. Go HTTP Race Condition (Incomplete Info)

**Fixture**: Go HTTP server with a shared map accessed without mutex in handler, `go.mod`, `main.go`, `main_test.go` with `-race` flag test.

**Task**: "这个 HTTP 服务有并发安全问题，压测时偶尔 panic。找到问题并修复。"

**Verify**: `go test -race ./...` passes.

### 5. TypeScript React DnD (Complete Info)

**Fixture**: React project with `TodoList.tsx` component rendering a list, `package.json` with react/vitest/testing-library deps, `TodoList.test.tsx` skeleton.

**Task**: "给 TodoList 组件添加拖拽排序功能，使用 @dnd-kit/sortable，更新 state 中的顺序，添加 React Testing Library 测试验证排序后顺序变化。"

**Verify**: `npm test` passes.

### 6. Python Data Pipeline (Incomplete Info)

**Fixture**: `data_pipeline.py` that reads entire CSV into memory with `pandas.read_csv()`, `test_pipeline.py` with a test that sets memory limit via `resource.setrlimit` and processes a generated large file.

**Task**: "data_pipeline.py 处理大文件时内存溢出。优化它使其能处理 GB 级文件。"

**Verify**: `python -m pytest` passes.

### 7. Rust JSON Formatter (Complete Info)

**Fixture**: Cargo project with `Cargo.toml`, `src/main.rs` and `src/lib.rs` with TODO placeholders, `tests/integration.rs` with tests for stdin→stdout formatting and `--indent` flag.

**Task**: "实现一个命令行 JSON 格式化工具：从 stdin 读取 JSON，输出格式化结果到 stdout，支持 --indent 参数。补全 main.rs 和 lib.rs 中的 TODO。"

**Verify**: `cargo test` passes.

### 8. TypeScript Fullstack Email (Incomplete Info)

**Fixture**: Express backend with `userController.ts` (register handler), `emailService.ts` (send function with a subtle bug — wrong field name), `userRoutes.ts`, frontend `RegisterForm.tsx`. Integration test that mocks SMTP and asserts email sent.

**Task**: "用户注册后没有收到欢迎邮件。排查从前端表单提交到后端邮件发送的完整链路，找到并修复问题。"

**Verify**: `npm test` passes.

### 9. C GPIO Debounce (Complete Info)

**Fixture**: `gpio_driver.h/c` with ISR handler stub, `timer.h/c` mock timer API, `test_gpio.c` with tests that simulate rapid GPIO toggles and verify debounce behavior. `Makefile` with test target.

**Task**: "为 gpio_driver.c 实现中断去抖动逻辑：在 gpio_isr_handler 中添加 50ms 去抖，使用 timer 回调确认状态稳定后才触发事件。通过 mock 硬件的单元测试。"

**Verify**: `make test` passes.

### 10. Multi-Language Microservices (Incomplete Info)

**Fixture**: Two subdirectories — `data-service/` (Python Flask, returns JSON but sometimes returns wrong Content-Type) and `api-gateway/` (TypeScript Express, calls data-service but doesn't handle non-JSON responses). Each has its own tests.

**Task**: "这个项目有 Python 的数据服务和 TypeScript 的 API 网关。API 网关调用数据服务时偶尔返回 500。排查并修复跨服务通信问题。"

**Verify**: Both `pytest` and `npm test` pass.

## File Structure

```
test/e2e/
├── e2e.test.ts              # 10 test cases
├── helpers.ts               # Shared utilities
└── fixtures/
    ├── 01-ts-express-api.ts
    ├── 02-py-csv-cli.ts
    ├── 03-c-ring-buffer.ts
    ├── 04-go-http-race.ts
    ├── 05-ts-react-dnd.ts
    ├── 06-py-data-pipeline.ts
    ├── 07-rust-json-fmt.ts
    ├── 08-ts-fullstack-email.ts
    ├── 09-c-gpio-debounce.ts
    └── 10-multi-service.ts
```

## Helpers API

```typescript
// Create temp git repo with project files
createTempRepo(setupFn: (dir: string) => void): string

// Run minion CLI, return result
runMinion(repo: string, task: string, timeout?: number):
  { exitCode: number, taskId: string, task: TaskRecord }

// Assert task completed with patches
assertTaskDone(task: TaskRecord): void

// Run verification command in patched repo
runInRepo(repo: string, cmd: string): { exitCode: number, stdout: string }

// Cleanup temp directories
cleanup(dirs: string[]): void
```

## Package.json Script

```json
{
  "test:e2e": "vitest --run test/e2e/ --timeout 300000"
}
```

## Error Handling

- **LLM non-determinism**: Verify by test outcome (compile/test pass), not specific implementation
- **Missing toolchains**: Agent must install Go/Rust itself via `apt-get`; this is part of the test
- **Timeout**: 5 min per test; mark as skip (not fail) on timeout since LLM behavior is non-deterministic
- **Network**: Docker bridge mode allows package installation (npm, pip, cargo, go get)
- **Isolation**: Independent temp dirs per test, cleaned up after each run

## Coverage Analysis

- **Languages**: TypeScript(3), Python(2), C(2), Go(1), Rust(1), Multi-lang(1)
- **Code types**: Backend(2), Frontend(1), CLI(2), System/Embedded(2), Fullstack(1), Data(1), Microservices(1)
- **Info level**: Complete(5), Incomplete(5)
- **Task types**: New feature(4), Bug fix(4), Performance(1), Implementation(1)
- **Complexity**: Single-file(2), Multi-file(5), Cross-module(3)
