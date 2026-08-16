// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GenuiSurface } from '../../src/client/GenuiSurface.tsx'
import type { GenuiSurfaceChatData } from '../../src/client/node.ts'

const line = (m: unknown) => JSON.stringify(m)
const DOC = [
  line({ version: 'v0.9.1', createSurface: { surfaceId: 'main', catalogId: 'https://valuz.io/a2ui/catalogs/base/v1' } }),
  line({ version: 'v0.9.1', updateComponents: { surfaceId: 'main', components: [
    { id: 'root', component: 'Stack', children: ['go'] },
    { id: 'go', component: 'Button', label: 'Refresh', action: { event: { name: 'refresh', context: { range: '7d' } } } },
  ] } }),
].join('\n')

function data(overrides: Partial<GenuiSurfaceChatData> = {}): GenuiSurfaceChatData {
  return { surfaceId: 'call-1', document: DOC, request: 'r', componentNames: ['Stack', 'Button'], warningCount: 0, edited: false, ...overrides }
}

describe('GenuiSurface', () => {
  const draw = (d: GenuiSurfaceChatData, colorScheme: 'light' | 'dark', sendAction: (a: unknown) => void) => {
    const props = { node: { data: d }, sendAction, colorScheme, t: (k: string) => k } as unknown as Parameters<typeof GenuiSurface>[0]
    return render(<GenuiSurface {...props} />)
  }

  it('renders the surface and routes a click to sendAction', () => {
    const sendAction = vi.fn()
    draw(data(), 'dark', sendAction)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(sendAction).toHaveBeenCalledWith({ surfaceId: 'call-1', name: 'refresh', component: 'go', context: { range: '7d' } })
  })

  it('shows a warning count', () => {
    const sendAction = vi.fn()
    draw(data({ warningCount: 2 }), 'light', sendAction)
    expect(screen.getByText(/2 component\(s\) were dropped/)).toBeTruthy()
  })
})
