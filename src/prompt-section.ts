/**
 * The system-prompt section that teaches the MAIN model to author A2UI itself
 * and emit it by calling `generate_ui`. Because the model writes the document
 * directly (no nested model call), the full A2UI authoring guide — base rules,
 * the message contract, and the component catalog — lives here, always on.
 * @module dsh-valuz-genui/prompt-section
 */

import {
  A2UI_VERSION,
  SUPPORTED_CATALOG_ID,
  buildCatalogBlock,
  buildInstructions,
} from '@valuz-genui/core'
import { valuzBaseComponentApis, type ComponentApi } from '@valuz-genui/a2ui/catalog'

/** Section name; tool guidance lives in the 100–199 order band. */
export const GENUI_SECTION_NAME = 'genui:authoring'
export const GENUI_SECTION_ORDER = 110

/** How the model must deliver the document it authored. */
const DELIVERY = `Deliver the UI by calling the generate_ui tool: pass \`messages\` as the array of A2UI message objects you wrote (one object per array element — do NOT stringify them, and do NOT wrap them in text). The client renders them, streaming, as you write the call. Author the whole document in one generate_ui call; do not narrate the JSON or repeat the UI as text afterward. When the user interacts with a surface you rendered, you receive a <ui_action surface="…" component="…" name="…">{…}</ui_action> message: answer in text if that suffices, or call generate_ui again with the full updated document to change the interface.`

/**
 * Build the authoring guide.
 * @param catalog - the component catalog to teach; defaults to the base catalog.
 * @returns the full system-prompt section text.
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
