# 01 - Hello World

The simplest possible example. The agent creates a Python file from scratch and a test to verify its output.

## What it does

- Creates `hello.py` that prints `Hello from Minion!`
- Creates `test_hello.py` that verifies the output
- No source code fixture needed — starts from an empty project

## Run

```bash
# Let the minion complete the task
minion task.txt

# Verify
./verify.sh
```

---

# 01 - Hello World (中文)

最简单的示例。代理从零开始创建一个 Python 文件，并生成测试来验证输出。

## 功能说明

- 创建 `hello.py`，打印 `Hello from Minion!`
- 创建 `test_hello.py`，验证输出结果
- 无需源代码模板 — 从空项目开始

## 运行

```bash
# 让 minion 完成任务
minion task.txt

# 验证
./verify.sh
```
