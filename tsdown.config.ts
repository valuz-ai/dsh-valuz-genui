/**
 * Two-target build:
 * - the Node host half (`lib/index.js`), a normal ESM bundle;
 * - the browser client half (`lib/client.js`), a CJS module wrapped in the
 *   dsh module-loader factory, with only platform modules kept external and
 *   everything else (a2ui, recharts, valuz core) inlined; CSS is injected as
 *   a `<style data-plugin>` at factory execution.
 *
 * `prepare` runs this after a git install, self-contained: the `@valuz/*`
 * packages install from npm like any dependency, so a consumer needs no
 * sibling checkout or extra build step.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'
import { bundle, transform } from 'lightningcss'

const resolve = createRequire(import.meta.url).resolve

const PLUGIN_ID = '@valuz/dsh-valuz-genui'

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

/** Compile a `.module.css` / `.css` import into an injecting module. */
const cssPlugin = {
  name: 'genui-css-inline',
  resolveId(source: string, importer: string | undefined): string | null {
    if (!source.endsWith('.css')) return null
    // Bare specifiers (`@valuz/a2ui/styles.css`) go through the package
    // exports map; relative ones resolve against the importer.
    const abs = importer !== undefined && source.startsWith('.')
      ? new URL(source, `file://${importer}`).pathname
      : resolve(source)
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(id: string): Promise<string | null> {
    if (!id.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const file = id.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    const isModule = file.endsWith('.module.css')
    // Plain CSS may `@import` sibling files (the A2UI styles.css pulls in the
    // theme tokens and per-component sheets); bundle() inlines them from disk.
    // CSS Modules stay a single-file transform so the hashed class map is exact.
    const { code, exports: cssExports } = isModule
      ? transform({ filename: file, code: await readFile(file), cssModules: { pattern: '[hash]_[local]' }, minify: true })
      : bundle({ filename: file, minify: true })
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
  plugins: [cssPlugin],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([host, client])
