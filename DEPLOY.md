# 🚀 คู่มือ Deploy Project ขึ้น Firebase

## ขั้นตอนการ Deploy

### 1. ตรวจสอบ Firebase Project
```bash
firebase projects:list
firebase use ocr-system-c3bea
```

### 2. Build Frontend (React + Vite)
```bash
npm run build
```
คำสั่งนี้จะสร้าง folder `dist/` ที่มีไฟล์ production-ready

### 3. Deploy ทั้ง Hosting และ Functions
```bash
firebase deploy
```

หรือ deploy แยกส่วน:

**Deploy เฉพาะ Hosting (Frontend):**
```bash
firebase deploy --only hosting
```

**Deploy เฉพาะ Functions:**
```bash
firebase deploy --only functions
```

**Deploy ทั้ง Hosting และ Functions:**
```bash
firebase deploy --only hosting,functions
```

### 4. ตรวจสอบผลลัพธ์
หลังจาก deploy สำเร็จ จะได้ URL:
- **Hosting URL:** `https://ocr-system-c3bea.web.app` หรือ `https://ocr-system-c3bea.firebaseapp.com`
- **Functions URL:** `https://ocrimage-3vghmazr7q-uc.a.run.app`

## ⚙️ การตั้งค่า

### Firebase.json
- `hosting.public`: ระบุ folder ที่จะ deploy (default: `dist`)
- `hosting.rewrites`: ตั้งค่า SPA routing (redirect ทุก path ไปที่ `/index.html`)
- `hosting.headers`: ตั้งค่า Cache-Control สำหรับ static files

### .firebaserc
- ระบุ Firebase project ID: `ocr-system-c3bea`

## 🔧 Troubleshooting

### ถ้า build ไม่สำเร็จ:
```bash
# ลบ node_modules และติดตั้งใหม่
rm -rf node_modules
npm install
npm run build
```

### ถ้า deploy ไม่สำเร็จ:
```bash
# ตรวจสอบว่า login Firebase แล้วหรือยัง
firebase login

# ตรวจสอบ project
firebase use

# ดู logs
firebase deploy --debug
```

### ถ้า Functions deploy ไม่สำเร็จ:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## 📝 สิ่งที่ต้องตรวจสอบก่อน Deploy

1. ✅ Firebase project ถูกต้อง (`ocr-system-c3bea`)
2. ✅ Build frontend สำเร็จ (`dist/` folder มีไฟล์)
3. ✅ Functions dependencies ติดตั้งแล้ว (`functions/node_modules`)
4. ✅ Environment variables ถูกต้อง (ถ้ามี)
5. ✅ Firebase APIs เปิดใช้งานแล้ว (Vision API, Storage API)

## 🎯 Quick Deploy Commands

```bash
# Build และ Deploy ทั้งหมด
npm run build && firebase deploy

# Deploy เฉพาะ Functions
firebase deploy --only functions:ocrImage

# Deploy เฉพาะ Hosting
npm run build && firebase deploy --only hosting
```
