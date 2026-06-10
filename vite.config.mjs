import { defineConfig } from 'vite';

// React plugin added in Phase D.
export default defineConfig({
  // host 127.0.0.1: Node on Windows resolves `localhost` to ::1 (IPv6 only),
  // but the verify_*.cjs harness targets http://127.0.0.1:8770.
  server: { host: '127.0.0.1', port: 8770, strictPort: true },
  preview: { host: '127.0.0.1', port: 8770, strictPort: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Coverage contract applies to the pure rules core only — UI/3D excluded by design.
      include: ['src/core/rules_core.ts', 'src/core/board.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
