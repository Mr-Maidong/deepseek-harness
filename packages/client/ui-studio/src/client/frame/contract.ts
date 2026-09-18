/** Owner shares for the personal studio's composable content seats. */

/** Shared section identity used by navigation and dependent panels. */
export type Section = 'project' | 'team' | 'knowledge'

/** Navigation panel share. */
export interface StudioNavigationOwnerProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
}

/**
 * How the universal preview card renders a path: a source buffer, an embedded
 * rendered artifact, a media player for bytes the card reads itself, or the
 * refusal shown for a binary format it cannot render.
 */
export type StudioPreviewKind = 'code' | 'iframe' | 'image' | 'video' | 'binary'

/** One media extension's preview kind and the type its bytes are handed to the browser as. */
export interface MediaFileType {
  readonly kind: 'image' | 'video'
  readonly mediaType: string
}

/**
 * Media the browser decodes or plays. Formats this list leaves out — TIFF, HEIC,
 * AVI, MPEG, audio — carry bytes no browser surface here can render, so they
 * classify as unsupported binaries instead of previewing as something broken.
 */
const MEDIA_FILE_TYPES: Readonly<Record<string, MediaFileType>> = {
  png: { kind: 'image', mediaType: 'image/png' },
  jpg: { kind: 'image', mediaType: 'image/jpeg' },
  jpeg: { kind: 'image', mediaType: 'image/jpeg' },
  gif: { kind: 'image', mediaType: 'image/gif' },
  webp: { kind: 'image', mediaType: 'image/webp' },
  avif: { kind: 'image', mediaType: 'image/avif' },
  bmp: { kind: 'image', mediaType: 'image/bmp' },
  ico: { kind: 'image', mediaType: 'image/x-icon' },
  // An SVG reaches the browser only through an img element's blob URL, so scripts
  // inside it never run.
  svg: { kind: 'image', mediaType: 'image/svg+xml' },
  mp4: { kind: 'video', mediaType: 'video/mp4' },
  m4v: { kind: 'video', mediaType: 'video/x-m4v' },
  mov: { kind: 'video', mediaType: 'video/quicktime' },
  webm: { kind: 'video', mediaType: 'video/webm' },
  mkv: { kind: 'video', mediaType: 'video/x-matroska' },
}

/**
 * Binary formats the card renders no surface for. Their bytes are not UTF-8
 * text, so the source buffer would show replacement characters, and a large file
 * would travel the whole read path only to fail. TypeScript (`ts`), RTF, and the
 * ambiguous `dat`/`img` suffixes are deliberately absent: text is a better
 * preview than a refusal.
 */
const UNSUPPORTED_BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // Archives and packages.
  'zip', 'rar', '7z', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'tar', 'jar', 'war',
  'apk', 'aab', 'ipa', 'whl', 'crx', 'xpi', 'dmg', 'iso',
  // Executables and object files.
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'obj', 'class', 'pyc', 'wasm',
  'node', 'pdb', 'ko', 'msi', 'deb', 'rpm',
  // Documents the card does not render.
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'epub', 'mobi', 'key', 'numbers', 'pages',
  // Fonts.
  'ttf', 'otf', 'ttc', 'woff', 'woff2', 'eot',
  // Audio.
  'mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma', 'mid', 'midi',
  // Video containers and image formats no browser decoder accepts.
  'tif', 'tiff', 'heic', 'heif', 'avi', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', '3g2',
  'rm', 'rmvb', 'swf',
  // Design files and opaque containers.
  'psd', 'ai', 'sketch', 'xd', 'fig',
  'sqlite', 'sqlite3', 'db', 'mdb', 'pak',
])

/** Extensions whose files the card embeds as rendered documents rather than shows as source. */
const RENDERED_EXTENSIONS: ReadonlySet<string> = new Set(['html', 'htm'])

/** The final suffix of a path's basename, lowercased, or an empty string when it has none. */
function extensionOf(path: string): string {
  const lower = path.toLowerCase()
  const name = lower.slice(Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1)
}

/**
 * The media type a path's own extension assigns to its bytes. Every path this
 * reports is one the card reads through the workspace-file Remote and plays from
 * a blob URL rather than showing as source.
 * @param path - the file path as the producer authored it.
 * @returns the media kind and type, or undefined for a path that is not media.
 */
export function mediaFileType(path: string): MediaFileType | undefined {
  return MEDIA_FILE_TYPES[extensionOf(path)]
}

/**
 * Whether a path names a binary format the card has no surface for. The producer
 * decides this before reading, so the file never travels the text read that
 * would either refuse it or hand back replacement characters.
 * @param path - the file path as the producer authored it.
 * @returns true for a refused binary format, false for every path the card reads.
 */
export function isUnsupportedBinary(path: string): boolean {
  return UNSUPPORTED_BINARY_EXTENSIONS.has(extensionOf(path))
}

/** Whether a path names a document the universal preview card embeds instead of editing.
 * A rendered artifact has no line grid, so it carries no language label and no focus line;
 * every other file opens as a source buffer. The file tree, the header search, and the chat
 * file opener share this one test so the same path reaches the card in the same kind from the
 * first publication, while its read is still in flight.
 * @param path - the file path as the producer authored it.
 * @returns true for rendered artifacts, false for everything else.
 */
export function isRenderedArtifact(path: string): boolean {
  return RENDERED_EXTENSIONS.has(extensionOf(path))
}

/**
 * The kind the card shows a readable text path as. Splitting it out of
 * {@link previewKindFor} keeps the producers' read branch precisely typed once
 * media and refused binaries have been answered.
 * @param path - the file path as the producer authored it.
 * @returns `'iframe'` for rendered artifacts, `'code'` for source files.
 */
export function textPreviewKindFor(path: string): 'code' | 'iframe' {
  return isRenderedArtifact(path) ? 'iframe' : 'code'
}

/** The preview kind the card shows one path as, before any read reaches the Host.
 * @param path - the file path as the producer authored it.
 * @returns the media kind for a previewable media file, `'binary'` for a refused binary format, otherwise the text kind.
 */
export function previewKindFor(path: string): StudioPreviewKind {
  return mediaFileType(path)?.kind
    ?? (isUnsupportedBinary(path) ? 'binary' : textPreviewKindFor(path))
}

/**
 * Read state of a workspace file as it travels from the tree click to the
 * floating card. A ready read discriminates on its kind: source carries a
 * language label and a search-jump focus line, a rendered artifact is just the
 * content the frame embeds, and a media file is only its path and type because
 * the card reads those bytes itself. A refused binary format settles on the
 * error state with no read at all.
 */
export type StudioPreview =
  | { path: string; status: 'loading'; kind: StudioPreviewKind }
  | {
    path: string
    status: 'ready'
    kind: 'code'
    content: string
    language?: string
    /** 1-based line/column to scroll the card to when it opens (search jump). */
    focus?: { line: number; column: number }
  }
  | { path: string; status: 'ready'; kind: 'iframe'; content: string }
  | { path: string; status: 'ready'; kind: 'image' | 'video'; mediaType: string }
  | { path: string; status: 'error'; kind: StudioPreviewKind }

/** Workspace and session switcher share. */
export interface StudioWorkspaceOwnerProps {
  activeSection: Section
  onPreview: (preview: StudioPreview) => void
  /** Path of the file currently shown in the floating preview card, or undefined. */
  openPath?: string | undefined
}

/** Project workbench share for the right rail. */
export interface StudioWorkbenchOwnerProps {
  activeSection: Section
}

/** Legacy left-main seat retained while the Studio workspace moves into the center column. */
export interface StudioLeftMainOwnerProps {
  children?: never
}

/** Real-time status panel share. */
export interface StudioStatusOwnerProps {
  activeSection: Section
}

/** Center editor share: a floating preview card over the conversation column. */
export interface StudioCenterEditorOwnerProps {
  preview?: StudioPreview | undefined
  onClose: () => void
}

/** Center toolbar share retained for project mode. */
export interface StudioCenterToolbarOwnerProps {
  children?: never
}
