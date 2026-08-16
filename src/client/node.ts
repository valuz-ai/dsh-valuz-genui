/**
 * The Conversation Node that renders a `render_ui` surface inline — streaming
 * as the model writes the call, then authoritative once the tool settles.
 *
 * It keys by step (`turn:step`, the stable identity), starts on `step/start`,
 * folds `assistant/chunk` `tool-call-delta` for the render_ui block into the
 * live document, and adopts the durable `tool/result.meta` document at settle
 * (which is also the replay source).
 * @module dsh-valuz-genui/client/node
 */

import type {
  ChatConversationViewNode,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { isGenuiSurfaceMeta } from '../meta.ts'
import { extractCompleteArrayElements } from './partial-args.ts'

const RENDER_UI_TOOL = 'render_ui'

/** Renderer payload for one surface. */
export interface GenuiSurfaceChatData {
  surfaceId: string
  /** Canonical A2UI JSONL document (partial while streaming, complete at settle). */
  document: string
  status: 'running' | 'success'
  title?: string
  componentNames: readonly string[]
  warningCount: number
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One render_ui surface rendered inline. */
    'genui-surface': GenuiSurfaceChatData
  }
}

interface SettledSurface {
  surfaceId: string
  document: string
  title?: string
  componentNames: readonly string[]
  warningCount: number
}

interface GenuiNodeState {
  /** Block index of the render_ui tool call in this step, once seen. */
  renderIndex: number | null
  /** The render_ui call id (surface id), once seen. */
  surfaceId: string | null
  /** Accumulated tool-call arguments for the render_ui block. */
  argsRaw: string
  /** Authoritative surface, once the tool settled. */
  settled: SettledSurface | null
}

function foldChunk(state: GenuiNodeState, event: SessionEvent): GenuiNodeState {
  if (event.type === 'assistant/chunk') {
    const chunk = event.data.chunk
    if (chunk.type !== 'tool-call-delta') return state
    let { renderIndex, surfaceId } = state
    if (chunk.name === RENDER_UI_TOOL) {
      renderIndex = chunk.index
      surfaceId = String(chunk.id)
    }
    if (renderIndex !== null && chunk.index === renderIndex) {
      return { ...state, renderIndex, surfaceId, argsRaw: state.argsRaw + chunk.argumentsDelta }
    }
    return { ...state, renderIndex, surfaceId }
  }
  if (event.type === 'tool/result') {
    const meta = event.data.meta
    if (isGenuiSurfaceMeta(meta)) {
      return {
        ...state,
        settled: {
          surfaceId: meta.surfaceId,
          document: meta.document,
          componentNames: meta.componentNames,
          warningCount: meta.warnings.length,
          ...(meta.title === undefined ? {} : { title: meta.title }),
        },
      }
    }
  }
  return state
}

function initial(): GenuiNodeState {
  return { renderIndex: null, surfaceId: null, argsRaw: '', settled: null }
}

/** JSONL body of the complete A2UI messages authored so far. */
function streamingDocument(argsRaw: string): string {
  const elements = extractCompleteArrayElements(argsRaw, 'messages')
  return elements.map((element) => JSON.stringify(element)).join('\n')
}

/** The render_ui surface node. */
export const genuiSurfaceDefinition: ConversationNodeDefinition<GenuiNodeState> = {
  kind: 'genui-surface',
  target: 'chat',
  match: (event) => {
    if (event.type === 'step/start') return { id: `${event.data.turn}:${event.data.step}`, role: 'start' }
    if (event.type === 'assistant/chunk' || event.type === 'tool/result') {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'update' }
    }
    return null
  },
  start: () => initial(),
  update: (context, match) => foldChunk(context.state, match.event),
  // Stream deltas coalesced to a frame; the settled result renders immediately.
  publication: (match) => (match.event.type === 'assistant/chunk' ? 'animation-frame' : 'immediate'),
  buildViewNode: (context: ConversationNodeContext<GenuiNodeState>): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    const state = context.state
    const data = viewData(state)
    if (data === null) return null
    return {
      key: context.key,
      kind: 'genui-surface',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data,
    }
  },
}

/** The renderer payload for the current state, or null when there is nothing to show yet. */
function viewData(state: GenuiNodeState): GenuiSurfaceChatData | null {
  if (state.settled !== null) {
    const s = state.settled
    return {
      surfaceId: s.surfaceId,
      document: s.document,
      status: 'success',
      componentNames: s.componentNames,
      warningCount: s.warningCount,
      ...(s.title === undefined ? {} : { title: s.title }),
    }
  }
  if (state.renderIndex === null) return null
  const document = streamingDocument(state.argsRaw)
  if (document.length === 0) return null
  return {
    surfaceId: state.surfaceId ?? 'streaming',
    document,
    status: 'running',
    componentNames: [],
    warningCount: 0,
  }
}
