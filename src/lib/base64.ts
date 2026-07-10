/**
 * Fast base64 → bytes decode.
 *
 * Uses a tight loop instead of `Uint8Array.from(atob(b64), c => c.charCodeAt(0))`
 * — the callback form invokes a JS function per byte and is dramatically slower
 * for multi-MB payloads (e.g. report/export downloads).
 *
 * Available in both window and worker scopes (`atob` exists in both).
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
