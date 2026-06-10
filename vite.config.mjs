import { defineConfig } from 'vite';

// React plugin added in Phase D; test config merged in Phase C.
export default defineConfig({
  // host 127.0.0.1: Node on Windows resolves `localhost` to ::1 (IPv6 only),
  // but the verify_*.cjs harness targets http://127.0.0.1:8770.
  server: { host: '127.0.0.1', port: 8770, strictPort: true },
  preview: { host: '127.0.0.1', port: 8770, strictPort: true },
});
