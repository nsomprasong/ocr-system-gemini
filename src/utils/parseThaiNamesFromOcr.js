/**
 * Integration Pipeline: OCR → Normalize → Parse
 * 
 * Full pipeline for parsing Thai names from OCR output
 */

import { normalizeOcrTokens } from "./normalizeOcrTokens.js"
import { parseThaiNames } from "./thaiNameParser.js"
import { normalizeThaiOCRTokens } from "./ocrNormalizeThai.js"

/**
 * Parse Thai names from OCR results
 * @param {Array} ocrResults - OCR output (string[] or object[])
 * @param {Object} options - Options
 * @param {boolean} options.debug - Enable debug mode (collect leftovers)
 * @param {number} options.yTolerance - Y-axis tolerance for normalization
 * @returns {Object} { names, leftovers, rawTokens }
 */
export function parseThaiNamesFromOcr(ocrResults, options = {}) {
  const { debug = false, yTolerance = 10 } = options

  // Step 1: Normalize OCR tokens (position-based)
  const positionNormalized = normalizeOcrTokens(ocrResults, { yTolerance })

  // Step 2: Normalize Thai OCR tokens (clean up spaces and merge syllables)
  const cleanTokens = normalizeThaiOCRTokens(positionNormalized)

  // Step 3: Parse names
  const names = parseThaiNames(cleanTokens)

  // Step 3: Collect leftovers (debug mode)
  let leftovers = []
  if (debug) {
    // Find tokens that weren't used in any parsed name
    const usedTokens = new Set()
    
    // Extract all tokens from parsed names (approximate)
    names.forEach(name => {
      // Simple heuristic: split name and check against raw tokens
      const nameParts = name.replace(/\s+/g, " ").split(" ")
      nameParts.forEach(part => {
        rawTokens.forEach(token => {
          if (token.includes(part) || part.includes(token)) {
            usedTokens.add(token)
          }
        })
      })
    })

    // Find unused tokens
    leftovers = rawTokens.filter(token => !usedTokens.has(token))
  }

  return {
    names,
    leftovers: debug ? leftovers : [],
    rawTokens,
  }
}

/**
 * Quick parse for simple string arrays
 * @param {string[]} tokens - Array of strings
 * @returns {string[]} Parsed names
 */
export function parseThaiNamesSimple(tokens) {
  const positionNormalized = normalizeOcrTokens(tokens)
  const cleanTokens = normalizeThaiOCRTokens(positionNormalized)
  return parseThaiNames(cleanTokens)
}
