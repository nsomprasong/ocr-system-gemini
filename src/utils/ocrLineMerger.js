/**
 * OCR Line Merger - Merges OCR words into lines
 * 
 * Rules:
 * - Words with similar Y position (within threshold) are same line
 * - Sort words in line by X (left → right)
 * - Merge into ONE line string
 */

const Y_THRESHOLD = 5 // pixels - words within this Y distance are same line

/**
 * Merge OCR words into lines
 * @param {Array} words - OCR words with {text, x, y, w, h}
 * @returns {Array} Lines with {text, x, y, w, h}
 */
export function mergeWordsIntoLines(words) {
  if (!words || words.length === 0) return []

  // Group words by similar Y position
  const lineGroups = []
  
  words.forEach((word) => {
    const wordCenterY = word.y + word.h / 2
    
    // Find existing line group with similar Y
    let foundGroup = null
    for (const group of lineGroups) {
      const groupCenterY = group.y + group.h / 2
      if (Math.abs(wordCenterY - groupCenterY) <= Y_THRESHOLD) {
        foundGroup = group
        break
      }
    }

    if (foundGroup) {
      // Add word to existing line group
      foundGroup.words.push(word)
      // Update line bounding box
      foundGroup.x = Math.min(foundGroup.x, word.x)
      foundGroup.y = Math.min(foundGroup.y, word.y)
      foundGroup.w = Math.max(foundGroup.x + foundGroup.w, word.x + word.w) - foundGroup.x
      foundGroup.h = Math.max(foundGroup.y + foundGroup.h, word.y + word.h) - foundGroup.y
    } else {
      // Create new line group
      lineGroups.push({
        words: [word],
        x: word.x,
        y: word.y,
        w: word.w,
        h: word.h,
      })
    }
  })

  // Convert groups to lines: sort words by X, merge text
  const lines = lineGroups.map((group) => {
    // Sort words in line by X (left → right)
    const sortedWords = [...group.words].sort((a, b) => a.x - b.x)
    
    // Merge text with spaces
    const text = sortedWords.map((w) => w.text).join(" ")

    return {
      text: text.trim(),
      x: group.x,
      y: group.y,
      w: group.w,
      h: group.h,
      words: sortedWords, // Keep original words for reference
    }
  })

  // Sort lines by Y (top → bottom), then X (left → right)
  lines.sort((a, b) => {
    if (Math.abs(a.y - b.y) > Y_THRESHOLD) {
      return a.y - b.y // Top to bottom
    }
    return a.x - b.x // Left to right
  })

  return lines
}
