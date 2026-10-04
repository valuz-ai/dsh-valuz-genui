// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenuiSurface, GenuiTurnSurfaces, latestRevisions } from '../../src/client/GenuiSurface.tsx'
import { en } from '../../src/client/locales.ts'
import type { GenuiSurfaceChatData } from '../../src/client/node.ts'

const line = (m: unknown) => JSON.stringify(m)
const DOC = [
  line({ version: 'v0.9.1', createSurface: { surfaceId: 'main', catalogId: 'https://valuz.io/a2ui/catalogs/base/v1' } }),
  line({ version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [
    { id: 'root', component: 'Stack', children: ['go'] },
    { id: 'go', component: 'Button', label: 'Refresh', action: { event: { name: 'refresh', context: { range: '7d' } } } },
  ] } }),
].join('\n')

/** English `t` with `{param}` interpolation. */
const t = (key: keyof typeof en, params: Record<string, string> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '')

function data(overrides: Partial<GenuiSurfaceChatData> = {}): GenuiSurfaceChatData {
  return { surfaceId: 'call-1', document: DOC, status: 'success', componentNames: ['Stack', 'Button'], warningCount: 0, ...overrides }
}

afterEach(cleanup)

const location = (status: 'open' | 'closed') => ({ kind: 'step', turn: { turn: 1, status }, step: { step: 1, status } })

describe('GenuiSurface (process node)', () => {
  const draw = (d: GenuiSurfaceChatData, status: 'open' | 'closed', sendAction: (a: unknown) => void = vi.fn()) => {
    const props = { node: { data: d, location: location(status) }, sendAction, colorScheme: 'dark', t } as unknown as Parameters<typeof GenuiSurface>[0]
    return render(<GenuiSurface {...props} />)
  }

  it('renders the surface while the turn runs and routes a click to sendAction', () => {
    const sendAction = vi.fn()
    draw(data(), 'open', sendAction)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(sendAction).toHaveBeenCalledWith({ surfaceId: 'call-1', name: 'refresh', component: 'go', context: { range: '7d' } })
  })

  it('shows a warning count', () => {
    draw(data({ warningCount: 2 }), 'open')
    expect(screen.getByText('2 component(s) were dropped by validation.')).toBeTruthy()
  })

  it('collapses to a reference once the turn ended and the surface settled', () => {
    draw(data({ title: 'Sales' }), 'closed')
    expect(screen.getByText('Generated UI: Sales (shown at the end of this turn)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('keeps an unsettled surface in place after the turn ended', () => {
    const { container } = draw(data({ status: 'running' }), 'closed')
    expect(container.querySelector('[data-genui-surface="call-1"]')).not.toBeNull()
    expect(screen.queryByText(/shown at the end of this turn/)).toBeNull()
  })
})

describe('GenuiTurnSurfaces (turn tail)', () => {
  const draw = (surfaces: readonly GenuiSurfaceChatData[] | undefined) => {
    const props = {
      turn: { turn: 1 }, seq: 9, openFile: vi.fn(), useSurfaces: () => surfaces,
      sendAction: vi.fn(), colorScheme: 'light', t,
    } as unknown as Parameters<typeof GenuiTurnSurfaces>[0]
    return render(<GenuiTurnSurfaces {...props} />)
  }

  it('renders only the settled surfaces of the turn', () => {
    const { container } = draw([data({ surfaceId: 'a' }), data({ surfaceId: 'b', status: 'running' })])
    expect([...container.querySelectorAll('[data-genui-surface]')].map((el) => el.getAttribute('data-genui-surface'))).toEqual(['a'])
  })

  it('renders nothing for a turn without settled surfaces', () => {
    expect(draw([]).container.innerHTML).toBe('')
    expect(draw(undefined).container.innerHTML).toBe('')
  })
})

describe('latestRevisions', () => {
  it('keeps the last settled surface per title and every untitled one, in order', () => {
    const kept = latestRevisions([
      data({ surfaceId: 'a', title: 'Sales' }),
      data({ surfaceId: 'b' }),
      data({ surfaceId: 'c', title: 'Costs' }),
      data({ surfaceId: 'd', title: 'Sales' }),
      data({ surfaceId: 'e', title: 'Costs', status: 'running' }),
      data({ surfaceId: 'f' }),
    ])
    expect(kept.map((surface) => surface.surfaceId)).toEqual(['b', 'c', 'd', 'f'])
  })
})
