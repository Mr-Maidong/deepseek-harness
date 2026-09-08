/**
 * LocalWorkspaceSearch unit tests: ripgrep JSON parsing, byte-to-code-unit
 * conversion, and preview trimming. The parsing helpers are exported from the
 * local module for direct testing.
 */
import { describe, expect, it } from 'vitest'
import {
  parseRipgrepJson,
  trimPreview,
  utf16Offset,
} from '../src/local.ts'

/** Build a ripgrep JSON-lines stream for one file with the given matches. */
function streamFor(path: string, matches: Array<{ line: number; text: string; start: number; end: number }>): string {
  const begin = JSON.stringify({ type: 'begin', data: { path: { text: path } } })
  const matchLines = matches.map(m => JSON.stringify({
    type: 'match',
    data: {
      path: { text: path },
      lines: { text: m.text },
      line_number: m.line,
      absolute_offset: 0,
      submatches: [{ match: { text: m.text.slice(m.start, m.end) }, start: m.start, end: m.end }],
    },
  }))
  const end = JSON.stringify({ type: 'end', data: { path: { text: path }, stats: {} } })
  return [begin, ...matchLines, end].join('\n')
}

describe('parseRipgrepJson', () => {
  it('returns an empty result for empty input', () => {
    expect(parseRipgrepJson('', 500, 5000, 512)).toEqual({
      files: [],
      fileCount: 0,
      matchCount: 0,
      truncated: false,
    })
  })

  it('groups matches by file and strips the ./ path prefix', () => {
    const raw = streamFor('./src/a.ts', [
      { line: 1, text: 'hello world\n', start: 0, end: 5 },
      { line: 3, text: 'say hello\n', start: 4, end: 9 },
    ])
    const result = parseRipgrepJson(raw, 500, 5000, 512)
    expect(result.fileCount).toBe(1)
    expect(result.matchCount).toBe(2)
    expect(result.files).toEqual([
      {
        path: 'src/a.ts',
        matches: [
          { line: 1, column: 1, preview: 'hello world\n', matchStart: 0, matchLength: 5 },
          { line: 3, column: 5, preview: 'say hello\n', matchStart: 4, matchLength: 5 },
        ],
      },
    ])
    expect(result.truncated).toBe(false)
  })

  it('reports multiple files in traversal order', () => {
    const raw = [
      streamFor('./a.ts', [{ line: 1, text: 'x hello\n', start: 2, end: 7 }]),
      streamFor('./b.ts', [{ line: 2, text: 'hello y\n', start: 0, end: 5 }]),
    ].join('\n')
    const result = parseRipgrepJson(raw, 500, 5000, 512)
    expect(result.files.map(f => f.path)).toEqual(['a.ts', 'b.ts'])
    expect(result.fileCount).toBe(2)
    expect(result.matchCount).toBe(2)
  })

  it('skips a file with no matches (no end event match grouping)', () => {
    const raw = streamFor('./a.ts', [])
    const result = parseRipgrepJson(raw, 500, 5000, 512)
    expect(result.files).toEqual([])
    expect(result.fileCount).toBe(0)
  })

  it('truncates matches beyond the cap and flags the result', () => {
    const raw = streamFor('./a.ts', [
      { line: 1, text: 'hello\n', start: 0, end: 5 },
      { line: 2, text: 'hello\n', start: 0, end: 5 },
      { line: 3, text: 'hello\n', start: 0, end: 5 },
    ])
    const result = parseRipgrepJson(raw, 500, 2, 512)
    expect(result.matchCount).toBe(2)
    expect(result.files[0]?.matches).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('truncates files beyond the cap and flags the result', () => {
    const raw = [
      streamFor('./a.ts', [{ line: 1, text: 'hello\n', start: 0, end: 5 }]),
      streamFor('./b.ts', [{ line: 1, text: 'hello\n', start: 0, end: 5 }]),
      streamFor('./c.ts', [{ line: 1, text: 'hello\n', start: 0, end: 5 }]),
    ].join('\n')
    const result = parseRipgrepJson(raw, 2, 5000, 512)
    expect(result.fileCount).toBe(2)
    expect(result.files.map(f => f.path)).toEqual(['a.ts', 'b.ts'])
    expect(result.truncated).toBe(true)
  })

  it('ignores events with malformed payloads, field by field', () => {
    const end = '{"type":"end","data":{"path":{"text":"./plain.ts"}}}'
    const match = (fields: string) => `{"type":"match","data":{${fields}}}`
    const raw = [
      '42', // event line is not an object
      '{"type":"begin","data":5}', // begin data is not a record
      '{"type":"begin","data":{"path":5}}', // begin path is not a record
      '{"type":"begin","data":{"path":{"text":5}}}', // begin path text is not a string
      '{"type":"end","data":{}}', // end arrives before any begin
      match('"lines":{"text":"hi\\n"},"line_number":1,"submatches":[{"start":0,"end":2}]'), // match arrives before any begin
      '{"type":"begin","data":{"path":{"text":"plain.ts"}}}', // begin without the ./ prefix names the file verbatim
      '{"type":"match","data":5}', // match data is not a record
      match('"lines":5,"line_number":1,"submatches":[{}]'), // lines is not a record
      match('"lines":{"text":5},"line_number":1,"submatches":[{}]'), // line text is not a string
      match('"lines":{"text":"hi\\n"},"line_number":"1","submatches":[{}]'), // line number is not a number
      match('"lines":{"text":"hi\\n"},"line_number":1'), // submatches is missing
      match('"lines":{"text":"hi\\n"},"line_number":1,"submatches":[5]'), // submatch is not a record
      match('"lines":{"text":"hi\\n"},"line_number":1,"submatches":[{"start":0}]'), // end offset is missing
      '{"type":"summary","data":{"stats":{}}}', // summary events carry no result rows
      '{bad json', // unparseable line
      end, // a file whose every match was rejected is not reported
    ].join('\n')
    const result = parseRipgrepJson(raw, 10, 10, 100)
    expect(result.files).toEqual([])
    expect(result).toMatchObject({ fileCount: 0, matchCount: 0, truncated: false })
  })

  it('ignores malformed JSON lines and non-object events', () => {
    const raw = [
      'not json',
      JSON.stringify({ type: 'summary', data: {} }),
      streamFor('./a.ts', [{ line: 1, text: 'hello\n', start: 0, end: 5 }]),
    ].join('\n')
    const result = parseRipgrepJson(raw, 500, 5000, 512)
    expect(result.fileCount).toBe(1)
    expect(result.matchCount).toBe(1)
  })

  it('converts multibyte byte offsets to code units', () => {
    // "你好 hello 世界\n" — "你好 " is 6 bytes + 1 space = 7 bytes, so "hello"
    // starts at byte 7, which is code-unit 3 (你, 好, space).
    const raw = streamFor('./c.txt', [{ line: 1, text: '你好 hello 世界\n', start: 7, end: 12 }])
    const result = parseRipgrepJson(raw, 500, 5000, 512)
    const match = result.files[0]?.matches[0]
    expect(match).toEqual({
      line: 1,
      column: 4,
      preview: '你好 hello 世界\n',
      matchStart: 3,
      matchLength: 5,
    })
  })

  it('trims a long line to a bounded window around the match', () => {
    const line = `${'x'.repeat(1000)} hello ${'y'.repeat(1000)}\n`
    const raw = streamFor('./long.txt', [{ line: 1, text: line, start: 1001, end: 1006 }])
    const result = parseRipgrepJson(raw, 500, 5000, 100)
    const match = result.files[0]?.matches[0]
    expect(match).toBeDefined()
    expect(match!.preview.length).toBeLessThanOrEqual(100)
    // The match text is intact within the trimmed preview.
    expect(match!.preview.slice(match!.matchStart, match!.matchStart + match!.matchLength)).toBe('hello')
  })
})

describe('utf16Offset', () => {
  it('maps ASCII byte offsets directly', () => {
    expect(utf16Offset('hello', 0)).toBe(0)
    expect(utf16Offset('hello', 5)).toBe(5)
  })

  it('counts multibyte characters as single code units', () => {
    expect(utf16Offset('你好', 0)).toBe(0)
    expect(utf16Offset('你好', 6)).toBe(2)
  })

  it('counts a 2-byte character as a single code unit', () => {
    expect(utf16Offset('aé', 1)).toBe(1)
    expect(utf16Offset('aé', 3)).toBe(2)
  })

  it('counts a 4-byte emoji as two code units (surrogate pair)', () => {
    expect(utf16Offset('a😀b', 0)).toBe(0)
    expect(utf16Offset('a😀b', 1)).toBe(1)
    expect(utf16Offset('a😀b', 5)).toBe(3)
    expect(utf16Offset('a😀b', 6)).toBe(4)
  })

  it('clamps an out-of-range offset to the text length', () => {
    expect(utf16Offset('hi', 99)).toBe(2)
    expect(utf16Offset('hi', -1)).toBe(0)
  })
})

describe('trimPreview', () => {
  it('returns the line unchanged when it fits', () => {
    expect(trimPreview('hello\n', 0, 5, 512)).toEqual({ text: 'hello\n', startOffset: 0 })
  })

  it('centers the window on the match', () => {
    const line = `${'x'.repeat(100)} hello ${'y'.repeat(100)}\n`
    // "hello" occupies code units 101..106 (index 100 is the leading space).
    const { text, startOffset } = trimPreview(line, 101, 106, 40)
    expect(text.length).toBeLessThanOrEqual(40)
    expect(text).toContain('hello')
    // The match is at the same relative position in the trimmed text.
    expect(text.slice(101 - startOffset, 106 - startOffset)).toBe('hello')
  })

  it('clamps to the line start when the match is near the beginning', () => {
    const line = `hello ${'y'.repeat(200)}\n`
    const { text, startOffset } = trimPreview(line, 0, 5, 40)
    expect(startOffset).toBe(0)
    expect(text.startsWith('hello')).toBe(true)
  })
})
