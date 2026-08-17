/**
 * The system-prompt section that teaches the MAIN model to author A2UI itself
 * and emit it by calling `generate_ui`. Because the model writes the document
 * directly (no nested model call), the full A2UI authoring guide — base rules,
 * the message contract, and the component catalog — lives here, always on.
 * @module @valuz/dsh-valuz-genui/prompt-section
 */

import {
  A2UI_VERSION,
  SUPPORTED_CATALOG_ID,
  buildCatalogBlock,
  buildInstructions,
} from '@valuz/genui-core'
import { valuzBaseComponentApis, type ComponentApi } from '@valuz/a2ui/catalog'

/** Section name; tool guidance lives in the 100–199 order band. */
export const GENUI_SECTION_NAME = 'genui:authoring'
export const GENUI_SECTION_ORDER = 110

/** The on-demand skill carrying the full A2UI field-signature catalog. */
export const GENUI_SKILL_NAME = 'genui'
export const GENUI_SKILL_DESCRIPTION =
  'The full A2UI v0.9.1 authoring guide for the generate_ui tool: every component with its exact fields, '
  + 'the message contract, and the theme/visualization rules. Load this before authoring a chart, dashboard, '
  + 'KPI cards, table, or form with generate_ui.'

/** How the model must deliver the document it authored. */
const DELIVERY = `Deliver the UI by calling the generate_ui tool: pass \`messages\` as the array of A2UI message objects you wrote (one object per array element — do NOT stringify them, and do NOT wrap them in text). The client renders them, streaming, as you write the call. Author the whole document in one generate_ui call; do not narrate the JSON or repeat the UI as text afterward. When the user interacts with a surface you rendered, you receive a <ui_action surface="…" component="…" name="…">{…}</ui_action> message: answer in text if that suffices, or call generate_ui again with the full updated document to change the interface.`

/** The A2UI message-contract lines shared by both guides. */
function messageContract(): string[] {
  return [
    `A2UI ${A2UI_VERSION} message contract — each element of generate_ui \`messages\` is one of:`,
    `- createSurface: {"version":"${A2UI_VERSION}","createSurface":{"surfaceId":"main","catalogId":"${SUPPORTED_CATALOG_ID}"}}  (must be the first element)`,
    `- updateComponents: {"version":"${A2UI_VERSION}","updateComponents":{"surfaceId":"main","components":[...]}}`,
    `- updateDataModel: {"version":"${A2UI_VERSION}","updateDataModel":{"surfaceId":"main","path":"/","value":{...}}}`,
    '- exactly one component must have id "root"; put the visible tree under root.children.',
  ]
}

/** One line per component: name + short description (no field signatures). */
function compactCatalog(catalog: readonly ComponentApi[]): string {
  const lines = catalog.map((component) => {
    const description = (component.schema.description ?? '').replace(/\s+/gu, ' ').trim()
    return `- ${component.name} — ${description}`
  })
  return `A2UI components (names and purpose; load the ${GENUI_SKILL_NAME} skill for exact fields):\n${lines.join('\n')}`
}

/**
 * Build the COMPACT always-on guide: rules, the message contract, and the
 * component names with one-line purposes — enough to author valid A2UI. The
 * exact field signatures live in the on-demand {@link GENUI_SKILL_NAME} skill.
 * @param catalog - the component catalog; defaults to the base catalog.
 * @returns the compact system-prompt section text.
 */
export function buildCompactGuide(catalog: readonly ComponentApi[] = valuzBaseComponentApis): string {
  return [
    'When the user asks for a chart, dashboard, KPI cards, a table, a form, or an interactive UI, render it with the generate_ui tool. Describe layout and relationships through the components below; never hand-write colors or CSS (the host owns the theme). Put concrete values directly in the components.',
    '',
    buildInstructions(),
    '',
    ...messageContract(),
    '',
    compactCatalog(catalog),
    '',
    `Before authoring, load the \`${GENUI_SKILL_NAME}\` skill for each component's exact field names and types; guessing fields drops components.`,
    '',
    DELIVERY,
  ].join('\n')
}

/**
 * Build the full authoring guide (with exact field signatures). Used as the
 * on-demand skill content, and as the always-on section when no skill
 * capability is available.
 * @param catalog - the component catalog to teach; defaults to the base catalog.
 * @returns the full system-prompt / skill text.
 */
export function buildAuthoringGuide(catalog: readonly ComponentApi[] = valuzBaseComponentApis): string {
  return [
    'When the user asks for a chart, dashboard, KPI cards, a table, a form, or an interactive UI, generate it with the generate_ui tool. Describe layout and relationships through the components below; never hand-write colors or CSS (the host owns the theme). Put concrete values directly in the components.',
    '',
    buildInstructions(),
    '',
    `A2UI ${A2UI_VERSION} message contract — each element of generate_ui \`messages\` is one of:`,
    `- createSurface: {"version":"${A2UI_VERSION}","createSurface":{"surfaceId":"main","catalogId":"${SUPPORTED_CATALOG_ID}"}}  (must be the first element)`,
    `- updateComponents: {"version":"${A2UI_VERSION}","updateComponents":{"surfaceId":"main","components":[...]}}`,
    `- updateDataModel: {"version":"${A2UI_VERSION}","updateDataModel":{"surfaceId":"main","path":"/","value":{...}}}`,
    '- exactly one component must have id "root"; put the visible tree under root.children.',
    '',
    buildCatalogBlock(catalog).trim(),
    '',
    DELIVERY,
  ].join('\n')
}
