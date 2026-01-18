import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      thresholds: {
        lines: 45,
        functions: 45,
        branches: 40,
        statements: 45
      }
    },
    watch: true
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
});
