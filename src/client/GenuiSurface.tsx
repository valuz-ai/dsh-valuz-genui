/**
 * The keyed Chat renderer for one generate_ui surface: it draws the A2UI
 * document with the valuz `<A2UIRenderer>`, follows the host light/dark theme,
 * and forwards user interactions to the agent through the injected sender.
 * @module dsh-valuz-genui/client/GenuiSurface
 */

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react'
import { A2UIRenderer } from '@valuz-genui/a2ui/react'
import type { A2uiClientAction } from '@valuz-genui/a2ui'
import '@valuz-genui/a2ui/styles.css'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UiAction } from '../meta.ts'
import css from './GenuiSurface.module.css'

/** Callback the plugin injects to route interactions back to the agent. */
export interface GenuiSurfaceInjected {
  readonly sendAction: (action: UiAction) => void
  /** Current host color scheme, refreshed on theme change. */
  readonly colorScheme: 'light' | 'dark'
}

/** Complete keyed Chat renderer props. */
export type GenuiSurfaceProps = PropsRuntime<'conversation.chat.node', 'genui-surface'> & GenuiSurfaceInjected

class SurfaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
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
    if (this.state.failed) {
      return <div className={css.error}>This interactive UI could not be rendered.</div>
    }
    return this.props.children
  }
}

/** Draw one generate_ui surface. */
export function GenuiSurface(props: GenuiSurfaceProps): ReactNode {
  const { node, sendAction, colorScheme } = props
  const data = node.data
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
      <SurfaceErrorBoundary>
        <A2UIRenderer body={data.document} status="success" theme={theme} onAction={onAction} />
      </SurfaceErrorBoundary>
      {data.warningCount > 0
        ? <div className={css.warning}>{data.warningCount} component(s) were dropped by validation.</div>
        : null}
    </div>
  )
}
