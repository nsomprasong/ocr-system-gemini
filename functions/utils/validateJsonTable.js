/**
 * Validates JSON table from Gemini Pass #2
 * 
 * Rules:
 * - Must be array
 * - Every object must have all required column keys
 * - Must have at least 1 non-empty name field
 * - No extra keys (only column keys allowed)
 * - No nested objects/arrays
 * 
 * @param {Array} jsonTable - JSON array from Gemini
 * @param {Array} columnDefinitions - Column definitions with columnKey
 * @returns {Object} { valid: boolean, errors: string[], cleaned: Array }
 */
function validateJsonTable(jsonTable, columnDefinitions) {
  const errors = [];
  const cleaned = [];
  
  // Rule 1: Must be array
  if (!Array.isArray(jsonTable)) {
    errors.push("Output must be an array");
    return { valid: false, errors, cleaned: [] };
  }
  
  if (jsonTable.length === 0) {
    errors.push("Array is empty");
    return { valid: false, errors, cleaned: [] };
  }
  
  // Get all required column keys
  const requiredKeys = columnDefinitions.map(col => col.columnKey);
  const keySet = new Set(requiredKeys);
  
  // Identify name fields (columns that might contain person names)
  const nameFields = columnDefinitions
    .filter(col => {
      const label = (col.label || col.columnKey).toLowerCase();
      return label.includes("ชื่อ") || 
             label.includes("name") || 
             label.includes("นาม") ||
             label.includes("ผู้");
    })
    .map(col => col.columnKey);
  
  // Validate each record
  for (let i = 0; i < jsonTable.length; i++) {
    const record = jsonTable[i];
    const recordErrors = [];
    
    // Rule 2: Must be object
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      recordErrors.push(`Record ${i + 1}: Must be an object`);
      continue;
    }
    
    // Rule 3: Check for nested objects/arrays
    for (const key in record) {
      const value = record[key];
      if (typeof value === "object" && value !== null) {
        recordErrors.push(`Record ${i + 1}, field "${key}": Contains nested object/array (not allowed)`);
      }
    }
    
    // Rule 4: Check for missing keys (but don't skip - we'll add them as empty strings)
    const recordKeys = Object.keys(record);
    const missingKeys = requiredKeys.filter(key => !(key in record));
    if (missingKeys.length > 0) {
      // Log warning but don't skip - we'll add missing keys as empty strings
      console.warn(`⚠️ [Validation] Record ${i + 1}: Missing keys (will be added as empty): ${missingKeys.join(", ")}`);
    }
    
    // Rule 5: No extra keys (only column keys allowed)
    const extraKeys = recordKeys.filter(key => !keySet.has(key));
    if (extraKeys.length > 0) {
      // Log warning but don't skip - we'll remove extra keys during cleaning
      console.warn(`⚠️ [Validation] Record ${i + 1}: Extra keys (will be removed): ${extraKeys.join(", ")}`);
    }
    
    // Rule 6: Must have at least 1 non-empty field (to avoid completely empty records)
    // IMPORTANT: Be lenient - check if record has ANY non-empty field
    const hasAnyData = Object.values(record).some(value => {
      return value && typeof value === "string" && value.trim().length > 0;
    });
    if (!hasAnyData) {
      // Only skip if record is completely empty (no data at all)
      recordErrors.push(`Record ${i + 1}: All fields are empty`);
      console.warn(`⚠️ [Validation] Record ${i + 1} is completely empty, skipping`);
      continue; // Skip completely empty records
    }
    
    // If record has critical structural errors (not object, nested objects/arrays), skip it
    const criticalErrors = recordErrors.filter(err => 
      err.includes("Must be an object") || 
      err.includes("nested object/array")
    );
    
    if (criticalErrors.length > 0) {
      errors.push(...recordErrors);
      console.warn(`⚠️ [Validation] Record ${i + 1} has critical structural errors, skipping:`, criticalErrors);
      continue; // Skip only records with structural errors
    }
    
    // Clean record: ensure all keys are present, strings, and trim values
    // IMPORTANT: Add missing keys as empty strings instead of skipping
    const cleanedRecord = {};
    for (const key of requiredKeys) {
      const value = record[key];
      if (value === null || value === undefined) {
        cleanedRecord[key] = "";
      } else if (typeof value === "object") {
        // Skip nested objects (should not happen after validation)
        cleanedRecord[key] = "";
      } else {
        cleanedRecord[key] = String(value).trim();
      }
    }
    
    cleaned.push(cleanedRecord);
  }
  
  const valid = errors.length === 0 && cleaned.length > 0;
  
  if (!valid) {
    console.error(`❌ [Validation] Validation failed:`, {
      totalRecords: jsonTable.length,
      validRecords: cleaned.length,
      errors: errors.length,
    });
  } else {
    console.log(`✅ [Validation] Validation passed: ${cleaned.length} valid records`);
  }
  
  return { valid, errors, cleaned };
}

module.exports = {
  validateJsonTable,
};
