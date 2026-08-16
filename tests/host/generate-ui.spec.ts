/**
 * Real-composition host test: a real Cordis Context with the tool registry and
 * system-prompt registry. generate_ui does no model call — it validates the
 * messages the model authored and persists the document to tool/result.meta.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { SUPPORTED_CATALOG_ID } from '@valuz-genui/core'
import * as Genui from '../../src/index.ts'
import { isGenuiSurfaceMeta } from '../../src/meta.ts'

const SURFACE = { version: 'v0.9.1', createSurface: { surfaceId: 'main', catalogId: SUPPORTED_CATALOG_ID } }
const ROOT = { version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'root', component: 'Stack', children: ['title'] }] } }
const TITLE = { version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'title', component: 'TextContent', text: 'Revenue', variant: 'h2' }] } }

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose())) })

async function mount(config?: Genui.Config) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const fiber = await ctx.plugin(Genui, config)
  return { ctx, fiber }
}

let calls = 0
function run(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`call-${++calls}`),
    name: 'generate_ui',
    arguments: args,
  })
}

const text = (result: { content: { type: string; text?: string }[] }) =>
  result.content.filter((b) => b.type === 'text').map((b) => b.text).join('')

describe('generate_ui', () => {
  it('registers the tool and teaches A2UI in the system prompt (no LLM inject)', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.schemas().map((s) => s.name)).toContain('generate_ui')
    expect(Genui.inject).not.toContain('llm')
    const assembly = JSON.stringify(await ctx.systemPrompt.assemble())
    expect(assembly).toContain('generate_ui')
    expect(assembly).toContain('A2UI component catalog')
  })

  it('validates the authored messages and persists the document in meta', async () => {
    const { ctx } = await mount()
    const result = await run(ctx, { messages: [SURFACE, ROOT, TITLE], title: 'Revenue' })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('Rendered an interactive UI')
    expect(text(result)).not.toContain('createSurface')
    const meta = result.meta
    expect(isGenuiSurfaceMeta(meta)).toBe(true)
    if (isGenuiSurfaceMeta(meta)) {
      expect(meta.document.split('\n')).toHaveLength(3)
      expect(meta.componentNames).toEqual(['Stack', 'TextContent'])
      expect(meta.title).toBe('Revenue')
    }
  })

  it('pins a foreign catalog id and reports schema warnings without failing', async () => {
    const { ctx } = await mount()
    const foreign = { version: 'v0.9.1', createSurface: { surfaceId: 'main', catalogId: 'https://example.com/x' } }
    const bad = { version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'bad', component: 'TextContent', text: 'x', color: 'red' }] } }
    const result = await run(ctx, { messages: [foreign, ROOT, bad] })
    expect(result.isError).toBe(false)
    const meta = result.meta
    if (isGenuiSurfaceMeta(meta)) {
      expect(meta.document.startsWith(JSON.stringify(SURFACE))).toBe(true)
      expect(meta.warnings.map((w) => w.id)).toEqual(['bad'])
    }
  })

  it('rejects messages that do not form a renderable document', async () => {
    const { ctx } = await mount()
    expect((await run(ctx, { messages: [] })).isError).toBe(true)
    expect(text(await run(ctx, { messages: [TITLE] }))).toContain('generate_ui')
    expect(text(await run(ctx, { messages: ['not an object'] }))).toContain('not an A2UI message object')
  })

  it('refuses an oversized document', async () => {
    const { ctx } = await mount({ maxDocumentBytes: 64 })
    const big = { version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'root', component: 'TextContent', text: 'x'.repeat(200) }] } }
    const result = await run(ctx, { messages: [SURFACE, big] })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('over the 64-byte limit')
  })

  it('fails loud on invalid configuration', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await expect(ctx.plugin(Genui, { maxDocumentBytes: 0 })).rejects.toThrow('maxDocumentBytes must be a positive integer')
  })

  it('unregisters on dispose (HMR safety)', async () => {
    const { ctx, fiber } = await mount()
    expect(ctx.tools.get('generate_ui')).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('generate_ui')).toBeUndefined()
  })
})
