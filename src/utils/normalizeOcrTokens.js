/**
 * OCR Token Normalization
 * 
 * Normalizes OCR output to clean string array compatible with parseThaiNames()
 * 
 * Handles:
 * - Multiple input formats (string[] or object[])
 * - Y-axis line merging (± tolerance)
 * - Noise character removal
 * - Stray Thai vowel trimming
 * - Preserves word order
 */

/**
 * Normalize OCR tokens
 * @param {Array} ocrResults - OCR output (string[] or {text, x, y, width, height}[])
 * @param {Object} options - Normalization options
 * @param {number} options.yTolerance - Y-axis tolerance for line merging (default: 10)
 * @returns {string[]} Clean string array
 */
export function normalizeOcrTokens(ocrResults, options = {}) {
  if (!ocrResults || !Array.isArray(ocrResults) || ocrResults.length === 0) {
    return []
  }

  const { yTolerance = 10 } = options

  // Step 1: Extract text from various input formats
  const tokens = ocrResults.map(item => {
    if (typeof item === "string") {
      return { text: item, y: 0 } // No position info
    } else if (item && typeof item === "object") {
      return {
        text: item.text || item.word || "",
        y: item.y || item.top || 0,
        x: item.x || item.left || 0,
      }
    }
    return { text: "", y: 0 }
  }).filter(item => item.text && item.text.trim())

  if (tokens.length === 0) return []

  // Step 2: Group tokens by Y-axis (same line)
  const lines = []
  const processed = new Set()

  for (let i = 0; i < tokens.length; i++) {
    if (processed.has(i)) continue

    const currentToken = tokens[i]
    const line = [currentToken]
    processed.add(i)

    // Find tokens on the same line (within Y tolerance)
    for (let j = i + 1; j < tokens.length; j++) {
      if (processed.has(j)) continue

      const otherToken = tokens[j]
      if (Math.abs(currentToken.y - otherToken.y) <= yTolerance) {
        line.push(otherToken)
        processed.add(j)
      }
    }

    // Sort line tokens by X position (left to right)
    line.sort((a, b) => (a.x || 0) - (b.x || 0))
    lines.push(line)
  }

  // Step 3: Process each line and merge tokens
  const normalized = []

  for (const line of lines) {
    const lineTokens = line.map(t => t.text.trim()).filter(t => t)
    
    // Merge tokens in line (handle broken prefixes)
    let i = 0
    while (i < lineTokens.length) {
      let text = lineTokens[i]

      // Remove noise characters
      text = text.replace(/[.,:;|]/g, "")

      // Handle broken prefix: "น." + "ส.xxx" → "น.ส.xxx"
      if (text === "น." && i + 1 < lineTokens.length) {
        const next = lineTokens[i + 1]
        if (next && next.startsWith("ส.")) {
          const namePart = next.slice(2) // Remove "ส." prefix
          text = "น.ส." + namePart
          i += 2
          normalized.push(text)
          continue
        }
      }

      // Handle broken prefix: "ว่า" + "ที่ร.ต.xxx" → "ว่าที่ร.ต.xxx"
      if (text === "ว่า" && i + 1 < lineTokens.length) {
        const next = lineTokens[i + 1]
        if (next && next.startsWith("ที่ร.ต.")) {
          const namePart = next.slice(5) // Remove "ที่ร.ต." prefix
          text = "ว่าที่ร.ต." + namePart
          i += 2
          normalized.push(text)
          continue
        }
      }

      // Trim stray Thai vowels at start/end (common OCR errors)
      // Thai vowels that shouldn't be standalone: ะ ั า ำ ิ ี ึ ื ุ ู เ แ โ ใ ไ
      text = text.replace(/^[ะัาำิีึืุูเแโใไ]+/, "")
      text = text.replace(/[ะัาำิีึืุูเแโใไ]+$/, "")

      if (text) {
        normalized.push(text)
      }
      i++
    }
  }

  return normalized
}

/**
 * Quick normalization for simple string arrays
 * @param {string[]} tokens - Array of strings
 * @returns {string[]} Normalized tokens
 */
export function normalizeSimpleTokens(tokens) {
  if (!tokens || !Array.isArray(tokens)) return []

  return tokens
    .map(t => typeof t === "string" ? t.trim() : "")
    .filter(t => t)
    .map(t => t.replace(/[.,:;|]/g, ""))
    .filter(t => t)
}
