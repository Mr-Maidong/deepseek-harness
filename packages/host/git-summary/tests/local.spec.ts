/**
 * LocalGitSummary unit tests: numstat parsing and null-delimited counting.
 * The parsing helpers are exported from the local module for direct testing.
 */
import { describe, expect, it } from 'vitest'
import { parseNumstat, countNullDelimited } from '../src/local.ts'

describe('parseNumstat', () => {
  it('returns zeros for empty input', () => {
    expect(parseNumstat('')).toEqual({ insertions: 0, deletions: 0 })
  })

  it('sums insertions and deletions across multiple files', () => {
    // git diff --numstat -z format: added\tdeleted\tpath\0
    const NUL = '\u0000'
    const raw = `10\t2\tfile-a.ts${NUL}5\t3\tfile-b.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 15, deletions: 5 })
  })

  it('skips binary files reported as dash-dash', () => {
    const NUL = '\u0000'
    const raw = `10\t2\ttext.ts${NUL}-\t-\timage.png${NUL}3\t1\tother.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 13, deletions: 3 })
  })

  it('handles paths with spaces and special characters', () => {
    const NUL = '\u0000'
    const raw = `1\t0\tpath with spaces/file.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 1, deletions: 0 })
  })

  it('ignores malformed entries without tabs', () => {
    const NUL = '\u0000'
    const raw = `malformed${NUL}10\t2\tgood.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 10, deletions: 2 })
  })

  it('ignores entries missing the path field', () => {
    const NUL = '\u0000'
    const raw = `10\t2${NUL}4\t1\tgood.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 4, deletions: 1 })
  })

  it('ignores entries whose counts are not numbers', () => {
    const NUL = '\u0000'
    const raw = `abc\t1\tfirst.ts${NUL}4\tdef\tsecond.ts${NUL}2\t3\tgood.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 2, deletions: 3 })
  })

  it('ignores an entry where only the deletion column is a dash', () => {
    const NUL = '\u0000'
    const raw = `10\t-\tweird.ts${NUL}4\t1\tgood.ts${NUL}`
    expect(parseNumstat(raw)).toEqual({ insertions: 4, deletions: 1 })
  })
})

describe('countNullDelimited', () => {
  const NUL = '\u0000'

  it('returns zero for empty string', () => {
    expect(countNullDelimited('')).toBe(0)
  })

  it('counts non-empty segments', () => {
    expect(countNullDelimited(`a${NUL}b${NUL}c${NUL}`)).toBe(3)
  })

  it('skips empty trailing segment from trailing NUL', () => {
    expect(countNullDelimited(`file-a${NUL}file-b${NUL}`)).toBe(2)
  })
})
