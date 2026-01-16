/**
 * Text Utilities - Helper functions for text processing
 */

/**
 * Remove empty lines from text (lines that contain only whitespace)
 * Preserves spaces and line breaks within non-empty lines
 * @param {string} text - Text to process
 * @returns {string} Text with empty lines removed
 */
export function removeEmptyLines(text) {
  if (!text || typeof text !== "string") return text || ""
  
  // Split by newlines, filter out empty/whitespace-only lines, then rejoin
  return text
    .split("\n")
    .filter(line => line.trim().length > 0)
    .join("\n")
}

/**
 * Remove trailing empty lines from text
 * @param {string} text - Text to process
 * @returns {string} Text with trailing empty lines removed
 */
export function removeTrailingEmptyLines(text) {
  if (!text || typeof text !== "string") return text || ""
  
  // Remove trailing newlines and whitespace
  return text.replace(/\n\s*$/, "")
}
