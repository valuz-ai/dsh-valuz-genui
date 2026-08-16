/**
 * Turns an A2UI client action from a rendered surface into a queued user
 * message on the owning session, so the model receives it as ordinary input
 * (model-visible ⟺ logged). No custom RPC — it rides `conversation.send`.
 * @module dsh-valuz-genui/client/action-bridge
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { formatUiAction, type UiAction } from '../meta.ts'

/** The scope-addressed conversation face this bridge needs. */
interface ConversationSend {
  send(text: string): Promise<void>
}

/**
 * Build the action sender for one session.
 * @param ctx - the client context (used to resolve the session scope).
 * @param sessionId - the session that owns the surface.
 * @returns a function that sends one interaction as a queued user message.
 */
export function createActionSender(ctx: ClientContext, sessionId: SessionId): (action: UiAction) => void {
  return (action: UiAction) => {
    const scoped = ctx.sessions.scope(sessionId)
    const conversation = scoped?.get('conversation') as ConversationSend | undefined
    if (conversation === undefined) {
      console.warn('[genui] no conversation service for session; UI action dropped')
      return
    }
    void conversation.send(formatUiAction(action)).catch((error: unknown) => {
      // The message may carry field content; log the failure, never the payload.
      console.warn('[genui] failed to send UI action', error instanceof Error ? error.message : error)
    })
  }
}
