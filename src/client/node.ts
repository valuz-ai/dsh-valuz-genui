/**
 * The Conversation Node that turns a `generate_ui` tool result into an
 * interactive A2UI surface in the chat. It matches `tool/result` events whose
 * `meta` this plugin wrote (`GENUI_META_KIND`), keyed by the surface id, and
 * carries the document plus a per-source revision to the keyed renderer.
 * @module dsh-valuz-genui/client/node
 */

import type {
  ChatConversationViewNode,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import { GENUI_META_KIND, isGenuiSurfaceMeta, type GenuiSurfaceMeta } from '../meta.ts'

/** Renderer payload for one surface. */
export interface GenuiSurfaceChatData {
  surfaceId: string
  /** Canonical A2UI JSONL document. */
  document: string
  request: string
  componentNames: readonly string[]
  warningCount: number
  edited: boolean
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One generate_ui surface rendered inline. */
    'genui-surface': GenuiSurfaceChatData
  }
}

interface GenuiNodeState {
  readonly meta: GenuiSurfaceMeta
}

function metaOf(event: { type: string; data: unknown }): GenuiSurfaceMeta | undefined {
  if (event.type !== 'tool/result') return undefined
  const meta = (event.data as { meta?: unknown }).meta
  return isGenuiSurfaceMeta(meta) ? meta : undefined
}

/** The generate_ui surface node: one durable tool result → one keyed Chat node. */
export const genuiSurfaceDefinition: ConversationNodeDefinition<GenuiNodeState> = {
  kind: GENUI_META_KIND,
  target: 'chat',
  match: (event) => {
    const meta = metaOf(event)
    return meta === undefined ? null : { id: meta.surfaceId, role: 'start' }
  },
  start: (_context, match) => {
    const meta = metaOf(match.event)
    if (meta === undefined) throw new Error('genui-surface start requires a genui tool/result')
    return { meta }
  },
  update: (context) => context.state,
  buildViewNode: (context: ConversationNodeContext<GenuiNodeState>): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    const meta = context.state.meta
    return {
      key: context.key,
      kind: GENUI_META_KIND,
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: {
        surfaceId: meta.surfaceId,
        document: meta.document,
        request: meta.request,
        componentNames: meta.componentNames,
        warningCount: meta.warnings.length,
        edited: meta.editedSurfaceId !== undefined,
      },
    }
  },
}
