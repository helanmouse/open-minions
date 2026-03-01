# 11-refactor-extract

## What This Demonstrates / 示例说明

Refactoring a monolithic TypeScript file into separate modules while keeping all existing tests passing.

将一个单体 TypeScript 文件重构为独立模块，同时保持所有现有测试通过。

## The Setup / 初始状态

`src/monolith.ts` contains three groups of functions mixed together:
- Validation: `validateEmail`, `validatePhone`, `validateAge`
- Formatting: `formatCurrency`, `formatDate`, `formatPhone`
- Calculation: `calculateTax`, `calculateDiscount`, `calculateTotal`
- Plus `processUser` which uses all three

`src/monolith.ts` 包含三组混在一起的函数：验证、格式化、计算，以及使用这三组的 `processUser`。

## The Task / 任务

Extract each concern into its own module (`validator.ts`, `formatter.ts`, `calculator.ts`), update `monolith.ts` to re-export, and keep all tests passing without modifying them.

将每组关注点提取到独立模块，更新 `monolith.ts` 重新导出，不修改测试文件。

## Run / 运行

```bash
minion run -y "$(cat task.txt)"
bash verify.sh
```
