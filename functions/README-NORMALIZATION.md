# OCR Normalization Pipeline

## Overview

ระบบ OCR ได้รับการ refactor เพื่อให้ Template และ Scan ใช้ pipeline เดียวกัน โดยมีการ normalize PDF/Image ก่อน OCR เสมอ

## Pipeline Flow

```
PDF/Image Input
  ↓
[1] Convert PDF → Image (DPI 300) [ถ้าเป็น PDF]
  ↓
[2] Detect orientation จากข้อความ (OCR OSD)
  ↓
[3] Rotate image จน upright (0/90/180/270)
  ↓
[4] OCR
  ↓
[5] Return OCRResult
```

## Key Features

✅ **Consistent DPI**: PDF → Image ใช้ DPI 300 เสมอ  
✅ **Auto Orientation**: ตรวจจับ orientation จากข้อความจริง (ไม่ดู page size)  
✅ **Auto Rotate**: หมุน image อัตโนมัติจนข้อความตั้งตรง  
✅ **Same Pipeline**: Template และ Scan ใช้ pipeline เดียวกัน 100%

## Files Structure

```
functions/
├── utils/
│   ├── normalizePdfToImages.js  # PDF → Images (DPI 300)
│   ├── detectOrientation.js     # Detect orientation from text
│   └── normalizeImage.js        # Normalize image (detect + rotate)
├── index.js                      # Main functions (refactored)
└── test-normalize.js            # Test script
```

## Usage

### Template Setup (First Page Only)
```javascript
const result = await ocrPdfBase64V2(pdfBase64, "template.pdf");
// Returns OCRResult with normalized first page
```

### Scan (All Pages)
```javascript
// Future: Will process all pages with same normalization
const result = await ocrPdfBase64V2(pdfBase64, "scan.pdf");
```

## Dependencies

- `pdfjs-dist`: PDF parsing (legacy build for Node.js)
- `canvas`: Image manipulation
- `dommatrix`: DOMMatrix polyfill
- `@google-cloud/vision`: OCR and orientation detection

## Notes

- pdfjs-dist ใช้ legacy build (`pdfjs-dist/legacy/build/pdf.js`) สำหรับ Node.js
- Worker ถูก disable ใน Node.js environment
- DOMMatrix polyfill ต้อง set ก่อน require pdfjs-dist
