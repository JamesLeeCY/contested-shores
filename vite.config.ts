import { defineConfig } from 'vite';

// GitHub Pages serves from /<repo>/; override with BASE_PATH in CI.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // The renderer changes far less often than the game: its own file stays cached across releases.
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi') ? 'pixi' : undefined) } },
  },
});
