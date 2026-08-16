import { describe, expect, it } from 'vitest'
import { genuiSurfaceDefinition, type GenuiSurfaceChatData } from '../../src/client/node.ts'
import type { GenuiSurfaceMeta } from '../../src/meta.ts'

const chunk = (seq: number, chunk: unknown) => ({ type: 'assistant/chunk', seq, time: 0, data: { turn: 2, step: 1, chunk } }) as never
const stepStart = { type: 'step/start', seq: 1, time: 0, data: { turn: 2, step: 1 } } as never
const meta: GenuiSurfaceMeta = {
  kind: 'genui-surface', surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', title: 'Dash',
  componentNames: ['Stack', 'Metric'], warnings: [{ id: 'x', component: 'Bad', reason: 'nope' }],
}
const toolResult = { type: 'tool/result', seq: 9, time: 0, data: { turn: 2, step: 1, meta } } as never

/** Drive the definition through a match/start/update sequence. */
function fold(events: unknown[]) {
  let state = genuiSurfaceDefinition.start({ key: 'k', id: '2:1' } as never, { event: events[0] } as never, {} as never)
  for (const event of events.slice(1)) {
    state = genuiSurfaceDefinition.update({ key: 'k', id: '2:1', state } as never, { event } as never)
  }
  const node = genuiSurfaceDefinition.buildViewNode?.({ key: 'k', id: '2:1', state, start: { event: events[0], location: { kind: 'step' } } } as never)
  return (node?.data ?? null) as GenuiSurfaceChatData | null
}

describe('genuiSurfaceDefinition', () => {
  it('matches step/start (start) and chunk/result (update), ignores others', () => {
    expect(genuiSurfaceDefinition.match(stepStart)).toEqual({ id: '2:1', role: 'start' })
    expect(genuiSurfaceDefinition.match(chunk(2, { type: 'text-delta', index: 0, text: 'x' }))).toEqual({ id: '2:1', role: 'update' })
    expect(genuiSurfaceDefinition.match(toolResult)).toEqual({ id: '2:1', role: 'update' })
    expect(genuiSurfaceDefinition.match({ type: 'user/message', data: {} } as never)).toBeNull()
  })

  it('renders nothing for a step without a generate_ui call', () => {
    expect(fold([stepStart, chunk(2, { type: 'text-delta', index: 0, text: 'hi' })])).toBeNull()
  })

  it('streams the partial document from generate_ui tool-call-delta', () => {
    const data = fold([
      stepStart,
      chunk(2, { type: 'tool-call-delta', index: 0, id: 'call-9', name: 'generate_ui', argumentsDelta: '{"messages":[{"a":1},' }),
      chunk(3, { type: 'tool-call-delta', index: 0, id: 'call-9', argumentsDelta: '{"b":2},{"c":' }),
    ])
    expect(data).toEqual({ surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', status: 'running', componentNames: [], warningCount: 0 })
  })

  it('ignores tool-call-delta for other tools in the same step', () => {
    const data = fold([
      stepStart,
      chunk(2, { type: 'tool-call-delta', index: 0, id: 'c1', name: 'web_search', argumentsDelta: '{"query":"x"}' }),
    ])
    expect(data).toBeNull()
  })

  it('adopts the authoritative document and facts once the tool settles', () => {
    const data = fold([
      stepStart,
      chunk(2, { type: 'tool-call-delta', index: 0, id: 'call-9', name: 'generate_ui', argumentsDelta: '{"messages":[{"a":1}' }),
      toolResult,
    ])
    expect(data).toEqual({ surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', status: 'success', title: 'Dash', componentNames: ['Stack', 'Metric'], warningCount: 1 })
  })

  it('renders from the settled result alone on replay (no chunks)', () => {
    expect(fold([stepStart, toolResult])?.status).toBe('success')
  })
})
