/**
 * Password search Web Worker — runs fuzzy scoring off the main thread so typing
 * stays smooth even with thousands of entries. Operates on metadata only
 * (names/usernames/urls/folder/tags), never secrets.
 *
 * Protocol:
 *  - { type: "index", items }          → cache the searchable index
 *  - { type: "search", reqId, query }  → reply { type: "result", reqId, ids }
 *
 * `reqId` lets the caller drop stale (out-of-order) responses (latest-wins).
 */

import { buildIndex, searchIndex, type IndexedItem, type SearchIndexItem } from "../lib/password-search-core"

type InMessage =
  | { type: "index"; items: SearchIndexItem[] }
  | { type: "search"; reqId: number; query: string; limit?: number }

let index: IndexedItem[] = []

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data
  if (msg.type === "index") {
    index = buildIndex(msg.items)
    return
  }
  if (msg.type === "search") {
    const ids = searchIndex(index, msg.query, msg.limit ?? 200)
    ;(self as unknown as Worker).postMessage({ type: "result", reqId: msg.reqId, ids })
  }
}
