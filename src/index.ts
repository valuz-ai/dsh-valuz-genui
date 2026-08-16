/**
 * DeepSeek Harness plugin: the `generate_ui` tool + the A2UI authoring guide.
 * The MAIN model authors an A2UI document and calls generate_ui with it; the
 * browser renders it inline, streaming as the model writes the call. No nested
 * model call — the model's own output is the UI.
 * @module dsh-valuz-genui
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { GENUI_SECTION_NAME, GENUI_SECTION_ORDER, buildAuthoringGuide } from './prompt-section.ts'
import { applyGenerateUiTool, type GenerateUiConfig } from './tool.ts'

export { GENUI_META_KIND, isGenuiSurfaceMeta, formatUiAction, parseUiAction } from './meta.ts'
export type { GenuiSurfaceMeta, UiAction } from './meta.ts'

export const name = 'genui'
export const inject = ['tools', 'systemPrompt']

/** Default inclusive byte cap on the serialized A2UI document. */
export const DEFAULT_MAX_DOCUMENT_BYTES = 256 * 1024

/** Deployment-owned configuration. */
export interface Config {
  /** Inclusive byte cap on the serialized A2UI document. */
  maxDocumentBytes?: number
}

export const Config: Schema<Config> = Schema.object({
  maxDocumentBytes: Schema.number().default(DEFAULT_MAX_DOCUMENT_BYTES),
})

/**
 * Register the generate_ui tool and the A2UI authoring guide.
 * @param ctx - context carrying the tool registry and system-prompt registry.
 * @param rawConfig - schema-validated configuration after defaulting.
 */
export function apply(ctx: Context, rawConfig: Config): void {
  const config = rawConfig as Required<Config>
  if (!Number.isInteger(config.maxDocumentBytes) || config.maxDocumentBytes < 1) {
    throw new Error('genui: maxDocumentBytes must be a positive integer')
  }

  ctx.systemPrompt.section({
    name: GENUI_SECTION_NAME,
    order: GENUI_SECTION_ORDER,
    text: buildAuthoringGuide(),
  })

  const toolConfig: GenerateUiConfig = { maxDocumentBytes: config.maxDocumentBytes }
  applyGenerateUiTool(ctx, toolConfig)
}
