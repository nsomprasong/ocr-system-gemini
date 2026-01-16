// document-engine/05_exportExcel.ts
// ---------------------------------------------------------------------------
// Stage 5: Export validated records to an Excel file.
//
// Responsibility:
// - รับ records ที่ผ่าน validate แล้ว จาก Stage 4
// - แปลงเป็นไฟล์ Excel (.xlsx) 1 workbook / 1 sheet ชื่อ "data"
// - 1 record = 1 row, header มาจาก columns, ลำดับ column ตาม columns
// - ไม่ทำ merge cell, ไม่ group row, ไม่ styling ซับซ้อน
//
// หมายเหตุ:
// - โมดูลนี้ไม่รู้จัก Gemini, OCR หรือ UI
// - ทำหน้าที่แค่ "แปลงข้อมูลเป็น Excel" และคืนเป็น Buffer เท่านั้น

import * as XLSX from "xlsx";

// NOTE: เพื่อไม่ต้องพึ่ง @types/node เรานิยาม Buffer เป็น interface บางเบา
// ซึ่ง compatible กับ Uint8Array ใน runtime ส่วนใหญ่ (เช่น browser/Node)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Buffer extends Uint8Array {}

export interface ExportColumnDefinition {
  /** Column key used to map from record fields. */
  key: string;
  /** Human-readable header text to show in Excel. */
  header: string;
}

export interface ExportExcelRequest {
  /** Cleaned records from Stage 4. */
  records: Array<Record<string, string>>;
  /** Column ordering and header labels. */
  columns: ExportColumnDefinition[];
  /** Optional file name hint (without extension). */
  fileNameHint?: string;
}

export interface ExportExcelResult {
  /**
   * Placeholder for Excel file content.
   * In a real implementation this could be:
   * - ArrayBuffer / Uint8Array
   * - base64 string
   * - or a stream handle on the server
   */
  content: string;
  /** Suggested file name, including extension. */
  suggestedFileName: string;
  /** Arbitrary metadata (e.g., row count, column count). */
  metadata: Record<string, unknown>;
}

/**
 * Exports records into an Excel-ready representation.
 *
 * Placeholder implementation:
 * - ไม่สร้างไฟล์จริง
 * - คืนค่า content เป็น string เปล่า ๆ และ metadata ขั้นพื้นฐาน
 */
export async function exportToExcel(
  request: ExportExcelRequest
): Promise<ExportExcelResult> {
  // TODO: Implement real Excel generation using a suitable library.
  const rowCount = request.records.length;
  const columnCount = request.columns.length;

  return {
    content: "",
    suggestedFileName: `${request.fileNameHint || "document"}.xlsx`,
    metadata: {
      placeholder: true,
      rowCount,
      columnCount,
    },
  };
}

// ---------------------------------------------------------------------------
// New API: exportRecordsToExcel(records, columns) → Buffer
// ---------------------------------------------------------------------------

/**
 * แปลง records ที่ผ่านการ validate แล้วให้เป็นไฟล์ Excel (.xlsx) ในรูปแบบ Buffer
 *
 * กติกา:
 * - 1 record = 1 row
 * - columns เป็นลำดับคอลัมน์ (และ header)
 * - cell เป็น primitive เท่านั้น (string/number/boolean จะถูกเขียนตรง ๆ)
 * - ห้าม merge cell, ห้าม group row, ไม่ทำ styling ซับซ้อน
 *
 * หมายเหตุ:
 * - ฟังก์ชันนี้ไม่ทำ validation ซ้ำ และไม่รู้จัก Gemini/OCR/Excel UI
 * - ถ้า records ว่าง จะยังคงสร้างไฟล์ที่มีแต่ header
 */
export async function exportRecordsToExcel(
  records: any[],
  columns: string[]
): Promise<Buffer> {
  const safeRecords = Array.isArray(records) ? records : [];
  const safeColumns = Array.isArray(columns) ? columns : [];

  // เตรียมข้อมูลแบบ Array-of-Arrays สำหรับสร้าง worksheet
  const sheetData: any[][] = [];

  // Header row: ใช้ columns ตรง ๆ เป็นชื่อคอลัมน์
  sheetData.push(safeColumns);

  // Data rows: 1 record = 1 row, เรียงคอลัมน์ตาม safeColumns
  for (const record of safeRecords) {
    const row = safeColumns.map((colKey) => {
      if (!record) return "";
      const value = record[colKey];

      if (value === null || value === undefined) {
        return "";
      }

      const t = typeof value;
      if (t === "string" || t === "number" || t === "boolean") {
        return value;
      }

      // ถ้าเป็นชนิดอื่น (เช่น object/array) ให้แปลงเป็น string แบบปลอดภัย
      try {
        return String(value);
      } catch {
        return "";
      }
    });

    sheetData.push(row);
  }

  // สร้าง workbook และ sheet ชื่อ "data"
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "data");

  // เขียน workbook เป็น Uint8Array (type: "array")
  const out = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as Uint8Array;

  // แปลงเป็น Buffer (interface ด้านบน compatible กับ Uint8Array)
  return out as Buffer;
}

