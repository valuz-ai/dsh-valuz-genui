import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VALUZ_ALIAS_ENTRIES } from './aliases.ts'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: VALUZ_ALIAS_ENTRIES,
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    server: { deps: { inline: [/@a2ui\//] } },
  },
})
