/**
 * Real-composition host test: a real Cordis Context with the tool registry,
 * system-prompt registry, session store, and a scripted LLM adapter. It drives
 * generate_ui end to end and asserts the model-facing receipt, the persisted
 * tool/result.meta, route selection, config validation, and the edit flow.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter, LlmRuntime, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as Genui from '../../src/index.ts'
import { isGenuiSurfaceMeta } from '../../src/meta.ts'

const SURFACE = JSON.stringify({ version: 'v0.9.1', createSurface: { surfaceId: 'main', catalogId: 'https://valuz.io/a2ui/catalogs/base/v1' } })
const ROOT = JSON.stringify({ version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'root', component: 'Stack', children: ['title'] }] } })
const TITLE = JSON.stringify({ version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'title', component: 'TextContent', text: 'Revenue', variant: 'h2' }] } })
const DOC = `${SURFACE}\n${ROOT}\n${TITLE}`

/** A scripted adapter: each stream() call replays the next document as text deltas. */
class ScriptedAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []
  constructor(private readonly scripts: string[]) { super() }
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100_000 } })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    const text = this.scripts.shift() ?? ''
    const size = Math.max(1, Math.ceil(text.length / 4))
    for (let at = 0; at < text.length; at += size) yield { type: 'text-delta', index: 0, text: text.slice(at, at + size) }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose())) })

async function mount(scripts: string[], config?: Genui.Config) {
  const ctx = new Context()
  contexts.push(ctx)
  const adapter = new ScriptedAdapter(scripts)
  void new LlmRuntime(ctx)
  ctx.llm.registerAdapter(['test-provider'], adapter)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const fiber = await ctx.plugin(Genui, config)
  return { ctx, adapter, fiber }
}

let calls = 0
function makeAgent(cwd = '/work') {
  const session = {
    id: 'sess-1',
    requestHeader: () => ({ config: { provider: 'test-provider', model: 'test-model' } }),
    events: [] as unknown[],
    header: { cwd },
  }
  return { session, options: {} }
}

function run(ctx: Context, agent: ReturnType<typeof makeAgent>, args: unknown) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`call-${++calls}`),
    name: 'generate_ui',
    arguments: args,
    agent: agent as never,
  })
}

const text = (result: { content: { type: string; text?: string }[] }) =>
  result.content.filter((b) => b.type === 'text').map((b) => b.text).join('')

describe('generate_ui host', () => {
  it('registers the tool and prompt section', async () => {
    const { ctx } = await mount([DOC])
    expect(ctx.tools.schemas().map((s) => s.name)).toContain('generate_ui')
    const assembly = await ctx.systemPrompt.assemble()
    const rendered = JSON.stringify(assembly)
    expect(rendered).toContain('generate_ui tool')
  })

  it('generates a document, returns a short receipt, and persists it in meta', async () => {
    const { ctx, adapter } = await mount([DOC])
    const agent = makeAgent()
    const result = await run(ctx, agent, { request: 'a revenue title', data: { revenue: '$1.2M' } })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('Rendered an interactive UI')
    expect(text(result)).not.toContain(SURFACE)
    const meta = result.meta
    expect(isGenuiSurfaceMeta(meta)).toBe(true)
    if (isGenuiSurfaceMeta(meta)) {
      expect(meta.document).toBe(DOC)
      expect(meta.componentNames).toEqual(['Stack', 'TextContent'])
      expect(meta.route).toEqual({ provider: 'test-provider', model: 'test-model' })
    }
    // The request carried the data and used the session's model.
    expect(adapter.calls[0]?.model).toBe('test-model')
    const prompt = JSON.stringify(adapter.calls[0]?.messages)
    expect(prompt).toContain('$1.2M')
  })

  it('follows a configured route override', async () => {
    const { ctx, adapter } = await mount([DOC], { provider: 'test-provider', model: 'cheap-ui-model' })
    await run(ctx, makeAgent(), { request: 'x' })
    expect(adapter.calls[0]?.model).toBe('cheap-ui-model')
  })

  it('edits an existing surface by loading its document from the session log', async () => {
    const { ctx } = await mount([DOC, `${SURFACE}\n${ROOT}\n${JSON.stringify({ version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [{ id: 'title', component: 'TextContent', text: 'Profit', variant: 'h2' }] } })}`])
    const agent = makeAgent()
    const first = await run(ctx, agent, { request: 'a revenue title' })
    const surfaceId = isGenuiSurfaceMeta(first.meta) ? first.meta.surfaceId : ''
    // Feed the first result back into the session log so the edit can find it.
    agent.session.events.push({ type: 'tool/result', data: { meta: first.meta } })
    const edited = await run(ctx, agent, { request: 'change to profit', edit_surface_id: surfaceId })
    expect(edited.isError).toBe(false)
    expect(text(edited)).toContain('Updated an interactive UI')
  })

  it('errors when editing a surface that does not exist', async () => {
    const { ctx } = await mount([DOC])
    const result = await run(ctx, makeAgent(), { request: 'x', edit_surface_id: 'nope' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('no surface "nope"')
  })

  it('reports a generation failure as a tool error', async () => {
    const { ctx } = await mount(['I cannot draw that.', 'still not a document'], { maxAttempts: 2 })
    const result = await run(ctx, makeAgent(), { request: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('generate_ui')
  })

  it('refuses oversized data', async () => {
    const { ctx } = await mount([DOC], { maxDataBytes: 32 })
    const result = await run(ctx, makeAgent(), { request: 'x', data: { big: 'x'.repeat(100) } })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('over the 32-byte limit')
  })

  it('fails loud on invalid configuration', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    void new LlmRuntime(ctx)
    ctx.llm.registerAdapter(['test-provider'], new ScriptedAdapter([]))
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await expect(ctx.plugin(Genui, { maxAttempts: 0 })).rejects.toThrow('maxAttempts must be a positive integer')
    await expect(ctx.plugin(Genui, { provider: 'p' })).rejects.toThrow('set both provider and model, or neither')
  })

  it('unregisters on dispose (HMR safety)', async () => {
    const { ctx, fiber } = await mount([DOC])
    expect(ctx.tools.get('generate_ui')).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('generate_ui')).toBeUndefined()
  })
})
