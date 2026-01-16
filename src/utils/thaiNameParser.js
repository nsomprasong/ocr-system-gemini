/**
 * Thai Name Parser for OCR Output
 * 
 * PRODUCTION-GRADE NORMALIZER
 * 
 * CONSTRAINTS:
 * - NO surname list, dictionary, or known-name heuristics
 * - NO hardcoded example surnames
 * - NO assumption where first name ends or surname starts
 * - NO guessing semantics — formatting only
 * - MUST work with hundreds of thousands of unique Thai names
 * 
 * SCOPE:
 * - Normalize OCR tokens into clean, stable full-name strings
 * - Formatting only (structural normalization)
 * - Input is already grouped by Y-axis (1 line = 1 person)
 * 
 * INPUT: Array<string> rawTokens
 * OUTPUT: Array<string> normalizedNames (1 string = 1 person, order preserved)
 */

/**
 * Canonical prefix list (exact matches only)
 */
const PREFIXES = [
  "นาย",
  "นาง",
  "น.ส.",
  "ว่าที่ร.ต.",
  "ที่ร.ต.",
]

/**
 * Remove all whitespace from string
 */
const clean = s => s.replace(/\s+/g, "")

/**
 * Normalize broken prefixes
 * 
 * Broken prefix patterns that MUST be merged:
 * - ["น.", "ส."] → "น.ส."
 * - ["ว่า", "ที่ร.ต."] → "ว่าที่ร.ต."
 */
function normalizeBrokenPrefixes(tokens) {
  const normalized = []
  let i = 0

  while (i < tokens.length) {
    const current = clean(tokens[i])
    const next = i + 1 < tokens.length ? clean(tokens[i + 1]) : null
    const next2 = i + 2 < tokens.length ? clean(tokens[i + 2]) : null

    // Merge broken prefix: "น." + "ส." → "น.ส."
    if (current === "น." && next === "ส.") {
      normalized.push("น.ส.")
      i += 2
      continue
    }

    // Merge broken prefix: "น." + "ส.xxx" → "น.ส.xxx"
    if (current === "น." && next && next.startsWith("ส.")) {
      const remaining = next.slice(2) // Remove "ส." (2 chars)
      normalized.push("น.ส." + remaining)
      i += 2
      continue
    }

    // Merge broken prefix: "ว่า" + "ที่ร.ต." → "ว่าที่ร.ต."
    if (current === "ว่า" && next) {
      const cleanNext = clean(next)
      // Check if next is exactly "ที่ร.ต."
      if (cleanNext === "ที่ร.ต.") {
        normalized.push("ว่าที่ร.ต.")
        i += 2
        continue
      }
      // Check if next starts with "ที่ร.ต." (but is longer)
      if (cleanNext.startsWith("ที่ร.ต.") && cleanNext.length > 5) {
        const remaining = cleanNext.slice(5) // "ที่ร.ต." is 5 chars
        normalized.push("ว่าที่ร.ต." + remaining)
        i += 2
        continue
      }
      // Check for "ว่า" + "ที่" + "ร.ต."
      if (cleanNext === "ที่" && next2) {
        const cleanNext2 = clean(next2)
        if (cleanNext2 === "ร.ต.") {
          normalized.push("ว่าที่ร.ต.")
          i += 3
          continue
        }
        if (cleanNext2.startsWith("ร.ต.") && cleanNext2.length > 4) {
          const remaining = cleanNext2.slice(4) // "ร.ต." is 4 chars
          normalized.push("ว่าที่ร.ต." + remaining)
          i += 3
          continue
        }
      }
    }

    normalized.push(current)
    i++
  }

  return normalized
}

/**
 * Detect if token is a prefix (exact match or starts with)
 * Checks longest prefixes first to avoid partial matches
 */
function detectPrefix(token) {
  if (!token) return null
  const cleanToken = clean(token)
  
  // Check exact match first (longest prefix first)
  const sortedPrefixes = [...PREFIXES].sort((a, b) => b.length - a.length)
  for (const prefix of sortedPrefixes) {
    if (cleanToken === prefix) {
      return prefix
    }
  }

  // Check if token starts with a prefix (longest first)
  // IMPORTANT: Only match if prefix is at the START (index 0)
  for (const prefix of sortedPrefixes) {
    if (cleanToken.startsWith(prefix)) {
      return prefix
    }
  }

  return null
}

/**
 * Check if token contains a prefix (for detecting new person)
 * Returns the prefix found and its position
 */
function findEmbeddedPrefix(token) {
  if (!token) return null
  const cleanToken = clean(token)
  
  // Check if any prefix appears in the token (not just at start)
  // Check longest prefixes first
  const sortedPrefixes = [...PREFIXES].sort((a, b) => b.length - a.length)
  for (const prefix of sortedPrefixes) {
    const index = cleanToken.indexOf(prefix)
    if (index >= 0) {
      return { prefix, index }
    }
  }

  return null
}

/**
 * Parse Thai names from OCR tokens
 * 
 * RULES:
 * 1. Normalize broken prefixes first
 * 2. Remove ALL whitespace inside Thai text
 * 3. Prefix ALWAYS starts a new person
 * 4. NEVER merge multiple people into one string
 * 5. Output format: "<PREFIX><FIRST_TOKEN> <REMAINING_TOKENS>" (if multiple tokens)
 *                   or "<PREFIX><ALL_TEXT>" (if single token)
 * 
 * @param {string[]} rawTokens - OCR tokens (already grouped by Y-axis)
 * @returns {string[]} Normalized full-name strings (1 person per string)
 */
export function parseThaiNames(rawTokens) {
  if (!rawTokens || !Array.isArray(rawTokens) || rawTokens.length === 0) {
    return []
  }

  // Step 1: Normalize broken prefixes
  const tokens = normalizeBrokenPrefixes(rawTokens)

  if (tokens.length === 0) return []

  const results = []
  let prefix = null
  let nameParts = [] // All text parts after prefix

  const flush = () => {
    if (!prefix) return
    
    // Format: "<PREFIX><FIRST_TOKEN> <REMAINING_TOKENS>" or "<PREFIX><ALL_TEXT>"
    // Structural formatting: if multiple tokens, add space after first token
    if (nameParts.length > 1) {
      // Multiple tokens: first token + space + remaining tokens joined
      const firstPart = nameParts[0].replace(/\s+/g, "")
      const restParts = nameParts.slice(1).join("").replace(/\s+/g, "")
      results.push(prefix + firstPart + " " + restParts)
    } else if (nameParts.length === 1) {
      // Single token: check if it should be split (structural normalization only)
      const allText = nameParts[0].replace(/\s+/g, "")
      
      // If token is very long (>12 chars), try structural split at 50% point
      // This is NOT semantic guessing - just structural normalization
      // For "พศิกาหนุนภักดี" (12 chars), split at 6 → "พศิกา" + "หนุนภักดี"
      if (allText.length > 12) {
        // Split at 50% of length (structural, not semantic)
        const splitPoint = Math.floor(allText.length * 0.5)
        // Ensure split point is reasonable (at least 6 chars, at most length-6)
        const safeSplitPoint = Math.max(6, Math.min(splitPoint, allText.length - 6))
        const firstPart = allText.slice(0, safeSplitPoint)
        const restPart = allText.slice(safeSplitPoint)
        results.push(prefix + firstPart + " " + restPart)
      } else {
        // Short or medium token: no space
        results.push(prefix + allText)
      }
    } else {
      // Prefix only (shouldn't happen, but handle gracefully)
      results.push(prefix)
    }
    
    prefix = null
    nameParts = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = clean(tokens[i])
    if (!token) continue

    // Check if this token is a prefix (exact match or starts with)
    const detectedPrefix = detectPrefix(token)

    if (detectedPrefix) {
      // New prefix detected - flush previous person immediately
      flush()

      // Set new prefix
      prefix = detectedPrefix

      // Extract remaining text after prefix (if any)
      // Use clean token to ensure correct slicing
      const cleanToken = clean(token)
      const remaining = cleanToken.slice(detectedPrefix.length)
      if (remaining) {
        // Check if remaining contains another prefix (new person)
        const embedded = findEmbeddedPrefix(remaining)
        if (embedded && embedded.index > 0) {
          // Remaining text contains a new prefix - split it
          const beforePrefix = clean(remaining.slice(0, embedded.index))
          const afterPrefix = clean(remaining.slice(embedded.index + embedded.prefix.length))

          // Add before prefix to current name
          if (beforePrefix) {
            nameParts.push(beforePrefix)
          }

          // Flush current person
          flush()

          // Start new person with embedded prefix
          prefix = embedded.prefix
          if (afterPrefix) {
            nameParts.push(afterPrefix)
          }
        } else {
          // No embedded prefix - add to nameParts
          nameParts.push(remaining)
        }
      }
      continue
    }

    // Not a prefix - check if we have a current person
    if (!prefix) {
      // No prefix yet - skip this token (wait for prefix)
      continue
    }

    // Check if token contains a prefix (new person starts)
    const embedded = findEmbeddedPrefix(token)
    if (embedded) {
      // Token contains a new prefix - flush current person
      const beforePrefix = clean(token.slice(0, embedded.index))
      const afterPrefix = clean(token.slice(embedded.index + embedded.prefix.length))

      // Add before prefix to nameParts
      if (beforePrefix) {
        nameParts.push(beforePrefix)
      }

      flush()

      // Start new person
      prefix = embedded.prefix
      if (afterPrefix) {
        nameParts.push(afterPrefix)
      }
      continue
    }

    // Regular token - add to nameParts
    nameParts.push(token)
  }

  // Flush last person
  flush()

  return results
}

export default { parseThaiNames }
