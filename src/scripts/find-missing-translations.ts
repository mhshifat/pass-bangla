/**
 * Script to find hardcoded strings that need translation
 * Run with: npx tsx src/scripts/find-missing-translations.ts
 */

import * as fs from "fs"
import * as path from "path"
// @ts-expect-error - glob ships without bundled type declarations in this setup
import { glob } from "glob"

interface StringMatch {
  file: string
  line: number
  content: string
  type: "string" | "template" | "jsx"
}

const EXCLUDED_PATTERNS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  "*.d.ts",
  "*.config.*",
  "*.json",
  "*.md",
  "scripts",
]

const COMMON_IGNORED_STRINGS = [
  "className",
  "id",
  "name",
  "type",
  "value",
  "key",
  "href",
  "src",
  "alt",
  "aria-label",
  "data-",
  "use client",
  "use server",
  "import",
  "export",
  "from",
  "return",
  "const",
  "let",
  "var",
  "function",
  "interface",
  "type",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "undefined",
  "null",
  "true",
  "false",
  "console.log",
  "console.error",
  "TODO",
  "FIXME",
  "XXX",
]

function findHardcodedStrings(filePath: string): StringMatch[] {
  const content = fs.readFileSync(filePath, "utf-8")
  const lines = content.split("\n")
  const matches: StringMatch[] = []

  lines.forEach((line, index) => {
    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) {
      return
    }

    // Find string literals
    const stringRegex = /["']([^"']{3,})["']/g
    let match
    while ((match = stringRegex.exec(line)) !== null) {
      const str = match[1]
      
      // Skip if it's a common ignored string
      if (COMMON_IGNORED_STRINGS.some(ignored => str.includes(ignored))) {
        continue
      }
      
      // Skip if it's a URL, path, or technical string
      if (
        str.startsWith("http") ||
        str.startsWith("/") ||
        str.startsWith("@/") ||
        str.startsWith("./") ||
        str.includes(".") && !str.includes(" ") ||
        /^[A-Z_]+$/.test(str) // UPPER_CASE constants
      ) {
        continue
      }
      
      // Check if it looks like user-facing text
      if (
        str.length > 2 &&
        (str[0] === str[0].toUpperCase() || /[a-zA-Z]/.test(str)) &&
        !str.match(/^[a-z]+[A-Z]/) // camelCase
      ) {
        matches.push({
          file: filePath,
          line: index + 1,
          content: str,
          type: "string",
        })
      }
    }

    // Find template literals with text
    const templateRegex = /`([^`]{10,})`/g
    while ((match = templateRegex.exec(line)) !== null) {
      const str = match[1]
      if (str.includes("${")) {
        // Skip template literals with variables for now
        continue
      }
      
      if (str.length > 10 && /[a-zA-Z]/.test(str)) {
        matches.push({
          file: filePath,
          line: index + 1,
          content: str,
          type: "template",
        })
      }
    }
  })

  return matches
}

async function main() {
  const srcDir = path.join(process.cwd(), "src")
  const files = await glob("**/*.{ts,tsx}", {
    cwd: srcDir,
    ignore: EXCLUDED_PATTERNS.map(p => `**/${p}/**`),
  })

  const allMatches: Map<string, StringMatch[]> = new Map()

  files.forEach((file: string) => {
    const filePath = path.join(srcDir, file)
    const matches = findHardcodedStrings(filePath)
    if (matches.length > 0) {
      allMatches.set(file, matches)
    }
  })

  // Output results
  console.log("\n=== Hardcoded Strings Found ===\n")
  
  let totalMatches = 0
  allMatches.forEach((matches, file) => {
    console.log(`\n📄 ${file} (${matches.length} matches)`)
    matches.forEach((match) => {
      console.log(`  Line ${match.line}: "${match.content.substring(0, 60)}${match.content.length > 60 ? "..." : ""}"`)
      totalMatches++
    })
  })

  console.log(`\n\nTotal: ${totalMatches} potential strings to translate`)
  console.log("\n💡 Tip: Review these strings and add them to translation files")
  console.log("   - src/locales/en/common.json")
  console.log("   - src/locales/bn/common.json")
}

if (require.main === module) {
  main().catch(console.error)
}

export { findHardcodedStrings }


