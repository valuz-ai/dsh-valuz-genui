/**
 * Two-target build:
 * - the Node host half (`lib/index.js`), a normal ESM bundle;
 * - the browser client half (`lib/client.js`), a CJS module wrapped in the
 *   dsh module-loader factory, with only platform modules kept external and
 *   everything else (a2ui, recharts, valuz core) inlined; CSS is injected as
 *   a `<style data-plugin>` at factory execution.
 *
 * `prepare` runs this after a git install, self-contained (no monorepo
 * context): the valuz-genui sources are aliased in and inlined, so a consumer
 * needs neither them nor a build step.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { VALUZ_ALIASES } from './aliases.ts'

const PLUGIN_ID = 'dsh-valuz-genui'

/** Platform modules the dsh web shell shares; everything else inlines. */
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const CSS_VIRTUAL_PREFIX = '\0genui-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Inline the valuz alias table so tsdown resolves the upstream sources. */
const aliasPlugin = {
  name: 'genui-valuz-alias',
  resolveId(source: string): string | null {
    return VALUZ_ALIASES[source] ?? null
  },
}

/** Compile a `.module.css` / `.css` import into an injecting module. */
const cssPlugin = {
  name: 'genui-css-inline',
  resolveId(source: string, importer: string | undefined): string | null {
    const aliased = VALUZ_ALIASES[source]
    const isCss = source.endsWith('.css') || (aliased !== undefined && aliased.endsWith('.css'))
    if (!isCss) return null
    const abs = aliased ?? (importer !== undefined && source.startsWith('.')
      ? new URL(source, `file://${importer}`).pathname
      : source)
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(id: string): Promise<string | null> {
    if (!id.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const file = id.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    const isModule = file.endsWith('.module.css')
    const source = await readFile(file)
    const { code, exports: cssExports } = transform({
      filename: file,
      code: source,
      cssModules: isModule ? { pattern: '[hash]_[local]' } : false,
      minify: true,
    })
    const classMap: Record<string, string> = {}
    for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(file)}`)};`,
      "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
      "  const tag = document.createElement('style');",
      `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      `export default ${JSON.stringify(classMap)};`,
    ].join('\n')
  },
}

const host: UserConfig = {
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  fixedExtension: false,
  dts: false,
  clean: true,
  plugins: [aliasPlugin],
}

const client: UserConfig = {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: false,
  clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [cssPlugin, aliasPlugin],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([host, client])
