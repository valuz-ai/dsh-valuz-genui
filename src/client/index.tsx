/**
 * Browser half of @valuz/dsh-valuz-genui: register the generate_ui surface
 * Conversation Node and its keyed Chat renderer, and wire the host theme +
 * the action → agent bridge into the renderer.
 * @module @valuz/dsh-valuz-genui/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { createActionSender } from './action-bridge.ts'
import { GenuiSurface, type GenuiSurfaceInjected } from './GenuiSurface.tsx'
import { genuiSurfaceDefinition } from './node.ts'

/** Required services: the node registry, the keyed slot, session scope, and theme. */
export const inject = ['conversationEvents', 'slots', 'sessions', 'theme']

/** Register the surface node and renderer. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(genuiSurfaceDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'genui-surface',
    inject: (sessionId: SessionId): GenuiSurfaceInjected => ({
      sendAction: createActionSender(ctx, sessionId),
      colorScheme: ctx.theme.getTheme().active.colorScheme,
    }),
  }, GenuiSurface))
}
