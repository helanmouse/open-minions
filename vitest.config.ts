import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules',
      '.minion',
      '.pi-mono-ref',
      'dist',
    ],
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
