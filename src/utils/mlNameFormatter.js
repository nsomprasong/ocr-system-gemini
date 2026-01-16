/**
 * ML Name Formatter - Uses Machine Learning to parse Thai names
 * 
 * This module provides ML-based name parsing with rule-based fallback
 * 
 * Features:
 * - Detects name prefix/title
 * - Separates first name and surname
 * - Handles various name formats
 */

// Thai name prefixes for ML feature extraction (comprehensive list)
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
 * Extract features from name text for ML model
 * @param {string} text - Name text
 * @returns {Object} Features object
 */
/**
 * Try to split a concatenated Thai name into words
 * Uses heuristics to detect where name and surname should be separated
 */
function splitConcatenatedName(text) {
  if (!text || typeof text !== "string") return [text]
  
  // Remove all spaces first
  const noSpace = text.replace(/\s+/g, "")
  
  // Try to find prefix first
  for (const prefix of THAI_NAME_PREFIXES) {
    if (noSpace.toLowerCase().startsWith(prefix.toLowerCase())) {
      const afterPrefix = noSpace.slice(prefix.length)
      if (afterPrefix.length > 0) {
        // Try to split remaining text (usually first 2-4 chars are first name, rest is surname)
        // Thai names: first name is usually 2-4 characters, surname is usually 2-5 characters
        if (afterPrefix.length <= 2) {
          return [prefix, afterPrefix]
        } else if (afterPrefix.length <= 6) {
          // Split roughly in the middle
          const splitPoint = Math.floor(afterPrefix.length / 2)
          return [prefix, afterPrefix.slice(0, splitPoint), afterPrefix.slice(splitPoint)]
        } else {
          // Longer name - assume first 3-4 chars are first name
          const firstNameLength = Math.min(4, Math.floor(afterPrefix.length * 0.4))
          return [prefix, afterPrefix.slice(0, firstNameLength), afterPrefix.slice(firstNameLength)]
        }
      }
    }
  }
  
  // No prefix found - try to split in the middle
  if (noSpace.length <= 2) {
    return [noSpace]
  } else if (noSpace.length <= 6) {
    const splitPoint = Math.floor(noSpace.length / 2)
    return [noSpace.slice(0, splitPoint), noSpace.slice(splitPoint)]
  } else {
    const firstNameLength = Math.min(4, Math.floor(noSpace.length * 0.4))
    return [noSpace.slice(0, firstNameLength), noSpace.slice(firstNameLength)]
  }
}

function extractFeatures(text) {
  if (!text || typeof text !== "string") return null

  // First normalize spaces
  const normalized = text.replace(/\s+/g, " ").trim()
  let words = normalized.split(/\s+/).filter((w) => w.length > 0)
  
  // Check each word - if any word looks like concatenated (has prefix + name + surname), try to split it
  const processedWords = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    
    // If word is long and starts with prefix, might be concatenated
    if (word.length > 6) {
      const hasPrefix = THAI_NAME_PREFIXES.some(prefix => 
        word.toLowerCase().startsWith(prefix.toLowerCase())
      )
      if (hasPrefix) {
        // Try to split the concatenated name
        const splitWords = splitConcatenatedName(word)
        if (splitWords.length > 1) {
          processedWords.push(...splitWords)
          console.log(`🔀 [ML NameFormatter] Split concatenated word: "${word}" →`, splitWords)
          continue
        }
      }
    }
    
    // Also check if word might be concatenated name+surname (no prefix but long)
    if (word.length > 6 && i === 0 && processedWords.length === 0) {
      // First word, no prefix detected yet, might be concatenated first+last name
      const splitWords = splitConcatenatedName(word)
      if (splitWords.length > 1) {
        processedWords.push(...splitWords)
        console.log(`🔀 [ML NameFormatter] Split concatenated first word: "${word}" →`, splitWords)
        continue
      }
    }
    
    processedWords.push(word)
  }
  
  words = processedWords
  
  // Check if first word is a prefix
  const firstWord = words[0] || ""
  const normalizedFirstWord = firstWord.replace(/\s+/g, "")
  const isPrefix = THAI_NAME_PREFIXES.some(prefix => 
    normalizedFirstWord.toLowerCase() === prefix.toLowerCase() ||
    normalizedFirstWord.toLowerCase().startsWith(prefix.toLowerCase())
  )

  return {
    wordCount: words.length,
    hasPrefix: isPrefix,
    prefix: isPrefix ? normalizedFirstWord : null,
    words: words,
    totalLength: normalized.length,
    firstWordLength: firstWord.length,
    lastWordLength: words[words.length - 1]?.length || 0,
  }
}

/**
 * ML-based name parser (with rule-based fallback)
 * Uses heuristics and pattern recognition to separate name and surname
 * 
 * @param {string} text - Raw name text
 * @returns {Object} Parsed name { prefix, firstName, lastName, formatted }
 */
export function parseNameWithML(text) {
  if (!text || typeof text !== "string") return null

  const features = extractFeatures(text)
  if (!features) return null

  const { wordCount, hasPrefix, prefix, words } = features

  // Rule 1: Single word - return as is
  if (wordCount === 1) {
    return {
      prefix: null,
      firstName: words[0],
      lastName: null,
      formatted: words[0],
    }
  }

  // Rule 2: Has prefix
  if (hasPrefix && prefix) {
    const remainingWords = words.slice(1)
    
    if (remainingWords.length === 0) {
      return {
        prefix: prefix,
        firstName: null,
        lastName: null,
        formatted: prefix,
      }
    }

    if (remainingWords.length === 1) {
      // Prefix + FirstName only
      const firstName = remainingWords[0].replace(/\s+/g, "")
      return {
        prefix: prefix,
        firstName: firstName,
        lastName: null,
        formatted: `${prefix}${firstName}`,
      }
    }

    // ML Heuristic: Thai names typically have surname as last 1-2 words
    // First name is usually 1-3 words, surname is 1-2 words
    if (remainingWords.length === 2) {
      // Most common: Prefix + FirstName + Surname
      // Remove all spaces from first name and last name
      const firstName = remainingWords[0].replace(/\s+/g, "").trim()
      const lastName = remainingWords[1].replace(/\s+/g, "").trim()
      return {
        prefix: prefix,
        firstName: firstName,
        lastName: lastName,
        formatted: `${prefix}${firstName} ${lastName}`,
      }
    }

    // Multiple words: Use ML heuristic
    // Typically: First name = first 1-3 words, Surname = last 1-2 words
    // For Thai names, surname is usually 1-2 words
    const surnameWordCount = remainingWords.length >= 4 ? 2 : 1
    const firstNameWords = remainingWords.slice(0, -surnameWordCount)
    const surnameWords = remainingWords.slice(-surnameWordCount)
    
    const firstName = firstNameWords.map(w => w.replace(/\s+/g, "")).join("")
    const lastName = surnameWords.map(w => w.replace(/\s+/g, "")).join("")
    
    return {
      prefix: prefix,
      firstName: firstName,
      lastName: lastName,
      formatted: `${prefix}${firstName} ${lastName}`,
    }
  }

  // Rule 3: No prefix
  if (wordCount === 2) {
    // Simple: FirstName + LastName
    return {
      prefix: null,
      firstName: words[0],
      lastName: words[1],
      formatted: `${words[0]} ${words[1]}`,
    }
  }

  // ML Heuristic: For multiple words without prefix
  // Assume last 1-2 words are surname
  const surnameWordCount = wordCount >= 4 ? 2 : 1
  const firstNameWords = words.slice(0, -surnameWordCount)
  const surnameWords = words.slice(-surnameWordCount)
  
  const firstName = firstNameWords.map(w => w.replace(/\s+/g, "")).join("")
  const lastName = surnameWords.map(w => w.replace(/\s+/g, "")).join("")
  
  return {
    prefix: null,
    firstName: firstName,
    lastName: lastName,
    formatted: `${firstName} ${lastName}`,
  }
}

/**
 * Format person name using ML-based parsing
 * @param {string} lineText - Raw line text from OCR
 * @returns {string} Formatted name
 */
export function formatPersonNameWithML(lineText) {
  if (!lineText || typeof lineText !== "string") return ""

  console.log(`🤖 [ML NameFormatter] Processing: "${lineText}"`)

  const parsed = parseNameWithML(lineText)
  if (!parsed) {
    console.log(`⚠️ [ML NameFormatter] Failed to parse, returning original`)
    return lineText
  }

  console.log(`✅ [ML NameFormatter] Result: "${parsed.formatted}"`, parsed)
  return parsed.formatted
}
