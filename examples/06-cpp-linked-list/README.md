# 06-cpp-linked-list

## EN

A C++ project where the agent adds a `sort()` method to an existing linked list implementation.

The header file `linked_list.h` defines a `LinkedList` class with insert, remove, print, size, and at methods. The implementation file `linked_list.cpp` has all methods working except `sort()`, which contains only a stub. Tests in `test_linked_list.cpp` verify sorting works correctly for normal, empty, and single-element lists.

The task: implement the `sort()` method in `linked_list.cpp` so that `make test` compiles and passes all assertions.

### Files

| File | Role |
|---|---|
| `linked_list.h` | Class definition (do not modify) |
| `linked_list.cpp` | Implementation with sort() stub (agent fills in) |
| `test_linked_list.cpp` | Pre-written tests (do not modify) |
| `Makefile` | Build and test (`make test`) |
| `task.txt` | Task description for the agent |
| `verify.sh` | Verification script |

### Run

```bash
./verify.sh
```

---

## ZH

一个 C++ 项目，代理为现有链表实现添加 `sort()` 方法。

头文件 `linked_list.h` 定义了 `LinkedList` 类，包含 insert、remove、print、size 和 at 方法。实现文件 `linked_list.cpp` 中所有方法均已实现，唯独 `sort()` 只有桩函数。`test_linked_list.cpp` 中的测试验证排序在正常、空链表和单元素链表情况下均能正确工作。

任务：实现 `linked_list.cpp` 中的 `sort()` 方法，使 `make test` 编译通过并通过所有断言。

### 文件说明

| 文件 | 作用 |
|---|---|
| `linked_list.h` | 类定义（不可修改） |
| `linked_list.cpp` | 含 sort() 桩函数的实现（代理填写） |
| `test_linked_list.cpp` | 预编写的测试（不可修改） |
| `Makefile` | 构建和测试（`make test`） |
| `task.txt` | 代理任务描述 |
| `verify.sh` | 验证脚本 |

### 运行

```bash
./verify.sh
```
