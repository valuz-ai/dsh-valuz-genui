/** `valuzGenui` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'valuzGenui'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'surface.renderFailed': '这个交互界面无法渲染。',
  'surface.dropped': '{count} 个组件未通过校验，已被省略。',
  'surface.inTail': '已生成界面：{title}（见本轮结尾）',
  'surface.untitled': '未命名界面',
}

/** Key of the plugin dictionary. */
export type GenuiKey = keyof typeof zh

/** English dictionary (same key set). */
export const en: Record<GenuiKey, string> = {
  'surface.renderFailed': 'This interactive UI could not be rendered.',
  'surface.dropped': '{count} component(s) were dropped by validation.',
  'surface.inTail': 'Generated UI: {title} (shown at the end of this turn)',
  'surface.untitled': 'Untitled UI',
}
