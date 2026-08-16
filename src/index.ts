/**
 * DeepSeek Harness plugin: the `generate_ui` tool. The model turns a request
 * (plus data) into an A2UI document, generated through the harness's own
 * model service (`ctx.llm`) by the provider-free valuz-genui core, and
 * rendered as an interactive surface by this plugin's browser half.
 * @module dsh-valuz-genui
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { GENUI_SECTION_NAME, GENUI_SECTION_ORDER, GENUI_SECTION_TEXT } from './prompt-section.ts'
import { applyGenerateUiTool, type GenuiToolConfig } from './tool.ts'

export { GENUI_META_KIND, isGenuiSurfaceMeta, formatUiAction, parseUiAction } from './meta.ts'
export type { GenuiSurfaceMeta, UiAction } from './meta.ts'

export const name = 'genui'
export const inject = ['tools', 'llm', 'systemPrompt']

/** Default generation bounds (mirrors the valuz core defaults). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16384
export const DEFAULT_MAX_CONTINUATIONS = 3
export const DEFAULT_MAX_ATTEMPTS = 2
export const DEFAULT_MAX_DATA_BYTES = 128 * 1024

/**
 * Deployment-owned configuration. Every field is optional; the schema fills
 * defaults. `provider`/`model` are absent by default so generation follows
 * the session's current model.
 */
export interface Config {
  /** Provider route override; absent = follow the session's current model. */
  provider?: string
  model?: string
  maxOutputTokens?: number
  maxContinuations?: number
  maxAttempts?: number
  temperature?: number
  /** Byte cap on the `data` argument. */
  maxDataBytes?: number
}

export const Config: Schema<Config> = Schema.object({
  provider: Schema.string(),
  model: Schema.string(),
  maxOutputTokens: Schema.number().default(DEFAULT_MAX_OUTPUT_TOKENS),
  maxContinuations: Schema.number().default(DEFAULT_MAX_CONTINUATIONS),
  maxAttempts: Schema.number().default(DEFAULT_MAX_ATTEMPTS),
  temperature: Schema.number(),
  maxDataBytes: Schema.number().default(DEFAULT_MAX_DATA_BYTES),
})

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`genui: ${name} must be a positive integer`)
  }
}

/**
 * Register the `generate_ui` tool and its prompt guidance.
 * @param ctx - context carrying tools, the LLM service, and the system-prompt registry.
 * @param rawConfig - schema-validated configuration after defaulting.
 */
export function apply(ctx: Context, rawConfig: Config): void {
  const config = rawConfig as Required<Pick<Config, 'maxOutputTokens' | 'maxContinuations' | 'maxAttempts' | 'maxDataBytes'>> & Config
  assertPositiveInteger('maxOutputTokens', config.maxOutputTokens)
  assertPositiveInteger('maxContinuations', config.maxContinuations)
  assertPositiveInteger('maxAttempts', config.maxAttempts)
  assertPositiveInteger('maxDataBytes', config.maxDataBytes)
  if ((config.provider === undefined) !== (config.model === undefined)) {
    throw new Error('genui: set both provider and model, or neither')
  }

  ctx.systemPrompt.section({
    name: GENUI_SECTION_NAME,
    order: GENUI_SECTION_ORDER,
    text: GENUI_SECTION_TEXT,
  })

  const toolConfig: GenuiToolConfig = {
    maxOutputTokens: config.maxOutputTokens,
    maxContinuations: config.maxContinuations,
    maxAttempts: config.maxAttempts,
    maxDataBytes: config.maxDataBytes,
    ...(config.provider === undefined ? {} : { provider: config.provider }),
    ...(config.model === undefined ? {} : { model: config.model }),
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
  }
  applyGenerateUiTool(ctx, toolConfig)
}
