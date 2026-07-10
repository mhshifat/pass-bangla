"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  buildIndex,
  searchIndex,
  type IndexedItem,
  type SearchIndexItem,
} from "@/lib/password-search-core"

/** Minimum fields the hook needs to build a search index. */
export interface SearchablePassword {
  id: string
  name: string
  username: string
  url?: string | null
  folder?: string | null
  tags?: Array<{ name: string }>
}

function toIndexItem(p: SearchablePassword): SearchIndexItem {
  const tagText = (p.tags ?? []).map((t) => t.name).join(" ")
  return {
    id: p.id,
    name: p.name,
    username: p.username,
    url: p.url ?? "",
    extra: `${p.folder ?? ""} ${tagText}`.trim(),
  }
}

/**
 * Instant client-side fuzzy search over a set of password records.
 *
 * Runs scoring in a Web Worker (so typing never blocks the UI, even with
 * thousands of entries) and transparently falls back to a main-thread search
 * if workers are unavailable. Result ranking is provided by the shared search
 * core; this hook only manages the worker lifecycle + id → record mapping.
 */
export function usePasswordSearchWorker<T extends SearchablePassword>(
  records: T[],
  limit = 200
): { query: string; setQuery: (q: string) => void; results: T[] } {
  const [query, setQuery] = useState("")
  const [resultIds, setResultIds] = useState<string[] | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const fallbackIndexRef = useRef<IndexedItem[] | null>(null)
  const reqIdRef = useRef(0)
  const latestReqRef = useRef(0)

  const byId = useMemo(() => {
    const m = new Map<string, T>()
    for (const r of records) m.set(r.id, r)
    return m
  }, [records])

  const indexItems = useMemo(() => records.map(toIndexItem), [records])

  // Create the worker once (client only). Falls back to main-thread on failure.
  useEffect(() => {
    let worker: Worker | null = null
    try {
      worker = new Worker(
        new URL("../workers/password-search.worker.ts", import.meta.url),
        { type: "module" }
      )
      worker.onmessage = (e: MessageEvent<{ type: string; reqId: number; ids: string[] }>) => {
        const data = e.data
        if (data?.type === "result" && data.reqId === latestReqRef.current) {
          setResultIds(data.ids)
        }
      }
      worker.onerror = () => {
        workerRef.current = null
        fallbackIndexRef.current = buildIndex(indexItems)
      }
      workerRef.current = worker
    } catch {
      workerRef.current = null
      fallbackIndexRef.current = buildIndex(indexItems)
    }
    return () => {
      worker?.terminate()
      workerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Send the index to the worker (or rebuild the fallback) when records change.
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "index", items: indexItems })
    } else {
      fallbackIndexRef.current = buildIndex(indexItems)
    }
  }, [indexItems])

  // Run a search when the query or the index changes.
  useEffect(() => {
    if (workerRef.current) {
      const reqId = ++reqIdRef.current
      latestReqRef.current = reqId
      workerRef.current.postMessage({ type: "search", reqId, query, limit })
    } else {
      const idx = fallbackIndexRef.current ?? buildIndex(indexItems)
      fallbackIndexRef.current = idx
      setResultIds(searchIndex(idx, query, limit))
    }
  }, [query, indexItems, limit])

  const results = useMemo(() => {
    if (resultIds == null) return records.slice(0, limit) // not searched yet
    const out: T[] = []
    for (const id of resultIds) {
      const r = byId.get(id)
      if (r) out.push(r)
    }
    return out
  }, [resultIds, byId, records, limit])

  return { query, setQuery, results }
}
