/**
 * The Conversation Node that renders a `generate_ui` surface inline — streaming
 * as the model writes the call, then authoritative once the tool settles.
 *
 * It keys by the generate_ui call id. A named `assistant/live-chunk`
 * `tool-call-delta` or the durable `tool/call` starts the node; later unnamed
 * deltas of the same call fold into the live document; the durable
 * `tool/result.meta` document replaces it at settle. Live chunks are
 * process-local and are removed when the model attempt settles, so on settle
 * and on reopen the node rebuilds from `tool/call` and `tool/result`.
 * @module @valuz/dsh-valuz-genui/client/node
 */

import type {
  ConversationLocation,
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
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

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
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
  /** The generate_ui call id, which is also the surface id. */
  surfaceId: string
  /** Accumulated tool-call arguments: streamed deltas, then the complete `tool/call` arguments. */
  argsRaw: string
  /** Authoritative surface, once the tool settled. */
  settled: SettledSurface | null
}

function settledFrom(meta: unknown): SettledSurface | null {
  if (!isGenuiSurfaceMeta(meta)) return null
  return {
    surfaceId: meta.surfaceId,
    document: meta.document,
    componentNames: meta.componentNames,
    warningCount: meta.warnings.length,
    ...(meta.title === undefined ? {} : { title: meta.title }),
  }
}

function startState(match: ConversationMatch): GenuiNodeState {
  const event = match.event
  if (event.type === 'assistant/live-chunk' && event.data.chunk.type === 'tool-call-delta') {
    return { surfaceId: String(event.data.chunk.id), argsRaw: event.data.chunk.argumentsDelta, settled: null }
  }
  if (event.type === 'tool/call') {
    return { surfaceId: String(event.data.callId), argsRaw: event.data.arguments, settled: null }
  }
  throw new Error('genui-surface start requires a generate_ui call delta or tool/call')
}

function foldMatch(state: GenuiNodeState, match: ConversationMatch): GenuiNodeState {
  const event = match.event
  if (event.type === 'assistant/live-chunk' && event.data.chunk.type === 'tool-call-delta') {
    return { ...state, argsRaw: state.argsRaw + event.data.chunk.argumentsDelta }
  }
  if (event.type === 'tool/call') return { ...state, argsRaw: event.data.arguments }
  if (event.type === 'tool/result') {
    const settled = settledFrom(event.data.meta)
    return settled === null ? state : { ...state, settled }
  }
  return state
}

/** JSONL body of the complete A2UI messages authored so far. */
function streamingDocument(argsRaw: string): string {
  const elements = extractCompleteArrayElements(argsRaw, 'messages')
  return elements.map((element) => JSON.stringify(element)).join('\n')
}

function nodeLocation(context: ConversationNodeContext<GenuiNodeState>): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

/** The generate_ui surface node. */
export const genuiSurfaceDefinition: ConversationNodeDefinition<GenuiNodeState> = {
  kind: 'genui-surface',
  target: 'chat',
  match: (event) => {
    if (event.type === 'assistant/live-chunk') {
      const chunk = event.data.chunk
      if (chunk.type !== 'tool-call-delta') return null
      // Only the first delta of a call carries its name; later deltas of a
      // started generate_ui call update it, and deltas of other calls find no start.
      if (chunk.name === undefined) return { id: String(chunk.id), role: 'update' }
      return chunk.name === GENERATE_UI_TOOL ? { id: String(chunk.id), role: 'start' } : null
    }
    if (event.type === 'tool/call') {
      return event.data.name === GENERATE_UI_TOOL ? { id: String(event.data.callId), role: 'start' } : null
    }
    if (event.type === 'tool/result' && event.surfaceOp === 'append' && isGenuiSurfaceMeta(event.data.meta)) {
      return { id: String(event.data.message.source.callId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => startState(match),
  update: (context, match) => foldMatch(context.state, match),
  // Stream deltas coalesced to a frame; the call and its result render immediately.
  publication: (match) => (match.event.type === 'assistant/live-chunk' ? 'animation-frame' : 'immediate'),
  buildViewNode: (context: ConversationNodeContext<GenuiNodeState>): ChatConversationViewNode | null => {
    const data = context.state === undefined ? null : viewData(context.state)
    if (data === null) return null
    return {
      key: context.key,
      kind: 'genui-surface',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: nodeLocation(context),
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
  const document = streamingDocument(state.argsRaw)
  if (document.length === 0) return null
  return {
    surfaceId: state.surfaceId,
    document,
    status: 'running',
    componentNames: [],
    warningCount: 0,
  }
}
