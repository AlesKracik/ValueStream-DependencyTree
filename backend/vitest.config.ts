import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The conformance replay needs a real MongoDB; it runs via
    // src/conformance/run.sh (vitest.conformance.config.ts).
    exclude: [...configDefaults.exclude, 'src/conformance/**'],
  },
});
