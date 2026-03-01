# 04-python-cli: CSV Exporter Encoding Bug

## EN

A small Python CLI tool that exports JSON data to CSV. Users have reported that Chinese characters appear garbled in the output file.

### What the agent must do

The task description is intentionally vague — it only says "garbled Chinese characters." The agent needs to:

1. Read the bug report in `task.txt`
2. Examine `csv_exporter.py` to understand the export logic
3. Run the tests to observe the failure
4. Diagnose the root cause: a missing `encoding='utf-8'` parameter in the file open call
5. Apply the fix and verify all tests pass

### Why this is interesting

The bug is a classic Python pitfall. On some platforms, `open()` defaults to a locale-dependent encoding (e.g., `cp1252` on Windows) rather than UTF-8. The agent must connect the vague symptom ("garbled characters") to the specific technical cause (missing encoding parameter) without being told what to look for.

### Run

```bash
pip install -r requirements.txt
bash verify.sh
```

---

## ZH

一个将 JSON 数据导出为 CSV 的 Python 小工具。用户反馈导出文件中的中文显示为乱码。

### Agent 需要做什么

任务描述故意写得很模糊——只说了"中文乱码"。Agent 需要：

1. 阅读 `task.txt` 或 `task.zh.txt` 中的 bug 描述
2. 查看 `csv_exporter.py`，理解导出逻辑
3. 运行测试，观察失败现象
4. 定位根因：`open()` 调用缺少 `encoding='utf-8'` 参数
5. 修复并验证测试通过

### 为什么这个例子有意思

这是一个经典的 Python 编码陷阱。在某些平台上，`open()` 默认使用系统区域编码（如 Windows 上的 `cp1252`）而非 UTF-8。Agent 必须将模糊的症状（"乱码"）与具体的技术原因（缺少 encoding 参数）关联起来，而不是被直接告知答案。

### 运行

```bash
pip install -r requirements.txt
bash verify.sh
```
