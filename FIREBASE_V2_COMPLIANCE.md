# Firebase Functions v2 Compliance - Smart OCR

## ✅ การแก้ไขที่ทำเสร็จแล้ว

### 1. Environment Variables (ไม่ใช้ functions.config())

**ไฟล์:** `functions/utils/geminiClient.js`

- ✅ ใช้ `process.env.GEMINI_API_KEY` เท่านั้น
- ✅ **ห้ามใช้** `functions.config()` (deprecated)
- ✅ Validate API key ตอนเรียกใช้ function (lazy initialization)
- ✅ Throw error ชัดเจนถ้า API key ไม่ถูกตั้งค่า

**Error Message:**
```
GEMINI_API_KEY environment variable is not set. 
Please set it in Firebase Console → Functions → Configuration → Environment variables. 
Smart OCR requires Gemini API key to function.
```

### 2. Firebase Functions v2 Syntax

**ไฟล์:** `functions/index.js`

- ✅ ใช้ `onRequest` จาก `firebase-functions/v2/https`
- ✅ ใช้ v2 options: `region`, `cors`, `timeoutSeconds`, `memory`, `maxInstances`

### 3. API Key Configuration

**วิธีตั้งค่า (ต้องทำ):**

1. **Firebase Console** (แนะนำ):
   - ไปที่ Firebase Console → Functions → Configuration
   - เพิ่ม Environment Variable:
     - Name: `GEMINI_API_KEY`
     - Value: `YOUR_GEMINI_API_KEY`

2. **Firebase CLI** (alternative):
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   ```
   (จะ prompt ให้ใส่ค่า)

### 4. Validation Flow

```
smartOcr() called
  ↓
smartOcrPdf() called
  ↓
analyzeDocumentStructure() called
  ↓
initializeGeminiClient() called
  ↓
✅ Validate @google/generative-ai installed
✅ Validate GEMINI_API_KEY is set
❌ Throw error if missing (clear message)
  ↓
Initialize Gemini client
  ↓
Continue processing
```

### 5. Error Handling

**ถ้า API key ไม่ถูกตั้งค่า:**
- Function จะ throw error ชัดเจน
- Error message บอกวิธีแก้ไข
- ไม่ deploy fail (validate ตอน runtime)

**ถ้า package ไม่ติดตั้ง:**
- Function จะ throw error ชัดเจน
- Error message บอกวิธีติดตั้ง

## 📝 หมายเหตุ

- **ไม่ใช้ `functions.config()`** - ใช้ environment variables เท่านั้น
- **Lazy initialization** - validate ตอนเรียกใช้ ไม่ใช่ตอน module load
- **Clear error messages** - บอกวิธีแก้ไขชัดเจน
- **Firebase Functions v2** - ใช้ syntax และ options ที่ถูกต้อง

## 🔍 ตรวจสอบ

```bash
# ตรวจสอบว่าใช้ v2 syntax
grep -r "firebase-functions/v2" functions/

# ตรวจสอบว่าไม่ใช้ functions.config()
grep -r "functions.config()" functions/
# ควรไม่พบผลลัพธ์

# ตรวจสอบว่าใช้ process.env
grep -r "process.env.GEMINI_API_KEY" functions/
# ควรพบผลลัพธ์
```
