/**
 * The Conversation Node that renders a `generate_ui` surface inline — streaming
 * as the model writes the call, then authoritative once the tool settles.
 *
 * It keys by step (`turn:step`, the stable identity), starts on `step/start`,
 * folds `assistant/chunk` `tool-call-delta` for the generate_ui block into the
 * live document, and adopts the durable `tool/result.meta` document at settle
 * (which is also the replay source).
 * @module @valuz/dsh-valuz-genui/client/node
 */

import type {
  ChatConversationViewNode,
  ConversationLocation,
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import { isGenuiSurfaceMeta } from '../meta.ts'
import { extractCompleteArrayElements } from './partial-args.ts'

const GENERATE_UI_TOOL = 'generate_ui'

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
    /** One generate_ui surface rendered inline. */
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
  /** Block index of the generate_ui tool call in this step, once seen. */
  renderIndex: number | null
  /** The generate_ui call id (surface id), once seen. */
  surfaceId: string | null
  /** Accumulated tool-call arguments for the generate_ui block. */
  argsRaw: string
  /** Authoritative surface, once the tool settled. */
  settled: SettledSurface | null
  /** Render position: the seq/location of the generate_ui event, so the surface
   * anchors at the tool call in the flow — not at step/start (which sorts to the top). */
  anchorSeq: number | null
  location: ConversationLocation | null
}

function foldMatch(state: GenuiNodeState, match: ConversationMatch): GenuiNodeState {
  const event = match.event
  if (event.type === 'assistant/chunk') {
    const chunk = event.data.chunk
    if (chunk.type !== 'tool-call-delta') return state
    let { renderIndex, surfaceId, anchorSeq, location } = state
    if (chunk.name === GENERATE_UI_TOOL) {
      renderIndex = chunk.index
      surfaceId = String(chunk.id)
      // Anchor the surface at the tool call, not the step boundary.
      if (anchorSeq === null) {
        anchorSeq = event.seq
        location = match.location
      }
    }
    if (renderIndex !== null && chunk.index === renderIndex) {
      return { ...state, renderIndex, surfaceId, anchorSeq, location, argsRaw: state.argsRaw + chunk.argumentsDelta }
    }
    return { ...state, renderIndex, surfaceId, anchorSeq, location }
  }
  if (event.type === 'tool/result') {
    const meta = event.data.meta
    if (isGenuiSurfaceMeta(meta)) {
      return {
        ...state,
        // On replay (no streamed chunks) the tool/result is the anchor.
        anchorSeq: state.anchorSeq ?? event.seq,
        location: state.location ?? match.location,
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
  return { renderIndex: null, surfaceId: null, argsRaw: '', settled: null, anchorSeq: null, location: null }
}

/** JSONL body of the complete A2UI messages authored so far. */
function streamingDocument(argsRaw: string): string {
  const elements = extractCompleteArrayElements(argsRaw, 'messages')
  return elements.map((element) => JSON.stringify(element)).join('\n')
}

/** The generate_ui surface node. */
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
  update: (context, match) => foldMatch(context.state, match),
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
      anchorSeq: state.anchorSeq ?? context.start.event.seq,
      location: state.location ?? context.start.location,
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
