/**
 * Pure fuzzy-search core shared by the search Web Worker and its main-thread
 * fallback. No secrets — operates only on password metadata.
 */

export interface SearchIndexItem {
  id: string
  name: string
  username: string
  url: string
  /** Extra searchable text: folder name + tag names, space-joined. */
  extra: string
}

export interface IndexedItem {
  id: string
  name: string
  username: string
  url: string
  extra: string
  hay: string
}

/** Precompute a lowercased index for fast repeated searching. */
export function buildIndex(items: SearchIndexItem[]): IndexedItem[] {
  return items.map((it) => ({
    id: it.id,
    name: it.name.toLowerCase(),
    username: it.username.toLowerCase(),
    url: it.url.toLowerCase(),
    extra: it.extra.toLowerCase(),
    hay: `${it.name} ${it.username} ${it.url} ${it.extra}`.toLowerCase(),
  }))
}

/** True if `query` appears as an ordered subsequence of `text`. */
function isSubsequence(text: string, query: string): boolean {
  let qi = 0
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi++
  }
  return qi === query.length
}

/** Score a single token against an item's fields. 0 = no match. */
function scoreToken(item: IndexedItem, token: string): number {
  const nameIdx = item.name.indexOf(token)
  if (nameIdx !== -1) {
    return 1000 - nameIdx * 3 + (item.name === token ? 800 : item.name.startsWith(token) ? 400 : 0)
  }
  const userIdx = item.username.indexOf(token)
  if (userIdx !== -1) return 620 - userIdx * 2
  const urlIdx = item.url.indexOf(token)
  if (urlIdx !== -1) return 440 - urlIdx
  const extraIdx = item.extra.indexOf(token)
  if (extraIdx !== -1) return 260 - extraIdx
  if (isSubsequence(item.name, token)) return 120
  if (isSubsequence(item.hay, token)) return 60
  return 0
}

/**
 * Returns matching item ids, best-first. An empty query returns the first
 * `limit` ids in the index's existing order (caller pre-sorts by recency).
 */
export function searchIndex(index: IndexedItem[], query: string, limit = 200): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return index.slice(0, limit).map((it) => it.id)

  const tokens = q.split(/\s+/).filter(Boolean)
  const scored: Array<{ id: string; score: number }> = []

  for (const item of index) {
    let total = 0
    let matchedAll = true
    for (const token of tokens) {
      const s = scoreToken(item, token)
      if (s === 0) {
        matchedAll = false
        break
      }
      total += s
    }
    if (matchedAll) scored.push({ id: item.id, score: total })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.id)
}
