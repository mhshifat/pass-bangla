import prisma from "@/lib/prisma"
import { decryptPassword } from "@/lib/crypto"
import { decryptFromStorage } from "@/lib/server-crypto-migration"
import { arePasswordsSimilar, calculateSimilarity } from "@/lib/password-similarity"

/** Upper bound on passwords decrypted by one whole-vault scan. */
export const MAX_SCAN_PASSWORDS = 5000
/** Upper bound on passwords compared pairwise for similarity. */
export const MAX_SIMILAR_PASSWORDS = 2000

export type ScanStrength = "strong" | "medium" | "weak"

export interface ScanEntry {
  id: string
  name: string
  username: string
  url: string | null
  ownerId: string
  owner: { id: string; name: string; email: string }
  strength: ScanStrength
  plain: string
}

export type PublicEntry = Omit<ScanEntry, "plain">

// One decrypt pass per request: duplicates, reused and similar run together.
// Keyed by the request's session object so nothing outlives the request.
const scans = new WeakMap<object, Promise<ScanEntry[]>>()

async function decryptVault(userId: string): Promise<ScanEntry[]> {
  const passwords = await prisma.password.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    take: MAX_SCAN_PASSWORDS,
    select: {
      id: true,
      name: true,
      username: true,
      password: true,
      url: true,
      ownerId: true,
      strength: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  })

  const entries: ScanEntry[] = []
  for (const pwd of passwords) {
    try {
      let plain: string
      try {
        plain = decryptFromStorage(pwd.password, pwd.ownerId)
      } catch {
        plain = decryptPassword(pwd.password)
      }
      entries.push({
        id: pwd.id,
        name: pwd.name,
        username: pwd.username,
        url: pwd.url,
        ownerId: pwd.ownerId,
        owner: pwd.owner,
        strength: pwd.strength.toLowerCase() as ScanStrength,
        plain,
      })
    } catch {
      // Skip passwords that can't be decrypted
    }
  }
  return entries
}

export function loadDecryptedVault(scope: object | null, userId: string): Promise<ScanEntry[]> {
  if (!scope) return decryptVault(userId)
  let scan = scans.get(scope)
  if (!scan) {
    scan = decryptVault(userId)
    scans.set(scope, scan)
    scan.catch(() => {
      if (scans.get(scope) === scan) scans.delete(scope)
    })
  }
  return scan
}

function toPublic(e: ScanEntry): PublicEntry {
  return {
    id: e.id,
    name: e.name,
    username: e.username,
    url: e.url,
    ownerId: e.ownerId,
    owner: e.owner,
    strength: e.strength,
  }
}

export interface SecretGroup {
  key: string
  count: number
  strength: ScanStrength
  entries: PublicEntry[]
}

/** Groups entries whose (optionally trimmed) plaintext matches; returns metadata only. */
export function groupByIdenticalSecret(entries: ScanEntry[], normalize: boolean): SecretGroup[] {
  const groups = new Map<string, ScanEntry[]>()
  for (const e of entries) {
    const k = normalize ? e.plain.trim() : e.plain
    const g = groups.get(k)
    if (g) g.push(e)
    else groups.set(k, [e])
  }
  const result: SecretGroup[] = []
  for (const g of groups.values()) {
    if (g.length < 2) continue
    result.push({
      key: g[0]!.id,
      count: g.length,
      strength: g[0]!.strength,
      entries: g.map(toPublic),
    })
  }
  return result
}

export interface SimilarGroup {
  key: string
  entries: PublicEntry[]
  similarity: number
}

/** Greedy similarity grouping; prunes pairs by length window and caps the compared set. */
export function groupBySimilarSecret(entries: ScanEntry[], threshold: number): SimilarGroup[] {
  const items = entries.slice(0, MAX_SIMILAR_PASSWORDS)
  const order = items.map((_, i) => i).sort((x, y) => items[x]!.plain.length - items[y]!.plain.length)
  const lengths = order.map((i) => items[i]!.plain.length)

  const lowerBound = (len: number) => {
    let lo = 0
    let hi = lengths.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (lengths[mid]! < len) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const processed = new Set<number>()
  const groups: SimilarGroup[] = []

  for (let i = 0; i < items.length; i++) {
    if (processed.has(i)) continue
    processed.add(i)
    const base = items[i]!.plain
    const len = base.length

    // |len - other| must stay within (1 - threshold) of the longer string
    const minLen = threshold > 0 ? Math.ceil(threshold * len) : 0
    const maxLen = threshold > 0 ? Math.floor(len / threshold) : Infinity
    const members: number[] = [i]
    for (let k = lowerBound(minLen); k < order.length && lengths[k]! <= maxLen; k++) {
      const j = order[k]!
      if (j <= i || processed.has(j)) continue
      if (arePasswordsSimilar(base, items[j]!.plain, threshold)) {
        members.push(j)
        processed.add(j)
      }
    }
    if (members.length < 2) continue
    members.sort((x, y) => x - y)

    let total = 0
    let comparisons = 0
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        total += calculateSimilarity(items[members[x]!]!.plain, items[members[y]!]!.plain)
        comparisons++
      }
    }
    groups.push({
      key: items[i]!.id,
      entries: members.map((m) => toPublic(items[m]!)),
      similarity: comparisons > 0 ? total / comparisons : 0,
    })
  }
  return groups
}
