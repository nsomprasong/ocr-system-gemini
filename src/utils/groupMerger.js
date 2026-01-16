/**
 * Group Merger - Merges lines in a group into final field text
 * 
 * Rules:
 * - Sort lines by Y position (top → bottom)
 * - Join lines with single space
 * - Apply field type formatting (PERSON_NAME or NORMAL_TEXT)
 */

import { normalizeThaiOCRTokens } from "./normalizeThaiOCRTokens.js"
import { removeEmptyLines } from "./textUtils.js"

export const FIELD_TYPES = {
  PERSON_NAME: "PERSON_NAME",
  NORMAL_TEXT: "NORMAL_TEXT",
}

/**
 * Merge lines in a group into final field text
 * @param {Array} lines - Lines in the group (each line has {text, x, y, w, h})
 * @param {string} fieldType - FIELD_TYPES.PERSON_NAME or FIELD_TYPES.NORMAL_TEXT
 * @returns {string} Merged and formatted text (newline-separated by Y position - one name per line)
 */
export function mergeGroupLines(lines, fieldType = FIELD_TYPES.NORMAL_TEXT) {
  if (!lines || lines.length === 0) return ""

  // SPECIAL CASE: For PERSON_NAME with few lines (≤5) that are sorted by X (left to right),
  // merge them all into one line regardless of Y distance
  // This handles cases like "น.ส.", "ศิริวรรณ", "เหลาไช" that should be one name
  if (fieldType === FIELD_TYPES.PERSON_NAME && lines.length <= 5 && lines.length > 1) {
    const linesWithX = lines.map(l => {
      // Remove newlines from text before processing (newlines are from OCR, not actual line breaks)
      const text = typeof l === "string" ? l : (l.text || "")
      const cleanText = text.replace(/\n/g, " ").trim() // Replace newlines with space
      return {
        text: cleanText,
        x: typeof l === "string" ? 0 : (l.x || 0),
        y: typeof l === "string" ? 0 : (l.y || 0),
        h: typeof l === "string" ? 0 : (l.h || 0),
      }
    }).filter(l => l.text)
    
    // Check if lines are sorted by X (left to right)
    const sortedByX = [...linesWithX].sort((a, b) => a.x - b.x)
    const isSortedByX = linesWithX.length === sortedByX.length && 
                       linesWithX.every((l, idx) => Math.abs(l.x - sortedByX[idx].x) < 1)
    
    // Check if all lines are horizontally aligned (Y variation is reasonable)
    const yPositions = linesWithX.map(l => l.y).filter(y => y > 0)
    const minY = Math.min(...yPositions)
    const maxY = Math.max(...yPositions)
    const yRange = maxY - minY
    const avgHeight = linesWithX.reduce((sum, l) => sum + l.h, 0) / linesWithX.length
    const isHorizontallyAligned = yRange <= avgHeight * 2 // Allow up to 2x line height variation
    
    if (isSortedByX && isHorizontallyAligned) {
      // Merge all lines into one line (sorted by X)
      // Join with space and remove extra spaces
      const mergedText = sortedByX.map(l => l.text).join(" ").replace(/\s+/g, " ").trim()
      return mergedText
    }
  }

  // Calculate average line height for dynamic Y threshold
  const avgLineHeight = lines.length > 0
    ? lines.reduce((sum, l) => {
        const h = typeof l === "string" ? 0 : (l.h || 0)
        return sum + h
      }, 0) / lines.filter(l => typeof l !== "string" && l.h).length
    : 20 // fallback
  const DYNAMIC_Y_THRESHOLD = avgLineHeight / 2 // Use line height / 2 as threshold
  
  
  // Sort lines by Y position (top → bottom), then X (left → right)
  const sortedLines = [...lines].sort((a, b) => {
    // Use dynamic Y threshold to group lines on the same row
    if (Math.abs(a.y - b.y) > DYNAMIC_Y_THRESHOLD) {
      return a.y - b.y // Top to bottom
    }
    return a.x - b.x // Left to right
  })

  // Group lines by Y position (same row = same Y within dynamic threshold)
  // SPECIAL CASE: For PERSON_NAME, if lines are sorted by X (left to right) and within group box,
  // treat them as same line even if Y distance exceeds threshold
  const rows = []
  let currentRow = null

  sortedLines.forEach((line, lineIndex) => {
    // Remove newlines from text before processing (newlines are from OCR, not actual line breaks)
    let lineText = typeof line === "string" ? line : (line.text || "")
    if (!lineText) return
    // Replace newlines with space for processing (will be handled by grouping logic)
    lineText = lineText.replace(/\n/g, " ").trim()
    
    const lineY = typeof line === "string" ? 0 : (line.y || 0)
    const lineH = typeof line === "string" ? avgLineHeight : (line.h || avgLineHeight)
    const lineX = typeof line === "string" ? 0 : (line.x || 0)
    const lineYCenter = lineY + lineH / 2
    
    // Use dynamic threshold: average height of lines in current row / 2
    const avgHeightInRow = currentRow && currentRow.lines.length > 0
      ? currentRow.lines.reduce((sum, l) => {
          // Estimate height from line object if available
          const h = typeof l === "string" ? avgLineHeight : (l.h || avgLineHeight)
          return sum + h
        }, 0) / currentRow.lines.length
      : lineH
    const dynamicYThreshold = avgHeightInRow / 2
    
    // SPECIAL CASE for PERSON_NAME: Check if lines are horizontally aligned (sorted by X)
    // If current line is to the right of lines in currentRow (X increases), and Y center is within lenient threshold,
    // treat as same line (horizontal text that OCR detected with slight Y variation)
    let shouldMerge = false
    let mergeReason = ""
    
    if (currentRow) {
      const currentRowY = currentRow.y
      const currentRowYCenter = currentRowY + avgHeightInRow / 2
      const distanceY = Math.abs(lineYCenter - currentRowYCenter)
      
      // Standard check: within Y threshold
      if (distanceY <= dynamicYThreshold) {
        shouldMerge = true
        mergeReason = "✅ Same line (within Y threshold)"
      } 
      // SPECIAL CASE: For PERSON_NAME, if lines are horizontally aligned (X increases) 
      // and Y center is within lenient threshold, treat as same line
      else if (fieldType === FIELD_TYPES.PERSON_NAME) {
        // Get the rightmost line in currentRow to check horizontal alignment
        const rightmostLine = currentRow.lines.reduce((rightmost, l) => {
          const lX = typeof l === "string" ? 0 : (l.x || 0)
          const rightmostX = typeof rightmost === "string" ? 0 : (rightmost.x || 0)
          return lX > rightmostX ? l : rightmost
        }, currentRow.lines[0])
        
        const rightmostLineX = typeof rightmostLine === "string" ? 0 : (rightmostLine.x || 0)
        
        // Check if current line is to the right of rightmost line in currentRow (horizontal alignment)
        const isHorizontalAlignment = lineX > rightmostLineX
        
        // Use very lenient threshold for horizontal text: use avgLineHeight directly (not divided by 2)
        // This allows tokens that are visually on the same line but OCR detected with Y variation to merge
        const lenientThreshold = avgLineHeight * 1.5 // 1.5x line height for horizontal text
        const isWithinLenientThreshold = distanceY <= lenientThreshold
        
        if (isHorizontalAlignment && isWithinLenientThreshold) {
          shouldMerge = true
          mergeReason = `✅ Same line (horizontal alignment, Y within ${Math.round(lenientThreshold)}px, distanceY: ${Math.round(distanceY)}px)`
        } else {
          // FALLBACK: If all lines in group are sorted by X (left to right), merge them all regardless of Y
          // This handles cases where OCR detected text as separate lines but they're actually one line
          const allLinesInGroup = [...currentRow.lines, line]
          const sortedByX = [...allLinesInGroup].sort((a, b) => {
            const aX = typeof a === "string" ? 0 : (a.x || 0)
            const bX = typeof b === "string" ? 0 : (b.x || 0)
            return aX - bX
          })
          const isSortedByX = JSON.stringify(allLinesInGroup.map(l => typeof l === "string" ? 0 : (l.x || 0))) === 
                              JSON.stringify(sortedByX.map(l => typeof l === "string" ? 0 : (l.x || 0)))
          
          if (isSortedByX && allLinesInGroup.length <= 5) {
            // If lines are sorted by X and there are few lines (likely one name), merge them
            shouldMerge = true
            mergeReason = `✅ Same line (sorted by X, all lines in group, distanceY: ${Math.round(distanceY)}px)`
          } else {
            mergeReason = `❌ Different line (distanceY: ${Math.round(distanceY)}px, threshold: ${Math.round(dynamicYThreshold)}px, lenient: ${Math.round(lenientThreshold)}px, horizontal: ${isHorizontalAlignment}, sortedByX: ${isSortedByX})`
          }
        }
      } else {
        mergeReason = `❌ Different line (distanceY: ${Math.round(distanceY)}px > threshold: ${Math.round(dynamicYThreshold)}px)`
      }
      
      // Debug: Log Y comparison for first few groups
      if (rows.length < 5) {
        console.log(`🔍 [GroupMerger] Comparing lines:`, {
          currentRow: {
            y: Math.round(currentRowY),
            yCenter: Math.round(currentRowYCenter),
            linesCount: currentRow.lines.length,
            avgHeight: Math.round(avgHeightInRow),
            threshold: Math.round(dynamicYThreshold),
            lines: currentRow.lines.map(l => ({
              text: (typeof l === "string" ? l : l.text)?.substring(0, 20) || "",
              x: typeof l === "string" ? 0 : Math.round(l.x || 0),
              y: typeof l === "string" ? 0 : Math.round(l.y || 0),
            })),
          },
          newLine: {
            text: lineText.substring(0, 20),
            x: Math.round(lineX),
            y: Math.round(lineY),
            yCenter: Math.round(lineYCenter),
            h: Math.round(lineH),
          },
          distanceY: Math.round(Math.abs(lineYCenter - currentRowYCenter)),
          threshold: Math.round(dynamicYThreshold),
          willMerge: shouldMerge,
          reason: mergeReason,
        })
      }
    }

    if (!currentRow || !shouldMerge) {
      // New row - start a new group (new line)
      if (currentRow) {
        rows.push(currentRow)
      }
      currentRow = {
        y: lineY,
        lines: [line], // Store line object to preserve height and text
      }
    } else {
      // Same row - add to current group (same line, join with space)
      // Update row Y to average of all lines in row (for better Y position tracking)
      const allLinesInRow = [...currentRow.lines, line]
      const avgY = allLinesInRow.reduce((sum, l) => {
        const y = typeof l === "string" ? 0 : (l.y || 0)
        return sum + y
      }, 0) / allLinesInRow.length
      currentRow.y = avgY
      currentRow.lines.push(line) // Store line object to preserve height and text
    }
  })

  // Don't forget the last row
  if (currentRow) {
    rows.push(currentRow)
  }

  // Format each row
  // For PERSON_NAME, use deterministic normalization (1 name = 1 row)
  if (fieldType === FIELD_TYPES.PERSON_NAME) {
    
    // Group words by row (Y-axis)
    // Use dynamic threshold based on token height / 2
    const wordRows = []
    let currentWordRow = null
    
    // Use line.text directly (already merged by wordMerger) - don't use line.words
    // This ensures we use the merged words, not the original OCR words
    // IMPORTANT: Remove newlines from text (newlines are from OCR, not actual line breaks)
    const allWords = lines.map(line => ({
      text: (line.text || "").replace(/\n/g, " ").trim(), // Replace newlines with space
      x: line.x || 0,
      y: line.y || 0,
      w: line.w || 0,
      h: line.h || 0,
    })).filter(w => w.text)
    
    // Calculate average word height for dynamic threshold
    const avgWordHeight = allWords.length > 0
      ? allWords.reduce((sum, w) => sum + (w.h || 0), 0) / allWords.length
      : 20 // fallback
    const DYNAMIC_Y_THRESHOLD = avgWordHeight / 2
    
    // Sort words by Y, then X
    const sortedWords = [...allWords].sort((a, b) => {
      if (Math.abs(a.y - b.y) > DYNAMIC_Y_THRESHOLD) {
        return a.y - b.y
      }
      return a.x - b.x
    })
    
    // Group words by row using dynamic threshold
    for (const word of sortedWords) {
      // Use dynamic threshold: average height of words in current row / 2
      const avgHeightInRow = currentWordRow && currentWordRow.length > 0
        ? currentWordRow.reduce((sum, w) => sum + (w.h || 0), 0) / currentWordRow.length
        : word.h || avgWordHeight
      const dynamicYThreshold = avgHeightInRow / 2
      
      if (!currentWordRow || Math.abs(word.y - currentWordRow[0].y) > dynamicYThreshold) {
        if (currentWordRow) {
          wordRows.push(currentWordRow)
        }
        currentWordRow = [word]
      } else {
        currentWordRow.push(word)
      }
    }
    if (currentWordRow) {
      wordRows.push(currentWordRow)
    }
    
    // Sort words within each row by X
    wordRows.forEach(row => row.sort((a, b) => a.x - b.x))
    
    // Convert to tokensPerLine format: Array<Array<string>>
    // Use line.text (merged word) directly, not line.words
    const tokensPerLine = wordRows.map(row => row.map(w => w.text || "").filter(t => t))
    
    // Use deterministic normalization - return exactly as normalized, no modification
    const normalized = normalizeThaiOCRTokens(tokensPerLine)
    
    // Return exactly as normalized - no join, no split, no modification
    // Each element in normalized array is one name string from normalizeThaiOCRTokens
    // Join with newline only for display (one name per line based on Y-axis)
    // This is NOT modification - just formatting for display
    if (normalized.length > 0) {
      const result = normalized.join("\n")
      // Remove empty lines from result
      return removeEmptyLines(result)
    }
    
    // Fallback: return empty string
    return ""
  }
  
  // For NORMAL_TEXT, display as OCR detected (no formatting)
  // Just join words/lines as they are from OCR
  const formattedRows = rows.map((row) => {
    // For NORMAL_TEXT, join lines with space (as OCR separated them)
    // Don't apply any formatting - show exactly as OCR detected
    return row.lines.map(l => {
      // Extract text from line object
      const lineObj = typeof l === "string" ? null : l
      // If line has words, join them with space (as OCR separated)
      if (lineObj && lineObj.words && Array.isArray(lineObj.words) && lineObj.words.length > 0) {
        return lineObj.words.map(w => w.text).join(" ")
      }
      // Otherwise use line text directly
      return typeof l === "string" ? l : (lineObj?.text || "")
    }).join(" ").trim()
  })
  
  // Join rows with newline (each row on a new line - according to Y position)
  const result = formattedRows.filter(r => r.trim()).join("\n")
  // Remove empty lines from result
  return removeEmptyLines(result)
}
