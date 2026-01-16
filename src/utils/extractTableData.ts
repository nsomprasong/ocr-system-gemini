import type { OCRResult } from "../../core/types"
import type { Template } from "../../template/template.schema"
import { groupTokensByZones } from "../../core/ocr_v2/tableAlignment"
import { mergeGroupLines, FIELD_TYPES } from "./groupMerger"
import { mergeConnectedWords } from "./wordMerger"
import { removeEmptyLines } from "./textUtils"

/**
 * ROW_TOLERANCE - Y-axis tolerance for determining if words are on the same row
 * Words within this Y distance are considered on the same row
 * This ensures proper row ordering (top → bottom, left → right)
 */
const ROW_TOLERANCE = 10 // pixels - adjust based on DPI

/**
 * Group interface for preview mode (uses groups with pre-formatted text)
 */
export interface Group {
  id: string
  excelColumn?: string
  text?: string
  words?: Array<{ x: number; y: number; text: string; w?: number; h?: number }>
  lines?: Array<{ x: number; y: number; text: string; w?: number; h?: number }>
  y?: number
  fieldType?: string
  defaultValue?: string
}

/**
 * Table row result
 */
export interface TableRow {
  [columnKey: string]: string
}

/**
 * Options for extracting table data
 */
export interface ExtractTableDataOptions {
  /** Y-axis tolerance for matching rows (default: 15) */
  yTolerance?: number
  /** Whether to use groups (preview mode) or template (export mode) */
  mode?: "preview" | "export"
}

/**
 * Extracts table data from OCR result using primary column alignment.
 * 
 * This is a unified function that works for both:
 * - Preview mode: Uses groups with pre-formatted text
 * - Export mode: Uses template with OCR words and formats them
 * 
 * Uses the column with the most rows (by Y-axis) as the PRIMARY COLUMN.
 * PRIMARY COLUMN defines ALL rows in the table.
 * Other columns fill data ONLY when token.y matches an existing primary row.y.
 * 
 * @param ocrResult - OCR result with words and page dimensions
 * @param groupsOrTemplate - Either groups array (preview) or template (export)
 * @param options - Extraction options
 * @returns Array of table rows (one per primary row)
 */
export function extractTableData(
  ocrResult: OCRResult,
  groupsOrTemplate: Group[] | Template,
  options: ExtractTableDataOptions = {}
): TableRow[] {
  const { yTolerance = 15, mode = "preview" } = options

  if (!ocrResult || !groupsOrTemplate) {
    console.log("🔍 [extractTableData] Missing required data:", {
      hasOcrResult: !!ocrResult,
      hasGroupsOrTemplate: !!groupsOrTemplate,
    })
    return []
  }

  try {
    if (mode === "preview" && Array.isArray(groupsOrTemplate)) {
      return extractFromGroups(ocrResult, groupsOrTemplate, yTolerance)
    } else if (mode === "export" && !Array.isArray(groupsOrTemplate)) {
      return extractFromTemplate(ocrResult, groupsOrTemplate, yTolerance)
    } else {
      console.error("❌ [extractTableData] Invalid mode/type combination:", {
        mode,
        isArray: Array.isArray(groupsOrTemplate),
        type: typeof groupsOrTemplate,
      })
      return []
    }
  } catch (error: unknown) {
    const err = error as Error
    console.error("❌ [extractTableData] Error:", err)
    console.error("❌ [extractTableData] Stack:", err?.stack)
    return []
  }
}

/**
 * Extract table data from groups (preview mode)
 * Groups already have formatted text from mergeGroupLines
 */
function extractFromGroups(
  ocrResult: OCRResult,
  groups: Group[],
  yTolerance: number
): TableRow[] {
  // Filter groups that have excelColumn mapped AND have data
  const mappedGroups = groups.filter((g) => {
    if (!g.excelColumn) return false
    
    const hasText = g.text && g.text.trim().length > 0
    const hasWords = (g.words && g.words.length > 0) || (g.lines && g.lines.length > 0)
    const hasDefaultValue = g.defaultValue && g.defaultValue.trim().length > 0
    
    return hasText || hasWords || hasDefaultValue
  })
  
  if (mappedGroups.length === 0) {
    console.log("🔍 [extractTableData] No mapped groups with data")
    return []
  }

  // For each group, split text by newlines to get individual rows
  const groupRows = new Map<string, Array<{ y: number; text: string; index: number }>>()
  
  for (const group of mappedGroups) {
    if (!group.text || !group.excelColumn) continue
    
    // IMPORTANT: Replace \n in token text with space to prevent unwanted line breaks
    // \n in token text (from OCR) should not create new rows
    // We'll use Y position to determine rows instead of relying on \n in text
    const cleanedText = group.text.replace(/\n/g, " ").trim()
    
    // Get Y positions from group's words/lines to determine row order
    const words = group.words || group.lines || []
    
    if (words.length > 0) {
      // Group words by Y-axis to determine rows (based on actual Y position, not \n in text)
      const wordRows = groupWordsByY(words, yTolerance)
      
      // For each word row, extract text from words in that row
      // This ensures rows are determined by Y position, not by \n in text
      const columnRows: Array<{ y: number; text: string; index: number }> = []
      for (let i = 0; i < wordRows.length; i++) {
        const wordRow = wordRows[i]
        
        // Extract text from words in this row (replace \n with space in each word)
        const rowText = wordRow.words
          .map(w => (w.text || "").replace(/\n/g, " "))
          .filter(t => t.trim())
          .join(" ")
          .trim()
        
        // Calculate average Y position from all words in the row
        let avgY = wordRow.y
        if (wordRow.words && wordRow.words.length > 0) {
          const wordYs = wordRow.words.map(w => w.y || 0).filter(y => y > 0)
          if (wordYs.length > 0) {
            avgY = wordYs.reduce((sum, y) => sum + y, 0) / wordYs.length
          }
        }
        
        columnRows.push({
          y: avgY,
          text: rowText,
          index: i,
        })
      }
      
      // If no word rows but we have cleaned text, use the entire text as one row
      if (columnRows.length === 0 && cleanedText) {
        columnRows.push({
          y: group.y || 0,
          text: cleanedText,
          index: 0,
        })
      }
      
      groupRows.set(group.excelColumn, columnRows)
    } else {
      // No words - use group Y position and treat entire text as one row
      if (cleanedText) {
        const columnRows = [{
          y: group.y || 0,
          text: cleanedText,
          index: 0,
        }]
        groupRows.set(group.excelColumn, columnRows)
      }
    }
  }

  // Find primary column (column with most rows)
  let primaryColumn: string | null = null
  let maxRows = 0
  
  for (const [columnKey, columnRows] of groupRows.entries()) {
    if (columnRows.length > maxRows) {
      maxRows = columnRows.length
      primaryColumn = columnKey
    }
  }

  if (!primaryColumn) {
    console.log("🔍 [extractTableData] No primary column found")
    return []
  }

  const primaryRows = groupRows.get(primaryColumn) || []
  console.log("✅ [extractTableData] Primary column:", {
    column: primaryColumn,
    rowsCount: primaryRows.length,
  })

  // Build table rows using primary column as reference
  const tableRows: TableRow[] = []
  
  for (const primaryRow of primaryRows) {
    const row: TableRow = {}
    
    // Fill all columns
    for (const [columnKey, columnRows] of groupRows.entries()) {
      if (columnKey === primaryColumn) {
        // Primary column - use primary row text
        row[columnKey] = primaryRow.text
      } else {
        // Other columns - find row with closest Y position
        let matchedRow = columnRows.find(r => Math.abs(r.y - primaryRow.y) <= yTolerance)
        
        // If no exact match, find closest
        if (!matchedRow && columnRows.length > 0) {
          const distances = columnRows.map(r => ({
            row: r,
            distance: Math.abs(r.y - primaryRow.y)
          }))
          distances.sort((a, b) => a.distance - b.distance)
          
          // Use closest if within reasonable distance
          if (distances[0].distance <= yTolerance * 2) {
            matchedRow = distances[0].row
          }
        }
        
        // Use matched text or default value
        const group = groups.find(g => g.excelColumn === columnKey)
        if (matchedRow) {
          row[columnKey] = matchedRow.text
        } else {
          const hasNoWords = (!group?.words || group.words.length === 0) && (!group?.lines || group.lines.length === 0)
          row[columnKey] = hasNoWords ? (group?.defaultValue || "") : ""
        }
      }
    }
    
    // Add manually added columns (no words, only defaultValue)
    for (const group of groups) {
      if (group.excelColumn && !row[group.excelColumn]) {
        const hasNoWords = (!group.words || group.words.length === 0) && (!group.lines || group.lines.length === 0)
        if (hasNoWords && group.defaultValue) {
          row[group.excelColumn] = group.defaultValue
        }
      }
    }
    
    tableRows.push(row)
  }

  return tableRows
}

/**
 * Extract table data from template (export mode)
 * Uses OCR words directly and formats them
 * 
 * IMPORTANT: For multi-page documents, applies template per-page (page-local grouping)
 */
function extractFromTemplate(
  ocrResult: OCRResult,
  template: Template,
  yTolerance: number
): TableRow[] {
  // Check if this is a multi-page document with pages array
  if (ocrResult.pages && ocrResult.pages.length > 1) {
    // MULTI-PAGE: Apply template per-page (page-local grouping)
    console.log(`📄 [extractTableData] Multi-page document detected: ${ocrResult.pages.length} pages`)
    console.log(`📄 [extractTableData] Applying template per-page (page-local grouping)`)
    
    const allRows: TableRow[] = []
    
    for (const pageData of ocrResult.pages) {
      if (!pageData.words || pageData.words.length === 0) {
        console.log(`📄 [extractTableData] Page ${pageData.pageNumber}: No words, skipping`)
        continue
      }
      
      console.log(`📄 [extractTableData] Page ${pageData.pageNumber}: Processing ${pageData.words.length} words (page-local Y coordinates)`)
      
      // IMPORTANT: Sort words by Y (top → bottom), then X (left → right) BEFORE applying template
      // This ensures proper row ordering (records start from top row, not middle of page)
      const sortedPageWords = [...pageData.words].sort((a, b) => {
        const yDiff = Math.abs(a.y - b.y)
        if (yDiff > ROW_TOLERANCE) {
          return a.y - b.y // Different rows - sort by Y (top → bottom)
        }
        return a.x - b.x // Same row - sort by X (left → right)
      })
      
      // Create page-local OCR result with sorted words
      const pageOcrResult: OCRResult = {
        fileName: ocrResult.fileName,
        page: {
          width: pageData.width,
          height: pageData.height,
        },
        words: sortedPageWords, // Words sorted by Y then X (page-local Y coordinates)
      }
      
      // Apply template to this page only
      const pageRows = extractFromTemplateSinglePage(pageOcrResult, template, yTolerance)
      
      console.log(`📄 [extractTableData] Page ${pageData.pageNumber}: Extracted ${pageRows.length} rows`)
      if (pageRows.length > 0) {
        const firstRowPreview = Object.values(pageRows[0]).slice(0, 2).join(" ")
        console.log(`📄 [extractTableData] Page ${pageData.pageNumber}: First row preview: "${firstRowPreview}..."`)
      }
      allRows.push(...pageRows)
    }
    
    console.log(`✅ [extractTableData] Multi-page extraction complete: ${allRows.length} total rows from ${ocrResult.pages.length} pages`)
    return allRows
  } else {
    // SINGLE-PAGE: Use original logic (backward compatible)
    console.log(`📄 [extractTableData] Single-page document: using original logic`)
    return extractFromTemplateSinglePage(ocrResult, template, yTolerance)
  }
}

/**
 * Extract table data from a single page (internal helper)
 */
function extractFromTemplateSinglePage(
  ocrResult: OCRResult,
  template: Template,
  yTolerance: number
): TableRow[] {
  // Convert template columns to zones format
  const zones = template.columns.map((column) => ({
    key: column.columnKey,
    zone: column.zone,
  }))

  // Group tokens by zones (using page-local coordinates)
  const columns = groupTokensByZones(
    ocrResult.words,
    zones,
    ocrResult.page.width,
    ocrResult.page.height
  )

  // Create a map of columnKey -> tokens
  const tokensByColumn = new Map<string, typeof columns[0]["tokens"]>()
  for (const col of columns) {
    tokensByColumn.set(col.key, col.tokens)
  }

  // Find primary column (column with most unique Y positions/rows)
  let primaryColumnKey: string | null = null
  let maxRows = 0
  // Use ROW_TOLERANCE for consistent row detection
  const Y_THRESHOLD = ROW_TOLERANCE
  
  for (const column of template.columns) {
    const tokens = tokensByColumn.get(column.columnKey) || []
    
    // Count unique Y positions (rows) in this column
    const uniqueYs = new Set<number>()
    for (const token of tokens) {
      const roundedY = Math.round(token.y / Y_THRESHOLD) * Y_THRESHOLD
      uniqueYs.add(roundedY)
    }
    
    if (uniqueYs.size > maxRows) {
      maxRows = uniqueYs.size
      primaryColumnKey = column.columnKey
    }
  }

  if (!primaryColumnKey) {
    console.log("🔍 [extractTableData] No primary column found")
    return []
  }

  // Get primary column tokens and build rows with Y positions
  const primaryTokens = tokensByColumn.get(primaryColumnKey) || []
  const mergedPrimaryWords = mergeConnectedWords(primaryTokens)
  
  // Group primary words by Y position
  const primaryWordRows = groupWordsByY(mergedPrimaryWords, Y_THRESHOLD)
  
  // Build primary rows with Y positions
  const primaryRowsWithY = primaryWordRows.map((wordRow, index) => {
    const avgY = wordRow.words.length > 0
      ? wordRow.words.reduce((sum, w) => sum + (w.y || 0), 0) / wordRow.words.length
      : wordRow.y
    
    return {
      y: avgY,
      index,
      words: wordRow.words,
    }
  })

  // Apply fieldType formatting to each column and store with Y positions
  const formattedColumnsWithY = new Map<string, Array<{y: number, text: string}>>()
  
  for (const column of template.columns) {
    const columnKey = column.columnKey
    const fieldType = column.fieldType || FIELD_TYPES.NORMAL_TEXT
    const columnTokens = tokensByColumn.get(columnKey) || []
    
    if (columnTokens.length === 0) {
      // No tokens - use default value for all rows
      formattedColumnsWithY.set(columnKey, primaryRowsWithY.map(() => ({
        y: 0,
        text: column.defaultValue || ""
      })))
      continue
    }
    
    // Merge connected words
    const mergedWords = mergeConnectedWords(columnTokens)
    
    // Sort words by Y (top → bottom), then X (left → right)
    // IMPORTANT: Use ROW_TOLERANCE to determine if words are on the same row
    const sortedWords = [...mergedWords].sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y)
      if (yDiff > ROW_TOLERANCE) {
        return a.y - b.y // Different rows - sort by Y (top → bottom)
      }
      return a.x - b.x // Same row - sort by X (left → right)
    })
    
    // Group words by Y position
    const wordRows = groupWordsByY(sortedWords, Y_THRESHOLD)
    
    // Format each word row using mergeGroupLines logic
    const formattedRows: Array<{y: number, text: string}> = []
    
    for (const wordRow of wordRows) {
      // Format using mergeGroupLines (respects fieldType)
      // Convert words to lines format expected by mergeGroupLines
      const wordsAsLines = wordRow.words.map((word) => ({
        text: word.text,
        x: word.x,
        y: word.y,
        w: word.w,
        h: word.h,
      }))
      const formattedText = mergeGroupLines(wordsAsLines, fieldType)
      
      // Calculate average Y position
      const avgY = wordRow.words.length > 0
        ? wordRow.words.reduce((sum, w) => sum + (w.y || 0), 0) / wordRow.words.length
        : wordRow.y
      
      formattedRows.push({
        y: avgY,
        text: formattedText,
      })
    }
    
    formattedColumnsWithY.set(columnKey, formattedRows)
  }

  // For each primary row, find matching formatted values from other columns
  const formattedRows = primaryRowsWithY.map((primaryRow) => {
    const formattedRow: TableRow = {}
    const primaryY = primaryRow.y

    for (const column of template.columns) {
      const columnKey = column.columnKey
      
      if (columnKey === primaryColumnKey) {
        // Primary column - format primary row words
        const fieldType = column.fieldType || FIELD_TYPES.NORMAL_TEXT
        // Convert words to lines format expected by mergeGroupLines
        const primaryWordsAsLines = primaryRow.words.map((word) => ({
          text: word.text,
          x: word.x,
          y: word.y,
          w: word.w,
          h: word.h,
        }))
        formattedRow[columnKey] = mergeGroupLines(primaryWordsAsLines, fieldType)
      } else {
        // Other columns - find formatted row with matching Y position
        const formattedRowsWithY = formattedColumnsWithY.get(columnKey) || []
        
        // Find exact match first
        let matchedRow = formattedRowsWithY.find(fr => Math.abs(fr.y - primaryY) <= yTolerance)
        
        // If no exact match, find closest
        if (!matchedRow && formattedRowsWithY.length > 0) {
          const distances = formattedRowsWithY.map(fr => ({
            ...fr,
            distance: Math.abs(fr.y - primaryY)
          }))
          distances.sort((a, b) => a.distance - b.distance)
          
          // Only use if very close
          if (distances[0].distance <= yTolerance) {
            matchedRow = distances[0]
          }
        }
        
        formattedRow[columnKey] = matchedRow?.text || column.defaultValue || ""
      }
    }
    
    return formattedRow
  })

  return formattedRows
}

/**
 * Helper: Group words by Y position (rows)
 * 
 * IMPORTANT: This function ensures proper row ordering:
 * 1. Sort words by Y (top → bottom), then X (left → right)
 * 2. Group words with similar Y positions (within ROW_TOLERANCE) into rows
 * 3. Sort words within each row by X (left → right)
 * 
 * This ensures records start from the top row, not from the middle of the page.
 */
function groupWordsByY(
  words: Array<{ x: number; y: number; text: string; w?: number; h?: number }>,
  yThreshold: number
): Array<{ y: number; words: typeof words }> {
  if (!words || words.length === 0) {
    return []
  }
  
  // Step 1: Sort words by Y (top → bottom), then X (left → right)
  // IMPORTANT: Use ROW_TOLERANCE to determine if words are on the same row
  const sortedWords = [...words].sort((a, b) => {
    const yA = a.y || 0
    const yB = b.y || 0
    const yDiff = Math.abs(yA - yB)
    
    if (yDiff > ROW_TOLERANCE) {
      return yA - yB // Different rows - sort by Y (top → bottom)
    }
    return (a.x || 0) - (b.x || 0) // Same row - sort by X (left → right)
  })
  
  // Step 2: Group words into rows based on Y proximity
  const wordRows: Array<{ y: number; words: typeof words }> = []
  let currentWordRow: { y: number; words: typeof words } | null = null
  
  for (const word of sortedWords) {
    const wordY = word.y || 0
    
    // Check if word belongs to current row (within Y threshold)
    if (!currentWordRow || Math.abs(wordY - currentWordRow.y) > yThreshold) {
      // Start new row
      if (currentWordRow) {
        // Sort words in current row by X (left → right) before adding to rows
        currentWordRow.words.sort((a, b) => (a.x || 0) - (b.x || 0))
        wordRows.push(currentWordRow)
      }
      currentWordRow = { y: wordY, words: [word] }
    } else {
      // Add word to current row
      currentWordRow.words.push(word)
    }
  }
  
  // Add last row
  if (currentWordRow) {
    // Sort words in last row by X (left → right)
    currentWordRow.words.sort((a, b) => (a.x || 0) - (b.x || 0))
    wordRows.push(currentWordRow)
  }
  
  // Log row information for debugging
  if (wordRows.length > 0) {
    const firstRowY = wordRows[0].y
    const lastRowY = wordRows[wordRows.length - 1].y
    const firstRowPreview = wordRows[0].words.slice(0, 3).map(w => w.text).join(" ")
    console.log(`📄 [RowSort] rows=${wordRows.length}, firstRowY=${firstRowY}, lastRowY=${lastRowY}, firstRowPreview="${firstRowPreview}..."`)
  }
  
  return wordRows
}
