# 05-c-ring-buffer

## EN

A C project where the agent implements ring buffer functions from a header specification.

The header file `ring_buffer.h` defines the full API for a fixed-size integer ring buffer: create, destroy, push, pop, and status queries. The implementation file `ring_buffer.c` contains only stubs with TODO comments. All tests are pre-written in `test_ring_buffer.c`.

The task: implement every function body in `ring_buffer.c` so that `make test` compiles and passes all assertions.

### Files

| File | Role |
|---|---|
| `ring_buffer.h` | API specification (do not modify) |
| `ring_buffer.c` | Stub implementations (agent fills these in) |
| `test_ring_buffer.c` | Pre-written tests (do not modify) |
| `Makefile` | Build and test (`make test`) |
| `task.txt` | Task description for the agent |
| `verify.sh` | Verification script |

### Run

```bash
./verify.sh
```

---

## ZH

一个 C 语言项目，代理根据头文件规范实现环形缓冲区的所有函数。

头文件 `ring_buffer.h` 定义了固定大小整数环形缓冲区的完整 API：创建、销毁、入队、出队和状态查询。实现文件 `ring_buffer.c` 仅包含带有 TODO 注释的桩函数。所有测试已预先编写在 `test_ring_buffer.c` 中。

任务：实现 `ring_buffer.c` 中的每个函数体，使 `make test` 编译通过并通过所有断言。

### 文件说明

| 文件 | 作用 |
|---|---|
| `ring_buffer.h` | API 规范（不可修改） |
| `ring_buffer.c` | 桩实现（代理填写） |
| `test_ring_buffer.c` | 预编写的测试（不可修改） |
| `Makefile` | 构建和测试（`make test`） |
| `task.txt` | 代理任务描述 |
| `verify.sh` | 验证脚本 |

### 运行

```bash
./verify.sh
```
