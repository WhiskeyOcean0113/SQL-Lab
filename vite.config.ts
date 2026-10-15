import { defineConfig } from 'vitest/config'
import { contentPlugin } from './scripts/lib/vite-content.ts'

export default defineConfig({
  // SQL_LAB_CONTENT=tests/fixtures/content npm run dev previews the UI against the test course.
  plugins: [contentPlugin(process.env.SQL_LAB_CONTENT ?? 'content')],
  // PGlite ships its own WASM and data files; pre-bundling breaks their URLs.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
})
