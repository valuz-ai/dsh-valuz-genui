import { describe, expect, it } from 'vitest'
import { formatUiAction, isGenuiSurfaceMeta, parseUiAction, type GenuiSurfaceMeta } from '../../src/meta.ts'

const META: GenuiSurfaceMeta = {
  kind: 'genui-surface',
  surfaceId: 'call-1',
  document: '{}',
  request: 'r',
  componentNames: ['Stack'],
  warnings: [],
  attempts: 1,
  continuations: 0,
  route: { provider: 'p', model: 'm' },
}

describe('meta', () => {
  it('narrows genui surface meta', () => {
    expect(isGenuiSurfaceMeta(META)).toBe(true)
    expect(isGenuiSurfaceMeta({ kind: 'other' })).toBe(false)
    expect(isGenuiSurfaceMeta(null)).toBe(false)
    expect(isGenuiSurfaceMeta({ kind: 'genui-surface', surfaceId: 1 })).toBe(false)
  })

  it('round-trips a ui action envelope', () => {
    const action = { surfaceId: 'call-1', component: 'btn', name: 'refresh', context: { range: '7d' } }
    const text = formatUiAction(action)
    expect(text).toBe('<ui_action surface="call-1" component="btn" name="refresh">{"range":"7d"}</ui_action>')
    expect(parseUiAction(text)).toEqual(action)
  })

  it('handles an action with no context', () => {
    const text = formatUiAction({ surfaceId: 's', component: 'c', name: 'n' })
    expect(text).toBe('<ui_action surface="s" component="c" name="n"></ui_action>')
    expect(parseUiAction(text)).toEqual({ surfaceId: 's', component: 'c', name: 'n' })
  })

  it('returns undefined for non-envelope text and malformed context', () => {
    expect(parseUiAction('just a message')).toBeUndefined()
    expect(parseUiAction('<ui_action surface="s" component="c" name="n">{bad json</ui_action>')).toBeUndefined()
  })

  it('encodes unsafe attribute values', () => {
    const text = formatUiAction({ surfaceId: 'a"b', component: 'c', name: 'n' })
    expect(text).not.toContain('a"b')
    expect(parseUiAction(text)?.surfaceId).toBe('a"b')
  })
})
