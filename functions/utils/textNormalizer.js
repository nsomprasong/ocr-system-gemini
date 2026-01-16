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
  
  // Remove excessive whitespace (keep single spaces and newlines)
  let normalized = text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\r/g, "\n") // Normalize line endings
    .replace(/[ \t]+/g, " ") // Multiple spaces/tabs → single space
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines → double newline
    .trim();
  
  // Remove zero-width characters and other invisible chars
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");
  
  // Normalize Thai characters (common OCR errors)
  // Note: Only fix obvious errors, don't over-correct
  normalized = normalized
    .replace(/๐/g, "0") // Thai zero → Arabic zero
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
