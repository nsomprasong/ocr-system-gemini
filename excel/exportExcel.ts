import * as XLSX from "xlsx"
import type { OCRResult } from "../core/types"
import type { Template } from "../template/template.schema"
import { buildRows } from "./buildRow"

/**
 * Generates filename for single file export.
 * Format: <source_filename>.xlsx
 */
function getSingleFileFilename(ocrResult: OCRResult): string {
  const baseName = ocrResult.fileName.replace(/\.[^/.]+$/, "") // Remove extension
  return `${baseName}.xlsx`
}

/**
 * Generates filename for batch export.
 * Format: ocr_export_<timestamp>.xlsx
 */
function getBatchFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5) // YYYY-MM-DDTHH-MM-SS
  return `ocr_export_${timestamp}.xlsx`
}

/**
 * Exports OCR results to Excel file.
 * One scanned file = one row.
 * 
 * @param ocrResults - Array of OCR results (one per scanned file)
 * @param template - Template with column definitions
 * @param filename - Optional custom filename. If not provided, uses auto-generated name
 */
export function exportExcel(
  ocrResults: OCRResult[],
  template: Template,
  filename?: string
): void {
  if (ocrResults.length === 0) {
    throw new Error("No OCR results to export")
  }

  // Generate filename if not provided
  if (!filename) {
    if (ocrResults.length === 1) {
      // Single file: <source_filename>.xlsx
      filename = getSingleFileFilename(ocrResults[0])
    } else {
      // Batch scan: ocr_export_<timestamp>.xlsx
      filename = getBatchFilename()
    }
  }

  // Build rows: one OCR result may produce multiple rows (based on primary column)
  const allRows: Array<Record<string, string>> = []
  for (const ocrResult of ocrResults) {
    const rowsFromFile = buildRows(ocrResult, template)
    allRows.push(...rowsFromFile)
  }
  const rows = allRows

  // Create workbook
  const wb = XLSX.utils.book_new()

  // Get column headers from template
  const headers = template.columns.map((col) => col.label || col.columnKey)

  // Create worksheet with headers first
  const ws = XLSX.utils.aoa_to_sheet([headers])

  // Add data rows (starting from row 2, since row 1 is headers)
  const dataRows = rows.map((row) =>
    template.columns.map((col) => row[col.columnKey] || "")
  )
  if (dataRows.length > 0) {
    XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: "A2" })
  }

  // Set column widths (optional, default to 20)
  const colWidths = template.columns.map(() => ({ wch: 20 }))
  ws["!cols"] = colWidths

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")

  // Write file
  XLSX.writeFile(wb, filename)
}

/**
 * Exports single OCR result to Excel file.
 * Convenience function for single file export.
 * 
 * @param ocrResult - Single OCR result
 * @param template - Template with column definitions
 * @param filename - Optional custom filename. If not provided, uses <source_filename>.xlsx
 */
export function exportSingleExcel(
  ocrResult: OCRResult,
  template: Template,
  filename?: string
): void {
  exportExcel([ocrResult], template, filename)
}

/**
 * Exports multiple OCR results to Excel file (batch export).
 * Convenience function for batch export.
 * 
 * @param ocrResults - Array of OCR results
 * @param template - Template with column definitions
 * @param filename - Optional custom filename. If not provided, uses ocr_export_<timestamp>.xlsx
 */
export function exportBatchExcel(
  ocrResults: OCRResult[],
  template: Template,
  filename?: string
): void {
  if (ocrResults.length === 0) {
    throw new Error("No OCR results to export")
  }

  // Use batch filename if not provided
  if (!filename) {
    filename = getBatchFilename()
  }

  exportExcel(ocrResults, template, filename)
}
