/**
 * Browser half of @valuz/dsh-valuz-genui: register the generate_ui surface
 * Conversation Node, its keyed Chat renderer inside the turn's process, and a
 * turn-tail entry that shows a completed turn's settled surfaces outside the
 * process fold; wire the host theme and the action → agent bridge into both.
 * @module @valuz/dsh-valuz-genui/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { createActionSender } from './action-bridge.ts'
import {
  GenuiSurface, type GenuiSurfaceInjected, GenuiTurnSurfaces, type GenuiTurnSurfacesInjected,
} from './GenuiSurface.tsx'
import { en, type GenuiKey, NS, zh } from './locales.ts'
import { genuiSurfaceDefinition } from './node.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** generate_ui surface copy. */
    valuzGenui: GenuiKey
  }
}

/** Required services: Conversation registries, slots, session scope, theme, and copy. */
export const inject = ['uiConversation', 'slots', 'sessions', 'theme', 'locale']

/** Register the surface node, its renderer, the turn-tail entry, and dictionaries. */
export function apply(ctx: Context): void {
  ctx.uiConversation.events.register(genuiSurfaceDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'valuz-genui: dictionaries')
  const surfaceFace = (sessionId: SessionId): GenuiSurfaceInjected => ({
    sendAction: createActionSender(ctx, sessionId),
    colorScheme: ctx.theme.getTheme().active.colorScheme,
  })
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'genui-surface',
    locale: NS,
    inject: surfaceFace,
  }, GenuiSurface))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'valuz-genui-surfaces',
    locale: NS,
    inject: (sessionId: SessionId): GenuiTurnSurfacesInjected => {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`valuz-genui: unknown session "${sessionId}"`)
      const chat = ctx.uiConversation.binding(binding).target('chat')
      return {
        ...surfaceFace(sessionId),
        keyedHooks: {
          surfaces: (turn) => {
            const snapshot = chat.getSnapshot()
            if (snapshot === undefined) throw new Error('valuz-genui: Chat target is unavailable')
            return snapshot.nodes.turnDataSource(Number(turn), 'genui-surface')
          },
        },
      }
    },
  }, GenuiTurnSurfaces))
}
