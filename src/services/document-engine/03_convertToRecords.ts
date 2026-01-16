// document-engine/03_convertToRecords.ts
// ---------------------------------------------------------------------------
// Stage 3: Convert analyzed document into flat records.
//
// Responsibility (version ล่าสุดสำหรับ document-engine):
// - ใช้ข้อความดิบจาก OCR + สรุปโครงสร้างเอกสาร (จาก Pass #1)
// - เรียก Gemini ให้ช่วย "แปลง" ข้อความเป็น JSON records แบบ flat
// - 1 คน = 1 record, 1 record = 1 object ตาม column ที่กำหนด
// - ไม่รู้จัก UI หรือ Excel, ทำหน้าที่แค่แปลง text → records เท่านั้น

export interface ConvertToRecordsRequest {
  /** Plain text from Stage 1. */
  text: string;
  /** Structural summary from Stage 2. */
  structure: {
    documentType: string;
    recordDefinition: string;
    repeatingPatterns?: string[];
    sharedValues?: string[];
    headerFooter?: string;
    dataRelationships?: string;
    confidence?: "low" | "medium" | "high";
    [key: string]: unknown;
  };
  /** Optional hint for expected column keys (e.g. from template or config). */
  expectedColumns?: string[];
}

export interface DocumentRecord {
  /** Flat key-value pairs representing one logical record. */
  [key: string]: string;
}

export interface ConvertToRecordsResult {
  /** List of flat records extracted from the document. */
  records: DocumentRecord[];
  /** Any warnings or hints for validation/preview stages. */
  warnings: string[];
  /** Metadata bag. */
  metadata: Record<string, unknown>;
}

/**
 * Converts plain text + structural summary into a list of flat records.
 *
 * Placeholder implementation:
 * - ไม่แปลงข้อมูลจริง
 * - คืน array ว่างและ metadata สำหรับให้ flow ทั้งหมดทำงานต่อได้
 */
export async function convertToRecords(
  request: ConvertToRecordsRequest
): Promise<ConvertToRecordsResult> {
  // TODO: Implement semantic parsing and record extraction logic in the future.
  return {
    records: [],
    warnings: [
      "convertToRecords is currently a placeholder and returned no records.",
    ],
    metadata: {
      placeholder: true,
      expectedColumns: request.expectedColumns ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// Gemini-based conversion (convertTextToRecords)
// ---------------------------------------------------------------------------

// ประกาศ type บางเบาสำหรับ process.env เพื่อไม่ต้องอิง @types/node
declare const process: {
  env: Record<string, string | undefined>;
};

const GEMINI_MODEL_NAME = "gemini-1.5-flash";
const GEMINI_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * สร้าง prompt ภาษาไทยสำหรับให้ Gemini แปลงข้อความ OCR → JSON records
 * โดยใช้โครงสร้างเอกสาร (structureSummary) และ columns ที่ต้องการ
 */
function buildConversionPrompt(
  text: string,
  structureSummary: string,
  columns: string[]
): string {
  const MAX_TEXT_LENGTH = 100_000;
  const truncatedText =
    text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  const columnsList =
    columns && columns.length
      ? columns.map((c) => `- ${c}`).join("\n")
      : "- (ไม่มี column ที่ระบุมา)";

  return (
    "คุณคือระบบแปลงเอกสารราชการเป็นข้อมูลตาราง\n\n" +
    "โครงสร้างเอกสาร:\n" +
    structureSummary +
    "\n\n" +
    "กติกาเด็ดขาด:\n" +
    "- 1 คน = 1 record เท่านั้น\n" +
    "- 1 record = 1 object\n" +
    "- ห้ามรวมหลายชื่อใน object เดียว\n" +
    "- ห้ามสร้าง Group\n" +
    "- ห้าม nested object หรือ array\n" +
    "- ห้ามเดาข้อมูล\n" +
    '- ถ้าข้อมูลไม่ชัด → ใส่ "" (string ว่าง)\n' +
    "- ห้ามแก้ไขตัวเลขหรือสะกดชื่อจากที่ปรากฏในเอกสาร\n\n" +
    "Semantic rule สำคัญ:\n" +
    "- บ้านเลขที่อาจปรากฏเพียงครั้งเดียว\n" +
    "- ให้ใช้กับรายชื่อถัดไปทั้งหมด\n" +
    "- จนกว่าจะพบบ้านเลขที่ใหม่\n\n" +
    "column ที่ต้องใช้ (key ของ JSON ต้องตรงตามนี้เท่านั้น):\n" +
    columnsList +
    "\n\n" +
    "กติกาการตอบ:\n" +
    "- ตอบเป็น JSON array เท่านั้น\n" +
    "- ห้ามมีข้อความอื่นก่อนหรือหลัง JSON\n" +
    "- ห้ามอธิบาย ห้ามใส่คำอธิบายประกอบ หรือ comment ใด ๆ\n\n" +
    "===== ข้อความจากเอกสาร (เริ่ม) =====\n" +
    truncatedText +
    "\n===== ข้อความจากเอกสาร (จบ) =====\n"
  );
}

/**
 * เรียก Gemini ผ่าน REST API (generateContent) ด้วย prompt ที่เตรียมไว้
 * - ใช้ model Flash/Flash-Lite ตาม requirement
 * - ถ้าไม่มี GEMINI_API_KEY → throw error ทันที
 */
async function callGeminiForConversion(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("GEMINI_API_KEY is not set in process.env");
  }

  const url = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(
    GEMINI_MODEL_NAME
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Gemini HTTP error ${response.status}: ${errorText.substring(0, 500)}`
    );
  }

  const data: any = await response.json();
  const candidates: any[] = data.candidates || [];
  if (!candidates.length) {
    throw new Error("Gemini returned no candidates");
  }

  const first = candidates[0];
  const parts: any[] = first?.content?.parts || [];

  const combinedText = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();

  if (!combinedText) {
    throw new Error("Gemini returned empty content");
  }

  return combinedText;
}

/**
 * ตรวจรูปแบบของ JSON records ตามกติกา:
 * - ต้อง parse เป็น array ได้
 * - ทุก element ต้องเป็น object ธรรมดา (ไม่ใช่ array / primitive)
 * - ห้ามมี key นอกเหนือจาก columns ที่กำหนด
 * - ห้ามมี nested object หรือ array (ทุก value ต้องไม่ใช่ object/array ยกเว้น null/primitive)
 *
 * หมายเหตุ: นี่คือการตรวจรูปแบบขั้นต่ำ (format-level) ไม่ใช่ business validation
 */
function parseAndValidateRecordsShape(
  rawJson: string,
  allowedColumns: string[]
): any[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(
      `Failed to parse Gemini output as JSON: ${(err as Error).message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini output is not a JSON array");
  }

  const result: any[] = [];
  const allowedSet = new Set(allowedColumns);

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];

    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `Record at index ${i} is not a plain object (found ${Array.isArray(item) ? "array" : typeof item})`
      );
    }

    const record: any = item as any;

    for (const key of Object.keys(record)) {
      if (!allowedSet.has(key)) {
        throw new Error(
          `Record at index ${i} has unexpected key "${key}" not in allowed columns`
        );
      }

      const value = record[key];
      const valueType = typeof value;

      if (value !== null && valueType === "object") {
        // object หรือ array ภายใน value ห้ามใช้
        throw new Error(
          `Record at index ${i} has nested object/array at key "${key}"`
        );
      }
    }

    result.push(record);
  }

  return result;
}

/**
 * แปลงข้อความ OCR เป็น JSON records โดยใช้ Gemini (Pass #2)
 *
 * หน้าที่:
 * - รับ text ดิบ, structureSummary (ผลจาก Pass #1) และ columns ที่ UI ต้องการ
 * - เรียก Gemini ให้สร้าง JSON array ของ flat objects ตาม columns
 * - ตรวจแค่ "รูปแบบ" ของ JSON ให้เป็นไปตามกติกาเบื้องต้น (ไม่ใช่ business validation)
 *
 * ข้อจำกัดสำคัญ:
 * - ห้ามรู้จัก UI หรือ Excel
 * - ห้ามทำ validation เชิง business (เช่น ชื่อต้องไม่ว่าง ฯลฯ)
 * - ถ้า output ผิดรูปแบบตามกติกา → throw error ทันที
 */
export async function convertTextToRecords(
  text: string,
  structureSummary: string,
  columns: string[]
): Promise<any[]> {
  const inputText = text ?? "";
  const summary = structureSummary ?? "";
  const cols = columns ?? [];

  if (!inputText.trim()) {
    throw new Error("convertTextToRecords: input text is empty");
  }
  if (!cols.length) {
    throw new Error("convertTextToRecords: columns must not be empty");
  }

  const prompt = buildConversionPrompt(inputText, summary, cols);
  const rawOutput = await callGeminiForConversion(prompt);

  // ไม่แตะเนื้อหา นอกจากการตรวจว่าเป็น JSON array flat objects ตาม columns
  const records = parseAndValidateRecordsShape(rawOutput, cols);

  return records;
}

