# Quick Start - Smart OCR Setup

## ✅ สิ่งที่ทำเสร็จแล้ว

1. ✅ ติดตั้ง `@google/generative-ai` package
2. ✅ สร้าง Smart OCR pipeline (functions/utils/)
3. ✅ สร้าง Smart OCR service (src/services/smartOcr.service.ts)
4. ✅ อัปเดต Export.jsx ให้ใช้ Smart OCR
5. ✅ อัปเดต buildRow.ts ให้รองรับ Smart OCR result

## 🚀 ขั้นตอนต่อไป (ต้องทำเอง)

### 1. ตั้งค่า Gemini API Key

**วิธีที่ 1: ใช้ Firebase Config (ง่ายที่สุด)**
```bash
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
```

**วิธีที่ 2: ใช้ Environment Variable (แนะนำสำหรับ production)**
1. ไปที่ [Firebase Console](https://console.firebase.google.com)
2. เลือกโปรเจกต์ → Functions → Configuration
3. เพิ่ม Environment Variable:
   - Name: `GEMINI_API_KEY`
   - Value: `YOUR_GEMINI_API_KEY`

### 2. Deploy Smart OCR Function

```bash
cd functions
firebase deploy --only functions:smartOcr
```

### 3. อัปเดต URL ใน Frontend

หลังจาก deploy สำเร็จ:

1. ไปที่ Firebase Console → Functions
2. ค้นหา function `smartOcr`
3. Copy URL (เช่น `https://smartocr-XXXXX-uc.a.run.app`)
4. สร้างไฟล์ `.env` ใน root directory:
   ```
   VITE_FIREBASE_SMART_OCR_URL=https://smartocr-XXXXX-uc.a.run.app
   ```
5. Restart dev server

หรือแก้ไข `src/services/smartOcr.service.ts` โดยตรง:
```typescript
const FIREBASE_SMART_OCR_URL = "https://smartocr-XXXXX-uc.a.run.app"
```

### 4. ทดสอบ

1. เปิดแอปพลิเคชัน
2. ไปที่หน้า Export
3. เปิด Template Mode (toggle `templateModeEnabled`)
4. อัปโหลด PDF file
5. ตรวจสอบ console logs:
   - ควรเห็น `🤖 [Smart OCR] Using Smart OCR for PDF: ...`
   - ควรเห็น `✅ [Smart OCR] Completed: X records`

## 📝 หมายเหตุ

- Smart OCR จะทำงานเฉพาะเมื่อ:
  - `templateModeEnabled = true`
  - ไฟล์เป็น PDF (ไม่ใช่ image)
  - มี `columnConfig` (column definitions)
- ถ้า Smart OCR fail จะ fallback ไปใช้ traditional OCR อัตโนมัติ
- ดูรายละเอียดเพิ่มเติมใน `functions/SMART_OCR_SETUP.md`
