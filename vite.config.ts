import { defineConfig } from 'vite';

// GitHub Pages serves from /<repo>/; override with BASE_PATH in CI.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
