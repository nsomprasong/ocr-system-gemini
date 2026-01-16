/**
 * Person Name Formatter - Formats Thai person names with prefixes
 * 
 * Uses ML-based parsing with rule-based fallback
 * 
 * Rules:
 * - Prefix + FirstName (NO SPACE)
 * - FirstName + LastName (ONE SPACE)
 */
import { formatPersonNameWithML } from "./mlNameFormatter"

// Thai name prefixes (full words, abbreviations, titles, ranks)
const THAI_NAME_PREFIXES = [
  // Common prefixes
  "นาย", "นาง", "นางสาว",
  "น.ส.", "น.ส", "นส",
  "ด.ช.", "ด.ญ.",
  
  // Military ranks (Army)
  "ร.ต.", "ร.ท.", "ร.อ.", "ร.ท.ม.", "ร.อ.ม.",
  "พ.ต.", "พ.ท.", "พ.อ.", "พ.ต.ม.", "พ.ท.ม.", "พ.อ.ม.",
  "พล.ต.", "พล.ท.", "พล.อ.", "พล.ต.ม.", "พล.ท.ม.", "พล.อ.ม.",
  "ร้อยตรี", "ร้อยโท", "ร้อยเอก",
  "พันตรี", "พันโท", "พันเอก",
  "พลตรี", "พลโท", "พลเอก",
  "ว่าที่ร้อยตรี", "ว่าที่ ร.ต.",
  
  // Police ranks
  "พ.ต.อ.", "พ.ต.ท.", "พ.ต.ต.",
  "พล.ต.อ.", "พล.ต.ท.", "พล.ต.ต.",
  "พันตำรวจเอก", "พันตำรวจโท", "พันตำรวจตรี",
  "พลตำรวจเอก", "พลตำรวจโท", "พลตำรวจตรี",
  
  // Academic titles
  "ดร.", "ศ.", "ผศ.", "รศ.", "ศ.ดร.",
  "ศาสตราจารย์", "รองศาสตราจารย์", "ผู้ช่วยศาสตราจารย์",
  
  // Professional titles
  "อ.", "ร.อ.", "ทพ.", "ทพ.ญ.", "ทนพ.",
  "แพทย์", "ทันตแพทย์", "สัตวแพทย์",
  
  // Religious titles
  "พระ", "พระครู", "พระอาจารย์", "หลวงพ่อ", "หลวงพี่",
  
  // Other titles
  "คุณ", "คุณครู", "อาจารย์",
]

/**
 * Check if a word is a Thai name prefix (with or without spaces)
 * Also normalizes the prefix by removing spaces
 */
function isNamePrefix(word) {
  const normalized = word.trim()
  // Remove spaces from normalized word for comparison
  const normalizedNoSpace = normalized.replace(/\s+/g, "")
  
  return THAI_NAME_PREFIXES.some((prefix) => {
    const prefixLower = prefix.toLowerCase()
    const wordLower = normalizedNoSpace.toLowerCase()
    // Check exact match or starts with prefix
    return wordLower === prefixLower || wordLower.startsWith(prefixLower)
  })
}

/**
 * Normalize prefix by removing spaces
 * Example: "น. ส." → "น.ส.", "นางสาว" → "นางสาว"
 */
function normalizePrefix(prefix) {
  if (!prefix) return prefix
  // Remove all spaces from prefix
  return prefix.replace(/\s+/g, "")
}

/**
 * Extract prefix from line text
 */
function extractPrefix(lineText) {
  const words = lineText.split(/\s+/)
  if (words.length === 0) return { prefix: "", rest: lineText }

  const firstWord = words[0]
  if (isNamePrefix(firstWord)) {
    return {
      prefix: firstWord,
      rest: words.slice(1).join(" "),
    }
  }

  return { prefix: "", rest: lineText }
}

/**
 * Format person name according to rules
 * @param {string} lineText - Raw line text from OCR (may have multiple spaces)
 * @returns {string} Formatted name
 * 
 * Rules:
 * - Prefix/Title + FirstName (NO SPACE) - ติดกัน
 * - FirstName + LastName (ONE SPACE) - เว้นวรรค 1 ที
 * 
 * Examples:
 * - "นาย สมชาย ใจดี" → "นายสมชาย ใจดี"
 * - "น.ส. กมล วิไล" → "น.ส.กมล วิไล"
 * - "ดร. ธีรพงษ์ สีสาลี" → "ดร.ธีรพงษ์ สีสาลี"
 * - "ร.ต. สมชาย ใจดี" → "ร.ต.สมชาย ใจดี"
 */
export function formatPersonName(lineText) {
  if (!lineText || typeof lineText !== "string") return ""

  console.log(`📝 [NameFormatter] Formatting: "${lineText}"`)

  // Use ML-based formatter (with rule-based fallback)
  try {
    const mlResult = formatPersonNameWithML(lineText)
    if (mlResult && mlResult !== lineText) {
      console.log(`✅ [NameFormatter] ML result: "${mlResult}"`)
      return mlResult
    }
  } catch (error) {
    console.warn("⚠️ [NameFormatter] ML formatter failed, using fallback:", error)
  }

  // Fallback to rule-based approach
  // Remove extra spaces and trim
  const normalized = lineText.replace(/\s+/g, " ").trim()
  if (!normalized) return ""

  // Split into words (preserve all words, even if they have spaces)
  const words = normalized.split(/\s+/).filter((w) => w.length > 0)
  
  if (words.length === 0) return normalized
  if (words.length === 1) return normalized // Single word, return as-is

  // Check if first word is a prefix/title
  const firstWord = words[0]
  const isPrefix = isNamePrefix(firstWord)
  
  // Normalize prefix by removing spaces (e.g., "น. ส." → "น.ส.")
  const normalizedPrefix = isPrefix ? normalizePrefix(firstWord) : null

  if (isPrefix && normalizedPrefix) {
    // Has prefix/title: Prefix (no space) + FirstName (no space) + " " + LastName(s)
    if (words.length === 2) {
      // Prefix + FirstName only (no last name)
      const firstName = words[1].replace(/\s+/g, "")
      return `${normalizedPrefix}${firstName}`
    } else if (words.length >= 3) {
      // Prefix + FirstName + LastName(s)
      const remainingWords = words.slice(1)
      
      if (remainingWords.length <= 2) {
        // Simple case: prefix + first name + surname
        const firstName = remainingWords[0].replace(/\s+/g, "")
        const lastName = remainingWords.slice(1).join("")
        return `${normalizedPrefix}${firstName} ${lastName}`
      } else {
        // Complex case: OCR split name into many parts
        const surnameWords = remainingWords.slice(-2)
        const firstNameWords = remainingWords.slice(0, -2)
        const firstName = firstNameWords.map(w => w.replace(/\s+/g, "")).join("")
        const lastName = surnameWords.map(w => w.replace(/\s+/g, "")).join("")
        return `${normalizedPrefix}${firstName} ${lastName}`
      }
    }
  } else {
    // No prefix: FirstName + " " + LastName(s)
    if (words.length === 2) {
      return `${words[0]} ${words[1]}`
    } else {
      if (words.length <= 3) {
        const firstName = words[0]
        const lastName = words.slice(1).join("")
        return `${firstName} ${lastName}`
      } else {
        const surnameWords = words.slice(-2)
        const firstNameWords = words.slice(0, -2)
        const firstName = firstNameWords.join("")
        const lastName = surnameWords.join("")
        return `${firstName} ${lastName}`
      }
    }
  }
  
  return normalized // Fallback
}
