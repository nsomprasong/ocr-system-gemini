/**
 * Parse page range string to array of page numbers
 * 
 * Examples:
 * - "1" → [1]
 * - "1-5" → [1,2,3,4,5]
 * - "1,3,5" → [1,3,5]
 * - "1,2-6,20-22" → [1,2,3,4,5,6,20,21,22]
 * - "all" or undefined → null (process all pages)
 * 
 * @param {string|undefined} pageRange - Page range string (e.g. "1,2-6,20-22")
 * @param {number} totalPages - Total number of pages in PDF (for validation)
 * @returns {number[]|null} Array of page numbers (1-indexed) or null for all pages
 */
function parsePageRange(pageRange, totalPages = null) {
  // If pageRange is empty, undefined, or "all", process all pages
  if (!pageRange || pageRange.trim() === "" || pageRange.trim().toLowerCase() === "all") {
    return null; // null means all pages
  }

  const pages = new Set();
  const parts = pageRange.split(",").map(p => p.trim()).filter(p => p.length > 0);

  for (const part of parts) {
    if (part.includes("-")) {
      // Range: "1-5" or "10-15"
      const [start, end] = part.split("-").map(s => parseInt(s.trim(), 10));
      
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid page range: "${part}". Expected format: "start-end" (e.g. "1-5")`);
      }
      
      if (start < 1) {
        throw new Error(`Page number must be >= 1, got: ${start}`);
      }
      
      if (end < start) {
        throw new Error(`Range end (${end}) must be >= range start (${start})`);
      }
      
      // Validate against total pages if provided
      if (totalPages !== null && end > totalPages) {
        throw new Error(`Page ${end} exceeds total pages (${totalPages})`);
      }
      
      // Add all pages in range (inclusive)
      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      // Single page: "1" or "5"
      const pageNum = parseInt(part, 10);
      
      if (isNaN(pageNum)) {
        throw new Error(`Invalid page number: "${part}". Expected a number.`);
      }
      
      if (pageNum < 1) {
        throw new Error(`Page number must be >= 1, got: ${pageNum}`);
      }
      
      // Validate against total pages if provided
      if (totalPages !== null && pageNum > totalPages) {
        throw new Error(`Page ${pageNum} exceeds total pages (${totalPages})`);
      }
      
      pages.add(pageNum);
    }
  }

  // Convert Set to sorted array
  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  
  if (sortedPages.length === 0) {
    return null; // No pages specified, process all
  }

  return sortedPages;
}

module.exports = {
  parsePageRange,
};
