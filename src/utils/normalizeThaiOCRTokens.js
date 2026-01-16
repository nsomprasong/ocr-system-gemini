/**
 * Production-Ready OCR Name Normalization
 * 
 * CORE PRINCIPLE:
 * - OCR แยกข้อมูลมาถูกต้องแล้ว
 * - 1 แถวตามแกน Y = 1 คน
 * - token ที่ OCR ส่งมาในแถวนั้น = ถูกต้อง
 * - ห้ามเดาว่าคำไหนคือชื่อ / นามสกุล
 * 
 * DETERMINISTIC LOGIC:
 * - token สุดท้ายของแถว = นามสกุล
 * - token ที่เหลือด้านหน้า = ชื่อ (concat ทั้งหมด)
 * - ใส่ช่องว่าง 1 ช่อง ระหว่างชื่อกับนามสกุล
 * - ถ้าแถวมี token เดียว → ถือว่าเป็นชื่อเดี่ยว (ไม่มีนามสกุล)
 * 
 * FORBIDDEN:
 * - ห้ามเดาว่าคำไหนคือชื่อ / นามสกุล
 * - ห้ามใช้ dictionary นามสกุล
 * - ห้าม normalize ภาษาไทย
 * - ห้าม split / merge token โดยใช้ heuristics
 * - ห้าม "ฉลาดกว่า OCR"
 * - ห้ามเปลี่ยนลำดับ token
 * - ห้ามรวม token จากคนละแถว (Y-axis)
 * 
 * INPUT: Array<Array<string>> (tokensPerLine - each inner array is one row)
 * OUTPUT: string[] (one string per row/person)
 */

/**
 * Group OCR tokens by row (Y-axis)
 * 
 * @param {Array<{text: string, x: number, y: number}>} tokens - OCR tokens with positions
 * @param {number} yThreshold - Y-axis tolerance for same row (default: 8px)
 * @returns {Array<Array<{text: string, x: number, y: number}>>} Array of rows
 */
function groupTokensByRow(tokens, yThreshold = 8) {
  if (!tokens || tokens.length === 0) {
    return []
  }

  // Sort all tokens by Y, then X
  const sortedTokens = [...tokens].sort((a, b) => {
    if (Math.abs(a.y - b.y) > yThreshold) {
      return a.y - b.y
    }
    return a.x - b.x
  })

  const rows = []
  let currentRow = null

  for (const token of sortedTokens) {
    if (!currentRow || Math.abs(token.y - currentRow[0].y) > yThreshold) {
      // New row
      if (currentRow) {
        rows.push(currentRow)
      }
      currentRow = [token]
    } else {
      // Same row
      currentRow.push(token)
    }
  }

  if (currentRow) {
    rows.push(currentRow)
  }

  // Sort tokens within each row by X (left → right)
  rows.forEach(row => row.sort((a, b) => a.x - b.x))

  return rows
}

// All normalization functions removed - just return tokens as-is

/**
 * Normalize one row of tokens to a single name string
 * 
 * SIMPLIFIED: Just join tokens as-is, preserve all spaces
 * No normalization, no splitting, no heuristics
 * 
 * @param {string[]} tokens - Token text strings (one row)
 * @returns {string} Joined tokens with all spaces preserved
 */
function normalizeOneRow(tokens) {
  if (!tokens || tokens.length === 0) {
    return null
  }

  // Filter valid tokens (non-empty strings)
  const validTokens = tokens.filter(t => t && typeof t === "string" && t.length > 0)
  
  if (validTokens.length === 0) {
    return null
  }

  // SIMPLIFIED: Just join tokens as-is, preserve all spaces from each token
  // IMPORTANT: Join tokens and preserve spaces from OCR
  // If token has space (leading/trailing), keep it
  // For multiple tokens, join without adding space (space should come from OCR tokens themselves)
  // Return exactly as OCR detected with spaces preserved
  return validTokens.join("")
}

/**
 * Normalize Thai OCR tokens to array of full name strings
 * 
 * Supports two input formats:
 * 1. Array<Array<string>> - tokensPerLine (each inner array is one row)
 * 2. Array<{text: string, x: number, y: number}> - tokens with positions (will group by Y)
 * 
 * @param {Array<Array<string>>|Array<{text: string, x: number, y: number}>} input - OCR tokens
 * @param {Object} options - Options
 * @param {number} options.yThreshold - Y-axis tolerance for same row (default: 8px)
 * @returns {string[]} Array of normalized full names (one per row/person)
 */
export function normalizeThaiOCRTokens(input, options = {}) {
  if (!input || !Array.isArray(input) || input.length === 0) {
    return []
  }

  const { yThreshold = 8 } = options

  // Check input format
  const isTokensPerLine = Array.isArray(input[0]) && typeof input[0][0] === "string"
  const isTokensWithPositions = input[0] && typeof input[0] === "object" && input[0].text !== undefined

  let tokensPerLine = []

  if (isTokensPerLine) {
    // Input is already Array<Array<string>>
    tokensPerLine = input
  } else if (isTokensWithPositions) {
    // Input is Array<{text, x, y}> - need to group by Y
    const rows = groupTokensByRow(input, yThreshold)
    tokensPerLine = rows.map(row => row.map(t => t.text))
  } else {
    // Invalid input format
    return []
  }

  // Process each row
  return tokensPerLine
    .map(tokens => normalizeOneRow(tokens))
    .filter(Boolean)
}

export default { normalizeThaiOCRTokens }
