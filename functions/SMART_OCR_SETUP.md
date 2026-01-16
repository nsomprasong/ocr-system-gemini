# Smart OCR Setup Guide

## 1. ติดตั้ง Dependencies

```bash
cd functions
npm install @google/generative-ai
```

## 2. ตั้งค่า Gemini API Key

### วิธีที่ 1: ใช้ Firebase Config (แนะนำสำหรับ development)

```bash
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
```

### วิธีที่ 2: ใช้ Environment Variable (แนะนำสำหรับ production)

1. ไปที่ Firebase Console → Functions → Configuration
2. เพิ่ม Environment Variable:
   - Name: `GEMINI_API_KEY`
   - Value: `YOUR_GEMINI_API_KEY`

### วิธีที่ 3: ใช้ Secret Manager (แนะนำสำหรับ production)

```bash
# สร้าง secret
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-

# Grant access to Cloud Functions
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

แล้วแก้ไข `functions/utils/geminiClient.js` ให้อ่านจาก Secret Manager

## 3. Deploy Smart OCR Function

```bash
cd functions
firebase deploy --only functions:smartOcr
```

## 4. อัปเดต URL ใน Frontend

หลังจาก deploy สำเร็จ:

1. ไปที่ Firebase Console → Functions
2. ค้นหา function `smartOcr`
3. Copy URL (เช่น `https://smartocr-XXXXX-uc.a.run.app`)
4. แก้ไข `src/services/smartOcr.service.ts`:

```typescript
const FIREBASE_SMART_OCR_URL = "https://smartocr-XXXXX-uc.a.run.app"
```

หรือใช้ environment variable:

```typescript
const FIREBASE_SMART_OCR_URL = process.env.REACT_APP_SMART_OCR_URL || "https://smartocr-XXXXX-uc.a.run.app"
```

## 5. ทดสอบ

1. เปิดแอปพลิเคชัน
2. ไปที่หน้า Export
3. เปิด Template Mode
4. อัปโหลด PDF file
5. ตรวจสอบ console logs:
   - ควรเห็น `🤖 [Smart OCR] Using Smart OCR for PDF: ...`
   - ควรเห็น `✅ [Smart OCR] Completed: X records`

## Troubleshooting

### Error: "@google/generative-ai not installed"
```bash
cd functions
npm install @google/generative-ai
```

### Error: "Gemini API key not configured"
- ตรวจสอบว่า set API key แล้ว: `firebase functions:config:get`
- ตรวจสอบว่า environment variable ถูกตั้งค่าใน Firebase Console

### Error: "Smart OCR service is temporarily unavailable"
- ตรวจสอบว่า function deploy สำเร็จ: `firebase functions:list`
- ตรวจสอบ logs: `firebase functions:log --only smartOcr`

### Smart OCR ไม่ถูกเรียก
- ตรวจสอบว่า `templateModeEnabled = true`
- ตรวจสอบว่าเป็น PDF file (ไม่ใช่ image)
- ตรวจสอบว่า `columnConfig` มีข้อมูล
