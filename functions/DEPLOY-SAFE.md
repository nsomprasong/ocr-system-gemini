# 🚀 Safe Deployment Guide (ไม่กระทบ v1)

## ⚠️ สำคัญ
- **ห้ามลบ** function `ocrImage` (v1) - ยังใช้อยู่ใน production
- Deploy เฉพาะ function ใหม่เท่านั้น

## 📋 Functions ที่จะ Deploy

1. `ocrImageV2` - Function ใหม่ที่ใช้ normalization pipeline
2. `ocrImageLegacyV2` - Legacy function (rename แล้ว ไม่กระทบ v1)

## 🚀 คำสั่ง Deploy

```bash
cd functions

# Deploy เฉพาะ function ใหม่ (ไม่กระทบ ocrImage v1)
firebase deploy --only functions:ocrImageV2,functions:ocrImageLegacyV2
```

## ✅ Verification

หลัง deploy สำเร็จ:
- ✅ `ocrImage` (v1) ยังทำงานปกติ
- ✅ `ocrImageV2` (ใหม่) ใช้ normalization pipeline
- ✅ `ocrImageLegacyV2` (legacy) ยังทำงาน

## 📊 Function URLs

- v1: `https://us-central1-YOUR-PROJECT.cloudfunctions.net/ocrImage` (ไม่เปลี่ยน)
- v2: `https://us-central1-YOUR-PROJECT.cloudfunctions.net/ocrImageV2` (ใหม่)
- Legacy: `https://us-central1-YOUR-PROJECT.cloudfunctions.net/ocrImageLegacyV2` (legacy)
