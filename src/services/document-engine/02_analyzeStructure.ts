// document-engine/02_analyzeStructure.ts
// ---------------------------------------------------------------------------
// Stage 2: Document structure analysis.
//
// Responsibility:
// - ฟังก์ชันนี้มีหน้าที่ "เข้าใจโครงสร้างเอกสาร" จากข้อความดิบที่ได้จาก OCR / PDF
// - เน้นการอธิบายประเภทเอกสาร, ความหมายของ 1 record, ความสัมพันธ์ของข้อมูล
// - ไม่แปลงข้อมูลเป็นตาราง, ไม่รู้จัก Excel, ไม่จัดกลุ่มหรือเดาข้อมูล
//
// Implementation (ตาม requirement ล่าสุด):
// - ใช้ Gemini Flash / Flash-Lite เพื่อวิเคราะห์เอกสาร
// - อ่าน API key จาก process.env.GEMINI_API_KEY
// - เรียก Gemini เพียงครั้งเดียว
// - คืนค่าเป็น string เดียวที่เป็น bullet point ภาษาไทยเท่านั้น
// - ถ้า output มี JSON / [] / {} / คำว่า Group / ลักษณะเป็น table → throw error
//
// หมายเหตุ:
// - โมดูลนี้เป็นส่วนหนึ่งของ document-engine (standalone)
// - ไม่ผูกกับ logic OCR / Gemini เดิม (functions/index.js ฯลฯ)

// ประกาศ type บางเบาสำหรับ process.env เพื่อไม่ต้องอิง @types/node
declare const process: {
  env: Record<string, string | undefined>;
};

// เลือกใช้ HTTP API ของ Gemini โดยตรง (ไม่ใช้ client library) เพื่อลด dependency
const GEMINI_MODEL_NAME = "gemini-1.5-flash";
const GEMINI_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * สร้าง prompt ภาษาไทยสำหรับให้ Gemini วิเคราะห์โครงสร้างเอกสาร
 * - เน้นว่า "ห้าม JSON / ห้าม table / ห้าม Group / ห้ามเดา"
 * - ขอคำตอบเป็น bullet point ภาษาไทยเท่านั้น
 */
function buildPrompt(text: string): string {
  // เพื่อความปลอดภัยด้านขนาด request: ตัดความยาว text ที่ส่งเข้าไป (เช่น 100k chars)
  const MAX_TEXT_LENGTH = 100_000;
  const truncatedText =
    text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  return (
    "คุณคือระบบวิเคราะห์เอกสารราชการไทย\n" +
    "เอกสารด้านล่างเป็นเอกสารที่ได้มาจาก OCR (อาจเป็นตารางหลายคอลัมน์ หรือบัญชีรายชื่อ)\n\n" +
    "หน้าที่ของคุณคือ:\n" +
    "1. อธิบายประเภทของเอกสารนี้คือเอกสารอะไร (เช่น บัญชีรายชื่อประชาชน, ใบลงทะเบียน, ใบแจ้งหนี้ ฯลฯ)\n" +
    "2. อธิบายให้ชัดเจนว่า \"1 record\" ในเอกสารนี้หมายถึงอะไร (เช่น 1 คน, 1 แถว, 1 สินค้า ฯลฯ)\n" +
    "3. อธิบายความสัมพันธ์ของข้อมูล เช่น:\n" +
    "   - บ้านเลขที่หรือที่อยู่ 1 บรรทัด อาจใช้ร่วมกับหลายรายชื่อด้านล่าง\n" +
    "   - รายชื่อเรียงจากบนลงล่างอย่างไร\n" +
    "   - มีลำดับที่ (เช่น 1, 2, 3, ...) ที่สอดคล้องกับแต่ละ record หรือไม่\n" +
    "4. ระบุส่วนที่เป็น header / footer / ข้อความประกอบ ที่ไม่ควรนำมาใช้เป็นข้อมูล record\n\n" +
    "กติกา (สำคัญมาก):\n" +
    "- ตอบเป็น bullet point ภาษาไทยเท่านั้น (ขึ้นต้นแต่ละบรรทัดด้วยเครื่องหมาย - หรือ • )\n" +
    "- ห้ามสร้างตาราง (เช่น ใช้เครื่องหมาย | แบ่งคอลัมน์ หรือจัดรูปแบบเป็น columns)\n" +
    "- ห้ามสร้าง JSON หรือใช้สัญลักษณ์ { } [ ]\n" +
    "- ห้ามจัดกลุ่มข้อมูลเป็น Group หรือใช้คำว่า Group\n" +
    "- ห้ามเดาข้อมูลที่ไม่มีในเอกสาร ถ้าไม่แน่ใจให้บอกว่า \"ไม่สามารถระบุได้จากข้อความที่ให้มา\"\n" +
    "- ห้ามเพิ่มข้อมูลใหม่ที่ไม่มีอยู่ในข้อความ\n\n" +
    "ให้ตอบเฉพาะ bullet point ภาษาไทยตามกติกาเท่านั้น ห้ามมีภาษาอื่นหรือรูปแบบอื่น\n\n" +
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
async function callGemini(prompt: string): Promise<string> {
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

  // โครงสร้างตาม Generative Language API: candidates[].content.parts[].text
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
 * ตรวจสอบว่า output จาก Gemini ทำผิดกติกาหรือไม่
 * - ถ้ามี { } หรือ [ ] → ถือว่าผิด (มีเค้าของ JSON)
 * - ถ้ามีคำว่า Group (ไม่สนใจตัวพิมพ์เล็กใหญ่) → ถือว่าผิด
 * - ถ้ามีลักษณะ table เช่น มี '|' ในหลายบรรทัด → ถือว่าผิดอย่างง่าย
 *
 * ถ้าผิด → throw error
 */
function validateGeminiOutputStrict(output: string): void {
  const text = output || "";

  // JSON-like or array-like symbols
  if (/[{}\[\]]/.test(text)) {
    throw new Error("Gemini output violated format rules: JSON-like symbols detected");
  }

  // The word "Group" (case-insensitive)
  if (/\bgroup\b/i.test(text)) {
    throw new Error("Gemini output violated format rules: 'Group' keyword detected");
  }

  // Very simple table heuristic: multiple lines containing '|' character
  const lines = text.split(/\r?\n/);
  const linesWithPipes = lines.filter((line) => line.includes("|"));
  if (linesWithPipes.length >= 2) {
    throw new Error("Gemini output violated format rules: table-like structure detected");
  }
}

/**
 * วิเคราะห์โครงสร้างเอกสารจากข้อความดิบ โดยใช้ Gemini
 *
 * ข้อสำคัญ:
 * - ไม่ parse, ไม่แปลง, ไม่จัดกลุ่ม หรือ map ไปยังโครงสร้างอื่น
 * - คืนค่า string เดียวที่เป็น bullet point ภาษาไทยเท่านั้น
 * - ถ้า output ผิด format (มี JSON / [] / {} / Group / table-like) → throw error
 */
export async function analyzeDocumentStructure(text: string): Promise<string> {
  const input = text ?? "";
  if (!input.trim()) {
    throw new Error("analyzeDocumentStructure: input text is empty");
  }

  const prompt = buildPrompt(input);
  const rawOutput = await callGemini(prompt);

  // ตรวจความถูกต้องตามกติกาอย่างเคร่งครัด
  validateGeminiOutputStrict(rawOutput);

  // ไม่แปลงหรือดัดแปลงเนื้อหา นอกจากการ trim เบื้องต้นเพื่อความสะอาด
  return rawOutput.trim();
}


