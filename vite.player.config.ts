import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the game runtime as ONE self-contained HTML file. The editor fetches it and injects
// project JSON to produce a standalone game that runs anywhere (any web host, any browser).
export default defineConfig({
  root: 'src/player',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: '../../public/player-template', emptyOutDir: true },
});
