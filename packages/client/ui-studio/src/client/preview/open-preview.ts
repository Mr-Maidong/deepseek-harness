/**
 * How one file path reaches the universal preview card. The file tree, the
 * header search, and the chat file opener all call this, so the same path always
 * lands in the same kind and the same first state, and no producer decides for
 * itself which kinds it reads.
 *
 * A media file is not read here: its bytes are the card's own business, so the
 * producer publishes the path and the type it will be played as and stops. A
 * binary format the card cannot render is refused here, before any read, because
 * the text read would either refuse it or show replacement characters, and a
 * large file must not travel the wire just to fail. Everything else takes the
 * ordinary bounded text read.
 */
import { mediaFileType, isUnsupportedBinary, textPreviewKindFor, type StudioPreview } from '../frame/contract.ts'

/** Read one file's text for the card; the path is fully qualified. */
export type PreviewTextRead = (path: string) => Promise<{ content: string; language?: string }>

/** Publish a preview state into the frame's store. */
export type PreviewPublish = (preview: StudioPreview) => void

/** UTF-8 decoding's own marker for bytes that were not valid text. */
const REPLACEMENT_CHARACTER = '\uFFFD'

/**
 * Publish the card's states for one fully qualified path.
 * @param readFile - the bounded text read the readable kinds use.
 * @param publish - the frame-store publication.
 * @param path - the fully qualified file path.
 * @param line - 1-based line the card lands on, when the gesture named one.
 * @param column - 1-based column paired with `line`; ignored without one.
 * @returns settles when the published state is the card's content, and rejects
 *   with the reason when the read failed; the card already carries that failure.
 */
export async function openPreview(
  readFile: PreviewTextRead,
  publish: PreviewPublish,
  path: string,
  line?: number,
  column = 1,
): Promise<void> {
  const media = mediaFileType(path)
  if (media !== undefined) {
    publish({ path, status: 'ready', kind: media.kind, mediaType: media.mediaType })
    return
  }
  if (isUnsupportedBinary(path)) {
    publish({ path, status: 'error', kind: 'binary' })
    return
  }
  const kind = textPreviewKindFor(path)
  publish({ path, status: 'loading', kind })
  try {
    const { content, language } = await readFile(path)
    // An extension the tables did not know was binary all along: the read
    // decoded invalid bytes as replacement characters, which is where a
    // source buffer would have shown mojibake.
    if (kind === 'code' && content.includes(REPLACEMENT_CHARACTER)) {
      publish({ path, status: 'error', kind: 'binary' })
      return
    }
    publish(kind === 'iframe'
      ? { path, status: 'ready', kind, content }
      : {
        path,
        status: 'ready',
        kind,
        content,
        ...(line === undefined ? {} : { focus: { line, column } }),
        ...(language === undefined ? {} : { language }),
      })
  } catch (error) {
    publish({ path, status: 'error', kind })
    throw error
  }
}
