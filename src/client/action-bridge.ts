/**
 * Turns an A2UI client action from a rendered surface into a queued user
 * message on the owning session, so the model receives it as ordinary input
 * (model-visible ⟺ logged). No custom RPC — it rides `conversation.send`.
 * @module @valuz/dsh-valuz-genui/client/action-bridge
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { formatUiAction, type UiAction } from '../meta.ts'

/**
 * Build the action sender for one session.
 * @param ctx - the client context (used to resolve the session scope).
 * @param sessionId - the session that owns the surface.
 * @returns a function that sends one interaction as a queued user message.
 */
export function createActionSender(ctx: Context, sessionId: SessionId): (action: UiAction) => void {
  return (action: UiAction) => {
    const scoped = ctx.sessions.scope(sessionId)
    const conversation = scoped?.get('conversation')
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
