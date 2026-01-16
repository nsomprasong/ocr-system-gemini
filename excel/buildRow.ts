import type { OCRResult } from "../core/types"
import type { Template } from "../template/template.schema"
import { extractTableData } from "../src/utils/extractTableData"

/**
 * Builds Excel rows from OCR result and template.
 * 
 * If Smart OCR result is available, uses it directly (semantic understanding).
 * Otherwise, uses primary column alignment (template layout).
 * 
 * @param ocrResult - OCR result with words and page dimensions (may include smartOcrResult)
 * @param template - Template with column definitions and zones
 * @returns Array of table rows (one per primary row)
 */
export function buildRows(ocrResult: OCRResult, template: Template): Array<Record<string, string>> {
  // Check if Smart OCR result is available
  if (ocrResult.smartOcrResult && ocrResult.smartOcrResult.records) {
    console.log(`🤖 [buildRows] Using Smart OCR result: ${ocrResult.smartOcrResult.records.length} records`);
    console.log(`🤖 [buildRows] Source: ${ocrResult.smartOcrResult.metadata.source}, Confidence: ${ocrResult.smartOcrResult.metadata.confidence}`);
    
    // Use Smart OCR records directly
    // Map records to template columns (ensure all columnKeys are present)
    const mappedRows = ocrResult.smartOcrResult.records.map((record) => {
      const row: Record<string, string> = {};
      
      // Map each template column
      for (const column of template.columns) {
        const columnKey = column.columnKey;
        
        // Use value from Smart OCR record if available
        if (record[columnKey] !== undefined && record[columnKey] !== null) {
          row[columnKey] = String(record[columnKey]);
        } else {
          // Use default value or empty string
          row[columnKey] = column.defaultValue || "";
        }
      }
      
      return row;
    });
    
    console.log(`✅ [buildRows] Mapped ${mappedRows.length} rows from Smart OCR`);
    return mappedRows;
  }
  
  // Fallback: Use traditional template-based extraction (primary column alignment)
  console.log(`📐 [buildRows] Using template-based extraction (primary column alignment)`);
  return extractTableData(
    ocrResult,
    template,
    {
      mode: "export",
      yTolerance: 15, // Strict tolerance for export
    }
  )
}

/**
 * Builds a single Excel row from OCR result and template.
 * 
 * DEPRECATED: This function creates only one row per file.
 * Use buildRows() instead for proper multi-row alignment.
 * 
 * @param ocrResult - OCR result with words and page dimensions
 * @param template - Template with column definitions and zones
 * @returns Plain object representing one Excel row (columnKey -> cell value)
 * @deprecated Use buildRows() instead
 */
export function buildRow(ocrResult: OCRResult, template: Template): Record<string, string> {
  // For backward compatibility, return first row from buildRows
  const rows = buildRows(ocrResult, template)
  
  if (rows.length === 0) {
    // No rows - return empty row
    const emptyRow: Record<string, string> = {}
    for (const column of template.columns) {
      emptyRow[column.columnKey] = ""
    }
    return emptyRow
  }

  // Return first row (for backward compatibility)
  return rows[0]
}
