import { describe, expect, it } from 'vitest'
import { genuiSurfaceDefinition, type GenuiSurfaceChatData } from '../../src/client/node.ts'
import type { GenuiSurfaceMeta } from '../../src/meta.ts'

const liveChunk = (seq: number, chunk: unknown) =>
  ({ type: 'assistant/live-chunk', seq, time: 0, data: { attemptId: 'a1', turn: 2, step: 1, chunk } }) as never
const delta = (seq: number, argumentsDelta: string, name?: string, id = 'call-9') =>
  liveChunk(seq, { type: 'tool-call-delta', index: 0, id, ...(name === undefined ? {} : { name }), argumentsDelta })
const toolCall = (seq: number, args: string, name = 'generate_ui', callId = 'call-9') =>
  ({ type: 'tool/call', seq, time: 0, data: { turn: 2, step: 1, callId, name, arguments: args } }) as never
const meta: GenuiSurfaceMeta = {
  kind: 'genui-surface', surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', title: 'Dash',
  componentNames: ['Stack', 'Metric'], warnings: [{ id: 'x', component: 'Bad', reason: 'nope' }],
}
const toolResult = (seq: number, resultMeta: unknown = meta, surfaceOp = 'append') => ({
  type: 'tool/result', seq, time: 0, surfaceOp,
  data: { turn: 2, step: 1, message: { role: 'tool', source: { callId: 'call-9' } }, meta: resultMeta },
}) as never

const loc = { kind: 'step', turn: 2, step: 1 }

/** Drive the definition through a start + updates sequence; returns the built node. */
function build(events: unknown[]) {
  const matches = events.map((event) => ({ event, location: loc }))
  let state = genuiSurfaceDefinition.start({ key: 'k', id: 'call-9' } as never, matches[0] as never, {} as never)
  for (const match of matches.slice(1)) {
    state = genuiSurfaceDefinition.update({ key: 'k', id: 'call-9', state } as never, match as never)
  }
  return genuiSurfaceDefinition.buildViewNode?.({ key: 'k', id: 'call-9', state, start: matches[0], matches } as never) ?? null
}

/** The rendered data for a sequence, or null. */
function fold(events: unknown[]) {
  return (build(events)?.data ?? null) as GenuiSurfaceChatData | null
}

describe('genuiSurfaceDefinition.match', () => {
  it('starts on the named generate_ui delta and updates on later deltas of the same call', () => {
    expect(genuiSurfaceDefinition.match(delta(2, '{', 'generate_ui'))).toEqual({ id: 'call-9', role: 'start' })
    expect(genuiSurfaceDefinition.match(delta(3, '"messages"'))).toEqual({ id: 'call-9', role: 'update' })
  })

  it('ignores deltas named for other tools and non-delta chunks', () => {
    expect(genuiSurfaceDefinition.match(delta(2, '{', 'web_search', 'c1'))).toBeNull()
    expect(genuiSurfaceDefinition.match(liveChunk(2, { type: 'text-delta', index: 0, text: 'x' }))).toBeNull()
  })

  it('starts on a generate_ui tool/call only', () => {
    expect(genuiSurfaceDefinition.match(toolCall(4, '{}'))).toEqual({ id: 'call-9', role: 'start' })
    expect(genuiSurfaceDefinition.match(toolCall(4, '{}', 'web_search', 'c1'))).toBeNull()
  })

  it('updates on an appended tool/result carrying genui meta only', () => {
    expect(genuiSurfaceDefinition.match(toolResult(9))).toEqual({ id: 'call-9', role: 'update' })
    expect(genuiSurfaceDefinition.match(toolResult(9, { kind: 'other' }))).toBeNull()
    expect(genuiSurfaceDefinition.match(toolResult(9, meta, 'replace'))).toBeNull()
    expect(genuiSurfaceDefinition.match({ type: 'user/message', seq: 1, time: 0, data: {} } as never)).toBeNull()
  })
})

describe('genuiSurfaceDefinition rendering', () => {
  it('streams the partial document from live generate_ui deltas', () => {
    const data = fold([
      delta(2, '{"messages":[{"a":1},', 'generate_ui'),
      delta(3, '{"b":2},{"c":'),
    ])
    expect(data).toEqual({ surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', status: 'running', componentNames: [], warningCount: 0 })
  })

  it('renders nothing until a complete A2UI message has streamed', () => {
    expect(fold([delta(2, '{"messages":[{"a":', 'generate_ui')])).toBeNull()
  })

  it('adopts the authoritative document and facts once the tool settles', () => {
    const data = fold([delta(2, '{"messages":[{"a":1}', 'generate_ui'), toolResult(9)])
    expect(data).toEqual({ surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', status: 'success', title: 'Dash', componentNames: ['Stack', 'Metric'], warningCount: 1 })
  })

  it('rebuilds from the durable tool/call after the live chunks are gone (settle and reopen)', () => {
    const running = fold([toolCall(4, '{"messages":[{"a":1},{"b":2}]}')])
    expect(running).toEqual({ surfaceId: 'call-9', document: '{"a":1}\n{"b":2}', status: 'running', componentNames: [], warningCount: 0 })
    expect(fold([toolCall(4, '{"messages":[]}'), toolResult(9)])?.status).toBe('success')
  })

  it('anchors at the start event, which is the generate_ui call itself', () => {
    const node = build([delta(5, '{"messages":[{"a":1}', 'generate_ui'), toolResult(9)])
    expect((node as { anchorSeq?: number } | null)?.anchorSeq).toBe(5)
  })

  it('builds no node for a Context without a start', () => {
    const node = genuiSurfaceDefinition.buildViewNode?.({ key: 'k', id: 'c1', state: undefined, matches: [{ event: delta(3, 'x', undefined, 'c1'), location: loc }] } as never)
    expect(node ?? null).toBeNull()
  })
})
