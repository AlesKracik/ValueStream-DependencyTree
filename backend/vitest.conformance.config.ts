import { defineConfig } from 'vitest/config';

// Conformance replay needs a real MongoDB (see src/conformance/run.sh), so it
// runs on its own instead of with the unit suite.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/conformance/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
