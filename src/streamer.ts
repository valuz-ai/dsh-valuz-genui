/**
 * `ModelStreamer` over the harness LLM service: `ctx.llm.stream()` chunks
 * become the valuz core's text/reasoning/finish events. Provider selection,
 * credentials, and adapters stay with the harness.
 * @module dsh-valuz-genui/streamer
 */

import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ModelStreamer, StreamerEvent, StreamRequest } from '@valuz-genui/core'

/** The provider route one generation uses. */
export interface ModelRoute {
  provider: string
  model: string
}

/** Where the streamer attributes its requests. */
export interface DshStreamerOptions {
  route: ModelRoute
  /** Session the nested call belongs to, for the harness's own bookkeeping. */
  sessionId?: SessionId
  /** Plugin name recorded as the message source. */
  plugin: string
}

/** Wraps a terminal `finish` failure so the loop treats the attempt as failed. */
export class DshModelError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'DshModelError'
  }
}

function toMessages(request: StreamRequest, plugin: string, route: ModelRoute): Message[] {
  return request.messages.map((message) => message.role === 'assistant'
    ? createAssistantMessage({ content: [{ type: 'text', text: message.content }], source: { provider: route.provider, model: route.model } })
    : createUserMessage({ content: [{ type: 'text', text: message.content }], source: { kind: 'plugin', plugin } }))
}

/**
 * Build a streamer bound to one route.
 * @param ctx - context carrying the harness LLM service.
 * @param options - route, session, and source attribution.
 * @returns a `ModelStreamer` the valuz generation loop can drive.
 */
export function createDshStreamer(ctx: Context, options: DshStreamerOptions): ModelStreamer {
  const { route, sessionId, plugin } = options
  return {
    label: `${route.provider}:${route.model}`,
    async *stream(request: StreamRequest): AsyncIterable<StreamerEvent> {
      const generate: GenerateOptions = {
        provider: route.provider,
        model: route.model,
        messages: toMessages(request, plugin, route),
        maxTokens: request.maxOutputTokens,
        ...(request.system === undefined ? {} : { system: request.system }),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.reasoningEffort === undefined || request.reasoningEffort === 'max'
          ? {}
          : { reasoningEffort: ReasoningEffortId(request.reasoningEffort) }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(sessionId === undefined ? {} : { sessionId }),
      }
      let usage: { inputTokens: number; outputTokens: number } | undefined
      for await (const chunk of ctx.llm.stream(generate)) {
        const event = mapChunk(chunk)
        if (event === undefined) continue
        if (event.type === 'usage') {
          usage = event.usage
          continue
        }
        if (event.type === 'finish') {
          yield { type: 'finish', reason: event.reason, ...(usage === undefined ? {} : { usage }) }
          return
        }
        yield event
      }
      yield { type: 'finish', reason: 'other', ...(usage === undefined ? {} : { usage }) }
    },
  }
}

type MappedChunk =
  | StreamerEvent
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number } }

function mapChunk(chunk: StreamChunk): MappedChunk | undefined {
  switch (chunk.type) {
    case 'text-delta':
      return { type: 'text-delta', text: chunk.text }
    case 'reasoning-delta':
      return { type: 'reasoning-delta', text: chunk.text }
    case 'usage': {
      const total = chunk.usage
      return {
        type: 'usage',
        usage: {
          inputTokens: (total.inputTokens ?? 0) + (total.cacheReadTokens ?? 0) + (total.cacheWriteTokens ?? 0),
          outputTokens: total.outputTokens ?? 0,
        },
      }
    }
    case 'finish': {
      const reason = chunk.reason
      switch (reason.kind) {
        case 'stop':
          return { type: 'finish', reason: 'stop' }
        case 'max-tokens':
          return { type: 'finish', reason: 'length' }
        case 'tool-calls':
          return { type: 'finish', reason: 'other' }
        case 'aborted':
          throw new DshModelError(reason.failure.message, reason.failure.code)
        case 'error':
          throw new DshModelError(reason.failure.message, reason.failure.code)
        default:
          return { type: 'finish', reason: 'other' }
      }
    }
    default:
      return undefined
  }
}
