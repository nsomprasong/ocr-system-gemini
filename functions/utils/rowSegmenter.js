/**
 * Row Segmenter
 * 
 * Refactored row separation/segmentation phase for OCR post-processing.
 * Ensures Thai names and house numbers stay in the same row.
 */

/**
 * Pre-normalize text: Merge Thai characters separated by single spaces
 * @param {string} text - Raw OCR text
 * @returns {string} Pre-normalized text
 */
function preNormalizeText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  
  // Split into words/tokens
  const tokens = text.split(/\s+/);
  const normalized = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (token.length === 0) continue;
    
    // Check if token is a single Thai character
    const isSingleThai = /^[ก-๙]$/.test(token);
    
    // Check if next token is also a single Thai character
    const nextToken = i < tokens.length - 1 ? tokens[i + 1].trim() : "";
    const isNextSingleThai = /^[ก-๙]$/.test(nextToken);
    
    if (isSingleThai && isNextSingleThai) {
      // Merge consecutive single Thai characters (no space)
      let merged = token;
      let j = i + 1;
      while (j < tokens.length) {
        const next = tokens[j].trim();
        if (/^[ก-๙]$/.test(next)) {
          merged += next;
          j++;
        } else {
          break;
        }
      }
      normalized.push(merged);
      i = j - 1; // Skip merged tokens
    } else {
      normalized.push(token);
    }
  }
  
  return normalized.join(" ");
}

/**
 * Detect if text contains a Thai person name
 * @param {string} text - Text to check
 * @returns {boolean} True if likely contains a name
 */
function detectName(text) {
  if (!text || text.trim().length < 6) {
    return false;
  }
  
  const trimmed = text.trim();
  
  // Must contain Thai characters
  if (!/[ก-๙]/.test(trimmed)) {
    return false;
  }
  
  // Check for name prefixes (but not ONLY prefixes)
  const namePrefixes = /^(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.|น\.ส\.|ว\.อ\.|อ\.|น\.)\s+/;
  const hasPrefix = namePrefixes.test(trimmed);
  
  // If has prefix, check that there's more content
  if (hasPrefix) {
    const afterPrefix = trimmed.replace(namePrefixes, "").trim();
    return afterPrefix.length >= 3 && /[ก-๙]{3,}/.test(afterPrefix);
  }
  
  // No prefix but has substantial Thai text (likely name)
  const thaiChars = trimmed.match(/[ก-๙]+/g);
  if (thaiChars) {
    const totalThaiLength = thaiChars.join("").length;
    return totalThaiLength >= 6;
  }
  
  return false;
}

/**
 * Detect house number in text
 * @param {string} text - Text to check
 * @returns {string|null} House number if found, null otherwise
 */
function detectHouseNumber(text) {
  if (!text) return null;
  
  // House number patterns: number, number/number, number-number, number,number
  const patterns = [
    /\b(\d{1,3}\/\d{1,3})\b/,  // 12/3
    /\b(\d{1,3}-\d{1,3})\b/,    // 12-13
    /\b(\d{1,3},\d{1,3})\b/,    // 12,13
    /\b(\d{1,3})\b/,            // 12
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Segment rawText into logical rows
 * @param {string} rawText - Raw OCR text
 * @returns {Array<{rawRowText: string}>} Array of row objects
 */
function segmentRows(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return [];
  }
  
  // Step 1: Pre-normalize
  const normalized = preNormalizeText(rawText);
  
  // Step 2: Split into candidate lines
  // Split by newlines and strong numeric breaks
  const candidateLines = normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Step 3: Row Assembly Logic
  // Group consecutive lines that belong to the same person record
  // Only split when we detect a new name (strong break)
  const rows = [];
  let currentRowBuffer = [];
  
  for (let i = 0; i < candidateLines.length; i++) {
    const line = candidateLines[i];
    const nextLine = i < candidateLines.length - 1 ? candidateLines[i + 1] : "";
    
    // Check if next line starts a new name (strong break - this is when we split)
    const nextHasName = nextLine && detectName(nextLine);
    
    // Add current line to buffer
    currentRowBuffer.push(line);
    
    // Only finalize row if next line starts a new name (strong break)
    if (nextHasName) {
      const currentText = currentRowBuffer.join(" ").trim();
      if (currentText.length > 0) {
        rows.push({
          rawRowText: currentText,
        });
      }
      currentRowBuffer = [];
    }
  }
  
  // Add last row if buffer not empty
  if (currentRowBuffer.length > 0) {
    const lastText = currentRowBuffer.join(" ").trim();
    if (lastText.length > 0) {
      rows.push({
        rawRowText: lastText,
      });
    }
  }
  
  // Step 4: Filter noise-only rows
  const filteredRows = rows.filter(row => {
    const text = row.rawRowText;
    if (!text || text.trim().length === 0) {
      return false;
    }
    
    const hasThai = /[ก-๙]/.test(text);
    const hasHouseNumber = detectHouseNumber(text) !== null;
    
    // Keep if has Thai OR house number
    return hasThai || hasHouseNumber;
  });
  
  return filteredRows;
}

module.exports = {
  segmentRows,
  preNormalizeText,
  detectName,
  detectHouseNumber,
};
