import { describe, expect, it } from 'vitest'
import { genuiSurfaceDefinition, type GenuiSurfaceChatData } from '../../src/client/node.ts'
import type { GenuiSurfaceMeta } from '../../src/meta.ts'

const meta: GenuiSurfaceMeta = {
  kind: 'genui-surface',
  surfaceId: 'call-7',
  document: '{"version":"v0.9.1"}',
  request: 'a chart',
  componentNames: ['Stack', 'LineChart'],
  warnings: [{ id: 'x', component: 'Bad', reason: 'nope' }],
  attempts: 1,
  continuations: 0,
  route: { provider: 'p', model: 'm' },
}

const startEvent = { type: 'tool/result', seq: 4, time: 0, data: { meta } } as never

describe('genuiSurfaceDefinition', () => {
  it('matches a genui tool/result and ignores others', () => {
    expect(genuiSurfaceDefinition.match(startEvent)).toEqual({ id: 'call-7', role: 'start' })
    expect(genuiSurfaceDefinition.match({ type: 'tool/result', data: { meta: { kind: 'other' } } } as never)).toBeNull()
    expect(genuiSurfaceDefinition.match({ type: 'assistant/message', data: {} } as never)).toBeNull()
  })

  it('builds a chat view node from the meta', () => {
    const state = genuiSurfaceDefinition.start({ key: 'k', id: 'call-7' } as never, { event: startEvent } as never, {} as never)
    const context = {
      key: 'k', id: 'call-7', state,
      start: { event: startEvent, location: { kind: 'step' } },
    }
    const node = genuiSurfaceDefinition.buildViewNode?.(context as never)
    expect((node as { kind?: string } | null | undefined)?.kind).toBe('genui-surface')
    expect((node as { visibility?: string } | null | undefined)?.visibility).toBe('visible')
    const data = node?.data as GenuiSurfaceChatData
    expect(data.document).toBe(meta.document)
    expect(data.componentNames).toEqual(['Stack', 'LineChart'])
    expect(data.warningCount).toBe(1)
    expect(data.edited).toBe(false)
  })

  it('returns null before it has started', () => {
    expect(genuiSurfaceDefinition.buildViewNode?.({ key: 'k', id: 'x', start: undefined } as never)).toBeNull()
  })
})
