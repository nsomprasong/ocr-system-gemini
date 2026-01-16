# 🚀 Quick Deploy Commands

## 1. Install Dependencies
```bash
cd functions
npm install
```

## 2. Deploy to Firebase
```bash
firebase deploy --only functions
```

## 3. Check Logs
```bash
firebase functions:log --only ocrImageV2
```

## 4. Test Function
```bash
# Test PDF OCR
curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/ocrImageV2 \
  -H "Content-Type: application/json" \
  -d '{"pdf_base64": "BASE64_PDF", "fileName": "test.pdf"}'

# Test Image OCR  
curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/ocrImageV2 \
  -H "Content-Type: application/json" \
  -d '{"image_base64": "BASE64_IMAGE", "fileName": "test.jpg"}'
```

## ⚠️ Important Notes

1. **First deployment** อาจใช้เวลา 5-10 นาที (native dependencies)
2. **Memory**: Functions ใช้ 1GiB - เพิ่มเป็น 2GiB ถ้า PDF ใหญ่
3. **Timeout**: Default 540 seconds - เพิ่มถ้าจำเป็น
4. **pdfjs-dist**: ใช้ legacy build สำหรับ Node.js

## ✅ Verification

หลัง deploy สำเร็จ ตรวจสอบ:
- ✅ Function deployed successfully
- ✅ No errors in logs
- ✅ OCR returns normalized results
- ✅ Template และ Scan ใช้ pipeline เดียวกัน
