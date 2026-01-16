/**
 * Usage Examples for normalizeThaiOCRTokens()
 * 
 * This file demonstrates how to use the normalization function
 * in different scenarios. DO NOT import this in production code.
 */

import { normalizeThaiOCRTokens, normalizeThaiOCRTokensToText } from "./normalizeThaiOCRTokens.js"

// ============================================================
// Example 1: Basic Usage
// ============================================================

const example1 = () => {
  const ocrWords = [
    { text: "นาย", x: 10, y: 100, w: 30, h: 20 },
    { text: "รัต", x: 50, y: 100, w: 25, h: 20 },
    { text: "นชัย", x: 80, y: 100, w: 40, h: 20 },
    { text: "แสง", x: 130, y: 100, w: 30, h: 20 },
    { text: "จันทร", x: 170, y: 100, w: 50, h: 20 },
  ]

  const lines = normalizeThaiOCRTokens(ocrWords)
  // Result:
  // [
  //   {
  //     y: 100,
  //     text: "นายรัตนชัย แสงจันทร",
  //     words: [...] // Original words preserved
  //   }
  // ]
}

// ============================================================
// Example 2: Multiple Lines (Cross-line Merging Prevented)
// ============================================================

const example2 = () => {
  const ocrWords = [
    // Line 1
    { text: "นาย", x: 10, y: 100, w: 30, h: 20 },
    { text: "รัตนชัย", x: 50, y: 100, w: 60, h: 20 },
    // Line 2 (different Y)
    { text: "น.", x: 10, y: 150, w: 15, h: 20 },
    { text: "ส.", x: 30, y: 150, w: 15, h: 20 },
    { text: "ปวีณา", x: 50, y: 150, w: 50, h: 20 },
  ]

  const lines = normalizeThaiOCRTokens(ocrWords, { yTolerance: 8 })
  // Result: 2 separate lines
  // Line 1: "นายรัตนชัย"
  // Line 2: "น.ส.ปวีณา"
  // ✅ Cross-line merging prevented
}

// ============================================================
// Example 3: Broken Prefix Merging
// ============================================================

const example3 = () => {
  const ocrWords = [
    { text: "น.", x: 10, y: 100, w: 15, h: 20 },
    { text: "ส.", x: 30, y: 100, w: 15, h: 20 },
    { text: "ยลลดา", x: 50, y: 100, w: 50, h: 20 },
  ]

  const lines = normalizeThaiOCRTokens(ocrWords)
  // Result: "น.ส.ยลลดา"
  // ✅ Broken prefix ["น.", "ส."] merged to "น.ส."
}

// ============================================================
// Example 4: Export to Excel (Text Only)
// ============================================================

const example4 = () => {
  const ocrWords = [
    { text: "นาย", x: 10, y: 100, w: 30, h: 20 },
    { text: "สมชาย", x: 50, y: 100, w: 50, h: 20 },
  ]

  // Get just text (no structure)
  const textLines = normalizeThaiOCRTokensToText(ocrWords)
  // Result: ["นายสมชาย"]
  
  // Use for Excel export
  // excelRow.name = textLines[0]
}

// ============================================================
// Example 5: Template Zone-Based Parsing
// ============================================================

const example5 = () => {
  const ocrWords = [
    { text: "นาย", x: 10, y: 100, w: 30, h: 20 },
    { text: "รัตนชัย", x: 50, y: 100, w: 60, h: 20 },
  ]

  const lines = normalizeThaiOCRTokens(ocrWords)
  
  // Use normalized lines for zone-based parsing
  lines.forEach(line => {
    // line.y - Y position for zone matching
    // line.text - Normalized text for display/export
    // line.words - Original words for bounding box calculation
    console.log(`Line at Y=${line.y}: "${line.text}"`)
  })
}

// ============================================================
// Example 6: Performance (100k+ lines)
// ============================================================

const example6 = () => {
  // Generate large dataset
  const largeDataset = Array.from({ length: 100000 }, (_, i) => ({
    text: `word${i}`,
    x: (i % 100) * 10,
    y: Math.floor(i / 100) * 20,
    w: 50,
    h: 20,
  }))

  // Automatically uses optimized sorting approach
  const start = Date.now()
  const lines = normalizeThaiOCRTokens(largeDataset, { yTolerance: 8 })
  const duration = Date.now() - start

  console.log(`Processed ${largeDataset.length} words in ${duration}ms`)
  console.log(`Generated ${lines.length} lines`)
  // ✅ Performance: O(n log n) for large datasets
}
