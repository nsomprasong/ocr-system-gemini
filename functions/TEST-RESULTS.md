# 🧪 Test Results - ocrImageV2 Function

## Test Script
```bash
cd functions
node test-ocr-v2.js
```

## Test with Custom File
```bash
# Test with PDF
node test-ocr-v2.js path/to/file.pdf

# Test with Image
node test-ocr-v2.js path/to/image.jpg
```

## Expected Results

### ✅ Success Response
```json
{
  "success": true,
  "result": {
    "fileName": "test.pdf",
    "page": {
      "width": 1190,
      "height": 841
    },
    "words": [
      {
        "text": "คำ",
        "x": 100,
        "y": 200,
        "w": 50,
        "h": 20
      }
    ]
  }
}
```

### ❌ Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

## Verification Checklist

- [ ] Function is reachable
- [ ] Image OCR returns words with coordinates
- [ ] PDF OCR returns words with coordinates
- [ ] Page dimensions are correct
- [ ] Normalization pipeline works (orientation detection + rotation)
