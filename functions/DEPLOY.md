# Deployment Guide - OCR Normalization Pipeline

## 📋 Pre-Deployment Checklist

### 1. Dependencies
```bash
cd functions
npm install
```

### 2. Test Locally (Optional)
```bash
# Test utility modules
node test-normalize.js

# Test with Firebase emulator
npm run serve
```

### 3. Verify Code
- ✅ All utility functions are in `functions/utils/`
- ✅ `ocrPdfBase64V2` uses normalization pipeline
- ✅ `ocrImageBase64V2` uses normalization pipeline
- ✅ No duplicate function definitions

## 🚀 Deployment Steps

### Step 1: Install Dependencies
```bash
cd functions
npm install
```

### Step 2: Deploy Functions
```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific function
firebase deploy --only functions:ocrImageV2
```

### Step 3: Verify Deployment
```bash
# Check logs
firebase functions:log

# Or check specific function
firebase functions:log --only ocrImageV2
```

## 🔍 Post-Deployment Testing

### Test PDF OCR
```bash
curl -X POST https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/ocrImageV2 \
  -H "Content-Type: application/json" \
  -d '{
    "pdf_base64": "BASE64_ENCODED_PDF",
    "fileName": "test.pdf"
  }'
```

### Test Image OCR
```bash
curl -X POST https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/ocrImageV2 \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "BASE64_ENCODED_IMAGE",
    "fileName": "test.jpg"
  }'
```

## ⚠️ Important Notes

1. **pdfjs-dist Worker**: Disabled in Node.js environment (uses Node.js implementation directly)
2. **Canvas**: Requires native dependencies - should work in Firebase Functions
3. **Memory**: Functions may need increased memory for large PDFs
4. **Timeout**: Default timeout is 540 seconds - adjust if needed

## 🐛 Troubleshooting

### Error: pdfjs-dist worker not found
- **Solution**: Worker is disabled in Node.js - this is expected

### Error: Canvas not found
- **Solution**: Ensure `canvas` package is installed: `npm install canvas`

### Error: Vision API credentials
- **Solution**: Ensure Google Cloud credentials are configured in Firebase Functions

### Error: Memory limit exceeded
- **Solution**: Increase function memory in `index.js`:
  ```javascript
  exports.ocrImageV2 = onRequest({
    memory: "2GiB", // Increase from 1GiB
    // ...
  });
  ```

## 📊 Monitoring

Monitor function performance:
```bash
# View real-time logs
firebase functions:log --only ocrImageV2

# View metrics in Firebase Console
# https://console.firebase.google.com/project/YOUR-PROJECT/functions
```
