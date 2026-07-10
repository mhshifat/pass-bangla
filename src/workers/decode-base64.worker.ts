/**
 * Base64 decode Web Worker.
 *
 * Decodes a base64 payload (a downloaded report/export file delivered as
 * base64-in-JSON) into raw bytes off the main thread, then transfers the
 * ArrayBuffer back to the caller zero-copy. Keeps the UI responsive when a
 * large report (multi-MB audit-log / password export) is downloaded.
 */

import { base64ToUint8Array } from "../lib/base64"

self.onmessage = (e: MessageEvent<{ base64: string }>) => {
  const bytes = base64ToUint8Array(e.data.base64)
  // Transfer the underlying buffer (no copy).
  ;(self as unknown as Worker).postMessage(bytes.buffer, [bytes.buffer])
}
