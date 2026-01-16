# Gemini Pipeline Update - Document Understanding

## ✅ การแก้ไขที่ทำเสร็จแล้ว

### 1. Pass #1: Document Understanding Prompt

**ไฟล์:** `functions/utils/geminiClient.js`

**การเปลี่ยนแปลง:**
- ✅ เน้น bullet point ภาษาไทย (ไม่ใช่ JSON)
- ✅ ระบุชัดเจน: ห้ามสร้างตาราง, ห้าม JSON, ห้าม Group
- ✅ แต่ยังคง parse JSON structure ท้ายสุดเพื่อใช้ในระบบ
- ✅ เน้นเอกสารราชการไทยประเภท "บัญชีรายชื่อ"

**Prompt Structure:**
```
- วิเคราะห์ประเภทเอกสาร
- อธิบายว่า "หนึ่ง record" แทนอะไร
- อธิบายความสัมพันธ์ข้อมูล (บ้านเลขที่, ลำดับ)
- ระบุ header/footer
- ตอบเป็น bullet point ภาษาไทย
- สรุปเป็น JSON structure ท้ายสุด
```

### 2. Pass #2: Convert to JSON Table Prompt

**ไฟล์:** `functions/utils/geminiClient.js`

**การเปลี่ยนแปลง:**
- ✅ เน้น **1 object = 1 คนเสมอ**
- ✅ ห้าม Group, ห้าม nested
- ✅ เพิ่ม Semantic Rule สำหรับบ้านเลขที่
- ✅ เน้น JSON array เท่านั้น (ไม่มี markdown, ไม่มีคำอธิบาย)

**Semantic Rule:**
```
- บ้านเลขที่ปรากฏครั้งเดียว → ใช้กับรายชื่อทั้งหมดถัดไป
- จนกว่าจะพบบ้านเลขที่ใหม่ → ใช้บ้านเลขที่ใหม่แทน
```

### 3. Validation Logic

**ไฟล์:** `functions/utils/validateJsonTable.js` (ใหม่)

**Validation Rules:**
1. ✅ ต้องเป็น array
2. ✅ ทุก object ต้องมี key ครบตาม column definitions
3. ✅ ต้องมีชื่ออย่างน้อย 1 field ไม่ว่าง
4. ✅ ห้ามมี key ที่ไม่ใช่ column
5. ✅ ห้าม nested object/array

**Output:**
- `valid`: boolean
- `errors`: array of error messages
- `cleaned`: validated and cleaned records

### 4. Integration with Smart OCR Pipeline

**ไฟล์:** `functions/index.js`

**การเปลี่ยนแปลง:**
- ✅ เพิ่ม Step 6: Validate JSON table
- ✅ ใช้ validation result ก่อน return
- ✅ Log validation errors ใน metadata
- ✅ ถ้า validation fail แต่มี valid records บางส่วน → ใช้ valid records แต่ confidence = "low"
- ✅ ถ้า validation fail ทั้งหมด → throw error

### 5. Firebase Functions v2 Compliance

**ไฟล์:** `functions/utils/geminiClient.js`

**การเปลี่ยนแปลง:**
- ✅ ใช้ `process.env.GEMINI_API_KEY` เท่านั้น
- ✅ ห้ามใช้ `functions.config()`
- ✅ Throw error ชัดเจนถ้า API key ไม่ถูกตั้งค่า
- ✅ Lazy initialization (validate ตอนเรียกใช้)

## 📋 Architecture Flow

```
1. PDF Input
   ↓
2. Check Text Layer
   ├─ มี → Extract text ตรง
   └─ ไม่มี → Google Vision OCR
   ↓
3. Normalize Text
   ↓
4. Gemini Pass #1: Document Understanding
   - Output: Bullet point ภาษาไทย + JSON structure
   ↓
5. Gemini Pass #2: Convert to JSON Table
   - Output: JSON array (1 object = 1 คน)
   ↓
6. Validate JSON Table
   - Check: array, keys, nested, name fields
   ↓
7. Return Validated Records
   ↓
8. Preview (UI)
   ↓
9. Export Excel (ใช้ logic เดิม)
```

## 🔍 Validation Details

### Rules ที่ตรวจสอบ:

1. **Array Check**
   - ต้องเป็น array
   - ต้องไม่ว่าง

2. **Object Structure**
   - ต้องเป็น object (ไม่ใช่ array, null)
   - ห้าม nested objects/arrays

3. **Column Keys**
   - ต้องมี key ครบตาม column definitions
   - ห้ามมี key ที่ไม่ใช่ column

4. **Name Fields**
   - ต้องมีชื่ออย่างน้อย 1 field ไม่ว่าง
   - ตรวจสอบจาก column label (ชื่อ, name, นาม, ผู้)

5. **Data Cleaning**
   - Convert values เป็น string
   - Trim whitespace
   - Handle null/undefined → ""

## 🚀 Deployment

```bash
cd functions
firebase deploy --only functions:smartOcr
```

## ⚠️ Requirements

1. **GEMINI_API_KEY** ต้องถูกตั้งค่าใน Firebase Console
2. Package `@google/generative-ai` ต้องติดตั้งแล้ว
3. Function ต้อง deploy แล้ว

## 📝 Notes

- Pass #1 ใช้เพื่อ "เข้าใจเอกสาร" เท่านั้น ไม่ได้ใช้ export
- Pass #2 ต้อง output JSON array เท่านั้น
- Validation จะ reject records ที่ไม่ผ่าน แต่ยังคงใช้ valid records
- ถ้า validation fail ทั้งหมด จะ throw error
