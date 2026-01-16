// document-engine/04_validateRecords.ts
// ---------------------------------------------------------------------------
// Stage 4: Validate records from Gemini Pass #2 before being used by the system.
//
// Responsibility:
// - ตรวจสอบว่า records ที่ได้จาก Pass #2 มีรูปแบบที่ "ปลอดภัยต่อการใช้งานจริง"
// - ตรวจเฉพาะโครงสร้าง (shape) และประเภทข้อมูลพื้นฐานเท่านั้น
// - ไม่แก้ไขค่า, ไม่รู้จัก Gemini, ไม่รู้จัก Excel และไม่โยน error
//
// Validation Rules (บังคับทั้งหมด):
// 1) records
//    - ต้องเป็น array
//    - length > 0
// 2) แต่ละ record
//    - ต้องเป็น plain object
//    - ห้าม nested object
//    - ห้าม nested array
// 3) key
//    - ต้องมี key ครบทุก column
//    - ห้ามมี key อื่นนอกเหนือจาก columns
// 4) value
//    - ต้องเป็น string หรือ number เท่านั้น
//    - ถ้า null / undefined → fail
// 5) logical rule
//    - ต้องมี field ที่เป็นชื่ออย่างน้อย 1 field (เช่น column ที่มีคำว่า "ชื่อ")
//    - ค่านั้นต้องไม่เป็น string ว่าง
//
// Output:
// - ถ้า valid → return true
// - ถ้า invalid → return false และ log เหตุผลแบบอ่านรู้เรื่อง

/**
 * ตัดสินว่า records ที่ได้จาก Gemini Pass #2 "ปลอดภัยต่อการใช้งานจริง" หรือไม่
 * ตามกติกาที่กำหนดด้านบน
 *
 * หมายเหตุสำคัญ:
 * - ห้าม throw error
 * - ห้ามแก้ไข records ที่รับเข้ามา
 * - ไม่รู้จัก Gemini / Excel และไม่ผูกกับ UI
 */
export function validateRecords(records: any[], columns: string[]): boolean {
  // Rule 1: records ต้องเป็น array และ length > 0
  if (!Array.isArray(records)) {
    console.error("[validateRecords] Invalid records: not an array");
    return false;
  }

  if (records.length === 0) {
    console.error("[validateRecords] Invalid records: array is empty");
    return false;
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    console.error("[validateRecords] Invalid columns: must be a non-empty string array");
    return false;
  }

  const columnSet = new Set(columns);

  // หา column ที่น่าจะเป็นชื่อ (มีคำว่า "ชื่อ" หรือ "name")
  const nameColumns = columns.filter((c) => {
    const lower = c.toLowerCase();
    return c.includes("ชื่อ") || lower.includes("name");
  });

  if (nameColumns.length === 0) {
    console.error(
      "[validateRecords] Invalid schema: no column that appears to be a name field (expected a column containing 'ชื่อ' or 'name')"
    );
    return false;
  }

  // ตรวจแต่ละ record
  for (let index = 0; index < records.length; index++) {
    const record = records[index];

    // Rule 2: ต้องเป็น plain object (ไม่ใช่ array และไม่ใช่ null)
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      console.error(
        `[validateRecords] Record ${index} is not a plain object (found ${record === null ? "null" : Array.isArray(record) ? "array" : typeof record})`
      );
      return false;
    }

    const keys = Object.keys(record);

    // Rule 3.1: ต้องมี key ครบทุก column
    for (const col of columns) {
      if (!keys.includes(col)) {
        console.error(
          `[validateRecords] Record ${index} is missing required key "${col}"`
        );
        return false;
      }
    }

    // Rule 3.2: ห้ามมี key อื่นนอกเหนือจาก columns
    for (const key of keys) {
      if (!columnSet.has(key)) {
        console.error(
          `[validateRecords] Record ${index} has unexpected key "${key}" not in allowed columns`
        );
        return false;
      }
    }

    // Rule 4: value ต้องเป็น string หรือ number เท่านั้น, null/undefined → fail
    for (const key of keys) {
      const value = (record as any)[key];

      if (value === null || value === undefined) {
        console.error(
          `[validateRecords] Record ${index} has null/undefined value at key "${key}"`
        );
        return false;
      }

      const valueType = typeof value;
      if (valueType !== "string" && valueType !== "number") {
        console.error(
          `[validateRecords] Record ${index} has invalid value type at key "${key}": expected string or number, found ${valueType}`
        );
        return false;
      }

      // Rule 2 (ซ้ำ): ห้าม nested object/array ในค่า
      // (string/number ผ่านแล้ว, object/array จะถูกจับได้ด้านบน)
    }

    // Rule 5: ต้องมี field ชื่ออย่างน้อย 1 field และไม่เป็น string ว่าง
    let hasNonEmptyNameField = false;
    for (const nameKey of nameColumns) {
      const rawValue = (record as any)[nameKey];
      // ตาม rule 4 rawValue ต้องเป็น string หรือ number อยู่แล้ว
      if (typeof rawValue === "string") {
        if (rawValue.trim().length > 0) {
          hasNonEmptyNameField = true;
          break;
        }
      } else if (typeof rawValue === "number") {
        // โดยปกติชื่อควรเป็น string แต่ถ้าเป็น number แล้วไม่ใช่ NaN ก็ถือว่ามีค่า
        if (!Number.isNaN(rawValue)) {
          hasNonEmptyNameField = true;
          break;
        }
      }
    }

    if (!hasNonEmptyNameField) {
      console.error(
        `[validateRecords] Record ${index} has no non-empty name field (checked columns: ${nameColumns.join(
          ", "
        )})`
      );
      return false;
    }
  }

  // ถ้าผ่านทุก rule
  return true;
}


