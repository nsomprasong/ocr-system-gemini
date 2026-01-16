# Smart OCR (Gemini) Pipeline

## ภาพรวม

Smart OCR Pipeline เป็นการปรับปรุง OCR system ให้ใช้ **Gemini API** สำหรับทำ **Document Understanding** แบบ semantic แทนการใช้ template layout (x/y coordinates)

## สิ่งที่เปลี่ยนแปลง

### ✅ สิ่งที่ทำแล้ว

1. **PDF Text Layer Detection** (`functions/utils/pdfTextExtractor.js`)
   - ตรวจสอบว่า PDF มี text layer หรือไม่
   - ถ้ามี → extract text ตรง (ไม่ใช้ OCR)
   - ถ้าไม่มี → ใช้ Google Vision OCR

2. **Text Normalization** (`functions/utils/textNormalizer.js`)
   - Normalize และ cleanup text ก่อนส่ง Gemini
   - แก้ไข common OCR errors (เช่น ตัวเลขไทย → ตัวเลขอารบิก)

3. **Gemini Integration** (`functions/utils/geminiClient.js`)
   - **Pass #1**: วิเคราะห์โครงสร้างเอกสาร
     - 1 record แทนอะไร
     - ข้อมูลซ้ำแบบไหน
     - ค่าใดครอบหลาย record (เช่น บ้านเลขที่)
   - **Pass #2**: แปลงเป็น JSON ตาราง
     - ใช้ semantic rules (ไม่ใช้ x/y)
     - Map กับ column definitions

4. **Smart OCR Function** (`functions/index.js`)
   - `smartOcrPdf()` - Internal function
   - `exports.smartOcr` - Firebase Cloud Function
   - Pipeline: PDF → Text extraction/OCR → Normalize → Gemini 2-pass → JSON

5. **Frontend Integration**
   - `src/services/smartOcr.service.ts` - Service สำหรับเรียก Smart OCR
   - `excel/buildRow.ts` - รองรับ Smart OCR result
   - `src/pages/Export.jsx` - เรียก Smart OCR เมื่อ templateModeEnabled = true

### ⚠️ สิ่งที่ต้องทำต่อ

1. **ติดตั้ง Dependencies**
   ```bash
   cd functions
   npm install @google/generative-ai
   ```

2. **ตั้งค่า Gemini API Key**
   ```bash
   # วิธีที่ 1: ใช้ Firebase Config
   firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
   
   # วิธีที่ 2: ใช้ Environment Variable
   # ตั้งค่าใน Firebase Console → Functions → Configuration → Environment variables
   # GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```

3. **Deploy Smart OCR Function**
   ```bash
   cd functions
   firebase deploy --only functions:smartOcr
   ```

4. **อัปเดต URL ใน Service**
   - หลังจาก deploy แล้ว ตรวจสอบ URL จาก Firebase Console
   - อัปเดต `FIREBASE_SMART_OCR_URL` ใน `src/services/smartOcr.service.ts`

## การทำงาน

### Flow: Scan → Smart OCR → Export Excel

1. **User สั่งสแกน** (Export.jsx)
   - ตรวจสอบว่า `templateModeEnabled = true` และเป็น PDF
   - เรียก `smartOcrPdf()` ผ่าน `smartOcr.service.ts`

2. **Smart OCR Pipeline** (functions/index.js)
   - **Step 1**: ตรวจ PDF text layer
   - **Step 2a**: ถ้ามี text layer → extract text ตรง
   - **Step 2b**: ถ้าไม่มี → ใช้ Google Vision OCR
   - **Step 3**: Normalize/cleanup text
   - **Step 4**: Gemini Pass #1 - วิเคราะห์โครงสร้าง
   - **Step 5**: Gemini Pass #2 - แปลงเป็น JSON table

3. **Export Excel** (Export.jsx)
   - รับ Smart OCR result (JSON array)
   - Map กับ columnConfig
   - Export ผ่าน `createSeparateExcelFiles()` หรือ `createCombinedExcelFile()`

### Smart OCR Result Format

```typescript
{
  success: true,
  records: [
    {
      "columnKey1": "value1",
      "columnKey2": "value2"
    },
    // ... more records
  ],
  metadata: {
    source: "textlayer+gemini" | "vision+gemini",
    pages: number,
    confidence: "low" | "medium" | "high",
    textLength: number,
    structureAnalysis: {
      recordDefinition: string,
      repeatingPatterns: string[],
      sharedValues: string[],
      confidence: string
    }
  },
  rawText: string // Normalized text for debugging
}
```

## Gemini Prompts

### Pass #1: Structure Analysis

Prompt วิเคราะห์:
- 1 record แทนอะไร
- ข้อมูลซ้ำแบบไหน
- ค่าใดครอบหลาย record

**Guard Rails:**
- ห้ามเดาข้อมูล
- ถ้าไม่ชัด ให้ระบุว่า "ไม่ชัดเจน"
- ตอบเป็น JSON เท่านั้น

### Pass #2: JSON Table Conversion

Prompt แปลง:
- ใช้โครงสร้างจาก Pass #1
- Map กับ column definitions
- ใช้ semantic rules (ไม่ใช้ x/y)

**Guard Rails:**
- ห้ามเดาข้อมูล → ใส่ "" ถ้าไม่ชัด
- ห้ามแก้ตัวเลขสำคัญ
- ค่าที่ครอบหลาย record → ใช้ค่าล่าสุดที่พบ
- ตอบเป็น JSON array เท่านั้น

## Semantic Rules (ตัวอย่าง)

### บ้านเลขที่ครอบหลาย record

```
Logic: บ้านเลขที่ปรากฏครั้งเดียว → ใช้กับหลายชื่อด้านล่างจนกว่าจะพบบ้านเลขที่ใหม่
```

### 1 คน = 1 record

```
Logic: 1 บรรทัด = 1 record (หรือตามที่ Gemini วิเคราะห์)
```

## ไฟล์ที่แก้ไข

### Backend (functions/)
- `functions/index.js` - เพิ่ม `smartOcrPdf()` และ `exports.smartOcr`
- `functions/utils/pdfTextExtractor.js` - ตรวจและ extract text จาก PDF
- `functions/utils/textNormalizer.js` - Normalize/cleanup text
- `functions/utils/geminiClient.js` - Gemini API integration (2-pass)

### Frontend (src/)
- `src/services/smartOcr.service.ts` - Service สำหรับเรียก Smart OCR
- `src/pages/Export.jsx` - เรียก Smart OCR เมื่อ templateModeEnabled = true
- `excel/buildRow.ts` - รองรับ Smart OCR result
- `core/types.ts` - เพิ่ม `smartOcrResult` ใน `OCRResult`

## ข้อกำหนดที่ปฏิบัติตาม

✅ ใช้ v2 codebase เดิมเป็นฐาน  
✅ แก้เฉพาะส่วน scan → OCR → parse → export  
✅ ตรวจ PDF text layer  
✅ ใช้ Gemini API ฝั่ง backend  
✅ Gemini ทำงาน 2-pass  
✅ ห้ามใช้ template layout (x/y)  
✅ Prompt มี guard rails  
✅ Output เป็น JSON array ที่ map กับ column definitions  
✅ ไม่กระทบ auth/credit/billing/UI flow  
✅ โค้ดแยก logic ชัดเจน อ่านง่าย  

## การทดสอบ

1. **ทดสอบ PDF ที่มี text layer**
   - ควร extract text ตรง (ไม่ใช้ OCR)
   - Source: "textlayer+gemini"

2. **ทดสอบ PDF ที่ไม่มี text layer**
   - ควรใช้ Google Vision OCR
   - Source: "vision+gemini"

3. **ทดสอบ Gemini 2-pass**
   - Pass #1: ควรวิเคราะห์โครงสร้างได้
   - Pass #2: ควรแปลงเป็น JSON table ได้

4. **ทดสอบ Export Excel**
   - ควรใช้ Smart OCR records โดยตรง
   - ไม่ใช้ extractDataFromText()

## Troubleshooting

### Gemini API Key ไม่ทำงาน
- ตรวจสอบว่า set API key แล้ว: `firebase functions:config:get`
- ตรวจสอบว่า install package: `npm install @google/generative-ai`

### Smart OCR ไม่ถูกเรียก
- ตรวจสอบว่า `templateModeEnabled = true`
- ตรวจสอบว่าเป็น PDF file
- ตรวจสอบว่า `columnConfig` มีข้อมูล

### Gemini Pass #2 ไม่ได้ผล
- ตรวจสอบว่า `columnDefinitions` ถูกส่งไป
- ตรวจสอบ logs ใน Firebase Functions

## หมายเหตุ

- Smart OCR ใช้เฉพาะ **PDF files** เท่านั้น
- สำหรับ **image files** ยังใช้ traditional OCR (Google Vision)
- Smart OCR จะ fallback ไป traditional OCR ถ้าเกิด error
- `ocrImageV2` ใน Firebase **ไม่ถูกแก้ไข** (ปลอดภัย)
