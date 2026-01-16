# 🧪 Test Commands for ocrImageV2

## Quick Test (Health Check)
```bash
cd functions
node test-simple.js
```

## Test with File
```bash
# Test with PDF
node test-ocr-v2.js path/to/file.pdf

# Test with Image  
node test-ocr-v2.js path/to/image.jpg
```

## Test with curl (PowerShell)
```powershell
# Test Image OCR
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("path/to/image.jpg"))
$body = @{
    image_base64 = $base64
    fileName = "test.jpg"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://ocrimagev2-3vghmazr7q-uc.a.run.app" -Method POST -Body $body -ContentType "application/json"

# Test PDF OCR
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("path/to/file.pdf"))
$body = @{
    pdf_base64 = $base64
    fileName = "test.pdf"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://ocrimagev2-3vghmazr7q-uc.a.run.app" -Method POST -Body $body -ContentType "application/json"
```

## Expected Results

### ✅ Success
- Status: 200
- Response contains: `{ success: true, result: { fileName, page: { width, height }, words: [...] } }`
- Words have coordinates (x, y, w, h)

### ❌ Error
- Status: 400/500
- Response contains: `{ success: false, error: "..." }`

## Verification

1. ✅ Function is reachable
2. ✅ Returns proper JSON structure
3. ✅ Words have bounding boxes
4. ✅ Page dimensions are correct
5. ✅ Normalization pipeline works (orientation + rotation)
