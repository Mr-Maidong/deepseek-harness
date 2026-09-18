/**
 * The base64 byte windows the workspace-file Remote returns. Both card faces
 * need the bytes behind that encoding — the edit buffer as text, a media read as
 * raw bytes — so the decoding lives here instead of once per reader.
 */

/**
 * Decode one base64 window to its bytes.
 * @param data - base64-encoded file bytes.
 * @returns the decoded bytes.
 */
export function decodeBase64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), character => character.charCodeAt(0))
}

/**
 * Decode one base64 window as UTF-8 text.
 * @param data - base64-encoded file bytes.
 * @returns the decoded text.
 */
export function decodeBase64Text(data: string): string {
  return new TextDecoder().decode(decodeBase64Bytes(data))
}
