# Examples Tutorial Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create 18 self-contained example projects in `examples/` that serve as both user tutorials and e2e test fixtures, covering all Open Minions capabilities.

**Architecture:** Flat numbered directories (01-18), each with source code, bilingual task descriptions, verify.sh, and README. Top-level README + init.sh as entry points. E2E runner scans examples automatically.

**Tech Stack:** TypeScript, Python, C, C++, Go, Java, Rust, Shell, React/Vite, Express, Flask, Maven

**Design doc:** `docs/plans/2026-03-01-examples-tutorial-design.md`

---

### Task 1: Scaffold — Top-level files + init.sh

**Files:**
- Create: `examples/README.md`
- Create: `examples/init.sh`

**Step 1: Create examples/README.md**

Write the top-level README with:
- Prerequisites (Docker, Node.js 22+, `minion setup`)
- Quick Start section pointing to 01-hello-world
- Example index table (all 18 examples: name, difficulty, language, task type)
- "How It Works" section (git init → minion run → verify.sh)
- Tips section

**Step 2: Create examples/init.sh**

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

**Step 3: Make init.sh executable**

Run: `chmod +x examples/init.sh`

**Step 4: Commit**

```bash
git add examples/README.md examples/init.sh
git commit -m "feat(examples): add top-level README and init.sh"
```

---

### Task 2: Example 01-hello-world

**Files:**
- Create: `examples/01-hello-world/README.md`
- Create: `examples/01-hello-world/task.txt`
- Create: `examples/01-hello-world/task.zh.txt`
- Create: `examples/01-hello-world/verify.sh`
- Create: `examples/01-hello-world/.minion-example.json`

**Step 1: Create README.md**

Bilingual README explaining: simplest possible example, creates a Python file, verifies output.

**Step 2: Create task.txt**

```
Create a hello.py that prints 'Hello from Minion!' and a test_hello.py that verifies the output.
```

**Step 3: Create task.zh.txt**

```
创建 hello.py 打印 'Hello from Minion!'，并创建 test_hello.py 验证输出。
```

**Step 4: Create verify.sh**

```bash
#!/bin/bash
set -e
python3 hello.py | grep -q "Hello"
python3 -m pytest test_hello.py -v
echo "PASS: 01-hello-world"
```

**Step 5: Create .minion-example.json**

```json
{
  "name": "hello-world",
  "difficulty": "easy",
  "language": "python",
  "taskType": "create",
  "tags": ["getting-started", "python", "first-example"]
}
```

**Step 6: Commit**

```bash
git add examples/01-hello-world/
git commit -m "feat(examples): add 01-hello-world"
```

---

### Task 3: Example 02-fix-a-bug

**Files:**
- Create: `examples/02-fix-a-bug/README.md`
- Create: `examples/02-fix-a-bug/calculator.py`
- Create: `examples/02-fix-a-bug/test_calculator.py`
- Create: `examples/02-fix-a-bug/requirements.txt`
- Create: `examples/02-fix-a-bug/task.txt`
- Create: `examples/02-fix-a-bug/task.zh.txt`
- Create: `examples/02-fix-a-bug/verify.sh`
- Create: `examples/02-fix-a-bug/.minion-example.json`

**Step 1: Create calculator.py**

```python
def add(a, b):
    return a + b

def subtract(a, b):
    return a - b

def multiply(a, b):
    return a * b

def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a // b  # BUG: integer division, should be a / b
```

**Step 2: Create test_calculator.py**

```python
import pytest
from calculator import add, subtract, multiply, divide

def test_add():
    assert add(2, 3) == 5

def test_subtract():
    assert subtract(5, 3) == 2

def test_multiply():
    assert multiply(3, 4) == 12

def test_divide():
    assert divide(7, 2) == 3.5  # FAILS: returns 3

def test_divide_by_zero():
    with pytest.raises(ValueError):
        divide(1, 0)
```

**Step 3: Create requirements.txt**

```
pytest
```

**Step 4: Create task.txt, task.zh.txt, verify.sh, .minion-example.json, README.md**

task.txt: `test_divide is failing — divide() returns wrong value. Fix the bug.`
task.zh.txt: `test_divide 测试失败了，divide 函数返回值不对。修复这个 bug。`
verify.sh: `python3 -m pytest -v`

**Step 5: Commit**

```bash
git add examples/02-fix-a-bug/
git commit -m "feat(examples): add 02-fix-a-bug"
```

---

### Task 4: Example 03-typescript-api

**Files:**
- Create: `examples/03-typescript-api/package.json`
- Create: `examples/03-typescript-api/tsconfig.json`
- Create: `examples/03-typescript-api/vitest.config.ts`
- Create: `examples/03-typescript-api/src/app.ts`
- Create: `examples/03-typescript-api/test/app.test.ts`
- Create: `examples/03-typescript-api/task.txt`
- Create: `examples/03-typescript-api/task.zh.txt`
- Create: `examples/03-typescript-api/verify.sh`
- Create: `examples/03-typescript-api/.minion-example.json`
- Create: `examples/03-typescript-api/README.md`

**Step 1: Create package.json**

Dependencies: express, @types/express, vitest, supertest, @types/supertest, typescript.
Scripts: `"test": "vitest --run"`, `"build": "tsc"`

**Step 2: Create tsconfig.json**

Standard ES module config targeting ES2022, outDir: dist.

**Step 3: Create src/app.ts**

Express app with:
- `express.json()` middleware
- `Todo` interface: `{ id: number; title: string; done: boolean }`
- In-memory `todos` array with one seed item
- `GET /api/todos` returning the array
- Export `app` and `listen` on port 3000 when run directly

**Step 4: Create test/app.test.ts**

Supertest tests for GET /api/todos (returns array, status 200).

**Step 5: Create task.txt, task.zh.txt, verify.sh, .minion-example.json, README.md**

task.txt: `Add POST /api/todos endpoint. Accept { title, done }, store in memory array with auto-increment id, return 201. Add supertest tests.`
task.zh.txt: `添加 POST /api/todos 端点，接收 { title, done }，存入内存数组（自增 id），返回 201。添加 supertest 测试。`
verify.sh: `npm install --silent && npm test`

**Step 6: Commit**

```bash
git add examples/03-typescript-api/
git commit -m "feat(examples): add 03-typescript-api"
```

---

### Task 5: Example 04-python-cli

**Files:**
- Create: `examples/04-python-cli/csv_exporter.py`
- Create: `examples/04-python-cli/test_csv_exporter.py`
- Create: `examples/04-python-cli/sample_data.json`
- Create: `examples/04-python-cli/requirements.txt`
- Create: `examples/04-python-cli/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create sample_data.json**

```json
[
  {"name": "张三", "age": 30, "city": "北京"},
  {"name": "李四", "age": 25, "city": "上海"},
  {"name": "王五", "age": 35, "city": "广州"}
]
```

**Step 2: Create csv_exporter.py**

```python
import csv, json, sys

def export_csv(input_file, output_file):
    with open(input_file) as f:
        data = json.load(f)
    with open(output_file, 'w', newline='') as f:  # BUG: missing encoding='utf-8'
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

if __name__ == '__main__':
    export_csv(sys.argv[1], sys.argv[2])
```

**Step 3: Create test_csv_exporter.py**

Test that exports sample_data.json to CSV, reads back, asserts Chinese characters are intact.

**Step 4: Create supporting files**

task.txt: `The CSV export has a bug — users report garbled Chinese characters in output. Fix it.`
task.zh.txt: `CSV 导出功能有 bug，用户反馈导出的文件中文乱码。修复它。`
verify.sh: `python3 -m pytest -v`

**Step 5: Commit**

```bash
git add examples/04-python-cli/
git commit -m "feat(examples): add 04-python-cli"
```

---

### Task 6: Example 05-c-ring-buffer

**Files:**
- Create: `examples/05-c-ring-buffer/ring_buffer.h`
- Create: `examples/05-c-ring-buffer/ring_buffer.c`
- Create: `examples/05-c-ring-buffer/test_ring_buffer.c`
- Create: `examples/05-c-ring-buffer/Makefile`
- Create: `examples/05-c-ring-buffer/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create ring_buffer.h**

Full API: `ring_buffer_create`, `_destroy`, `_push`, `_pop`, `_is_empty`, `_is_full`. Struct with `int *data`, `capacity`, `head`, `tail`, `count`.

**Step 2: Create ring_buffer.c**

All function bodies return NULL/false/true stubs (TODO comments).

**Step 3: Create test_ring_buffer.c**

Tests: create/destroy, push single, push until full, pop single, pop until empty, push-pop interleave, overflow returns false, underflow returns false.

**Step 4: Create Makefile**

```makefile
CC = gcc
CFLAGS = -Wall -Wextra -std=c11
test: ring_buffer.c test_ring_buffer.c
	$(CC) $(CFLAGS) -o test_ring_buffer ring_buffer.c test_ring_buffer.c
	./test_ring_buffer
clean:
	rm -f test_ring_buffer
```

**Step 5: Create supporting files and commit**

```bash
git add examples/05-c-ring-buffer/
git commit -m "feat(examples): add 05-c-ring-buffer"
```

---

### Task 7: Example 06-cpp-linked-list

**Files:**
- Create: `examples/06-cpp-linked-list/linked_list.h`
- Create: `examples/06-cpp-linked-list/linked_list.cpp`
- Create: `examples/06-cpp-linked-list/test_linked_list.cpp`
- Create: `examples/06-cpp-linked-list/Makefile`
- Create: `examples/06-cpp-linked-list/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create linked_list.h**

```cpp
#pragma once

struct Node {
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

class LinkedList {
public:
    LinkedList();
    ~LinkedList();
    void insert(int val);
    bool remove(int val);
    void print() const;
    int size() const;
    int at(int index) const;
    // TODO: void sort();  — agent must add this
private:
    Node* head;
    int count;
};
```

**Step 2: Create linked_list.cpp**

Implement all methods except `sort()` (not declared yet). `insert` adds to head, `remove` removes first match, `print` outputs space-separated, `at` returns value at index.

**Step 3: Create test_linked_list.cpp**

```cpp
#include "linked_list.h"
#include <cassert>
#include <iostream>

void test_insert_and_size() {
    LinkedList list;
    list.insert(3); list.insert(1); list.insert(2);
    assert(list.size() == 3);
}

void test_remove() {
    LinkedList list;
    list.insert(1); list.insert(2); list.insert(3);
    assert(list.remove(2));
    assert(list.size() == 2);
    assert(!list.remove(99));
}

void test_sort() {
    LinkedList list;
    list.insert(5); list.insert(1); list.insert(3);
    list.insert(4); list.insert(2);
    list.sort();
    assert(list.at(0) == 1);
    assert(list.at(1) == 2);
    assert(list.at(2) == 3);
    assert(list.at(3) == 4);
    assert(list.at(4) == 5);
}

void test_sort_empty() {
    LinkedList list;
    list.sort();  // should not crash
    assert(list.size() == 0);
}

void test_sort_single() {
    LinkedList list;
    list.insert(42);
    list.sort();
    assert(list.at(0) == 42);
}

int main() {
    test_insert_and_size();
    test_remove();
    test_sort();
    test_sort_empty();
    test_sort_single();
    std::cout << "PASS: 06-cpp-linked-list" << std::endl;
    return 0;
}
```

**Step 4: Create Makefile**

```makefile
CXX = g++
CXXFLAGS = -Wall -Wextra -std=c++17
test: linked_list.cpp test_linked_list.cpp
	$(CXX) $(CXXFLAGS) -o test_linked_list linked_list.cpp test_linked_list.cpp
	./test_linked_list
clean:
	rm -f test_linked_list
```

**Step 5: Create supporting files**

task.txt: `Add a sort() method to LinkedList that sorts nodes in ascending order. Pass 'make test'.`
task.zh.txt: `给 LinkedList 添加 sort() 方法，按升序排列节点。通过 make test。`
verify.sh: `make test`

**Step 6: Commit**

```bash
git add examples/06-cpp-linked-list/
git commit -m "feat(examples): add 06-cpp-linked-list"
```

---

### Task 8: Example 07-go-concurrency

**Files:**
- Create: `examples/07-go-concurrency/go.mod`
- Create: `examples/07-go-concurrency/main.go`
- Create: `examples/07-go-concurrency/main_test.go`
- Create: `examples/07-go-concurrency/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create go.mod**

```
module kvserver

go 1.21
```

**Step 2: Create main.go**

```go
package main

import (
	"encoding/json"
	"net/http"
)

// BUG: shared map without mutex — race condition
var store = map[string]string{}

func getHandler(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	val, ok := store[key]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"key": key, "value": val})
}

func setHandler(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	val := r.URL.Query().Get("value")
	store[key] = val
	w.WriteHeader(http.StatusCreated)
}

func NewMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/get", getHandler)
	mux.HandleFunc("/set", setHandler)
	return mux
}

func main() {
	http.ListenAndServe(":8080", NewMux())
}
```

**Step 3: Create main_test.go**

```go
package main

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestConcurrentAccess(t *testing.T) {
	srv := httptest.NewServer(NewMux())
	defer srv.Close()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			key := fmt.Sprintf("key%d", n)
			http.Get(fmt.Sprintf("%s/set?key=%s&value=val%d", srv.URL, key, n))
		}(i)
		go func(n int) {
			defer wg.Done()
			key := fmt.Sprintf("key%d", n)
			http.Get(fmt.Sprintf("%s/get?key=%s", srv.URL, key))
		}(i)
	}
	wg.Wait()
}
```

Note: Add `"fmt"` to imports in test file.

**Step 4: Create supporting files**

task.txt: `This HTTP server panics under load. Find and fix the race condition.`
task.zh.txt: `这个 HTTP 服务有并发安全问题，压测时偶尔 panic。找到问题并修复。`
verify.sh: `go test -race -count=1 ./...`

**Step 5: Commit**

```bash
git add examples/07-go-concurrency/
git commit -m "feat(examples): add 07-go-concurrency"
```

---

### Task 9: Example 08-java-maven

**Files:**
- Create: `examples/08-java-maven/pom.xml`
- Create: `examples/08-java-maven/src/main/java/com/example/StringUtils.java`
- Create: `examples/08-java-maven/src/test/java/com/example/StringUtilsTest.java`
- Create: `examples/08-java-maven/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create pom.xml**

Standard Maven project: groupId `com.example`, artifactId `string-utils`, Java 17, JUnit 5 dependency.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>string-utils</artifactId>
  <version>1.0-SNAPSHOT</version>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
```

**Step 2: Create StringUtils.java**

```java
package com.example;

public class StringUtils {
    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();
    }

    public static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    // TODO: isPalindrome(String) — agent must add this
}
```

**Step 3: Create StringUtilsTest.java**

```java
package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StringUtilsTest {
    @Test void testReverse() {
        assertEquals("cba", StringUtils.reverse("abc"));
    }

    @Test void testCapitalize() {
        assertEquals("Hello", StringUtils.capitalize("hello"));
    }

    @Test void testIsPalindrome() {
        assertTrue(StringUtils.isPalindrome("racecar"));
        assertTrue(StringUtils.isPalindrome("Race Car"));
        assertFalse(StringUtils.isPalindrome("hello"));
    }

    @Test void testIsPalindromeEmpty() {
        assertTrue(StringUtils.isPalindrome(""));
        assertTrue(StringUtils.isPalindrome("a"));
    }
}
```

**Step 4: Create supporting files**

task.txt: `Add isPalindrome(String) to StringUtils. Case-insensitive, ignore spaces. Pass 'mvn test'.`
task.zh.txt: `给 StringUtils 添加 isPalindrome 方法，忽略大小写和空格。通过 mvn test。`
verify.sh: `mvn test -q`

**Step 5: Commit**

```bash
git add examples/08-java-maven/
git commit -m "feat(examples): add 08-java-maven"
```

---

### Task 10: Example 09-shell-script

**Files:**
- Create: `examples/09-shell-script/deploy.sh`
- Create: `examples/09-shell-script/test_deploy.sh`
- Create: `examples/09-shell-script/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create deploy.sh**

```bash
#!/bin/bash
set -e

SOURCE_DIR=$1
DEST_DIR=$2

if [ -z "$SOURCE_DIR" ] || [ -z "$DEST_DIR" ]; then
  echo "Usage: deploy.sh <source> <dest>"
  exit 1
fi

# BUG: unquoted variables fail when paths contain spaces
mkdir -p $DEST_DIR
cp -r $SOURCE_DIR/* $DEST_DIR/
echo "Deployed $SOURCE_DIR → $DEST_DIR"
```

**Step 2: Create test_deploy.sh**

```bash
#!/bin/bash
set -e

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Create source with spaces in path
SRC="$TMPDIR/my source dir"
DST="$TMPDIR/my dest dir"
mkdir -p "$SRC"
echo "hello" > "$SRC/file.txt"
mkdir -p "$SRC/sub folder"
echo "world" > "$SRC/sub folder/nested.txt"

# Run deploy
bash deploy.sh "$SRC" "$DST"

# Verify
[ -f "$DST/file.txt" ] || { echo "FAIL: file.txt missing"; exit 1; }
[ -f "$DST/sub folder/nested.txt" ] || { echo "FAIL: nested.txt missing"; exit 1; }
echo "PASS: 09-shell-script"
```

**Step 3: Create supporting files**

task.txt: `deploy.sh fails when directory paths contain spaces. Fix the script.`
task.zh.txt: `deploy.sh 在目录路径包含空格时会失败。修复这个脚本。`
verify.sh: `bash test_deploy.sh`

**Step 4: Make scripts executable and commit**

```bash
chmod +x examples/09-shell-script/deploy.sh examples/09-shell-script/test_deploy.sh
git add examples/09-shell-script/
git commit -m "feat(examples): add 09-shell-script"
```

---

### Task 11: Example 10-react-component

**Files:**
- Create: `examples/10-react-component/package.json`
- Create: `examples/10-react-component/tsconfig.json`
- Create: `examples/10-react-component/vite.config.ts`
- Create: `examples/10-react-component/vitest.config.ts`
- Create: `examples/10-react-component/index.html`
- Create: `examples/10-react-component/src/App.tsx`
- Create: `examples/10-react-component/src/TodoList.tsx`
- Create: `examples/10-react-component/src/main.tsx`
- Create: `examples/10-react-component/test/TodoList.test.tsx`
- Create: `examples/10-react-component/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create package.json**

Dependencies: react, react-dom, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react, vitest, @testing-library/react, @testing-library/jest-dom, jsdom.

Scripts: `"dev": "vite"`, `"build": "tsc && vite build"`, `"test": "vitest --run"`

**Step 2: Create tsconfig.json**

Standard React TS config: jsx `react-jsx`, strict, ES2022, module ESNext.

**Step 3: Create vite.config.ts and vitest.config.ts**

vite.config.ts: `@vitejs/plugin-react` plugin.
vitest.config.ts: environment `jsdom`, setupFiles if needed.

**Step 4: Create index.html + src/main.tsx + src/App.tsx**

Minimal React app shell rendering `<TodoList />`.

**Step 5: Create src/TodoList.tsx**

```tsx
import { useState } from 'react';

interface Todo {
  id: number;
  text: string;
}

const initialTodos: Todo[] = [
  { id: 1, text: 'Learn React' },
  { id: 2, text: 'Build a project' },
  { id: 3, text: 'Ship it' },
];

export function TodoList() {
  const [todos] = useState<Todo[]>(initialTodos);

  return (
    <div>
      <h1>Todo List</h1>
      <ul>
        {todos.map(todo => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 6: Create test/TodoList.test.tsx**

Test that: renders all items, after drag-and-drop reorder the order changes. Use `@testing-library/react`. The drag-and-drop test should verify the component accepts `onReorder` or similar prop and updates order.

**Step 7: Create supporting files**

task.txt: `Add drag-and-drop sorting to TodoList using @dnd-kit/sortable. Install the dependency, update state on reorder. Add tests.`
task.zh.txt: `给 TodoList 添加拖拽排序功能，使用 @dnd-kit/sortable，拖拽后更新顺序。添加测试。`
verify.sh: `npm install --silent && npm test`

**Step 8: Commit**

```bash
git add examples/10-react-component/
git commit -m "feat(examples): add 10-react-component"
```

---

### Task 12: Example 11-refactor-extract

**Files:**
- Create: `examples/11-refactor-extract/package.json`
- Create: `examples/11-refactor-extract/tsconfig.json`
- Create: `examples/11-refactor-extract/vitest.config.ts`
- Create: `examples/11-refactor-extract/src/monolith.ts`
- Create: `examples/11-refactor-extract/test/monolith.test.ts`
- Create: `examples/11-refactor-extract/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create package.json**

Dependencies: typescript, vitest. Scripts: `"test": "vitest --run"`, `"build": "tsc"`

**Step 2: Create src/monolith.ts**

~150 lines with mixed concerns:

```typescript
// --- Validation ---
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\+?[\d\s-]{10,}$/.test(phone);
}

export function validateAge(age: number): boolean {
  return Number.isInteger(age) && age >= 0 && age <= 150;
}

// --- Formatting ---
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `+${digits[0]} (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  return phone;
}

// --- Calculation ---
export function calculateTax(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

export function calculateDiscount(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

export function calculateTotal(items: { price: number; qty: number }[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// --- User processing (uses all three concerns) ---
export interface UserInput {
  name: string;
  email: string;
  phone: string;
  age: number;
}

export function processUser(input: UserInput): { valid: boolean; errors: string[]; formatted: Record<string, string> } {
  const errors: string[] = [];
  if (!validateEmail(input.email)) errors.push('Invalid email');
  if (!validatePhone(input.phone)) errors.push('Invalid phone');
  if (!validateAge(input.age)) errors.push('Invalid age');

  return {
    valid: errors.length === 0,
    errors,
    formatted: {
      phone: formatPhone(input.phone),
    },
  };
}
```

**Step 3: Create test/monolith.test.ts**

12+ tests covering all exported functions: validateEmail (valid/invalid), validatePhone, validateAge, formatCurrency, formatDate, formatPhone, calculateTax, calculateDiscount, calculateTotal, processUser (valid/invalid). All tests import from `../src/monolith`.

**Step 4: Create supporting files**

task.txt: `Refactor monolith.ts: extract validation into src/validator.ts, formatting into src/formatter.ts, calculation into src/calculator.ts. Update monolith.ts to re-export from the new modules. Keep all existing tests passing without modifying them.`
task.zh.txt: `重构 monolith.ts：把验证逻辑提取到 src/validator.ts，格式化逻辑提取到 src/formatter.ts，计算逻辑提取到 src/calculator.ts。monolith.ts 从新模块重新导出。不修改测试文件，保持所有测试通过。`
verify.sh: `npm install --silent && npm test`

**Step 5: Commit**

```bash
git add examples/11-refactor-extract/
git commit -m "feat(examples): add 11-refactor-extract"
```

---

### Task 13: Example 12-perf-optimize

**Files:**
- Create: `examples/12-perf-optimize/data_pipeline.py`
- Create: `examples/12-perf-optimize/test_pipeline.py`
- Create: `examples/12-perf-optimize/generate_test_data.py`
- Create: `examples/12-perf-optimize/requirements.txt`
- Create: `examples/12-perf-optimize/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create data_pipeline.py**

```python
import csv

def process_csv(input_path, output_path):
    """Read CSV, compute per-row stats, write results."""
    # BUG: loads entire file into memory — fails on large files
    with open(input_path, 'r') as f:
        rows = list(csv.DictReader(f))

    results = []
    for row in rows:
        values = [float(v) for k, v in row.items() if k != 'id']
        results.append({
            'id': row['id'],
            'sum': sum(values),
            'avg': sum(values) / len(values) if values else 0,
            'max': max(values) if values else 0,
        })

    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'sum', 'avg', 'max'])
        writer.writeheader()
        writer.writerows(results)

    return len(results)
```

**Step 2: Create generate_test_data.py**

Generates a CSV with configurable row count and 10 numeric columns. Used by test to create large test files.

```python
import csv, random, sys

def generate(path, rows=100000):
    cols = [f'col{i}' for i in range(10)]
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['id'] + cols)
        writer.writeheader()
        for i in range(rows):
            row = {'id': str(i)}
            row.update({c: str(round(random.uniform(0, 1000), 2)) for c in cols})
            writer.writerow(row)

if __name__ == '__main__':
    generate(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 100000)
```

**Step 3: Create test_pipeline.py**

```python
import os, tempfile, resource, pytest
from generate_test_data import generate
from data_pipeline import process_csv

def test_correctness():
    """Basic correctness test with small data."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write('id,col0,col1\n1,10.0,20.0\n2,30.0,40.0\n')
        inp = f.name
    out = inp + '.out'
    try:
        n = process_csv(inp, out)
        assert n == 2
        with open(out) as f:
            lines = f.readlines()
        assert '30.0' in lines[1]  # sum of 10+20
    finally:
        os.unlink(inp)
        if os.path.exists(out): os.unlink(out)

def test_memory_efficiency():
    """Process 100k rows within 50MB memory limit."""
    with tempfile.TemporaryDirectory() as tmpdir:
        inp = os.path.join(tmpdir, 'big.csv')
        out = os.path.join(tmpdir, 'out.csv')
        generate(inp, rows=100000)

        # Set memory limit to 50MB
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        resource.setrlimit(resource.RLIMIT_AS, (50 * 1024 * 1024, hard))
        try:
            n = process_csv(inp, out)
            assert n == 100000
        finally:
            resource.setrlimit(resource.RLIMIT_AS, (soft, hard))
```

**Step 4: Create supporting files**

requirements.txt: `pytest`
task.txt: `data_pipeline.py runs out of memory on large files. Optimize to handle GB-scale files with constant memory. Pass pytest.`
task.zh.txt: `data_pipeline.py 处理大文件时内存溢出。优化它使其能用恒定内存处理 GB 级文件。通过 pytest。`
verify.sh: `python3 -m pytest -v`

**Step 5: Commit**

```bash
git add examples/12-perf-optimize/
git commit -m "feat(examples): add 12-perf-optimize"
```

---

### Task 14: Example 13-fullstack-debug

**Files:**
- Create: `examples/13-fullstack-debug/package.json`
- Create: `examples/13-fullstack-debug/tsconfig.json`
- Create: `examples/13-fullstack-debug/vitest.config.ts`
- Create: `examples/13-fullstack-debug/src/userController.ts`
- Create: `examples/13-fullstack-debug/src/emailService.ts`
- Create: `examples/13-fullstack-debug/src/userRoutes.ts`
- Create: `examples/13-fullstack-debug/src/app.ts`
- Create: `examples/13-fullstack-debug/test/registration.test.ts`
- Create: `examples/13-fullstack-debug/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create package.json**

Dependencies: express, @types/express, typescript, vitest, supertest, @types/supertest.
Scripts: `"test": "vitest --run"`, `"build": "tsc"`

**Step 2: Create src/app.ts**

Express app with `express.json()`, mounts user routes at `/api/users`.

**Step 3: Create src/userRoutes.ts**

```typescript
import { Router } from 'express';
import { registerUser } from './userController.js';

const router = Router();
router.post('/register', registerUser);
export default router;
```

**Step 4: Create src/userController.ts**

```typescript
import { Request, Response } from 'express';
import { sendWelcomeEmail } from './emailService.js';

interface User {
  id: number;
  name: string;
  email: string;
}

const users: User[] = [];
let nextId = 1;

export async function registerUser(req: Request, res: Response) {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email required' });
  }
  const user: User = { id: nextId++, name, email };
  users.push(user);
  await sendWelcomeEmail(user);
  res.status(201).json(user);
}
```

**Step 5: Create src/emailService.ts**

```typescript
interface EmailUser {
  name: string;
  email: string;
  [key: string]: unknown;
}

// Simulated email sender
export async function sendWelcomeEmail(user: EmailUser): Promise<boolean> {
  // BUG: accesses user.mail instead of user.email
  const to = (user as any).mail;
  if (!to) {
    console.warn('No email address found for user');
    return false;
  }
  console.log(`Sending welcome email to ${to}`);
  return true;
}
```

**Step 6: Create test/registration.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as emailService from '../src/emailService.js';

describe('User Registration', () => {
  it('should register user and send welcome email', async () => {
    const spy = vi.spyOn(emailService, 'sendWelcomeEmail');

    const res = await request(app)
      .post('/api/users/register')
      .send({ name: 'Alice', email: 'alice@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('alice@example.com');
    expect(spy).toHaveBeenCalled();

    // The email should actually be sent (return true)
    const result = await spy.mock.results[0].value;
    expect(result).toBe(true);
  });

  it('should reject missing fields', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ name: 'Bob' });
    expect(res.status).toBe(400);
  });
});
```

**Step 7: Create supporting files**

task.txt: `Users don't receive welcome emails after registration. Trace the full chain from form submission to email sending. Find and fix the bug.`
task.zh.txt: `用户注册后没有收到欢迎邮件。排查从表单提交到邮件发送的完整链路，找到并修复问题。`
verify.sh: `npm install --silent && npm test`

**Step 8: Commit**

```bash
git add examples/13-fullstack-debug/
git commit -m "feat(examples): add 13-fullstack-debug"
```

---

### Task 15: Example 14-multi-service

**Files:**
- Create: `examples/14-multi-service/data-service/app.py`
- Create: `examples/14-multi-service/data-service/test_app.py`
- Create: `examples/14-multi-service/data-service/requirements.txt`
- Create: `examples/14-multi-service/api-gateway/package.json`
- Create: `examples/14-multi-service/api-gateway/tsconfig.json`
- Create: `examples/14-multi-service/api-gateway/vitest.config.ts`
- Create: `examples/14-multi-service/api-gateway/src/gateway.ts`
- Create: `examples/14-multi-service/api-gateway/test/gateway.test.ts`
- Create: `examples/14-multi-service/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create data-service/app.py**

```python
from flask import Flask, jsonify, request
import random

app = Flask(__name__)

DATA = [
    {"id": 1, "name": "Widget A", "price": 9.99},
    {"id": 2, "name": "Widget B", "price": 19.99},
    {"id": 3, "name": "Widget C", "price": 29.99},
]

@app.route('/data/items', methods=['GET'])
def get_items():
    # BUG: sometimes returns text/plain instead of JSON
    if random.random() < 0.3:
        return str(DATA), 200, {'Content-Type': 'text/plain'}
    return jsonify(DATA)

@app.route('/data/items/<int:item_id>', methods=['GET'])
def get_item(item_id):
    item = next((i for i in DATA if i['id'] == item_id), None)
    if not item:
        return jsonify({"error": "not found"}), 404
    return jsonify(item)

if __name__ == '__main__':
    app.run(port=5001)
```

**Step 2: Create data-service/test_app.py**

```python
import pytest
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c

def test_get_items_returns_json(client):
    """Items endpoint must ALWAYS return application/json."""
    for _ in range(20):  # run multiple times to catch intermittent bug
        resp = client.get('/data/items')
        assert resp.status_code == 200
        assert resp.content_type == 'application/json'
        data = resp.get_json()
        assert isinstance(data, list)

def test_get_item(client):
    resp = client.get('/data/items/1')
    assert resp.status_code == 200
    assert resp.get_json()['name'] == 'Widget A'

def test_get_item_not_found(client):
    resp = client.get('/data/items/999')
    assert resp.status_code == 404
```

**Step 3: Create data-service/requirements.txt**

```
flask
pytest
```

**Step 4: Create api-gateway/src/gateway.ts**

```typescript
import express from 'express';

const app = express();
const DATA_SERVICE = process.env.DATA_SERVICE_URL || 'http://localhost:5001';

app.get('/api/items', async (req, res) => {
  try {
    const resp = await fetch(`${DATA_SERVICE}/data/items`);
    // BUG: assumes response is always JSON, doesn't check Content-Type
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from data service' });
  }
});

export default app;
```

**Step 5: Create api-gateway/test/gateway.test.ts**

Test that gateway handles both JSON and non-JSON responses from data-service gracefully. Mock fetch to simulate both scenarios.

**Step 6: Create api-gateway/package.json**

Dependencies: express, @types/express, typescript, vitest, supertest, @types/supertest.

**Step 7: Create supporting files**

task.txt: `API gateway returns 500 intermittently when calling data-service. Debug cross-service communication and fix both services.`
task.zh.txt: `API 网关调用数据服务时偶尔返回 500。排查并修复跨服务通信问题。`
verify.sh:
```bash
#!/bin/bash
set -e
cd data-service && pip install -q -r requirements.txt && python3 -m pytest -v && cd ..
cd api-gateway && npm install --silent && npm test && cd ..
echo "PASS: 14-multi-service"
```

**Step 8: Commit**

```bash
git add examples/14-multi-service/
git commit -m "feat(examples): add 14-multi-service"
```

---

### Task 16: Example 15-rust-cli

**Files:**
- Create: `examples/15-rust-cli/Cargo.toml`
- Create: `examples/15-rust-cli/src/main.rs`
- Create: `examples/15-rust-cli/src/lib.rs`
- Create: `examples/15-rust-cli/tests/integration.rs`
- Create: `examples/15-rust-cli/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create Cargo.toml**

```toml
[package]
name = "json-fmt"
version = "0.1.0"
edition = "2021"

[dependencies]
serde_json = "1"
```

**Step 2: Create src/lib.rs**

```rust
use serde_json::Value;

/// Format a JSON string with the given indentation.
pub fn format_json(input: &str, indent: usize) -> Result<String, String> {
    todo!("Parse input as JSON Value, then serialize with indent")
}
```

**Step 3: Create src/main.rs**

```rust
use std::io::{self, Read};

fn main() {
    let indent = parse_indent_arg();
    todo!("Read stdin, call json_fmt::format_json, print to stdout")
}

fn parse_indent_arg() -> usize {
    todo!("Parse --indent N from args, default 2")
}
```

**Step 4: Create tests/integration.rs**

```rust
use std::process::{Command, Stdio};
use std::io::Write;

#[test]
fn test_format_default_indent() {
    let mut child = Command::new("cargo")
        .args(["run", "--quiet", "--"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("failed to start");

    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(b"{\"a\":1,\"b\":2}").unwrap();
    drop(child.stdin.take());

    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(stdout.contains("  \"a\": 1"));
}

#[test]
fn test_format_custom_indent() {
    let mut child = Command::new("cargo")
        .args(["run", "--quiet", "--", "--indent", "4"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("failed to start");

    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(b"{\"x\":true}").unwrap();
    drop(child.stdin.take());

    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(stdout.contains("    \"x\": true"));
}

#[test]
fn test_invalid_json() {
    let mut child = Command::new("cargo")
        .args(["run", "--quiet", "--"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to start");

    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(b"not json").unwrap();
    drop(child.stdin.take());

    let output = child.wait_with_output().unwrap();
    assert!(!output.status.success());
}

#[test]
fn test_lib_format() {
    let result = json_fmt::format_json("{\"a\":1}", 2).unwrap();
    assert!(result.contains("  \"a\": 1"));
}
```

**Step 5: Create supporting files**

task.txt: `Implement the JSON formatter CLI: read from stdin, format with --indent flag (default 2), output to stdout. Fill TODO in main.rs and lib.rs. Pass cargo test.`
task.zh.txt: `实现 JSON 格式化 CLI：从 stdin 读取，用 --indent 参数格式化（默认 2），输出到 stdout。补全 TODO。通过 cargo test。`
verify.sh: `cargo test`

**Step 6: Commit**

```bash
git add examples/15-rust-cli/
git commit -m "feat(examples): add 15-rust-cli"
```

---

### Task 17: Example 16-detached-mode

**Files:**
- Create: `examples/16-detached-mode/package.json`
- Create: `examples/16-detached-mode/tsconfig.json`
- Create: `examples/16-detached-mode/vitest.config.ts`
- Create: `examples/16-detached-mode/src/utils.ts`
- Create: `examples/16-detached-mode/test/utils.test.ts`
- Create: `examples/16-detached-mode/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create package.json**

Dependencies: typescript, vitest. Scripts: `"test": "vitest --run"`, `"build": "tsc"`

**Step 2: Create src/utils.ts**

```typescript
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Agent will add deepMerge here
```

**Step 3: Create test/utils.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { deepClone, deepMerge } from '../src/utils.js';

describe('deepClone', () => {
  it('should deep clone objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const clone = deepClone(obj);
    clone.b.c = 99;
    expect(obj.b.c).toBe(2);
  });
});

describe('deepMerge', () => {
  it('should merge flat objects', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('should deep merge nested objects', () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { z: 3, w: 4 } };
    expect(deepMerge(a, b)).toEqual({ x: { y: 1, z: 3, w: 4 } });
  });

  it('should override arrays', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it('should handle empty objects', () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });
});
```

**Step 4: Create README.md — Tutorial-focused**

This README is the main content. It walks through detached mode:

1. `minion run -y -d "Add deepMerge function to utils.ts with tests"` — launch in background
2. `minion list` — see running tasks
3. `minion status <id>` — check progress
4. `minion stop <id>` — (optional) cancel a running task
5. Wait for completion, then `npm test`

Include expected output for each command.

**Step 5: Create supporting files**

task.txt: `Add a deepMerge function to src/utils.ts that recursively merges objects. Arrays should be overridden, not concatenated. Export it. Pass all tests.`
task.zh.txt: `给 src/utils.ts 添加 deepMerge 函数，递归合并对象。数组直接覆盖，不拼接。导出函数。通过所有测试。`
verify.sh: `npm install --silent && npm test`

**Step 6: Commit**

```bash
git add examples/16-detached-mode/
git commit -m "feat(examples): add 16-detached-mode"
```

---

### Task 18: Example 17-custom-config

**Files:**
- Create: `examples/17-custom-config/app.py`
- Create: `examples/17-custom-config/test_app.py`
- Create: `examples/17-custom-config/requirements.txt`
- Create: `examples/17-custom-config/task.txt`, `task.zh.txt`, `verify.sh`, `.minion-example.json`, `README.md`

**Step 1: Create app.py**

```python
from datetime import datetime

def format_date(dt: datetime) -> str:
    """Format datetime as YYYY-MM-DD HH:MM."""
    # BUG: wrong format string — uses %m for minutes instead of %M
    return dt.strftime('%Y-%m-%d %H:%m')

def get_greeting(name: str) -> str:
    now = datetime.now()
    formatted = format_date(now)
    return f"Hello {name}, current time is {formatted}"
```

**Step 2: Create test_app.py**

```python
from datetime import datetime
from app import format_date, get_greeting

def test_format_date():
    dt = datetime(2024, 3, 15, 14, 30)
    result = format_date(dt)
    assert result == '2024-03-15 14:30', f"Got: {result}"

def test_format_date_midnight():
    dt = datetime(2024, 1, 1, 0, 0)
    result = format_date(dt)
    assert result == '2024-01-01 00:00', f"Got: {result}"

def test_greeting_contains_name():
    result = get_greeting("Alice")
    assert "Alice" in result
```

**Step 3: Create README.md — Tutorial-focused**

This README walks through container configuration:

1. `minion setup` — interactive TUI for provider selection
2. Edit `~/.minion/config.json` to add presets:
   ```json
   {
     "presets": {
       "git.userName": "Your Name",
       "git.userEmail": "you@example.com",
       "timezone": "Asia/Shanghai"
     }
   }
   ```
3. Environment variable config: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`
4. `minion config` — view current settings
5. Run the task: `minion run -y "$(cat task.txt)"`
6. Verify: `git log --format="%an" -1` shows custom name

**Step 4: Create supporting files**

requirements.txt: `pytest`
task.txt: `Fix the date formatting bug in app.py. The format_date function produces wrong output.`
task.zh.txt: `修复 app.py 中的日期格式化 bug。format_date 函数输出不正确。`
verify.sh:
```bash
#!/bin/bash
set -e
python3 -m pytest -v
echo "PASS: 17-custom-config"
```

**Step 5: Commit**

```bash
git add examples/17-custom-config/
git commit -m "feat(examples): add 17-custom-config"
```

---

### Task 19: Example 18-remote-repo

**Files:**
- Create: `examples/18-remote-repo/README.md`
- Create: `examples/18-remote-repo/.minion-example.json`

**Step 1: Create README.md — Guide only (no fixture)**

This is a tutorial-only example with no source code. The README covers:

1. **What is `--repo`?** — Run tasks against remote GitHub repositories
2. **Basic usage:**
   ```bash
   minion run -y --repo https://github.com/user/repo "Fix the typo in README.md"
   ```
3. **Workflow:** auto-clone → sandbox → patch → apply → push to branch
4. **With timeout** (network latency):
   ```bash
   minion run -y --repo https://github.com/user/repo --timeout 10 "Add input validation"
   ```
5. **Checking results:**
   ```bash
   minion status <task-id>
   ```
6. **Tips:**
   - Use `-d` for long-running remote tasks
   - Check the created branch on GitHub for the patch
   - Works with private repos if git credentials are configured

Bilingual: English sections with Chinese translations inline.

**Step 2: Create .minion-example.json**

```json
{
  "name": "remote-repo",
  "difficulty": "guide",
  "language": "none",
  "taskType": "guide",
  "tags": ["cli-pattern", "remote", "github"],
  "skipE2E": true
}
```

**Step 3: Commit**

```bash
git add examples/18-remote-repo/
git commit -m "feat(examples): add 18-remote-repo"
```

---

### Task 20: E2E Test Runner Integration

**Files:**
- Create: `test/e2e/examples-runner.test.ts`
- Modify: `package.json` — add `test:e2e:examples` script

**Step 1: Create test/e2e/examples-runner.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, mkdtempSync, cpSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

const EXAMPLES_DIR = join(__dirname, '../../examples');
const TIMEOUT = 5 * 60 * 1000; // 5 minutes per example

interface ExampleMeta {
  name: string;
  skipE2E?: boolean;
}

function getExampleDirs(): string[] {
  return readdirSync(EXAMPLES_DIR)
    .filter(d => /^\d{2}-/.test(d))
    .map(d => join(EXAMPLES_DIR, d))
    .filter(d => {
      const metaPath = join(d, '.minion-example.json');
      if (!existsSync(metaPath)) return true;
      const meta: ExampleMeta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      return !meta.skipE2E;
    })
    .sort();
}

describe('Examples E2E', () => {
  const dirs = getExampleDirs();

  for (const dir of dirs) {
    const name = basename(dir);

    it(`${name}: verify.sh passes after minion run`, async () => {
      // Create temp copy
      const tmp = mkdtempSync(join(tmpdir(), `minion-e2e-${name}-`));
      cpSync(dir, tmp, { recursive: true });

      // Init git repo
      execSync('git init -q && git add . && git commit -m "initial" -q', {
        cwd: tmp, stdio: 'pipe',
      });

      // Read task
      const taskPath = join(tmp, 'task.txt');
      expect(existsSync(taskPath)).toBe(true);
      const task = readFileSync(taskPath, 'utf-8').trim();

      // Run minion
      execSync(`npx minion run -y "${task}"`, {
        cwd: tmp, stdio: 'pipe', timeout: TIMEOUT,
      });

      // Verify
      const verifyPath = join(tmp, 'verify.sh');
      expect(existsSync(verifyPath)).toBe(true);
      execSync(`bash verify.sh`, {
        cwd: tmp, stdio: 'pipe', timeout: 60000,
      });
    }, TIMEOUT + 10000);
  }
});
```

**Step 2: Add script to package.json**

Add to scripts:
```json
"test:e2e:examples": "vitest --run test/e2e/examples-runner.test.ts --timeout 300000"
```

**Step 3: Commit**

```bash
git add test/e2e/examples-runner.test.ts package.json
git commit -m "feat(examples): add E2E test runner for examples"
```

---

## Summary

| Task | Example | Language | Type |
|------|---------|----------|------|
| 1 | Scaffold | — | Top-level README + init.sh |
| 2 | 01-hello-world | Python | Create file |
| 3 | 02-fix-a-bug | Python | Bug fix |
| 4 | 03-typescript-api | TypeScript | New feature |
| 5 | 04-python-cli | Python | Bug fix (vague) |
| 6 | 05-c-ring-buffer | C | Implement from spec |
| 7 | 06-cpp-linked-list | C++ | Add method |
| 8 | 07-go-concurrency | Go | Race condition fix |
| 9 | 08-java-maven | Java | Add method |
| 10 | 09-shell-script | Shell | Quoting bug fix |
| 11 | 10-react-component | React/TS | Frontend + npm deps |
| 12 | 11-refactor-extract | TypeScript | Refactoring |
| 13 | 12-perf-optimize | Python | Memory optimization |
| 14 | 13-fullstack-debug | TypeScript | Cross-module debug |
| 15 | 14-multi-service | Python+TS | Cross-service fix |
| 16 | 15-rust-cli | Rust | Implement TODO stubs |
| 17 | 16-detached-mode | TypeScript | Background mode tutorial |
| 18 | 17-custom-config | Python | Config + presets tutorial |
| 19 | 18-remote-repo | — | Remote repo guide |
| 20 | E2E Runner | — | Test infrastructure |
