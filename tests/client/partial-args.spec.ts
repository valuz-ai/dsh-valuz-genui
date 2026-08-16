import { describe, expect, it } from 'vitest'
import { extractCompleteArrayElements } from '../../src/client/partial-args.ts'

describe('extractCompleteArrayElements', () => {
  it('returns complete elements and omits a partial trailing one', () => {
    const raw = '{"messages":[{"a":1},{"b":2},{"c":'
    expect(extractCompleteArrayElements(raw, 'messages')).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('returns all elements when the array is closed', () => {
    const raw = '{"messages":[{"a":1},{"b":2}],"title":"x"}'
    expect(extractCompleteArrayElements(raw, 'messages')).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('handles braces and brackets inside string values', () => {
    const raw = '{"messages":[{"t":"a{b}[c]"},{"t":"end'
    expect(extractCompleteArrayElements(raw, 'messages')).toEqual([{ t: 'a{b}[c]' }])
  })

  it('handles escaped quotes inside strings', () => {
    const raw = '{"messages":[{"t":"a\\"b"},{"t":"partial'
    expect(extractCompleteArrayElements(raw, 'messages')).toEqual([{ t: 'a"b' }])
  })

  it('handles nested objects and arrays in an element', () => {
    const raw = '{"messages":[{"updateComponents":{"components":[{"id":"root"}]}},{'
    expect(extractCompleteArrayElements(raw, 'messages')).toEqual([{ updateComponents: { components: [{ id: 'root' }] } }])
  })

  it('returns [] before the array starts or when the key is absent', () => {
    expect(extractCompleteArrayElements('{"messages":', 'messages')).toEqual([])
    expect(extractCompleteArrayElements('{"messa', 'messages')).toEqual([])
    expect(extractCompleteArrayElements('{"other":[{"a":1}]}', 'messages')).toEqual([])
  })

  it('tolerates whitespace between key, colon, and bracket', () => {
    expect(extractCompleteArrayElements('{ "messages" : [ {"a":1} ]', 'messages')).toEqual([{ a: 1 }])
  })
})
