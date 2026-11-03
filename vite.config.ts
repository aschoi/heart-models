import { defineConfig } from 'vitest/config';

// Relative base so the built site works from any path, including
// https://<user>.github.io/<repo>/ on GitHub Pages.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        main: 'index.html',
        anatomy: 'anatomy/index.html',
        heartbeat: 'heartbeat/index.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
