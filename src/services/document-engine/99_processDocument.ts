// document-engine/99_processDocument.ts
// ---------------------------------------------------------------------------
// High-level pipeline orchestration for document-engine.
//
// Responsibility:
// - รับ PDF buffer + columns แล้วรันทุก stage ของ document-engine ตามลำดับที่กำหนด:
//   1) extractTextFromPdf(pdfBuffer)
//   2) analyzeDocumentStructure(text)
//   3) convertTextToRecords(text, structureSummary, columns)
//   4) validateRecords(records, columns)  → ถ้า false → throw error
//   5) exportRecordsToExcel(records, columns)
//
// ข้อสำคัญ:
// - ห้ามแก้ logic ภายในของแต่ละ stage
// - pipeline ต้องเป็น linear เท่านั้น
// - ถ้า step ใด throw → throw ต่อทันที (แค่ log ก่อนเพื่อ debug)

// NOTE: เพื่อให้ TypeScript compile ได้โดยไม่พึ่ง @types/node
// เรานิยาม Buffer แบบบางเบาให้ compatible กับ Uint8Array
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Buffer extends Uint8Array {}

import { extractTextFromPdf } from "./01_extractText";
import { analyzeDocumentStructure } from "./02_analyzeStructure";
import { convertTextToRecords } from "./03_convertToRecords";
import { validateRecords } from "./04_validateRecords";
import { exportRecordsToExcel } from "./05_exportExcel";

/**
 * ทำงานตาม pipeline:
 * 1) PDF buffer → clean text
 * 2) text → structure summary (bullet point string)
 * 3) text + structureSummary + columns → JSON records
 * 4) validate records ตามกติกาเชิงโครงสร้าง
 * 5) records + columns → Excel Buffer (.xlsx)
 */
export async function processDocument(
  pdfBuffer: Buffer,
  columns: string[]
): Promise<Buffer> {
  if (!pdfBuffer || pdfBuffer.byteLength === 0) {
    throw new Error("processDocument: pdfBuffer is empty");
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("processDocument: columns must be a non-empty array");
  }

  // STEP 1: extractTextFromPdf
  let text: string;
  try {
    console.log("[document-engine] Step 1: extractTextFromPdf");
    text = await extractTextFromPdf(pdfBuffer);
  } catch (err) {
    console.error("[document-engine] Step 1 failed: extractTextFromPdf", err);
    throw err;
  }

  // STEP 2: analyzeDocumentStructure
  let structureSummary: string;
  try {
    console.log("[document-engine] Step 2: analyzeDocumentStructure");
    structureSummary = await analyzeDocumentStructure(text);
  } catch (err) {
    console.error(
      "[document-engine] Step 2 failed: analyzeDocumentStructure",
      err
    );
    throw err;
  }

  // STEP 3: convertTextToRecords
  let records: any[];
  try {
    console.log("[document-engine] Step 3: convertTextToRecords");
    records = await convertTextToRecords(text, structureSummary, columns);
  } catch (err) {
    console.error(
      "[document-engine] Step 3 failed: convertTextToRecords",
      err
    );
    throw err;
  }

  // STEP 4: validateRecords
  try {
    console.log("[document-engine] Step 4: validateRecords");
    const valid = validateRecords(records, columns);
    if (!valid) {
      console.error(
        "[document-engine] Step 4 failed: validateRecords returned false"
      );
      throw new Error("processDocument: records failed validation");
    }
  } catch (err) {
    // validateRecords ไม่ควร throw ตามสัญญา, แต่เพื่อความปลอดภัย log และ throw ต่อ
    console.error("[document-engine] Step 4 encountered an error", err);
    throw err;
  }

  // STEP 5: exportRecordsToExcel
  let excelBuffer: Buffer;
  try {
    console.log("[document-engine] Step 5: exportRecordsToExcel");
    excelBuffer = await exportRecordsToExcel(records, columns);
  } catch (err) {
    console.error(
      "[document-engine] Step 5 failed: exportRecordsToExcel",
      err
    );
    throw err;
  }

  console.log(
    "[document-engine] Pipeline completed successfully. Records:",
    records.length
  );
  return excelBuffer;
}

