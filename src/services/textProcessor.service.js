// Text Processing Service - Filter junk, normalize, extract data
// Version: 2.0 - Enhanced name extraction with location filtering
console.log("📦 textProcessor.service.js loaded - Version 2.0")

/**
 * ตรวจสอบว่าเป็น junk text หรือไม่ (ตรงกับ Python script เป๊ะๆ)
 */
export function isJunk(line) {
  line = line.trim()
  if (!line) return true
  // ตรงกับ Python: if re.fullmatch(r"[0-9/]+", line)
  if (/^[0-9/]+$/.test(line)) return true
  // ตรงกับ Python: if len(line) <= 2
  if (line.length <= 2) return true
  
  // ตรงกับ Python junk keywords list (บรรทัด 86-94)
  const junkKeywords = [
    "ชื่อตัว", "ชื่อสกุล", "เพศ", "ลำดับ",
    "เลขหมาย", "เลขประจำ", "ประจำบ้าน",
    "ลายมือชื่อ", "ลายพิมพ์", "หมายเหตุ",
    "หมู่ที่", "ตำบล",
    "ประกาศ", "ผู้อำนวยการ", "ผู้ชนวยการ",
    "การเลือก", "การเลือกตั้ง", "การบริหาร",
    "เรื่อง", "คำสั่ง", "หัวหน้า", "ผู้มีสิทธิเลือกตั้ง", "วันที่เลือกตั้ง",
    "ก.พ.", "พ.ค.", "ส.ส.", "ย้ายเข้าก่อน", "มีสิทธิเลือกตั้ง", "ยายเข้าก่อน"
  ]
  
  // ตรงกับ Python: for kw in [...]: if kw in line: return True
  for (const kw of junkKeywords) {
    if (line.includes(kw)) return true
  }
  
  return false
}

/**
 * Normalize ชื่อ-สกุล (ตรงกับ Python script เป๊ะๆ + ตัดส่วนอำเภอ/ตำบล/จังหวัดออก)
 * Python: normalize_name(line)
 *   line = re.sub(r"[^\u0E00-\u0E7F\s\.]", "", line)
 *   line = re.sub(r"\s+", " ", line).strip()
 *   line = re.sub(r"\s*\.\s*", ".", line)
 *   line = re.sub(r"\b(นาย|นาง|นางสาว)\s+", r"\1", line)
 *   line = re.sub(r"\.{2,}", ".", line)
 *   return line.strip()
 * 
 * เพิ่มเติม: ตัดส่วนอำเภอ/ตำบล/จังหวัดออกเพื่อให้ได้แต่ชื่อ-สกุล
 * (Python script ไม่ได้ตัด แต่ถ้า OCR text มีอำเภออยู่ในบรรทัดเดียวกัน ต้องตัดออก)
 */
export function normalizeName(line) {
  // ตัดส่วน "อำเภอ" และข้อมูลที่ตามมาออก (เช่น "อำเภอด่านมะขามเตี้ย กลอนโด")
  // รองรับทั้ง "อำเภอ" (อ+ำ+เภอ) และ "อําเภอ" (อ+ํ+า+เภอ) ที่มีอักขระพิเศษ
  // ใช้ regex เพื่อหาทั้งสองรูปแบบ
  // "อำเภอ" = อ + ำ + เภอ (ำ = \u0E33)
  // "อําเภอ" = อ + ํ + า + เภอ (ํ = \u0E4D, า = \u0E32)
  // ใช้ regex ที่ match ทั้งสองรูปแบบ: อ + (ำ หรือ ํ+า) + เภอ
  const amphoeRegex = /อ(ำ|ํา)เภอ/
  const amphoeMatch = line.match(amphoeRegex)
  if (amphoeMatch && amphoeMatch.index !== undefined) {
    const amphoeIndex = amphoeMatch.index
    const beforeAmphoe = line.substring(0, amphoeIndex).trim()
    console.log(`    ✂️ Found "${amphoeMatch[0]}" at index ${amphoeIndex}, before: "${beforeAmphoe}"`)
    line = beforeAmphoe
  } else {
    // ลองหาด้วย indexOf เป็น fallback
    let amphoeIndex = line.indexOf("อำเภอ")
    if (amphoeIndex === -1) {
      amphoeIndex = line.indexOf("อําเภอ")
    }
    if (amphoeIndex !== -1) {
      const beforeAmphoe = line.substring(0, amphoeIndex).trim()
      console.log(`    ✂️ Found "อำเภอ" (fallback) at index ${amphoeIndex}, before: "${beforeAmphoe}"`)
      line = beforeAmphoe
    } else {
      console.log(`    ⚠️ Could not find "อำเภอ" in line: "${line.substring(0, 50)}..."`)
    }
  }
  
  // ตัดส่วน "ตำบล" และข้อมูลที่ตามมาออก
  const tambonMatch = line.match(/ตำบล/)
  if (tambonMatch) {
    const tambonIndex = line.indexOf(tambonMatch[0])
    if (tambonIndex !== -1) {
      line = line.substring(0, tambonIndex).trim()
      console.log(`    ✂️ Cut "ตำบล" part, remaining: "${line}"`)
    }
  }
  
  // ตัดส่วน "จังหวัด" และข้อมูลที่ตามมาออก
  const provinceMatch = line.match(/จังหวัด/)
  if (provinceMatch) {
    const provinceIndex = line.indexOf(provinceMatch[0])
    if (provinceIndex !== -1) {
      line = line.substring(0, provinceIndex).trim()
      console.log(`    ✂️ Cut "จังหวัด" part, remaining: "${line}"`)
    }
  }
  
  // ลบตัวอักษรเดี่ยวๆ ที่อยู่ท้ายชื่อ (เช่น "ท" ใน "เกื้อกูล กิมทอง ท")
  line = line.replace(/\s+[\u0E00-\u0E7F]\s*$/, "").trim()
  
  // ตรงกับ Python: re.sub(r"[^\u0E00-\u0E7F\s\.]", "", line)
  line = line.replace(/[^\u0E00-\u0E7F\s\.]/g, "")
  // ตรงกับ Python: re.sub(r"\s+", " ", line).strip()
  line = line.replace(/\s+/g, " ").trim()
  // ตรงกับ Python: re.sub(r"\s*\.\s*", ".", line)
  line = line.replace(/\s*\.\s*/g, ".")
  // ตรงกับ Python: re.sub(r"\b(นาย|นาง|นางสาว)\s+", r"\1", line)
  line = line.replace(/\b(นาย|นาง|นางสาว)\s+/g, "$1")
  // ตรงกับ Python: re.sub(r"\.{2,}", ".", line)
  line = line.replace(/\.{2,}/g, ".")
  // ตรงกับ Python: return line.strip()
  return line.trim()
}

/**
 * แยกชื่อจากบรรทัดที่มีข้อมูลตาราง (เช่น "1 เกื้อกูล ทิมทอง 11 อำเภอด่านมะขามเตี้ย กลอนโด 9")
 * โดยหาส่วนที่เป็นชื่อ (2-4 คำภาษาไทยติดกัน) ที่ไม่มีตัวเลขและไม่มี junk keywords
 */
function extractNameFromTableRow(line) {
  const trimmed = line.trim()
  
  // ตัดส่วน "อำเภอ" และข้อมูลที่ตามมาออกก่อน
  let namePart = trimmed
  const amphoeIndex = trimmed.indexOf("อำเภอ")
  const tambonIndex = trimmed.indexOf("ตำบล")
  const provinceIndex = trimmed.indexOf("จังหวัด")
  
  const locationIndices = [amphoeIndex, tambonIndex, provinceIndex].filter(idx => idx !== -1)
  if (locationIndices.length > 0) {
    const firstLocationIndex = Math.min(...locationIndices)
    namePart = trimmed.substring(0, firstLocationIndex).trim()
  }
  
  // หาคำภาษาไทยทั้งหมดในส่วนก่อนอำเภอ
  const thaiWords = namePart.match(/[\u0E00-\u0E7F]+/g)
  if (!thaiWords || thaiWords.length < 2) {
    return null
  }
  
  // Junk keywords ที่ต้อง filter
  const junkKeywords = [
    "ชื่อตัว", "ชื่อสกุล", "เพศ", "ลำดับ",
    "เลขหมาย", "เลขประจำ", "ประจำบ้าน",
    "ลายมือชื่อ", "ลายพิมพ์", "หมายเหตุ",
    "หมู่ที่", "ตำบล", "อำเภอ", "จังหวัด",
    "ประกาศ", "ผู้อำนวยการ", "ผู้ชนวยการ",
    "การเลือก", "การเลือกตั้ง", "การบริหาร",
    "เรื่อง", "คำสั่ง", "หัวหน้า", "ผู้มีสิทธิเลือกตั้ง", "วันที่เลือกตั้ง",
    "ก.พ.", "พ.ค.", "ส.ส.", "ย้ายเข้าก่อน", "มีสิทธิเลือกตั้ง", "ยายเข้าก่อน",
    "รายชื่อ", "ประชาชน", "บ้านเลขที่", "ทีม"
  ]
  
  // หาส่วนที่เป็นชื่อ (2-4 คำติดกันที่ไม่มี junk keyword และไม่มีตัวเลข)
  // เริ่มจากท้ายสุดก่อน (เพราะชื่อมักอยู่หลังลำดับและก่อนบ้านเลขที่)
  for (let start = thaiWords.length - 2; start >= 0; start--) {
    for (let length = 2; length <= Math.min(4, thaiWords.length - start); length++) {
      const nameWords = thaiWords.slice(start, start + length)
      const namePart = nameWords.join(" ")
      
      // ตรวจสอบว่าไม่มี junk keyword
      let hasJunk = false
      for (const kw of junkKeywords) {
        if (namePart.includes(kw)) {
          hasJunk = true
          break
        }
      }
      
      if (!hasJunk) {
        // ตรวจสอบว่าเป็นชื่อที่ถูกต้อง (ไม่มีตัวเลข, มีความยาวเหมาะสม)
        if (namePart.length >= 3 && namePart.length <= 50 && !/[0-9]/.test(namePart)) {
          // ตรวจสอบรูปแบบชื่อ-สกุล (2-4 คำ)
          if (nameWords.length >= 2 && nameWords.length <= 4) {
            return namePart
          }
        }
      }
    }
  }
  
  return null
}

/**
 * ตรวจสอบว่าเป็นชื่อคนที่น่าจะถูกต้องหรือไม่ (Enhanced version)
 * เงื่อนไขที่ใช้:
 * 1. มีคำภาษาไทยอย่างน้อย 2 คำ (ตรวจสอบส่วนก่อนอำเภอ/ตำบล/จังหวัด)
 * 2. มีคำนำหน้า (นาย/นาง/นางสาว) หรือมีความยาวเหมาะสม
 * 3. ความยาวระหว่าง 3-50 ตัวอักษร (ตรวจสอบส่วนก่อนอำเภอ/ตำบล/จังหวัด)
 * 4. ไม่มีตัวเลขในส่วนชื่อ (แต่ยอมรับตัวเลขในส่วนอื่นๆ ของบรรทัด)
 * 5. ถ้ามีอำเภอ/ตำบล/จังหวัด ให้ตรวจสอบส่วนก่อนตำแหน่งนั้น
 */
function isValidName(line) {
  const trimmed = line.trim()
  
  // หาส่วนก่อนอำเภอ/ตำบล/จังหวัด (ถ้ามี)
  let namePart = trimmed
  const amphoeIndex = trimmed.indexOf("อำเภอ")
  const tambonIndex = trimmed.indexOf("ตำบล")
  const provinceIndex = trimmed.indexOf("จังหวัด")
  
  const locationIndices = [amphoeIndex, tambonIndex, provinceIndex].filter(idx => idx !== -1)
  if (locationIndices.length > 0) {
    const firstLocationIndex = Math.min(...locationIndices)
    namePart = trimmed.substring(0, firstLocationIndex).trim()
  }
  
  // หาคำภาษาไทยในส่วนชื่อ
  const thaiWords = namePart.match(/[\u0E00-\u0E7F]+/g)
  if (!thaiWords || thaiWords.length < 2) {
    return false
  }
  
  // ตรวจสอบว่ามีคำนำหน้า (นาย/นาง/นางสาว) หรือไม่
  const hasTitle = /^(นาย|นาง|นางสาว)/.test(namePart)
  
  // ตรวจสอบว่ามีตัวเลขในส่วนชื่อ (ไม่ใช่ทั้งบรรทัด)
  // ให้ตรวจสอบเฉพาะส่วนที่เป็นคำภาษาไทย (ไม่รวมตัวเลขที่อยู่ข้างๆ)
  const nameOnly = thaiWords.join(" ")
  const hasNumbers = /[0-9]/.test(nameOnly.replace(/\./g, ""))
  if (hasNumbers) {
    return false
  }
  
  // ตรวจสอบรูปแบบชื่อ-สกุล (มักจะมี 2-4 คำ)
  // ถ้ามีคำนำหน้า: 3-5 คำ (คำนำหน้า + ชื่อ + สกุล + อาจมีชื่อกลาง)
  // ถ้าไม่มีคำนำหน้า: 2-4 คำ (ชื่อ + สกุล + อาจมีชื่อกลาง)
  const wordCount = thaiWords.length
  if (hasTitle) {
    // มีคำนำหน้า: ควรมี 3-5 คำ (คำนำหน้า + ชื่อ + สกุล)
    if (wordCount < 3 || wordCount > 5) {
      return false
    }
  } else {
    // ไม่มีคำนำหน้า: ควรมี 2-4 คำ (ชื่อ + สกุล)
    if (wordCount < 2 || wordCount > 4) {
      return false
    }
  }
  
  return true
}

/**
 * แยกชื่อจากบรรทัดที่มี junk keywords (เช่น "รายชื่อประชาชน หัวหน้าทีม: ซานน สมสมสม")
 * โดยหาส่วนที่เป็นชื่อ-สกุล (2-4 คำภาษาไทย) ที่ไม่มี junk keywords
 */
function extractNameFromMixedLine(line) {
  const trimmed = line.trim()
  
  // หาคำภาษาไทยทั้งหมด
  const thaiWords = trimmed.match(/[\u0E00-\u0E7F]+/g)
  if (!thaiWords || thaiWords.length < 2) {
    return null
  }
  
  // Junk keywords ที่ต้อง filter
  const junkKeywords = [
    "ชื่อตัว", "ชื่อสกุล", "เพศ", "ลำดับ",
    "เลขหมาย", "เลขประจำ", "ประจำบ้าน",
    "ลายมือชื่อ", "ลายพิมพ์", "หมายเหตุ",
    "หมู่ที่", "ตำบล", "อำเภอ", "จังหวัด",
    "ประกาศ", "ผู้อำนวยการ", "ผู้ชนวยการ",
    "การเลือก", "การเลือกตั้ง", "การบริหาร",
    "เรื่อง", "คำสั่ง", "หัวหน้า", "ผู้มีสิทธิเลือกตั้ง", "วันที่เลือกตั้ง",
    "ก.พ.", "พ.ค.", "ส.ส.", "ย้ายเข้าก่อน", "มีสิทธิเลือกตั้ง", "ยายเข้าก่อน",
    "รายชื่อ", "ประชาชน", "บ้านเลขที่", "ทีม"
  ]
  
  // หาส่วนที่เป็นชื่อ (2-4 คำติดกันที่ไม่มี junk keyword)
  for (let i = 0; i <= thaiWords.length - 2; i++) {
    for (let j = 2; j <= Math.min(4, thaiWords.length - i); j++) {
      const nameWords = thaiWords.slice(i, i + j)
      const namePart = nameWords.join(" ")
      
      // ตรวจสอบว่าไม่มี junk keyword
      let hasJunk = false
      for (const kw of junkKeywords) {
        if (namePart.includes(kw)) {
          hasJunk = true
          break
        }
      }
      
      if (!hasJunk) {
        // ตรวจสอบว่าเป็นชื่อที่ถูกต้อง (ไม่มีตัวเลข, มีความยาวเหมาะสม)
        if (namePart.length >= 3 && namePart.length <= 50 && !/[0-9]/.test(namePart)) {
          return namePart
        }
      }
    }
  }
  
  return null
}

/**
 * แยกข้อมูลจาก OCR text (Enhanced version - ใช้เงื่อนไขที่เข้มงวดกว่า)
 * 
 * วิธีที่ 1: วิธีปัจจุบัน (ตรงกับ Python script)
 *   - Filter junk
 *   - หาคำภาษาไทยอย่างน้อย 2 คำ
 *   - Normalize
 * 
 * วิธีที่ 2: Enhanced (แนะนำ)
 *   - Filter junk
 *   - ตรวจสอบความยาว (3-50 ตัวอักษร)
 *   - หาคำภาษาไทยอย่างน้อย 2 คำ
 *   - ตรวจสอบคำนำหน้า (นาย/นาง/นางสาว)
 *   - ตรวจสอบรูปแบบชื่อ-สกุล (2-4 คำ หรือ 3-5 คำถ้ามีคำนำหน้า)
 *   - ตรวจสอบว่าไม่มีตัวเลข
 *   - ตรวจสอบว่าไม่มีคำที่บ่งบอกตำแหน่ง (อำเภอ/ตำบล/จังหวัด) - ถ้าไม่มีคำนำหน้า
 *   - Normalize
 * 
 * เพิ่มเติม: ถ้าบรรทัดมี junk keywords แต่มีชื่ออยู่ด้วย ให้ extract ชื่อออกมา
 */
export function extractDataFromText(text) {
  if (!text || typeof text !== "string") {
    console.warn("⚠️ extractDataFromText: text is empty or not a string")
    return []
  }
  
  const lines = text.split("\n")
  const names = []
  
  console.log(`🔍 Processing ${lines.length} lines from OCR text`)
  console.log(`📝 Full OCR text:`, text)
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    
    if (!trimmed) {
      console.log(`  Line ${i + 1}: (empty) - skipped`)
      continue
    }
    
    console.log(`  Line ${i + 1}: "${trimmed}"`)
    
    // Skip junk lines (ตรงกับ Python: if not is_junk(line))
    if (isJunk(trimmed)) {
      console.log(`    ⏭️ Skipped (junk line)`)
      // แต่ถ้ามีชื่ออยู่ในบรรทัดที่มี junk keywords ให้ลอง extract
      const extractedName = extractNameFromMixedLine(trimmed)
      if (extractedName) {
        console.log(`    🔍 Found name in mixed line: "${extractedName}"`)
        const normalized = normalizeName(extractedName)
        console.log(`    📝 Normalized: "${normalized}"`)
        if (normalized && normalized.length >= 3) {
          names.push(normalized)
          console.log(`    ✅ Extracted from mixed line: "${normalized}"`)
        }
      }
      continue
    }
    
    // หาคำภาษาไทย (ตรงกับ Python: thai_words = re.findall(r"[\u0E00-\u0E7F]+", line))
    const thaiWords = trimmed.match(/[\u0E00-\u0E7F]+/g)
    console.log(`    Thai words: ${thaiWords ? thaiWords.length : 0}`, thaiWords)
    
    // ตรวจสอบว่ามีคำภาษาไทยอย่างน้อย 2 คำ (ตรงกับ Python: if len(thai_words) >= 2)
    if (thaiWords && thaiWords.length >= 2) {
      // Normalize (จะตัดส่วนอำเภอ/ตำบล/จังหวัดออกอัตโนมัติ)
      const normalized = normalizeName(trimmed)
      console.log(`    📝 Normalized: "${normalized}"`)
      
      if (normalized && normalized.length >= 3) {
        // ตรวจสอบอีกครั้งหลัง normalize ว่ามีคำภาษาไทยอย่างน้อย 2 คำ
        const normalizedWords = normalized.match(/[\u0E00-\u0E7F]+/g)
        console.log(`    Normalized words: ${normalizedWords ? normalizedWords.length : 0}`, normalizedWords)
        
        if (normalizedWords && normalizedWords.length >= 2) {
          names.push(normalized)
          console.log(`    ✅ Extracted: "${normalized}"`)
        } else {
          console.log(`    ⏭️ Skipped (not enough words after normalize)`)
        }
      } else {
        console.log(`    ⏭️ Skipped (normalized too short: "${normalized}")`)
      }
    } else {
      console.log(`    ⏭️ Skipped (not enough Thai words)`)
    }
  }
  
  console.log(`📊 Total extracted: ${names.length} names from ${lines.length} lines`)
  return names
}

/**
 * แยกข้อมูลตาม pattern (สำหรับคอลัมน์อื่นๆ เช่น บ้านเลขที่, หมู่, ตำบล)
 */
export function extractByPattern(text, pattern) {
  // TODO: เพิ่ม logic สำหรับ extract ข้อมูลอื่นๆ ตาม pattern
  // ตอนนี้ return empty string
  return ""
}

/**
 * แยกข้อมูลตารางจาก OCR result โดยใช้ bounding boxes
 * @param {Object} ocrResult - { text, words: [{ text, bbox: { x0, y0, x1, y1 } }], lines: [...] }
 * @returns {Array} Array of rows, each row is an object with column data
 */
export function parseTableFromOCR(ocrResult) {
  console.log("📊 parseTableFromOCR: Starting table parsing...")
  
  if (!ocrResult || !ocrResult.words || ocrResult.words.length === 0) {
    console.warn("⚠️ No words data from OCR, falling back to text extraction")
    return []
  }

  const words = ocrResult.words
  console.log(`📊 Found ${words.length} words with bounding boxes`)

  // หา header row (แถวแรกที่อยู่บนสุด)
  // เรียง words ตาม y0 (top position)
  const sortedWords = [...words].sort((a, b) => {
    const y0A = a.bbox?.y0 || 0
    const y0B = b.bbox?.y0 || 0
    return y0A - y0B
  })

  // หา threshold สำหรับแยกแถว (ถ้า y0 ต่างกันมากกว่า threshold = แถวใหม่)
  // คำนวณจากความสูงเฉลี่ยของ words
  const avgHeight = sortedWords.reduce((sum, w) => {
    const h = (w.bbox?.y1 || 0) - (w.bbox?.y0 || 0)
    return sum + h
  }, 0) / sortedWords.length
  const rowThreshold = avgHeight * 1.5 // ถ้า y0 ต่างกันมากกว่า 1.5 เท่าของความสูง = แถวใหม่

  console.log(`📐 Row threshold: ${rowThreshold.toFixed(2)} (avg height: ${avgHeight.toFixed(2)})`)

  // แยก words เป็นแถว (rows)
  const rows = []
  let currentRow = []
  let currentY = null

  for (const word of sortedWords) {
    const y0 = word.bbox?.y0 || 0
    
    if (currentY === null) {
      // แถวแรก
      currentY = y0
      currentRow = [word]
    } else if (Math.abs(y0 - currentY) <= rowThreshold) {
      // อยู่ในแถวเดียวกัน
      currentRow.push(word)
    } else {
      // แถวใหม่
      rows.push(currentRow)
      currentRow = [word]
      currentY = y0
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  console.log(`📊 Parsed ${rows.length} rows from OCR`)

  // แยกแต่ละแถวเป็นคอลัมน์ (เรียงตาม x0 - left position)
  const tableData = rows.map((row, rowIndex) => {
    // เรียง words ในแถวตาม x0 (ซ้ายไปขวา)
    const sortedRow = [...row].sort((a, b) => {
      const x0A = a.bbox?.x0 || 0
      const x0B = b.bbox?.x0 || 0
      return x0A - x0B
    })

    // หา threshold สำหรับแยกคอลัมน์
    const avgWidth = sortedRow.reduce((sum, w) => {
      const ww = (w.bbox?.x1 || 0) - (w.bbox?.x0 || 0)
      return sum + ww
    }, 0) / sortedRow.length
    const colThreshold = avgWidth * 2 // ถ้า x0 ต่างกันมากกว่า 2 เท่าของความกว้าง = คอลัมน์ใหม่

    // แยกเป็นคอลัมน์
    const columns = []
    let currentCol = []
    let currentX = null

    for (const word of sortedRow) {
      const x0 = word.bbox?.x0 || 0
      
      if (currentX === null) {
        currentX = x0
        currentCol = [word]
      } else if (Math.abs(x0 - currentX) <= colThreshold) {
        // อยู่ในคอลัมน์เดียวกัน
        currentCol.push(word)
      } else {
        // คอลัมน์ใหม่
        columns.push(currentCol.map(w => w.text).join(" ").trim())
        currentCol = [word]
        currentX = x0
      }
    }
    if (currentCol.length > 0) {
      columns.push(currentCol.map(w => w.text).join(" ").trim())
    }

    return {
      rowIndex,
      columns, // Array of column values
    }
  })

  console.log(`📊 Parsed table: ${tableData.length} rows, sample row has ${tableData[0]?.columns?.length || 0} columns`)
  if (tableData.length > 0) {
    console.log(`📊 Sample row 0:`, tableData[0].columns)
  }

  return tableData
}

/**
 * Map ข้อมูลตารางกับ columnConfig ตาม label
 * @param {Array} tableData - Array of { rowIndex, columns }
 * @param {Array} columnConfig - Array of { key, label, mode, manualValue }
 * @returns {Array} Array of objects matching columnConfig structure
 */
export function mapColumnsToData(tableData, columnConfig) {
  console.log("🔗 mapColumnsToData: Mapping table data to column config...")
  console.log(`📊 Table data: ${tableData.length} rows`)
  console.log(`📊 Column config: ${columnConfig.length} columns`)

  if (tableData.length === 0) {
    console.warn("⚠️ No table data to map")
    return []
  }

  // หา header row (แถวแรกที่อาจเป็นหัวตาราง)
  // ลองหาแถวที่มีคำที่ตรงกับ columnConfig labels
  let headerRowIndex = 0
  let headerColumns = tableData[0]?.columns || []

  // ลองหาแถวที่มีคำที่ตรงกับ columnConfig labels
  for (let i = 0; i < Math.min(3, tableData.length); i++) {
    const row = tableData[i]
    const rowText = row.columns.join(" ").toLowerCase()
    
    // ตรวจสอบว่ามี label จาก columnConfig อยู่ในแถวนี้หรือไม่
    const hasHeader = columnConfig.some(col => {
      if (!col.label) return false
      const labelLower = col.label.toLowerCase()
      return rowText.includes(labelLower) || row.columns.some(colText => 
        colText.toLowerCase().includes(labelLower)
      )
    })

    if (hasHeader) {
      headerRowIndex = i
      headerColumns = row.columns
      console.log(`📋 Found header row at index ${i}:`, headerColumns)
      break
    }
  }

  // Map header columns กับ columnConfig
  // ถ้า columnConfig label ตรงกับ header column ให้ใช้ index นั้น
  const columnMapping = columnConfig.map((col, colIdx) => {
    if (col.mode === "manual") {
      return { columnIndex: -1, config: col } // Manual mode ไม่ต้อง map
    }

    // หา header column ที่ตรงกับ label
    const labelLower = col.label?.toLowerCase() || ""
    let matchedIndex = -1

    for (let i = 0; i < headerColumns.length; i++) {
      const headerText = headerColumns[i].toLowerCase()
      if (headerText.includes(labelLower) || labelLower.includes(headerText)) {
        matchedIndex = i
        break
      }
    }

    // ถ้าไม่เจอ ให้ใช้ index ตามลำดับ (colIdx)
    if (matchedIndex === -1 && colIdx < headerColumns.length) {
      matchedIndex = colIdx
    }

    return { columnIndex: matchedIndex, config: col }
  })

  console.log("🔗 Column mapping:", columnMapping.map(m => ({
    label: m.config.label,
    index: m.columnIndex,
    mode: m.config.mode
  })))

  // Map ข้อมูลแต่ละแถว (ข้าม header row)
  const mappedData = []
  for (let i = headerRowIndex + 1; i < tableData.length; i++) {
    const row = tableData[i]
    const rowData = {}

    columnMapping.forEach((mapping, colIdx) => {
      const col = mapping.config
      
      if (col.mode === "manual") {
        rowData[col.key] = col.manualValue || ""
      } else if (mapping.columnIndex >= 0 && mapping.columnIndex < row.columns.length) {
        // ดึงข้อมูลจากคอลัมน์ที่ map ไว้
        let value = row.columns[mapping.columnIndex]
        
        // Normalize ถ้าเป็นชื่อ
        if (col.label?.toLowerCase().includes("ชื่อ") || col.label?.toLowerCase().includes("รายชื่อ")) {
          value = normalizeName(value)
        }
        
        rowData[col.key] = value || ""
      } else {
        rowData[col.key] = ""
      }
    })

    // ข้ามแถวที่ว่างเปล่า
    const hasData = Object.values(rowData).some(v => v && v.trim().length > 0)
    if (hasData) {
      mappedData.push(rowData)
    }
  }

  console.log(`✅ Mapped ${mappedData.length} rows from ${tableData.length} table rows`)
  return mappedData
}
