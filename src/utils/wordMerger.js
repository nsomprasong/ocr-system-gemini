/**
 * Word Merger - Merges adjacent/connected words into single words
 * 
 * Rules:
 * - Words that are close together (within threshold) are merged into one word
 * - Used for display and selection to treat connected words as single units
 */

// Thresholds for merging words
// Use threshold to detect spaces - words beyond this are in separate groups
// IMPORTANT: Use dynamic threshold based on token height (h / 2) instead of fixed value
// This adapts to different font sizes and ensures tokens on the same line are grouped correctly
const X_DISTANCE_THRESHOLD = 60 // pixels - words within this X distance are same group (close together), beyond this = new group (visual gap) - balanced to merge close tokens without merging distant ones (important for tables with multiple columns)
// Y_DISTANCE_THRESHOLD is now calculated dynamically as average token height / 2
// For horizontal alignment, we use lenient Y threshold (2-3x token height) to allow merging even if heights differ

/**
 * Merge adjacent/connected words into single words
 * @param {Array} words - OCR words with {text, x, y, w, h}
 * @returns {Array} Merged words with {text, x, y, w, h}
 */
export function mergeConnectedWords(words) {
  if (!words || words.length === 0) return []

  console.log(`🔗 [WordMerger] Starting merge of ${words.length} words with X threshold: ${X_DISTANCE_THRESHOLD}px, Y threshold: dynamic (token height / 2)`)

  // Calculate average token height for dynamic Y threshold
  const avgTokenHeight = words.length > 0
    ? words.reduce((sum, w) => sum + (w.h || 0), 0) / words.length
    : 20 // fallback
  const DYNAMIC_Y_THRESHOLD = avgTokenHeight / 2 // Use token height / 2 as threshold
  
  console.log(`🔗 [WordMerger] Average token height: ${avgTokenHeight.toFixed(1)}px, Y threshold: ${DYNAMIC_Y_THRESHOLD.toFixed(1)}px`)
  
  // SPECIAL CASE: If there are few words (≤5) that are sorted by X (left to right),
  // merge them all into one token regardless of distance
  // This handles cases like "น.ส.", "ศิริวรรณ", "เหลาไช" that should be one name
  if (words.length <= 5 && words.length > 1) {
    const sortedByX = [...words].sort((a, b) => a.x - b.x)
    const isSortedByX = words.every((w, idx) => Math.abs(w.x - sortedByX[idx].x) < 1)
    
    if (isSortedByX) {
      // Check if Y range is reasonable (horizontally aligned)
      const yPositions = words.map(w => w.y).filter(y => y > 0)
      const minY = Math.min(...yPositions)
      const maxY = Math.max(...yPositions)
      const yRange = maxY - minY
      const isHorizontallyAligned = yRange <= avgTokenHeight * 3 // Allow up to 3x token height variation
      
      if (isHorizontallyAligned) {
        // Merge all words into one token
        const mergedText = sortedByX.map(w => w.text || "").join("")
        const mergedToken = {
          text: mergedText,
          x: Math.min(...sortedByX.map(w => w.x)),
          y: Math.min(...sortedByX.map(w => w.y)),
          w: Math.max(...sortedByX.map(w => w.x + w.w)) - Math.min(...sortedByX.map(w => w.x)),
          h: Math.max(...sortedByX.map(w => w.y + w.h)) - Math.min(...sortedByX.map(w => w.y)),
          words: sortedByX, // Keep original words for reference
        }
        console.log(`✅ [WordMerger] Merged all ${words.length} words (sorted by X, horizontally aligned):`, {
          words: sortedByX.map(w => ({ text: w.text?.substring(0, 20), x: Math.round(w.x), y: Math.round(w.y) })),
          mergedText: mergedText,
          yRange: Math.round(yRange),
          avgHeight: Math.round(avgTokenHeight),
        })
        return [mergedToken]
      }
    }
  }
  
  // Sort words by Y (top → bottom), then X (left → right)
  // IMPORTANT: Use Y center for better alignment detection (handles different heights better)
  const sortedWords = [...words].sort((a, b) => {
    const aYCenter = a.y + (a.h || 0) / 2
    const bYCenter = b.y + (b.h || 0) / 2
    const yDiff = Math.abs(aYCenter - bYCenter)
    
    // If Y centers are close (within threshold), sort by X (left to right)
    // Otherwise, sort by Y (top to bottom)
    if (yDiff <= DYNAMIC_Y_THRESHOLD) {
      return a.x - b.x // Left to right (same line)
    }
    return a.y - b.y // Top to bottom (different lines)
  })

  const mergedWords = []
  let currentGroup = null
  let mergeCount = 0

  sortedWords.forEach((word, idx) => {
    if (!currentGroup) {
      // Start new group
      currentGroup = {
        words: [word],
        x: word.x,
        y: word.y,
        w: word.w,
        h: word.h,
      }
    } else {
      // Check if word is connected to current group
      const lastWord = currentGroup.words[currentGroup.words.length - 1]
      const lastWordRight = lastWord.x + lastWord.w
      const wordLeft = word.x
      const distanceX = wordLeft - lastWordRight
      
      // Check if on same line (similar Y)
      // Use dynamic threshold: average height of tokens in current group / 2
      const avgHeightInGroup = currentGroup.words.length > 0
        ? currentGroup.words.reduce((sum, w) => sum + (w.h || 0), 0) / currentGroup.words.length
        : (lastWord.h || 0)
      const dynamicYThreshold = avgHeightInGroup / 2
      
      // Use Y center for better alignment detection (handles different heights better)
      const lastWordCenterY = lastWord.y + (lastWord.h || 0) / 2
      const wordCenterY = word.y + (word.h || 0) / 2
      const distanceY = Math.abs(wordCenterY - lastWordCenterY)
      
      // Check if word is to the right of last word (horizontal alignment)
      const isHorizontalAlignment = wordLeft > lastWordRight
      
      // Check if tokens overlap or are close vertically (using bounding boxes)
      const lastWordTop = lastWord.y
      const lastWordBottom = lastWord.y + (lastWord.h || 0)
      const wordTop = word.y
      const wordBottom = word.y + (word.h || 0)
      
      // Calculate vertical overlap
      const overlapTop = Math.max(lastWordTop, wordTop)
      const overlapBottom = Math.min(lastWordBottom, wordBottom)
      const overlapHeight = Math.max(0, overlapBottom - overlapTop)
      const minHeight = Math.min(lastWord.h || 0, word.h || 0)
      const overlapRatio = minHeight > 0 ? overlapHeight / minHeight : 0
      
      // Use very lenient threshold for horizontal alignment: 5x token height or overlap detection
      const lenientYThreshold = avgHeightInGroup * 5 // 5x token height for horizontal text with different heights
      const hasVerticalOverlap = overlapRatio > 0.1 // At least 10% vertical overlap
      
      // Debug: Log Y comparison for first few merges
      if (mergeCount < 10 || mergedWords.length < 3) {
        console.log(`🔍 [WordMerger] Comparing tokens:`, {
          lastWord: {
            text: lastWord.text?.substring(0, 20) || "",
            x: Math.round(lastWord.x),
            y: Math.round(lastWord.y),
            h: Math.round(lastWord.h),
            right: Math.round(lastWordRight),
            yCenter: Math.round(lastWordCenterY),
          },
          currentWord: {
            text: word.text?.substring(0, 20) || "",
            x: Math.round(wordLeft),
            y: Math.round(word.y),
            h: Math.round(word.h),
            yCenter: Math.round(wordCenterY),
            top: Math.round(wordTop),
            bottom: Math.round(wordBottom),
          },
          distanceX: Math.round(distanceX),
          distanceY: Math.round(distanceY),
          threshold: Math.round(dynamicYThreshold),
          lenientThreshold: Math.round(lenientYThreshold),
          isHorizontalAlignment: isHorizontalAlignment,
          avgHeightInGroup: Math.round(avgHeightInGroup),
          overlapRatio: (overlapRatio * 100).toFixed(0) + "%",
          overlapHeight: Math.round(overlapHeight),
        })
      }

      // IMPORTANT: Merge based on distance only, not on whether word.text contains space
      // If words are close horizontally and on same line, merge them into same group
      // distanceX > X_DISTANCE_THRESHOLD means there's a visual gap = new group
      // Use dynamic Y threshold based on token height / 2
      // We preserve spaces from OCR (word.text may contain spaces), so we merge based on visual distance only
      
      // PRIORITY: Use X distance as primary factor for merging
      // If words are close horizontally (within X threshold), merge them regardless of Y distance
      // This handles cases where tokens are horizontally aligned but have different heights
      const isCloseHorizontally = distanceX <= X_DISTANCE_THRESHOLD
      
      // Standard check: close horizontally and on same line (Y within threshold)
      const isStandardMerge = isCloseHorizontally && distanceY <= dynamicYThreshold
      
      // SPECIAL CASE: For horizontal alignment (word is to the right of last word),
      // use very lenient Y threshold (5x token height) or overlap detection
      // This handles cases like "น.ส.", "ศิริวรรณ", "เหลาไช" where OCR detected Y variation or different heights
      const isLenientMerge = isHorizontalAlignment && 
                            isCloseHorizontally && 
                            (distanceY <= lenientYThreshold || hasVerticalOverlap)
      
      // FALLBACK: If words are close horizontally and have vertical overlap, merge them
      // This handles cases where tokens are clearly on the same line but have different heights
      const isHorizontalMerge = isCloseHorizontally && isHorizontalAlignment && hasVerticalOverlap
      
      // ULTIMATE FALLBACK: If words are close horizontally (within X threshold) and horizontally aligned,
      // merge them regardless of Y distance (for cases with very different heights)
      // Use same X threshold to avoid merging tokens from different columns in tables
      const isForceHorizontalMerge = isCloseHorizontally && isHorizontalAlignment && distanceX <= X_DISTANCE_THRESHOLD
      
      if (isStandardMerge || isLenientMerge || isHorizontalMerge || isForceHorizontalMerge) {
        // Words are close together visually - add to current group (same word/phrase/sentence)
        mergeCount++
        let mergeType = "standard"
        if (isStandardMerge) {
          mergeType = "standard (X & Y within threshold)"
        } else if (isLenientMerge) {
          mergeType = `horizontal alignment (lenient Y: ${lenientYThreshold.toFixed(1)}px or overlap: ${(overlapRatio * 100).toFixed(0)}%)`
        } else if (isHorizontalMerge) {
          mergeType = `horizontal alignment (X close, overlap: ${(overlapRatio * 100).toFixed(0)}%)`
        } else if (isForceHorizontalMerge) {
          mergeType = "horizontal alignment (force merge, ignore Y)"
        }
        if (mergeCount <= 10 || mergedWords.length < 3) {
          console.log(`🔗 [WordMerger] Merging "${word.text}" with previous (${mergeType}, distanceX: ${distanceX.toFixed(1)}px, distanceY: ${distanceY.toFixed(1)}px, overlap: ${(overlapRatio * 100).toFixed(0)}%) - connected words/phrase`)
        }
        currentGroup.words.push(word)
        // Update bounding box
        currentGroup.x = Math.min(currentGroup.x, word.x)
        currentGroup.y = Math.min(currentGroup.y, word.y)
        const maxX = Math.max(currentGroup.x + currentGroup.w, word.x + word.w)
        const maxY = Math.max(currentGroup.y + currentGroup.h, word.y + word.h)
        currentGroup.w = maxX - currentGroup.x
        currentGroup.h = maxY - currentGroup.y
      } else {
        // Log why words were not merged (for debugging)
        if (mergedWords.length < 3) {
          const avgHeightInGroup = currentGroup.words.length > 0
            ? currentGroup.words.reduce((sum, w) => sum + (w.h || 0), 0) / currentGroup.words.length
            : 0
          const dynamicYThreshold = avgHeightInGroup / 2
          const reason = `distanceX: ${distanceX.toFixed(1)}px (threshold: ${X_DISTANCE_THRESHOLD}px), distanceY: ${distanceY.toFixed(1)}px (threshold: ${dynamicYThreshold.toFixed(1)}px, based on token height ${avgHeightInGroup.toFixed(1)}px / 2)`
          console.log(`🔗 [WordMerger] Not merging "${word.text}" - ${reason}`)
        }
        // Save current group
        // IMPORTANT: Join words and preserve all spaces from word.text (don't remove spaces)
        // Replace \n with space to prevent unwanted line breaks (newlines in OCR text are not actual line breaks)
        // If word.text contains space, keep it; otherwise join without adding space
        const joinedText = currentGroup.words
          .map((w) => (w.text || "").replace(/\n/g, " ")) // Replace \n with space
          .join("")
        
        mergedWords.push({
          text: joinedText,
          x: currentGroup.x,
          y: currentGroup.y,
          w: currentGroup.w,
          h: currentGroup.h,
          words: currentGroup.words, // Keep original words for reference
        })
        currentGroup = {
          words: [word],
          x: word.x,
          y: word.y,
          w: word.w,
          h: word.h,
        }
      }
    }
  })

  // Don't forget the last group
  if (currentGroup) {
    // IMPORTANT: Join words and preserve all spaces from word.text (don't remove spaces)
    // Replace \n with space to prevent unwanted line breaks (newlines in OCR text are not actual line breaks)
    // If word.text contains space, keep it; otherwise join without adding space
    const joinedText = currentGroup.words
      .map((w) => (w.text || "").replace(/\n/g, " ")) // Replace \n with space
      .join("")
    
    mergedWords.push({
      text: joinedText,
      x: currentGroup.x,
      y: currentGroup.y,
      w: currentGroup.w,
      h: currentGroup.h,
      words: currentGroup.words, // Keep original words for reference
    })
  }

  console.log(`✅ [WordMerger] Merged ${words.length} words into ${mergedWords.length} groups (${mergeCount} merges performed)`)
  if (mergedWords.length > 0 && mergedWords.length <= 10) {
    console.log(`📝 [WordMerger] Sample merged words:`, mergedWords.slice(0, 5).map(w => `"${w.text}"`).join(", "))
  }

  return mergedWords
}
