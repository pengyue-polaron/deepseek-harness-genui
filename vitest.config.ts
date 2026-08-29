import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Browser-heavy files each own a Chromium lifecycle. Running test files in
    // parallel makes cold launches contend for the same host resources and can
    // turn bounded Playwright waits into false CI failures.
    fileParallelism: false,
    coverage: { reporter: ['text', 'json-summary'] },
  },
})
