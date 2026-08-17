/**
 * Where the valuz-genui packages live during local development. Both halves
 * of this plugin inline them at build time (they are not published yet), so
 * tsdown and vitest resolve the same source paths as tsconfig `paths`.
 */
import { fileURLToPath } from 'node:url'

const upstream = fileURLToPath(new URL('../valuz-genui/packages/', import.meta.url))

/** Alias table: bare specifier → absolute source path. */
export const VALUZ_ALIASES: Record<string, string> = {
  '@valuz/genui-core': `${upstream}core/src/index.ts`,
  '@valuz/a2ui/catalog': `${upstream}a2ui/src/catalog/index.ts`,
  '@valuz/a2ui/react': `${upstream}a2ui/src/react/index.ts`,
  '@valuz/a2ui/stream': `${upstream}a2ui/src/stream/index.ts`,
  '@valuz/a2ui/theme': `${upstream}a2ui/src/theme/index.ts`,
  '@valuz/a2ui/styles.css': `${upstream}a2ui/src/styles.css`,
  '@valuz/a2ui': `${upstream}a2ui/src/index.ts`,
}

/** Rolldown/Vite alias entries; longer specifiers first so `/catalog` wins over the root. */
export const VALUZ_ALIAS_ENTRIES = Object.entries(VALUZ_ALIASES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([find, replacement]) => ({ find, replacement }))
