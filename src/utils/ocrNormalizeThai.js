/**
 * OCR Normalization Layer for Thai Text
 * 
 * Cleans up OCR raw tokens before passing to parseThaiNames()
 * 
 * Rules:
 * - Remove extra spaces inside Thai words
 * - Merge Thai syllables that belong to the same word
 * - Preserve name prefixes (นาย, นาง, น.ส., ว่าที่ร.ต., ที่ร.ต.)
 * - Flush buffer when prefix is detected
 * - Concatenate Thai-only tokens unless a new prefix starts
 */

const THAI_PREFIXES = [
  "นาย",
  "นาง",
  "น.ส.",
  "ว่าที่ร.ต.",
  "ที่ร.ต.",
]

/**
 * Check if token is a Thai name prefix
 * @param {string} token - Token to check
 * @returns {boolean}
 */
function isPrefix(token) {
  if (!token || typeof token !== "string") return false
  const clean = token.trim()
  return THAI_PREFIXES.some(p => clean === p || clean.startsWith(p))
}

/**
 * Check if token contains only Thai characters (and common punctuation)
 * @param {string} token - Token to check
 * @returns {boolean}
 */
function isThaiOnly(token) {
  if (!token || typeof token !== "string") return false
  // Thai Unicode range: \u0E00-\u0E7F
  // Also allow common punctuation: . , ( ) - 
  const thaiPattern = /^[\u0E00-\u0E7F\s.,()\-]+$/
  return thaiPattern.test(token.trim())
}

/**
 * Normalize Thai OCR tokens
 * 
 * Removes extra spaces and merges Thai syllables that belong together.
 * Preserves name prefixes and flushes buffer on prefix detection.
 * 
 * @param {string[]} rawTokens - Raw OCR tokens
 * @returns {string[]} Normalized tokens ready for parseThaiNames()
 */
export function normalizeThaiOCRTokens(rawTokens) {
  if (!rawTokens || !Array.isArray(rawTokens) || rawTokens.length === 0) {
    return []
  }

  const normalized = []
  let buffer = ""

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i]
    if (!token || typeof token !== "string") continue

    const clean = token.trim()
    if (!clean) continue

    // Check if this is a prefix
    if (isPrefix(clean)) {
      // Flush any previous buffer
      if (buffer) {
        normalized.push(buffer)
        buffer = ""
      }
      // Add prefix as-is
      normalized.push(clean)
      continue
    }

    // If token is Thai-only, add to buffer (merge consecutive Thai tokens)
    if (isThaiOnly(clean)) {
      // Remove spaces and concatenate to buffer
      const cleanToken = clean.replace(/\s+/g, "")
      buffer = buffer ? buffer + cleanToken : cleanToken
      continue
    }

    // If buffer exists and token is NOT Thai-only, flush buffer
    if (buffer) {
      normalized.push(buffer)
      buffer = ""
    }

    // Add non-Thai token as-is (numbers, English, etc.)
    normalized.push(clean)
  }

  // Flush remaining buffer
  if (buffer) {
    normalized.push(buffer)
  }

  return normalized
}
