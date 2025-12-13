import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 120000, // 2 minutes for LLM tests
    hookTimeout: 30000,
  },
});
