/**
 * Password similarity detection utilities
 * Uses Levenshtein distance and character similarity to detect similar passwords
 */

/**
 * Levenshtein distance using two rolling rows. Returns `maxDistance + 1` as soon
 * as the distance is certain to exceed `maxDistance`.
 */
export function levenshteinWithin(str1: string, str2: string, maxDistance: number = Infinity): number {
  let a = str1
  let b = str2
  if (a.length < b.length) {
    const tmp = a
    a = b
    b = tmp
  }
  const m = a.length
  const n = b.length
  if (m - n > maxDistance) return maxDistance + 1

  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = curr[0]
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      curr[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > maxDistance) return maxDistance + 1
    const tmp = prev
    prev = curr
    curr = tmp
  }

  return prev[n]
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  return levenshteinWithin(str1, str2)
}

/**
 * Calculate similarity percentage between two passwords
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function calculateSimilarity(password1: string, password2: string): number {
  if (password1 === password2) return 1.0

  const maxLength = Math.max(password1.length, password2.length)
  if (maxLength === 0) return 1.0

  const distance = levenshteinDistance(password1, password2)
  const similarity = 1 - distance / maxLength

  return Math.max(0, similarity)
}

/**
 * Check if two passwords are similar based on a threshold
 * @param password1 First password
 * @param password2 Second password
 * @param threshold Similarity threshold (0-1), default 0.8 (80% similar)
 */
export function arePasswordsSimilar(
  password1: string,
  password2: string,
  threshold: number = 0.8
): boolean {
  if (password1 === password2) return true
  const maxLength = Math.max(password1.length, password2.length)
  if (maxLength === 0) return true
  // similarity >= threshold  <=>  distance <= (1 - threshold) * maxLength
  const maxDistance = Math.floor((1 - threshold) * maxLength + 1e-9)
  const distance = levenshteinWithin(password1, password2, maxDistance)
  if (distance > maxDistance) return false
  return 1 - distance / maxLength >= threshold
}

/**
 * Check if passwords share common patterns
 * - Same base with minor variations (e.g., "Password1", "Password2")
 * - Same structure with different numbers
 */
export function hasCommonPattern(password1: string, password2: string): boolean {
  // Remove trailing numbers and compare base
  const base1 = password1.replace(/\d+$/, "")
  const base2 = password2.replace(/\d+$/, "")
  
  if (base1.length >= 4 && base2.length >= 4 && base1 === base2) {
    return true
  }

  // Check if they're similar enough
  return arePasswordsSimilar(password1, password2, 0.75)
}
