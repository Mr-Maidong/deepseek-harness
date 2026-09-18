/**
 * The path classification every producer shares. It runs before any read, so it
 * decides three things at once: which paths the card plays as media, which it
 * refuses as binary formats, and which it opens as a text buffer or an embedded
 * document. The two tables must stay disjoint — an extension in both would make
 * the media branch silently win — and the deliberately ambiguous suffixes must
 * stay out of the binary table.
 */
import { describe, expect, it } from 'vitest'
import {
  isRenderedArtifact, isUnsupportedBinary, mediaFileType, previewKindFor, textPreviewKindFor,
} from '../src/client/frame/contract.ts'

describe('mediaFileType', () => {
  it('maps each media extension to its kind and browser media type', () => {
    expect(mediaFileType('/work/demo/photo.PNG')).toEqual({ kind: 'image', mediaType: 'image/png' })
    expect(mediaFileType('/work/demo/photo.jpeg')).toEqual({ kind: 'image', mediaType: 'image/jpeg' })
    expect(mediaFileType('/work/demo/icon.svg')).toEqual({ kind: 'image', mediaType: 'image/svg+xml' })
    expect(mediaFileType('/work/demo/clip.webm')).toEqual({ kind: 'video', mediaType: 'video/webm' })
    expect(mediaFileType('/work/demo/clip.MKV')).toEqual({ kind: 'video', mediaType: 'video/x-matroska' })
  })

  it('reads the extension of the basename only', () => {
    // A dot in a parent directory names no file type.
    expect(mediaFileType('/work/assets.png/notes')).toBeUndefined()
    expect(mediaFileType('/work/demo/archive.png.txt')).toBeUndefined()
    expect(mediaFileType('C:\\work\\demo\\photo.webp')).toEqual({ kind: 'image', mediaType: 'image/webp' })
  })

  it('reports nothing for a path with no extension or an unknown one', () => {
    expect(mediaFileType('/work/demo/README')).toBeUndefined()
    expect(mediaFileType('/work/demo/notes.md')).toBeUndefined()
    expect(mediaFileType('/work/demo/')).toBeUndefined()
  })
})

describe('isUnsupportedBinary', () => {
  it('recognizes the binary formats the card has no surface for', () => {
    expect(isUnsupportedBinary('/work/demo/archive.zip')).toBe(true)
    expect(isUnsupportedBinary('/work/demo/paper.PDF')).toBe(true)
    expect(isUnsupportedBinary('/work/demo/Inter.ttf')).toBe(true)
    expect(isUnsupportedBinary('/work/demo/take.avi')).toBe(true)
    expect(isUnsupportedBinary('/work/demo/track.mp3')).toBe(true)
    expect(isUnsupportedBinary('/work/demo/scan.heic')).toBe(true)
  })

  it('keeps text formats out of the refusal', () => {
    // TypeScript and RTF are text, and a source buffer is a better preview than a
    // refusal; the ambiguous `dat`/`img` suffixes stay unclassified for the same
    // reason.
    expect(isUnsupportedBinary('/work/demo/app.ts')).toBe(false)
    expect(isUnsupportedBinary('/work/demo/notes.rtf')).toBe(false)
    expect(isUnsupportedBinary('/work/demo/table.dat')).toBe(false)
    expect(isUnsupportedBinary('/work/demo/disk.img')).toBe(false)
    expect(isUnsupportedBinary('/work/demo/notes.md')).toBe(false)
  })

  it('leaves previewable media out, because those tables are disjoint', () => {
    expect(isUnsupportedBinary('/work/demo/photo.png')).toBe(false)
    expect(isUnsupportedBinary('/work/demo/clip.mp4')).toBe(false)
  })
})

describe('previewKindFor', () => {
  it('answers media before the text kinds', () => {
    expect(previewKindFor('/work/demo/photo.avif')).toBe('image')
    expect(previewKindFor('/work/demo/clip.m4v')).toBe('video')
  })

  it('answers a refused binary format', () => {
    expect(previewKindFor('/work/demo/archive.tar')).toBe('binary')
    expect(previewKindFor('/work/demo/book.docx')).toBe('binary')
  })

  it('falls back to the text kinds', () => {
    expect(previewKindFor('/work/demo/page.html')).toBe('iframe')
    expect(previewKindFor('/work/demo/PAGE.HTM')).toBe('iframe')
    expect(previewKindFor('/work/demo/app.ts')).toBe('code')
  })

  it('narrows the text kinds for the producers that read a path', () => {
    expect(textPreviewKindFor('/work/demo/page.htm')).toBe('iframe')
    expect(textPreviewKindFor('/work/demo/photo.png')).toBe('code')
    expect(isRenderedArtifact('/work/demo/photo.png')).toBe(false)
  })
})
