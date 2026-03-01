# 02 - Fix a Bug

A simple bug-fix example. The `divide()` function in `calculator.py` uses integer division (`//`) instead of float division (`/`), causing `test_divide` to fail.

## The Bug

```python
def divide(a, b):
    return a // b  # integer division — divide(7, 2) returns 3, not 3.5
```

## What the agent should do

- Read the failing test to understand the expected behavior
- Identify that `//` should be `/` in `calculator.py`
- Fix the bug so all tests pass

## Run

```bash
# Let the minion complete the task
minion task.txt

# Verify
./verify.sh
```

---

# 02 - 修复 Bug (中文)

一个简单的 Bug 修复示例。`calculator.py` 中的 `divide()` 函数使用了整数除法（`//`）而非浮点除法（`/`），导致 `test_divide` 测试失败。

## Bug 说明

```python
def divide(a, b):
    return a // b  # 整数除法 — divide(7, 2) 返回 3，而非 3.5
```

## 代理应完成的操作

- 阅读失败的测试，理解期望行为
- 找到 `calculator.py` 中 `//` 应改为 `/` 的问题
- 修复 Bug，使所有测试通过

## 运行

```bash
# 让 minion 完成任务
minion task.txt

# 验证
./verify.sh
```
