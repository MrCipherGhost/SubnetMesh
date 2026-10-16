import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cert = fileURLToPath(new URL('../certs/local.pem', import.meta.url));
const key = fileURLToPath(new URL('../certs/local-key.pem', import.meta.url));
export default defineConfig({
  plugins: [react()],
  server: {
    https: existsSync(cert) && existsSync(key) ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    }
  }
});
