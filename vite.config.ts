import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Hash of the simulation code and game data: saves record it (see src/build.ts). */
function simFingerprint(): string {
  const h = createHash('sha1');
  const walk = (dir: string) => {
    for (const f of readdirSync(dir).sort()) {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|json)$/.test(f)) h.update(p).update(readFileSync(p));
    }
  };
  for (const d of ['src/sim', 'src/data', 'data']) walk(d);
  return h.digest('hex').slice(0, 10);
}

// GitHub Pages serves from /<repo>/; override with BASE_PATH in CI.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  define: { __SIM_BUILD__: JSON.stringify(simFingerprint()) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // The renderer changes far less often than the game: its own file stays cached across releases.
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi') ? 'pixi' : undefined) } },
  },
});
