/**
 * OCR Table Alignment System
 * 
 * CORE CONCEPT:
 * - OCR already provides tokens with x, y, text
 * - OCR segmentation is trusted
 * - Job is ONLY to align data into a table
 * 
 * GOLDEN RULES:
 * - Use the column that has the MOST rows (by Y-axis) as the PRIMARY COLUMN
 * - PRIMARY COLUMN defines ALL rows in the table
 * - NEVER create new rows from other columns
 * - NEVER merge data across different Y rows
 * - If Y does not match → DO NOT INSERT
 */

const Y_TOLERANCE = 10  // pixels - tolerance for same row

/**
 * Groups OCR tokens by X-axis into columns
 * 
 * Algorithm:
 * 1. Sort tokens by X (left to right)
 * 2. Group tokens that are close in X (within threshold)
 * 3. Each group becomes a column
 * 
 * @param {Array} tokens - OCR tokens with x, y, text, w, h
 * @param {number} xThreshold - X-axis tolerance for same column (default: 50px)
 * @returns {Array} Array of columns [{ x, tokens[] }]
 */
export function groupTokensByColumn(tokens, xThreshold = 50) {
  if (!tokens || tokens.length === 0) {
    return []
  }

  // Sort tokens by X (left to right)
  const sortedTokens = [...tokens].sort((a, b) => a.x - b.x)

  const columns = []
  let currentColumn = null

  for (const token of sortedTokens) {
    if (!currentColumn) {
      // Start first column
      currentColumn = {
        x: token.x,
        tokens: [token],
      }
    } else {
      // Check if token belongs to current column
      const columnRight = Math.max(...currentColumn.tokens.map(t => t.x + t.w))
      const distanceX = token.x - columnRight

      if (distanceX <= xThreshold) {
        // Same column - add to current column
        currentColumn.tokens.push(token)
        // Update column X to average or leftmost
        currentColumn.x = Math.min(currentColumn.x, token.x)
      } else {
        // New column - save current and start new
        columns.push(currentColumn)
        currentColumn = {
          x: token.x,
          tokens: [token],
        }
      }
    }
  }

  // Don't forget the last column
  if (currentColumn) {
    columns.push(currentColumn)
  }

  // Sort columns by X (left to right)
  columns.sort((a, b) => a.x - b.x)

  return columns
}

/**
 * Detects the primary column (column with most Y rows)
 * 
 * @param {Array} columns - Array of columns
 * @returns {Object|null} The column with the most unique Y positions
 */
export function detectPrimaryColumn(columns) {
  if (!columns || columns.length === 0) {
    return null
  }

  let maxRows = 0
  let primaryColumn = null

  for (const column of columns) {
    // Count unique Y positions (rows) in this column
    const uniqueYs = new Set()
    
    for (const token of column.tokens) {
      // Group Y positions within tolerance
      let matched = false
      for (const existingY of uniqueYs) {
        if (Math.abs(token.y - existingY) <= Y_TOLERANCE) {
          matched = true
          break
        }
      }
      if (!matched) {
        uniqueYs.add(token.y)
      }
    }

    const rowCount = uniqueYs.size

    if (rowCount > maxRows) {
      maxRows = rowCount
      primaryColumn = column
    }
  }

  return primaryColumn
}

/**
 * Builds primary rows from primary column tokens
 * Groups tokens by Y and extracts text for each row
 * 
 * @param {Object} primaryColumn - The primary column
 * @returns {Array} Array of rows [{ y, text }]
 */
export function buildPrimaryRows(primaryColumn) {
  if (!primaryColumn || !primaryColumn.tokens || primaryColumn.tokens.length === 0) {
    return []
  }

  // Group tokens by Y (within tolerance)
  const rowGroups = new Map()

  for (const token of primaryColumn.tokens) {
    // Find existing row Y that matches (within tolerance)
    let matchedY = null
    
    for (const existingY of rowGroups.keys()) {
      if (Math.abs(token.y - existingY) <= Y_TOLERANCE) {
        matchedY = existingY
        break
      }
    }

    if (matchedY !== null) {
      // Add to existing row
      rowGroups.get(matchedY).push(token)
    } else {
      // Create new row
      rowGroups.set(token.y, [token])
    }
  }

  // Convert to PrimaryRow array, sorted by Y (top to bottom)
  const rows = []
  
  for (const [y, tokens] of rowGroups.entries()) {
    // Sort tokens in row by X (left to right)
    const sortedTokens = [...tokens].sort((a, b) => a.x - b.x)
    
    // Join text with spaces
    const text = sortedTokens
      .map(t => t.text.trim())
      .filter(Boolean)
      .join(" ")

    rows.push({ y, text })
  }

  // Sort by Y (top to bottom)
  rows.sort((a, b) => a.y - b.y)

  return rows
}

/**
 * Fills a column by matching token Y positions to existing primary rows
 * 
 * Rules:
 * - Only inserts data when token.y matches an existing row.y (within tolerance)
 * - Never creates new rows
 * - Returns array of cell values (one per primary row)
 * 
 * @param {Array} primaryRows - Array of primary rows (from buildPrimaryRows)
 * @param {Array} columnTokens - Tokens from the column to fill
 * @returns {Array} Array of cell values (one per primary row, empty string if no match)
 */
export function fillColumnByYMatch(primaryRows, columnTokens) {
  if (!primaryRows || primaryRows.length === 0) {
    return []
  }

  // Initialize result array with empty strings (one per primary row)
  const result = new Array(primaryRows.length).fill("")

  // For each column token, find matching primary row
  for (const token of columnTokens) {
    // Find primary row with matching Y (within tolerance)
    for (let i = 0; i < primaryRows.length; i++) {
      const primaryRow = primaryRows[i]
      
      if (Math.abs(token.y - primaryRow.y) <= Y_TOLERANCE) {
        // Match found - append text to this cell
        if (result[i]) {
          // Cell already has text - append with space
          result[i] = `${result[i]} ${token.text.trim()}`.trim()
        } else {
          // First token for this cell
          result[i] = token.text.trim()
        }
        // Token matched - no need to check other rows
        break
      }
    }
    // If no match found, token is skipped (not inserted)
  }

  return result
}

/**
 * Converts a percentage-based zone to absolute pixel coordinates
 */
function zoneToAbsolute(zone, pageWidth, pageHeight) {
  return {
    x: zone.x * pageWidth,
    y: zone.y * pageHeight,
    w: zone.w * pageWidth,
    h: zone.h * pageHeight,
  }
}

/**
 * Checks if a word's bounding box intersects or is inside a zone
 */
function wordInZone(word, zoneAbs) {
  const wordLeft = word.x
  const wordTop = word.y
  const wordRight = word.x + word.w
  const wordBottom = word.y + word.h

  const zoneLeft = zoneAbs.x
  const zoneTop = zoneAbs.y
  const zoneRight = zoneAbs.x + zoneAbs.w
  const zoneBottom = zoneAbs.y + zoneAbs.h

  return !(
    wordRight < zoneLeft ||
    wordLeft > zoneRight ||
    wordBottom < zoneTop ||
    wordTop > zoneBottom
  )
}

/**
 * Groups tokens by template zones (columns)
 * 
 * @param {Array} tokens - OCR tokens
 * @param {Array} zones - Template zones with percentage-based coordinates
 * @param {number} pageWidth - Page width in pixels
 * @param {number} pageHeight - Page height in pixels
 * @returns {Array} Array of columns [{ key, tokens[] }]
 */
export function groupTokensByZones(tokens, zones, pageWidth, pageHeight) {
  const columns = []

  for (const templateZone of zones) {
    const zoneAbs = zoneToAbsolute(templateZone.zone, pageWidth, pageHeight)
    const tokensInZone = tokens.filter((word) => wordInZone(word, zoneAbs))

    columns.push({
      key: templateZone.key,
      tokens: tokensInZone,
    })
  }

  return columns
}

/**
 * Builds preview table from OCR tokens using template zones
 * 
 * Algorithm:
 * 1. Group tokens by zones (columns)
 * 2. Detect primary column (most rows)
 * 3. Build primary rows from primary column
 * 4. Fill other columns by Y-match
 * 
 * @param {Array} tokens - OCR tokens with x, y, text, w, h
 * @param {Array} zones - Template zones with percentage-based coordinates
 * @param {number} pageWidth - Page width in pixels
 * @param {number} pageHeight - Page height in pixels
 * @returns {Array} Array of table rows (one per primary row)
 */
export function buildPreviewTable(tokens, zones, pageWidth, pageHeight) {
  console.log("🔍 [buildPreviewTable] Input:", {
    tokensCount: tokens?.length || 0,
    zonesCount: zones?.length || 0,
    zones: zones.map(z => ({ key: z.key, zone: z.zone })),
    pageSize: { width: pageWidth, height: pageHeight },
  })

  if (!tokens || tokens.length === 0 || !zones || zones.length === 0) {
    console.warn("⚠️ [buildPreviewTable] Empty input:", {
      hasTokens: !!tokens,
      tokensLength: tokens?.length || 0,
      hasZones: !!zones,
      zonesLength: zones?.length || 0,
    })
    return []
  }

  // Step 1: Group tokens by zones (columns)
  const columns = groupTokensByZones(tokens, zones, pageWidth, pageHeight)
  console.log("📊 [buildPreviewTable] Columns after grouping:", {
    columnsCount: columns.length,
    columns: columns.map(col => ({
      key: col.key,
      tokensCount: col.tokens.length,
      sampleTokens: col.tokens.slice(0, 3).map(t => t.text),
    })),
  })

  if (columns.length === 0) {
    console.warn("⚠️ [buildPreviewTable] No columns found after grouping")
    return []
  }

  // Step 2: Detect primary column (convert to Column format for detectPrimaryColumn)
  const columnObjects = columns.map(col => ({
    x: col.tokens.length > 0 ? Math.min(...col.tokens.map(t => t.x)) : 0,
    tokens: col.tokens,
  }))

  const primaryColumnObj = detectPrimaryColumn(columnObjects)
  console.log("🎯 [buildPreviewTable] Primary column:", {
    found: !!primaryColumnObj,
    tokensCount: primaryColumnObj?.tokens.length || 0,
  })

  if (!primaryColumnObj) {
    console.warn("⚠️ [buildPreviewTable] No primary column detected")
    return []
  }

  // Find which zone column is the primary
  const primaryColumnIndex = columnObjects.findIndex(col => col === primaryColumnObj)
  if (primaryColumnIndex === -1) {
    console.warn("⚠️ [buildPreviewTable] Primary column index not found")
    return []
  }

  const primaryColumn = columns[primaryColumnIndex]
  console.log("✅ [buildPreviewTable] Primary column key:", primaryColumn.key)

  // Step 3: Build primary rows
  const primaryRows = buildPrimaryRows(primaryColumnObj)
  console.log("📋 [buildPreviewTable] Primary rows:", {
    rowsCount: primaryRows.length,
    sampleRows: primaryRows.slice(0, 3).map(r => ({ y: r.y, text: r.text })),
  })

  if (primaryRows.length === 0) {
    console.warn("⚠️ [buildPreviewTable] No primary rows built")
    return []
  }

  // Step 4: Build table rows
  const tableRows = []

  // Pre-compute cell values for all columns (except primary)
  const columnCellValues = new Map()
  
  for (const column of columns) {
    if (column !== primaryColumn) {
      // Fill by Y-match (compute once per column)
      const cellValues = fillColumnByYMatch(primaryRows, column.tokens)
      columnCellValues.set(column.key, cellValues)
    }
  }

  // Create one row per primary row
  for (let i = 0; i < primaryRows.length; i++) {
    const row = {}

    // Fill all columns
    for (const column of columns) {
      if (column === primaryColumn) {
        // Primary column - use primary row text
        row[column.key] = primaryRows[i].text
      } else {
        // Other columns - use pre-computed cell values
        const cellValues = columnCellValues.get(column.key) || []
        row[column.key] = cellValues[i] || ""
      }
    }

    tableRows.push(row)
  }

  return tableRows
}
