/**
 * Choose the model route one generation uses: an explicit plugin config wins,
 * then the session's current model, then the agent's own options, then the
 * deployment default. Mirrors the compaction/session-title precedent.
 * @module dsh-valuz-genui/route
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ModelRoute } from './streamer.ts'

/** An optional, partial route from plugin config. */
export interface ConfiguredRoute {
  provider?: string
  model?: string
}

function pairOf(provider: string | undefined, model: string | undefined): ModelRoute | undefined {
  return provider !== undefined && provider.length > 0 && model !== undefined && model.length > 0
    ? { provider, model }
    : undefined
}

/**
 * Resolve the route for one generation.
 * @param agent - the calling agent (its session and options are read).
 * @param configured - the plugin's optional provider/model override.
 * @returns the chosen route.
 * @throws when no source supplies a complete provider/model pair.
 */
export function resolveRoute(agent: Agent, configured: ConfiguredRoute): ModelRoute {
  const header = agent.session.requestHeader()?.config
  const options = agent.options
  const route = pairOf(configured.provider, configured.model)
    ?? pairOf(header?.provider, header?.model)
    ?? pairOf(options.provider, options.model)
  if (route === undefined) {
    throw new Error(
      'generate_ui: no model is configured for this session — select a model, or set provider/model in the genui plugin config',
    )
  }
  return route
}
