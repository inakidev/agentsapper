import { defineConfig } from 'vitest/config';

// Evaluation run (npm run eval): writes docs/evaluation/RESULTS.md and results.json.
export default defineConfig({
  test: {
    include: ['test/eval/**/*.eval.ts'],
    environment: 'node',
    testTimeout: 600_000,
  },
});
