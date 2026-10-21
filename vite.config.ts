import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use the repository subpath only for the hosted Pages build. Keeping the
// default base at / makes local Vite and StackBlitz previews work at their root.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/kurocanvas/' : '/',
  plugins: [react()],
  worker: { format: 'es' },
  server: { host: '0.0.0.0' },
}));
