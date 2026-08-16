/**
 * The durable contract shared by the host tool and the browser node: the
 * `tool/result.meta` payload one `generate_ui` call persists, and the
 * `<ui_action>` envelope a user interaction sends back to the agent.
 * Pure types and functions; imported by both halves.
 * @module dsh-valuz-genui/meta
 */

/** Discriminator on `tool/result.meta` for surfaces this plugin rendered. */
export const GENUI_META_KIND = 'genui-surface' as const

/** One dropped component, mirrored from the valuz sanitizer. */
export interface GenuiRejectedComponent {
  id: string
  component: string
  reason: string
}

/** Persisted facts of one rendered surface (`tool/result.meta`). */
export interface GenuiSurfaceMeta {
  kind: typeof GENUI_META_KIND
  /** Stable surface identity: the tool call id. Models reference it to edit. */
  surfaceId: string
  /** Canonical A2UI JSONL document. */
  document: string
  /** The request the model made. */
  request: string
  componentNames: string[]
  warnings: GenuiRejectedComponent[]
  attempts: number
  continuations: number
  route: { provider: string; model: string }
  usage?: { inputTokens: number; outputTokens: number }
  /** Surface id this call edited, when it was an edit. */
  editedSurfaceId?: string
}

/**
 * Narrow an arbitrary `meta` value to a genui surface.
 * @param value - `tool/result.meta` from any tool.
 * @returns whether the value is a {@link GenuiSurfaceMeta}.
 */
export function isGenuiSurfaceMeta(value: unknown): value is GenuiSurfaceMeta {
  if (typeof value !== 'object' || value === null) return false
  const meta = value as Record<string, unknown>
  return meta['kind'] === GENUI_META_KIND
    && typeof meta['surfaceId'] === 'string'
    && typeof meta['document'] === 'string'
    && typeof meta['request'] === 'string'
    && Array.isArray(meta['componentNames'])
}

/** One user interaction on a rendered surface, as the browser reports it. */
export interface UiAction {
  surfaceId: string
  /** The A2UI action name the model authored (`{"event":{"name":…}}`). */
  name: string
  /** The component that dispatched it. */
  component: string
  /** Action context / form values, when any. */
  context?: unknown
}

const ATTRIBUTE_SAFE = /^[A-Za-z0-9_.:-]{1,128}$/

function attribute(value: string): string {
  return ATTRIBUTE_SAFE.test(value) ? value : encodeURIComponent(value).slice(0, 128)
}

/**
 * Render the message the browser sends when the user interacts with a
 * surface. Machine-parseable and model-readable at once.
 * @param action - the interaction.
 * @returns e.g. `<ui_action surface="call-1" component="btn" name="refresh">{"range":"7d"}</ui_action>`.
 */
export function formatUiAction(action: UiAction): string {
  const context = action.context === undefined ? '' : JSON.stringify(action.context)
  return `<ui_action surface="${attribute(action.surfaceId)}" component="${attribute(action.component)}" name="${attribute(action.name)}">${context}</ui_action>`
}

const UI_ACTION_PATTERN = /^<ui_action surface="([^"]*)" component="([^"]*)" name="([^"]*)">([\s\S]*)<\/ui_action>$/u

/**
 * Parse a message produced by {@link formatUiAction}.
 * @param text - the whole message text.
 * @returns the action, or `undefined` when the text is not a ui_action envelope.
 */
export function parseUiAction(text: string): UiAction | undefined {
  const match = UI_ACTION_PATTERN.exec(text.trim())
  if (match === null) return undefined
  const [, surfaceId, component, name, body] = match
  let context: unknown
  if (body !== undefined && body.length > 0) {
    try {
      context = JSON.parse(body)
    } catch {
      return undefined
    }
  }
  return {
    surfaceId: decodeURIComponent(surfaceId ?? ''),
    component: decodeURIComponent(component ?? ''),
    name: decodeURIComponent(name ?? ''),
    ...(context === undefined ? {} : { context }),
  }
}
