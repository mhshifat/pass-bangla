import { base64ToUint8Array } from "@/lib/base64"

/**
 * Decodes a base64 string to an ArrayBuffer, using a Web Worker when available
 * so large payloads don't block the UI, and falling back to a (still fast)
 * main-thread tight-loop decode otherwise.
 */
export function decodeBase64Async(base64: string): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const fallback = () => resolve(base64ToUint8Array(base64).buffer as ArrayBuffer)

    if (typeof Worker === "undefined") {
      fallback()
      return
    }

    let worker: Worker | null = null
    let settled = false
    const finish = (buffer: ArrayBuffer) => {
      if (settled) return
      settled = true
      worker?.terminate()
      worker = null
      resolve(buffer)
    }

    try {
      worker = new Worker(
        new URL("../workers/decode-base64.worker.ts", import.meta.url),
        { type: "module" }
      )
      // Safety net: if the worker never responds, decode on the main thread.
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        worker?.terminate()
        worker = null
        fallback()
      }, 10000)

      worker.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        clearTimeout(timeout)
        finish(e.data)
      }
      worker.onerror = () => {
        clearTimeout(timeout)
        if (settled) return
        settled = true
        worker?.terminate()
        worker = null
        fallback()
      }
      worker.postMessage({ base64 })
    } catch {
      fallback()
    }
  })
}

/**
 * Downloads a base64-encoded file: decodes it (off-thread when possible),
 * wraps it in a Blob, and triggers a browser download. Client-only.
 */
export async function downloadBase64File(opts: {
  base64: string
  mimeType: string
  fileName: string
}): Promise<void> {
  const buffer = await decodeBase64Async(opts.base64)
  const blob = new Blob([buffer], { type: opts.mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = opts.fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
