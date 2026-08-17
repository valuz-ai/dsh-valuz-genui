/**
 * Extract the complete elements of a named array from a streaming tool-call
 * argument buffer (`argsRaw`, the concatenated `tool-call-delta` fragments).
 * Used to render an A2UI surface as the model writes `generate_ui`'s `messages`
 * argument, before the JSON is closed.
 * @module @valuz/dsh-valuz-genui/client/partial-args
 */

/**
 * Return the complete top-level objects of `arr` (default `messages`) written
 * so far in a partial JSON argument buffer. A trailing element still being
 * written is omitted; malformed input yields whatever prefix was complete.
 * @param argsRaw - the accumulated tool-call argument JSON, possibly truncated.
 * @param key - the array property name to read.
 * @returns the complete elements as parsed values, in order.
 */
export function extractCompleteArrayElements(argsRaw: string, key: string): unknown[] {
  const start = arrayStart(argsRaw, key)
  if (start === -1) return []

  const elements: unknown[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let elementStart = -1

  for (let i = start; i < argsRaw.length; i += 1) {
    const ch = argsRaw[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    switch (ch) {
      case '"':
        inString = true
        break
      case '{':
      case '[':
        if (depth === 0 && ch === '{') elementStart = i
        depth += 1
        break
      case '}':
      case ']':
        depth -= 1
        if (depth === 0 && elementStart !== -1) {
          const raw = argsRaw.slice(elementStart, i + 1)
          try {
            elements.push(JSON.parse(raw))
          } catch {
            // A complete-looking object that still fails to parse ends the run;
            // never emit a partial element.
            return elements
          }
          elementStart = -1
        } else if (depth < 0) {
          // Reached the array's own closing bracket.
          return elements
        }
        break
      default:
        break
    }
  }
  return elements
}

/** Find the index just after the opening `[` of the `"<key>": [` array, or -1. */
function arrayStart(argsRaw: string, key: string): number {
  const needle = `"${key}"`
  let from = 0
  for (;;) {
    const keyAt = argsRaw.indexOf(needle, from)
    if (keyAt === -1) return -1
    let i = keyAt + needle.length
    while (i < argsRaw.length && (argsRaw[i] === ' ' || argsRaw[i] === '\t' || argsRaw[i] === '\n' || argsRaw[i] === '\r')) i += 1
    if (argsRaw[i] === ':') {
      i += 1
      while (i < argsRaw.length && (argsRaw[i] === ' ' || argsRaw[i] === '\t' || argsRaw[i] === '\n' || argsRaw[i] === '\r')) i += 1
      if (argsRaw[i] === '[') return i + 1
    }
    from = keyAt + needle.length
  }
}
