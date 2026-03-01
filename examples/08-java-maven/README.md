# 08-java-maven

## EN

A Java Maven project with a `StringUtils` class that has `reverse` and `capitalize` methods.

The test suite includes tests for an `isPalindrome` method that does not exist yet. The agent must implement `isPalindrome(String)` in `StringUtils.java` so that it checks whether a string is a palindrome, ignoring case and spaces.

### Files

| File | Role |
|---|---|
| `src/main/java/com/example/StringUtils.java` | Utility class with a TODO for isPalindrome (agent fixes this) |
| `src/test/java/com/example/StringUtilsTest.java` | JUnit 5 tests including isPalindrome cases (do not modify) |
| `pom.xml` | Maven project definition with JUnit 5 dependency |
| `task.txt` | Task description for the agent |
| `verify.sh` | Verification script |

### Run

```bash
./verify.sh
```

---

## ZH

一个 Java Maven 项目，包含一个 `StringUtils` 工具类，已有 `reverse` 和 `capitalize` 方法。

测试套件中包含了对尚未实现的 `isPalindrome` 方法的测试。代理需要在 `StringUtils.java` 中实现 `isPalindrome(String)` 方法，判断字符串是否为回文，忽略大小写和空格。

### 文件说明

| 文件 | 作用 |
|---|---|
| `src/main/java/com/example/StringUtils.java` | 工具类，含 isPalindrome 的 TODO（代理修复此文件） |
| `src/test/java/com/example/StringUtilsTest.java` | JUnit 5 测试，包含 isPalindrome 用例（不可修改） |
| `pom.xml` | Maven 项目定义，含 JUnit 5 依赖 |
| `task.txt` | 代理任务描述 |
| `verify.sh` | 验证脚本 |

### 运行

```bash
./verify.sh
```
