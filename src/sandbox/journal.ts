import { writeFileSync, readFileSync, existsSync } from 'fs';

const TEMPLATE = `## Plan

<!-- Update this section immediately after reading the task -->

## Execution Log

<!-- Append to this section after each significant action -->

## Verification

<!-- Fill this section after running build/lint/test -->

## Status

<!-- Must be one of: COMPLETED, BLOCKED — <reason>, PARTIAL — <what remains> -->
`;

export function seedJournal(path: string): void {
  if (existsSync(path)) return;
  writeFileSync(path, TEMPLATE, 'utf-8');
}

export function readJournal(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}
