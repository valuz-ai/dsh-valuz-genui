/**
 * The system-prompt guidance that teaches the model when to call `generate_ui`
 * and how to react to a `<ui_action>` message. Independent of the skill so it
 * works with zero skill catalog (a lesson from prior genui plugins).
 * @module dsh-valuz-genui/prompt-section
 */

/** Section name; tool guidance lives in the 100–199 order band. */
export const GENUI_SECTION_NAME = 'genui:tool'
export const GENUI_SECTION_ORDER = 110

export const GENUI_SECTION_TEXT =
  'You can render interactive UI with the generate_ui tool: a natural-language '
  + 'request plus the data to show become charts, KPI cards, tables, forms, or a '
  + 'small dashboard shown inline in this conversation. Call it when the user asks '
  + 'for a chart, dashboard, card, visualization, page, or interactive control — '
  + 'not to merely list items, and never inferring the intent from data alone. Put '
  + 'the concrete values in the data argument; describe layout and relationships in '
  + 'words, never colors or CSS (the host owns the theme). Do not restate the UI as '
  + 'text after calling it. When the user interacts with a surface you rendered, you '
  + 'receive a message like <ui_action surface="…" component="…" name="…">{…}</ui_action>: '
  + 'answer in text if that suffices, or call generate_ui again with current_document '
  + 'set to that surface to return an updated interface.'
