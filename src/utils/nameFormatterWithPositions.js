/**
 * Name Formatter using OCR word positions
 * 
 * Uses bounding box positions to intelligently format Thai names
 * - Detects prefix/title
 * - Separates first name and surname based on word positions
 * - Handles spacing correctly
 */

import { FIELD_TYPES } from "./groupMerger"
import { parseThaiNames } from "./thaiNameParser"
import { normalizeThaiOCRTokens } from "./ocrNormalizeThai.js"

// Thai name prefixes
const THAI_NAME_PREFIXES = [
  "นาย", "นาง", "นางสาว",
  "น.ส.", "น.ส", "นส",
  "ด.ช.", "ด.ญ.",
  "ร.ต.", "ร.ท.", "ร.อ.",
  "พ.ต.", "พ.ท.", "พ.อ.",
  "พล.ต.", "พล.ท.", "พล.อ.",
  "ดร.", "ศ.", "ผศ.", "รศ.",
  "พระ", "พระครู",
]

/**
 * Normalize prefix by removing spaces
 */
function normalizePrefix(prefix) {
  if (!prefix) return prefix
  return prefix.replace(/\s+/g, "")
}

/**
 * Check if word is a prefix
 */
function isPrefix(word) {
  if (!word || typeof word !== "string") return false
  const normalized = word.replace(/\s+/g, "").trim()
  return THAI_NAME_PREFIXES.some(prefix => 
    normalized.toLowerCase() === prefix.toLowerCase() ||
    normalized.toLowerCase().startsWith(prefix.toLowerCase())
  )
}

/**
 * Try to split concatenated first name + surname
 * Thai names: first name is usually 2-6 characters, surname is usually 3-8 characters
 * @param {string} text - Concatenated name (e.g., "ณัฐพรอินทรประเสริฐ")
 * @returns {Object} {firstName, surname} or null if can't split
 */
function splitNameSurname(text) {
  if (!text || typeof text !== "string" || text.length < 6) return null
  
  // Thai names: first name is usually 2-6 characters
  // Try different split points
  const minFirstNameLength = 2
  const maxFirstNameLength = Math.min(6, Math.floor(text.length * 0.6))
  
  for (let firstNameLength = maxFirstNameLength; firstNameLength >= minFirstNameLength; firstNameLength--) {
    const firstName = text.slice(0, firstNameLength)
    const surname = text.slice(firstNameLength)
    
    // Validate: surname should be at least 3 characters
    if (surname.length >= 3) {
      // Check if split makes sense (both parts are reasonable length)
      if (firstName.length >= 2 && surname.length >= 3) {
        return { firstName, surname }
      }
    }
  }
  
  return null
}

/**
 * Format name using OCR words - ใช้ Thai Name Parser
 * @param {Array} words - Array of words with {text, x, y, w, h}
 * @returns {string} Formatted name
 */
export function formatNameWithPositions(words) {
  if (!words || words.length === 0) return ""
  
  // Sort words by X position (left to right)
  const sortedWords = [...words].sort((a, b) => {
    // First by Y (top to bottom) with threshold
    const Y_THRESHOLD = 10
    if (Math.abs(a.y - b.y) > Y_THRESHOLD) {
      return a.y - b.y
    }
    // Then by X (left to right)
    return a.x - b.x
  })
  
  if (sortedWords.length === 0) return ""
  if (sortedWords.length === 1) return sortedWords[0].text
  
  // Extract tokens from words
  const rawTokens = sortedWords.map(w => w.text).filter(t => t && t.trim())
  
  // Normalize OCR tokens before parsing (remove spaces, merge syllables)
  const tokens = normalizeThaiOCRTokens(rawTokens)
  
  // Use Thai Name Parser to parse normalized tokens
  const parsedNames = parseThaiNames(tokens)
  
  // Return first parsed name (or join all if multiple)
  if (parsedNames.length > 0) {
    return parsedNames[0] // Return first name found
  }
  
  // Fallback: If parser returns nothing, use simple join with prefix handling
  const result = []
  let i = 0
  
  while (i < sortedWords.length) {
    const word = sortedWords[i]
    
    // ถ้าเป็น prefix word → รวบรวม prefix words ติดกัน
    if (isPrefix(word.text)) {
      const prefixWords = []
      while (i < sortedWords.length && isPrefix(sortedWords[i].text)) {
        prefixWords.push(sortedWords[i])
        i++
      }
      // รวม prefix words ติดกัน (ไม่มี space)
      const prefix = prefixWords.map(w => normalizePrefix(w.text)).join("")
      result.push(prefix)
    } else {
      // ไม่ใช่ prefix → ใช้ word ตามที่ OCR แยกมา
      result.push(word.text)
      i++
    }
  }
  
  return result.join(" ")
}

/**
 * Format group lines using word positions
 * @param {Array} lines - Lines with {text, x, y, w, h, words}
 * @param {string} fieldType - FIELD_TYPES.PERSON_NAME or FIELD_TYPES.NORMAL_TEXT
 * @returns {string} Formatted text
 */
export function formatGroupLinesWithPositions(lines, fieldType = FIELD_TYPES.NORMAL_TEXT) {
  if (!lines || lines.length === 0) return ""
  
  // Group lines by Y position (same row)
  const Y_THRESHOLD = 10
  const rows = []
  let currentRow = null
  
  const sortedLines = [...lines].sort((a, b) => {
    if (Math.abs(a.y - b.y) > Y_THRESHOLD) {
      return a.y - b.y
    }
    return a.x - b.x
  })
  
  sortedLines.forEach((line) => {
    if (!currentRow || Math.abs(line.y - currentRow.y) > Y_THRESHOLD) {
      if (currentRow) {
        rows.push(currentRow)
      }
      currentRow = {
        y: line.y,
        lines: [line],
      }
    } else {
      currentRow.lines.push(line)
    }
  })
  
  if (currentRow) {
    rows.push(currentRow)
  }
  
  // Format each row
  const formattedRows = rows.map((row) => {
    if (fieldType === FIELD_TYPES.PERSON_NAME) {
      // Use word positions to format name
      // Collect all words from lines in this row
      const allWords = row.lines.flatMap(line => {
        // Use line.words if available, otherwise create word from line
        if (line.words && Array.isArray(line.words) && line.words.length > 0) {
          return line.words
        }
        // Fallback: create word object from line
        return [{
          text: line.text || "",
          x: line.x || 0,
          y: line.y || 0,
          w: line.w || 0,
          h: line.h || 0,
        }]
      })
      
      return formatNameWithPositions(allWords)
    } else {
      // NORMAL_TEXT - display exactly as OCR detected (no formatting)
      // Join lines with space (each line is a data unit from OCR)
      return row.lines.map(line => {
        // Use line text directly (don't split into words)
        return typeof line === "string" ? line : (line.text || "")
      }).join(" ").trim()
    }
  })
  
  // Join rows with newline (each row on a new line - according to Y position)
  return formattedRows.filter(r => r.trim()).join("\n")
}
