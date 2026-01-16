/**
 * Parse Thai Names by Row (Y-axis)
 * 
 * Integrates parseThaiNames with Y-axis grouping
 * Rule: 1 parsed name = 1 row (Y-axis)
 * Never merge multiple names into one row
 */

import { parseThaiNames } from "./thaiNameParser.js"
import { normalizeThaiOCRTokens } from "./ocrNormalizeThai.js"

/**
 * Group words by Y-axis (same row)
 * @param {Array} words - Array of words with {text, x, y, w, h}
 * @param {number} yTolerance - Y-axis tolerance for grouping (default: 10)
 * @returns {Array} Array of rows, each row is an array of words
 */
function groupWordsByRow(words, yTolerance = 10) {
  if (!words || words.length === 0) return []

  const rows = []
  const processed = new Set()

  for (let i = 0; i < words.length; i++) {
    if (processed.has(i)) continue

    const currentWord = words[i]
    const row = [currentWord]
    processed.add(i)

    // Find words on the same row (within Y tolerance)
    for (let j = i + 1; j < words.length; j++) {
      if (processed.has(j)) continue

      const otherWord = words[j]
      if (Math.abs(currentWord.y - otherWord.y) <= yTolerance) {
        row.push(otherWord)
        processed.add(j)
      }
    }

    // Sort row words by X position (left to right)
    row.sort((a, b) => (a.x || 0) - (b.x || 0))
    rows.push(row)
  }

  // Sort rows by Y position (top to bottom)
  rows.sort((a, b) => (a[0].y || 0) - (b[0].y || 0))

  return rows
}

/**
 * Parse names from words, grouped by Y-axis (row)
 * Each row produces separate parsed names
 * 
 * @param {Array} words - Array of words with {text, x, y, w, h}
 * @param {Object} options - Options
 * @param {number} options.yTolerance - Y-axis tolerance for row grouping (default: 10)
 * @returns {Array} Array of { name, rowIndex, words } - one entry per parsed name
 */
export function parseNamesByRow(words, options = {}) {
  if (!words || words.length === 0) return []

  const { yTolerance = 10 } = options

  // Step 1: Group words by Y-axis (rows)
  const rows = groupWordsByRow(words, yTolerance)

  if (rows.length === 0) return []

  // Step 2: Parse each row separately
  const results = []

  rows.forEach((row, rowIndex) => {
    // Extract tokens from row words (left to right)
    const rawTokens = row.map(w => w.text).filter(t => t && t.trim())

    if (rawTokens.length === 0) return

    // Normalize OCR tokens before parsing
    const tokens = normalizeThaiOCRTokens(rawTokens)

    // Parse names from normalized tokens
    const parsedNames = parseThaiNames(tokens)

    // Each parsed name becomes a separate result
    parsedNames.forEach((name) => {
      results.push({
        name,
        rowIndex,
        words: row, // Keep reference to original words
        y: row[0].y, // Y position of this row
      })
    })
  })

  return results
}

/**
 * Parse names from a group's words
 * Returns array of parsed names (one per row)
 * 
 * @param {Object} group - Group object with { lines, words }
 * @returns {Array} Array of parsed names (strings)
 */
export function parseNamesFromGroup(group) {
  if (!group) return []

  // Use words if available, otherwise extract from lines
  const words = group.words || (group.lines || []).flatMap(line => line.words || [])

  if (!words || words.length === 0) return []

  // Parse by row
  const parsed = parseNamesByRow(words)

  // Return just the names
  return parsed.map(p => p.name)
}
