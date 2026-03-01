# 07-go-concurrency

## EN

A Go HTTP key-value server with a deliberate race condition on a shared map.

The server exposes two endpoints (`/get` and `/set`) that read and write a `map[string]string` without any synchronization. Under concurrent access this triggers Go's built-in race detector and can cause a panic at runtime.

The task: find the unsynchronized shared state and add proper concurrency protection so that `go test -race` passes cleanly.

### Files

| File | Role |
|---|---|
| `main.go` | HTTP server with the race condition (agent fixes this) |
| `main_test.go` | Concurrent test that exposes the bug (do not modify) |
| `go.mod` | Go module definition |
| `task.txt` | Task description for the agent |
| `verify.sh` | Verification script |

### Run

```bash
./verify.sh
```

---

## ZH

一个 Go 语言 HTTP 键值服务，故意在共享 map 上引入了竞态条件。

服务暴露两个端点（`/get` 和 `/set`），对一个 `map[string]string` 进行无同步保护的读写操作。在并发访问下会触发 Go 内置的竞态检测器，运行时可能导致 panic。

任务：找到未同步的共享状态，添加正确的并发保护，使 `go test -race` 顺利通过。

### 文件说明

| 文件 | 作用 |
|---|---|
| `main.go` | 含竞态条件的 HTTP 服务（代理修复此文件） |
| `main_test.go` | 暴露 bug 的并发测试（不可修改） |
| `go.mod` | Go 模块定义 |
| `task.txt` | 代理任务描述 |
| `verify.sh` | 验证脚本 |

### 运行

```bash
./verify.sh
```
