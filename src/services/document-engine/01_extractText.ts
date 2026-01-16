// document-engine/01_extractText.ts
// ---------------------------------------------------------------------------
// Stage 1: Raw text extraction.
//
// Responsibility:
// - รับไฟล์เอกสารและแปลงให้เป็นข้อความต่อเนื่อง (plain text)
// - สำหรับ requirement นี้ เราโฟกัสที่ PDF → text เท่านั้น
// - ยังไม่ต้องเข้าใจโครงสร้างเอกสาร แค่ดึงข้อความออกมาให้ได้มากที่สุด
//
// หมายเหตุสำคัญ:
// - โมดูลนี้ต้อง standalone และไม่อิง logic OCR / Gemini เดิม
// - ใช้ text layer ของ PDF ก่อน ถ้าไม่มีจึงค่อย fallback ไปหา OCR (Google Vision)
// - โค้ดต้อง deterministic: input เดิม → output เดิมเสมอ

// NOTE: ใน frontend environment อาจไม่มี type Buffer ของ Node.js
// เพื่อให้ไฟล์นี้ compile ได้ทั้งใน browser build และ Node:
// - เรานิยาม interface Buffer แบบบางเบา (extends Uint8Array)
// - ทำให้สามารถรับ binary data ได้ โดยไม่ต้องอิง @types/node
//   (หากรันใน Node จริง ค่า Buffer ของ Node ก็ compatible กับ Uint8Array อยู่แล้ว)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Buffer extends Uint8Array {}

// ใช้ dynamic import กับ pdfjs-dist เพื่อหลีกเลี่ยงปัญหา bundle ในบาง environment
// และเพื่อไม่โหลด library หนักโดยไม่จำเป็น ถ้าไม่ได้เรียกใช้ฟังก์ชันนี้
async function getPdfjsLib(): Promise<any> {
  // เราไม่ผูกกับ path ภายในของ pdfjs-dist มากเกินไป
  // หากต้องปรับ path ในอนาคต ให้แก้เพียงจุดนี้จุดเดียว
  const pdfjs = await import("pdfjs-dist");
  // บางเวอร์ชันของ pdfjs-dist export ผ่าน default, บางเวอร์ชัน export เป็น module ตรง ๆ
  return (pdfjs as any).default || pdfjs;
}

/**
 * ตรวจสอบว่า PDF มี text layer หรือไม่ โดยดูจาก page แรกว่ามี text items หรือไม่
 * - ถ้ามี text items แสดงว่ามี text layer สามารถ extract ได้โดยตรง
 * - ถ้า error ใด ๆ เกิดขึ้น จะถือว่า "ไม่มี text layer" (ให้ไปใช้ OCR ต่อ)
 */
async function hasTextLayer(pdfBuffer: Buffer): Promise<boolean> {
  try {
    const pdfjsLib = await getPdfjsLib();
    const pdfUint8 = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8, verbosity: 0 });
    const pdf = await loadingTask.promise;

    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();

    const items = (textContent && (textContent.items as any[])) || [];
    return items.length > 0;
  } catch {
    // หากตรวจสอบไม่สำเร็จ ให้ถือว่าไม่มี text layer เพื่อความปลอดภัย
    return false;
  }
}

/**
 * ดึงข้อความจาก text layer ของ PDF (ทุกหน้า)
 * - ใช้ pdfjs-dist อ่าน textContent แล้วต่อ string เป็นข้อความเดียว
 * - พยายามคงโครงสร้างพื้นฐาน เช่น newlines ระหว่างบรรทัด / หน้า
 */
async function extractTextLayer(pdfBuffer: Buffer): Promise<string> {
  const pdfjsLib = await getPdfjsLib();
  const pdfUint8 = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: pdfUint8, verbosity: 0 });
  const pdf = await loadingTask.promise;

  const totalPages: number = pdf.numPages;
  let fullText = "";

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items: any[] = (textContent && textContent.items) || [];

    let pageText = "";

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const str: string = item?.str ?? "";
      if (!str) continue;

      pageText += str;

      // pdfjs จะให้ flag hasEOL เมื่อจบ "บรรทัด"
      if (item.hasEOL) {
        pageText += "\n";
      } else {
        // heuristic ง่าย ๆ: ถ้าถัดไปยังอยู่บรรทัดเดียวกัน ให้เว้น space
        const next = items[i + 1];
        if (next && next.str && !str.endsWith(" ")) {
          const currentY = item.transform?.[5] ?? 0;
          const nextY = next.transform?.[5] ?? 0;
          if (Math.abs(currentY - nextY) < 5) {
            pageText += " ";
          }
        }
      }
    }

    fullText += pageText.trim();
    if (pageNum < totalPages) {
      fullText += "\n\n"; // เว้นบรรทัดระหว่างหน้า
    }
  }

  return fullText;
}

/**
 * ใช้ Google Vision API (DOCUMENT_TEXT_DETECTION) เพื่อดึงข้อความจาก PDF ที่ไม่มี text layer.
 *
 * หมายเหตุ:
 * - ในโมดูล frontend (เช่น React/Vite) จะไม่สามารถเรียก Google Vision โดยตรงได้
 *   เพราะต้องใช้ service account และ credentials ฝั่ง backend
 * - ฟังก์ชันนี้จึงถูกออกแบบให้โยน error ที่อธิบายชัดเจน
 *   และให้ environment backend เป็นผู้ implement จริงในอนาคต
 */
async function extractTextWithVision(_pdfBuffer: Buffer): Promise<string> {
  // TODO: Implement real Google Vision DOCUMENT_TEXT_DETECTION call in a backend environment.
  // ข้อกำหนดบังคับให้ใช้ DOCUMENT_TEXT_DETECTION สำหรับ PDF ที่ไม่มี text layer
  // แต่ใน context นี้ (โมดูล standalone) เราจะไม่ผูกกับ @google-cloud/vision โดยตรง
  throw new Error(
    "Google Vision OCR is not configured in this environment. " +
      "extractTextWithVision must be implemented in a backend/runtime with Google Cloud credentials."
  );
}

/**
 * Normalize ข้อความดิบให้พร้อมใช้งานในขั้นถัดไป:
 * - แปลง \r\n / \r เป็น \n
 * - ลบ zero-width / hidden characters
 * - ลด multiple spaces ให้เหลือ 1 ช่อง
 * - ลด multiple newlines (>= 3) ให้เหลือไม่เกิน 2
 * - trim หน้าหลัง
 */
function normalizeText(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // Normalize line breaks
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove zero-width / hidden characters
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Collapse multiple spaces/tabs into a single space
  text = text.replace(/[ \t]+/g, " ");

  // Collapse 3+ consecutive newlines into max 2
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim each line (ขวา) เพื่อไม่ทำให้คำติดกันเกินไป
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  // Trim ทั้งข้อความ
  return text.trim();
}

export interface ExtractTextRequest {
  /** Raw binary or base64 string of the document. Concrete format is up to the caller. */
  payload: string;
  /** Optional MIME type hint (e.g. application/pdf, image/png, text/plain). */
  mimeType?: string;
  /** Original file name, used only for logging/metadata. */
  fileName?: string;
}

export interface ExtractedText {
  /** Full extracted text from the document. */
  text: string;
  /** Number of logical pages detected (if known). */
  pages: number;
  /** Arbitrary metadata bag for downstream stages. */
  metadata: Record<string, unknown>;
}

/**
 * Extracts raw text from an input document (generic API).
 *
 * Placeholder implementation:
 * - ไม่ดึงข้อความจริง
 * - คืนค่าโครงสร้างข้อมูลเปล่า ๆ สำหรับให้ระบบ compile ได้
 */
export async function extractText(
  request: ExtractTextRequest
): Promise<ExtractedText> {
  // TODO: Implement actual text extraction logic (PDF/image/text) in the future.
  return {
    text: "",
    pages: 0,
    metadata: {
      placeholder: true,
      receivedMimeType: request.mimeType ?? null,
      receivedFileName: request.fileName ?? null,
    },
  };
}

/**
 * Extracts "clean raw text" from a PDF buffer.
 *
 * Pipeline:
 * 1) ตรวจว่า PDF มี text layer หรือไม่ (hasTextLayer)
 * 2) ถ้ามี → extractTextLayer (ไม่ใช้ OCR)
 * 3) ถ้าไม่มี → extractTextWithVision (DOCUMENT_TEXT_DETECTION)
 * 4) Normalize ข้อความ (normalizeText) แล้วคืนค่าเป็น string เดียว
 *
 * ข้อกำหนด:
 * - input: Buffer (binary PDF)
 * - output: string เดียว (ห้าม array / object)
 * - ห้าม parse table / ตีความข้อมูล / เดา
 * - deterministic: input เดิม → output เดิม
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  if (!pdfBuffer || pdfBuffer.byteLength === 0) {
    return "";
  }

  let rawText: string;

  // STEP 1: Check text layer
  const hasLayer = await hasTextLayer(pdfBuffer);

  if (hasLayer) {
    // STEP 2a: Extract from text layer directly (no OCR)
    rawText = await extractTextLayer(pdfBuffer);
  } else {
    // STEP 2b: Fallback to Google Vision DOCUMENT_TEXT_DETECTION
    // (ใน environment นี้จะโยน error แจ้งให้ implement ฝั่ง backend)
    rawText = await extractTextWithVision(pdfBuffer);
  }

  // STEP 3: Normalize text before handing off to next stages
  return normalizeText(rawText);
}

