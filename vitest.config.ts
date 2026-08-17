import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    // Inline @valuz/* so its `styles.css` export and React deps go through
    // the vite pipeline (plain Node cannot import CSS).
    server: { deps: { inline: [/@a2ui\//, /@valuz\//] } },
  },
})
