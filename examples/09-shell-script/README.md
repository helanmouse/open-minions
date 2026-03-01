# 09 - Shell Script Quoting

A shell script (`deploy.sh`) that copies files from a source directory to a destination directory. It has a classic quoting bug: variable expansions are not quoted, so paths containing spaces cause word splitting and the script fails.

## The Bug

```bash
# Unquoted variables undergo word splitting
mkdir -p $DEST_DIR
cp -r $SOURCE_DIR/* $DEST_DIR/
```

When `DEST_DIR` is `/tmp/my dest dir`, the shell splits it into two arguments: `/tmp/my` and `dest` and `dir`.

## What the agent should do

- Run the test to see the failure
- Identify the unquoted variable expansions in `deploy.sh`
- Wrap `$SOURCE_DIR` and `$DEST_DIR` in double quotes
- Verify all tests pass

## Run

```bash
# Let the minion complete the task
minion task.txt

# Verify
./verify.sh
```

---

# 09 - Shell 脚本引号问题 (中文)

一个将文件从源目录复制到目标目录的 shell 脚本（`deploy.sh`）。它有一个经典的引号 bug：变量展开没有加引号，因此当路径包含空格时，shell 会进行单词拆分，导致脚本失败。

## Bug 说明

```bash
# 未加引号的变量会被单词拆分
mkdir -p $DEST_DIR
cp -r $SOURCE_DIR/* $DEST_DIR/
```

当 `DEST_DIR` 为 `/tmp/my dest dir` 时，shell 会将其拆分为三个参数：`/tmp/my`、`dest` 和 `dir`。

## 代理应完成的操作

- 运行测试查看失败信息
- 找到 `deploy.sh` 中未加引号的变量展开
- 用双引号包裹 `$SOURCE_DIR` 和 `$DEST_DIR`
- 验证所有测试通过

## 运行

```bash
# 让 minion 完成任务
minion task.txt

# 验证
./verify.sh
```
