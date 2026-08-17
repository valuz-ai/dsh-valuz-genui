/**
 * DeepSeek Harness plugin: the `generate_ui` tool + the A2UI authoring guide.
 * The MAIN model authors an A2UI document and calls generate_ui with it; the
 * browser renders it inline, streaming as the model writes the call. No nested
 * model call — the model's own output is the UI.
 *
 * The authoring guide is served two ways: a compact always-on system-prompt
 * section (component names + purposes + rules), plus the full field-signature
 * catalog in an on-demand `genui` skill when the host has skill support. Where
 * no skill capability exists, the full guide stays in the section.
 * @module dsh-valuz-genui
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-skill'
import {
  GENUI_SECTION_NAME,
  GENUI_SECTION_ORDER,
  GENUI_SKILL_DESCRIPTION,
  GENUI_SKILL_NAME,
  buildAuthoringGuide,
  buildCompactGuide,
} from './prompt-section.ts'
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
  /**
   * Keep the full field-signature catalog always on in the system prompt
   * instead of the on-demand `genui` skill. Off by default (compact section +
   * skill when the host supports skills; full section otherwise).
   */
  alwaysOnFullGuide?: boolean
}

export const Config: Schema<Config> = Schema.object({
  maxDocumentBytes: Schema.number().default(DEFAULT_MAX_DOCUMENT_BYTES),
  alwaysOnFullGuide: Schema.boolean().default(false),
})

/**
 * Register the generate_ui tool, its authoring guidance, and (when available)
 * the on-demand catalog skill.
 * @param ctx - context carrying the tool registry, system-prompt registry, and optionally the skill registry.
 * @param rawConfig - schema-validated configuration after defaulting.
 */
export function apply(ctx: Context, rawConfig: Config): void {
  const config = rawConfig as Required<Config>
  if (!Number.isInteger(config.maxDocumentBytes) || config.maxDocumentBytes < 1) {
    throw new Error('genui: maxDocumentBytes must be a positive integer')
  }

  // The compact section is used only when the full catalog is available as a
  // skill; otherwise the model needs the full guide inline. Evaluated per
  // assembly so it follows the skill capability appearing/leaving.
  const guideAvailableAsSkill = (): boolean =>
    !config.alwaysOnFullGuide && ctx.get('skills') !== undefined
  ctx.systemPrompt.section({
    name: GENUI_SECTION_NAME,
    order: GENUI_SECTION_ORDER,
    text: () => (guideAvailableAsSkill() ? buildCompactGuide() : buildAuthoringGuide()),
  })

  if (!config.alwaysOnFullGuide) {
    ctx.inject(['skills'], (skillCtx) => skillCtx.skills.register({
      name: GENUI_SKILL_NAME,
      description: GENUI_SKILL_DESCRIPTION,
      content: buildAuthoringGuide(),
      source: 'runtime',
    }))
  }

  const toolConfig: GenerateUiConfig = { maxDocumentBytes: config.maxDocumentBytes }
  applyGenerateUiTool(ctx, toolConfig)
}
