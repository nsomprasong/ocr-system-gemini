import { onRequest } from "firebase-functions/v2/https";
import Busboy from "busboy";
import type { Request, Response } from "express";

// NOTE:
// - เรา import จาก document-engine ที่อยู่ในฝั่ง frontend/shared code
// - path นี้ขึ้นกับโครงสร้างโปรเจกต์ปัจจุบัน: root/src/services/document-engine/99_processDocument.ts
// - ถ้าโครงสร้างเปลี่ยน ให้ปรับ path นี้ให้ชี้ไปที่โมดูล shared ที่ build ร่วมกับ Cloud Functions
import { processDocument } from "../../src/services/document-engine/99_processDocument";

/**
 * Firebase HTTPS Function:
 *   POST /processPdfToExcel
 *
 * Request:
 * - multipart/form-data
 *   - field "file"   : PDF file
 *   - field "columns": JSON string array (เช่น ["name","address"])
 *
 * Pipeline:
 * 1) extractTextFromPdf(pdfBuffer)
 * 2) analyzeDocumentStructure(text)
 * 3) convertTextToRecords(text, structureSummary, columns)
 * 4) validateRecords(records, columns)  → ถ้า false → throw error
 * 5) exportRecordsToExcel(records, columns)
 *
 * Response (success):
 * - 200
 * - Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 * - Content-Disposition: attachment; filename="result.xlsx"
 * - body: Excel buffer
 *
 * Response (error):
 * - 400: ไม่มี file / columns parse ไม่ได้
 * - 500: processDocument throw error
 * - body: ข้อความ error เป็น text/plain
 */
export const processPdfToExcel = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req: Request, res: Response): Promise<void> => {
    // 1) ตรวจว่า request เป็น POST
    if (req.method !== "POST") {
      res
        .status(405)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("Method Not Allowed");
      return;
    }

    // 2) ใช้ Busboy เพื่อ parse multipart/form-data
    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      res
        .status(400)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("Invalid content type. Expected multipart/form-data");
      return;
    }

    let pdfBuffer: Buffer | null = null;
    let columnsJson = "";

    try {
      await new Promise<void>((resolve, reject) => {
        const busboy = new Busboy({ headers: req.headers });

        const fileChunks: Buffer[] = [];

        busboy.on("file", (_fieldname, file, _filename, _encoding, mimetype) => {
          // รับเฉพาะ PDF ตามที่กำหนด (แต่ไม่บังคับชนิดเป๊ะ ๆ)
          // ถ้าอยากเข้มกว่านี้สามารถตรวจ mimetype === "application/pdf"
          file.on("data", (data: Buffer) => {
            fileChunks.push(data);
          });

          file.on("limit", () => {
            reject(new Error("Uploaded file is too large"));
          });

          file.on("end", () => {
            // no-op, จะประกอบ buffer เมื่อจบทั้งหมด
          });
        });

        busboy.on("field", (fieldname, val) => {
          if (fieldname === "columns") {
            columnsJson = val;
          }
        });

        busboy.on("error", (err) => {
          reject(err);
        });

        busboy.on("finish", () => {
          if (fileChunks.length > 0) {
            pdfBuffer = Buffer.concat(fileChunks);
          }
          resolve();
        });

        // pipe request เข้าสู่ busboy
        req.pipe(busboy);
      });
    } catch (err) {
      console.error("[processPdfToExcel] Failed to parse multipart form:", err);
      res
        .status(400)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("Invalid multipart/form-data request");
      return;
    }

    // 3) ตรวจว่ามี file และ columns
    if (!pdfBuffer || pdfBuffer.length === 0) {
      res
        .status(400)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("Missing PDF file");
      return;
    }

    if (!columnsJson || columnsJson.trim().length === 0) {
      res
        .status(400)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("Missing columns field");
      return;
    }

    // 4) parse columns ด้วย JSON.parse
    let columns: string[];
    try {
      const parsed = JSON.parse(columnsJson);
      if (!Array.isArray(parsed)) {
        throw new Error("columns must be a JSON array");
      }
      // กรองให้เหลือแต่ string
      columns = parsed.map((c) => String(c));
      if (columns.length === 0) {
        throw new Error("columns array is empty");
      }
    } catch (err) {
      console.error("[processPdfToExcel] Failed to parse columns JSON:", err);
      res
        .status(400)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("Invalid columns JSON");
      return;
    }

    // 5) เรียก processDocument(pdfBuffer, columns) → Excel Buffer
    let excelBuffer: Buffer;
    try {
      console.log("[processPdfToExcel] Calling processDocument...");
      excelBuffer = await processDocument(pdfBuffer, columns);
      console.log(
        "[processPdfToExcel] processDocument completed. Excel size:",
        excelBuffer.length
      );
    } catch (err: any) {
      console.error("[processPdfToExcel] processDocument failed:", err);
      const message =
        (err && typeof err.message === "string" && err.message) ||
        "Internal Server Error";
      res
        .status(500)
        .set("Content-Type", "text/plain; charset=utf-8")
        .send(message);
      return;
    }

    // 6) ส่ง Excel buffer กลับ (status 200) เป็นไฟล์ดาวน์โหลดโดยตรง
    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="result.xlsx"');
    res.setHeader("Content-Length", excelBuffer.length.toString());
    res.end(excelBuffer);
    return;
  }
);

