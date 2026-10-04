/**
 * Renderers for generate_ui surfaces: the keyed Chat node inside the turn's
 * process, and the turn-tail list that shows a completed turn's settled
 * surfaces outside the process fold. Both draw the A2UI document with the
 * valuz `<A2UIRenderer>`, follow the host light/dark theme, and forward user
 * interactions to the agent through the injected sender.
 * @module @valuz/dsh-valuz-genui/client/GenuiSurface
 */

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react'
import { A2UIRenderer } from '@valuz/a2ui/react'
import type { A2uiClientAction } from '@valuz/a2ui'
import '@valuz/a2ui/styles.css'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConversationLocation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UiAction } from '../meta.ts'
import type { GenuiSurfaceChatData } from './node.ts'
import css from './GenuiSurface.module.css'

/** Callback and theme the plugin injects into both renderers. */
export interface GenuiSurfaceInjected {
  readonly sendAction: (action: UiAction) => void
  /** Current host color scheme, refreshed on theme change. */
  readonly colorScheme: 'light' | 'dark'
}

/** Turn-keyed surface source for the turn-tail renderer. */
export interface GenuiTurnSurfacesInjected extends GenuiSurfaceInjected {
  keyedHooks: {
    /** This Turn's generate_ui surfaces, in invocation order. */
    surfaces: (turn: string) => ObservableSnapshot<readonly GenuiSurfaceChatData[]>
  }
}

type Translate = PropsLocale<'valuzGenui'>['t']

/** Complete keyed Chat node renderer props. */
export type GenuiSurfaceProps = PropsRuntime<'conversation.chat.node', 'genui-surface'>
  & PropsLocale<'valuzGenui'>
  & GenuiSurfaceInjected

/** Complete turn-tail renderer props. */
export type GenuiTurnSurfacesProps = PropsRuntime<'conversation.chat.turnTail'>
  & PropsLocale<'valuzGenui'>
  & InjectFace<GenuiTurnSurfacesInjected>

class SurfaceErrorBoundary extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  constructor(props: { children: ReactNode; message: string }) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[genui] surface render failed', error.message, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.failed) return <div className={css.error}>{this.props.message}</div>
    return this.props.children
  }
}

interface SurfaceViewProps extends GenuiSurfaceInjected {
  readonly data: GenuiSurfaceChatData
  readonly t: Translate
}

/** Draw one surface document. */
function SurfaceView({ data, sendAction, colorScheme, t }: SurfaceViewProps): ReactNode {
  const [theme, setTheme] = useState(colorScheme)
  useEffect(() => setTheme(colorScheme), [colorScheme])

  const onAction = (action: A2uiClientAction): void => {
    sendAction({
      surfaceId: data.surfaceId,
      name: action.name,
      component: action.sourceComponentId,
      ...(action.context !== undefined && Object.keys(action.context).length > 0 ? { context: action.context } : {}),
    })
  }

  return (
    <div className={css.root} data-genui-surface={data.surfaceId}>
      <SurfaceErrorBoundary message={t('surface.renderFailed')}>
        <A2UIRenderer body={data.document} status={data.status} theme={theme} onAction={onAction} />
      </SurfaceErrorBoundary>
      {data.warningCount > 0
        ? <div className={css.warning}>{t('surface.dropped', { count: String(data.warningCount) })}</div>
        : null}
    </div>
  )
}

/** Whether the node's Turn has ended, so its turn tail shows the settled surfaces. */
function turnClosed(location: ConversationLocation): boolean {
  return (location.kind === 'turn' || location.kind === 'step') && location.turn.status === 'closed'
}

/**
 * Draw one generate_ui call inside the turn's process: the live surface while
 * the turn runs, and a one-line reference once the turn has ended and the
 * surface settled, because the turn tail then shows it in full.
 */
export function GenuiSurface({ node, sendAction, colorScheme, t }: GenuiSurfaceProps): ReactNode {
  const data = node.data
  if (data.status === 'success' && turnClosed(node.location)) {
    return <div className={css.reference}>{t('surface.inTail', { title: data.title ?? t('surface.untitled') })}</div>
  }
  return <SurfaceView data={data} sendAction={sendAction} colorScheme={colorScheme} t={t} />
}

/**
 * The settled surfaces to show for a turn, in invocation order. A later
 * surface with the same title is a revision (a retry after dropped
 * components, or an edit) and replaces the earlier one; untitled surfaces
 * are all kept.
 */
export function latestRevisions(surfaces: readonly GenuiSurfaceChatData[]): GenuiSurfaceChatData[] {
  const settled = surfaces.filter((surface) => surface.status === 'success')
  return settled.filter((surface, index) =>
    surface.title === undefined || !settled.slice(index + 1).some((later) => later.title === surface.title))
}

/** Draw a completed turn's settled surfaces after its final reply, outside the process fold. */
export function GenuiTurnSurfaces({ turn, useSurfaces, sendAction, colorScheme, t }: GenuiTurnSurfacesProps): ReactNode {
  const settled = latestRevisions(useSurfaces(String(turn.turn)) ?? [])
  if (settled.length === 0) return null
  return (
    <div className={css.tail}>
      {settled.map((surface) => (
        <SurfaceView key={surface.surfaceId} data={surface} sendAction={sendAction} colorScheme={colorScheme} t={t} />
      ))}
    </div>
  )
}
