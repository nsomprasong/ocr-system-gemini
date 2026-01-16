/**
 * Text Normalizer Utility
 * 
 * Normalizes and cleans up text before sending to Gemini.
 * Handles common OCR/text extraction issues.
 */

/**
 * Normalizes text extracted from PDF or OCR
 * 
 * @param {string} text - Raw text
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  
  // Step 1: Normalize line endings
  let normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  
  // Step 2: Fix fragmented OCR text - merge single-character lines with next line
  // This helps when OCR splits words across lines
  const lines = normalized.split("\n");
  const mergedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : "";
    
    // If current line is a single character (not space, not empty) and next line exists
    if (line.length === 1 && line.match(/[^\s]/) && nextLine.length > 0) {
      // Merge with next line (no space if it's likely part of a word)
      mergedLines.push(line + nextLine);
      i++; // Skip next line as it's merged
    } else if (line.length > 0) {
      mergedLines.push(line);
    }
  }
  normalized = mergedLines.join("\n");
  
  // Step 3: Remove excessive whitespace
  normalized = normalized
    .replace(/[ \t]+/g, " ") // Multiple spaces/tabs → single space
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines → double newline
    .trim();
  
  // Step 4: Remove zero-width characters and other invisible chars
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");
  
  // Step 5: Normalize Thai characters (common OCR errors)
  normalized = normalized
    .replace(/๐/g, "0")
    .replace(/๑/g, "1")
    .replace(/๒/g, "2")
    .replace(/๓/g, "3")
    .replace(/๔/g, "4")
    .replace(/๕/g, "5")
    .replace(/๖/g, "6")
    .replace(/๗/g, "7")
    .replace(/๘/g, "8")
    .replace(/๙/g, "9");
  
  return normalized;
}

/**
 * Cleans up text for Gemini processing
 * Removes artifacts and improves readability
 * 
 * @param {string} text - Normalized text
 * @returns {string} Cleaned text
 */
function cleanupText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  
  let cleaned = text;
  
  // Remove page numbers and headers/footers (common patterns)
  // This is heuristic - adjust based on actual document patterns
  cleaned = cleaned
    .replace(/^หน้า\s*\d+\s*$/gm, "") // "หน้า 1" on its own line
    .replace(/^\d+\s*$/gm, "") // Standalone numbers (likely page numbers)
    .replace(/^Page\s+\d+\s*$/gim, ""); // "Page 1" on its own line
  
  // Remove excessive blank lines
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");
  
  return cleaned.trim();
}

/**
 * Combines normalization and cleanup
 * 
 * @param {string} text - Raw text
 * @returns {string} Normalized and cleaned text
 */
function normalizeAndCleanup(text) {
  const normalized = normalizeText(text);
  const cleaned = cleanupText(normalized);
  return cleaned;
}

module.exports = {
  normalizeText,
  cleanupText,
  normalizeAndCleanup,
};
