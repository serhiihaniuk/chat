import { fileURLToPath } from 'node:url';

import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import mdx from 'fumadocs-mdx/vite';

// Explicit aliases for the tsconfig `paths` entries. Vite's native
// `resolve.tsconfigPaths` resolved these nondeterministically on Windows (a
// rotating "Cannot find module @/components/demos/<name>" across dev and build),
// so the alias is spelled out here to keep resolution deterministic. The
// @rollup/plugin-alias path-boundary match means `@` never swallows scoped
// packages like `@react-router/*` (no `/` immediately after `@`).
const appDir = fileURLToPath(new URL('./app', import.meta.url));
const sourceDir = fileURLToPath(new URL('./.source', import.meta.url));

export default defineConfig({
  plugins: [mdx(), tailwindcss(), reactRouter()],
  resolve: {
    alias: {
      '@': appDir,
      collections: sourceDir,
    },
  },
});
