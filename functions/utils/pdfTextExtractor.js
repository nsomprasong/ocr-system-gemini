/**
 * PDF Text Extractor Utility
 * 
 * Checks if PDF has text layer and extracts text directly.
 * If no text layer, returns null (caller should use OCR).
 */

const { getPdfjsLib } = require("./normalizePdfToImages");

/**
 * Checks if PDF has extractable text layer
 * @param {Buffer} pdfBuffer - PDF buffer
 * @returns {Promise<boolean>} True if PDF has text layer
 */
async function hasTextLayer(pdfBuffer) {
  try {
    const pdfjsLib = await getPdfjsLib();
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array, verbosity: 0 });
    const pdf = await loadingTask.promise;
    
    // Check first page for text content
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    
    // If textContent has items, PDF has text layer
    const hasText = textContent.items && textContent.items.length > 0;
    
    console.log(`📄 [PDF Text Extractor] PDF has text layer: ${hasText} (${textContent.items?.length || 0} items on page 1)`);
    
    return hasText;
  } catch (error) {
    console.error(`❌ [PDF Text Extractor] Error checking text layer:`, error);
    return false; // Assume no text layer on error
  }
}

/**
 * Extracts text from PDF (all pages)
 * Only call this if hasTextLayer() returns true
 * 
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} fileName - File name for logging
 * @param {Object} options - Extraction options
 * @param {number} options.startPage - Start page (1-based, inclusive)
 * @param {number} options.endPage - End page (1-based, inclusive)
 * @returns {Promise<{text: string, pages: number, source: 'textlayer'}>}
 */
async function extractTextFromPdf(pdfBuffer, fileName = "input.pdf", options = {}) {
  try {
    const pdfjsLib = await getPdfjsLib();
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array, verbosity: 0 });
    const pdf = await loadingTask.promise;
    
    const totalPages = pdf.numPages;
    const startPage = options.startPage || 1;
    const endPage = options.endPage || totalPages;
    
    console.log(`📄 [PDF Text Extractor] Extracting text from pages ${startPage}-${endPage} of ${totalPages}`);
    
    let fullText = "";
    const pageTexts = [];
    
    for (let pageNum = startPage; pageNum <= Math.min(endPage, totalPages); pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Extract text from items, preserving structure
      // pdfjs getTextContent() returns items with str and hasEOL properties
      let pageText = "";
      for (let i = 0; i < textContent.items.length; i++) {
        const item = textContent.items[i];
        if (item.str) {
          pageText += item.str;
          
          // Check if this is end of line
          if (item.hasEOL) {
            pageText += "\n";
          } else {
            // Add space between words (simple heuristic)
            // If next item exists and current item doesn't end with space, add space
            const nextItem = textContent.items[i + 1];
            if (nextItem && nextItem.str && !item.str.endsWith(" ")) {
              // Check if next item is on same line (simple check)
              // If transform exists, check Y position
              const currentY = item.transform?.[5] || 0;
              const nextY = nextItem.transform?.[5] || 0;
              
              // If same line (Y difference < 5), add space
              if (Math.abs(currentY - nextY) < 5) {
                pageText += " ";
              }
            }
          }
        }
      }
      
      pageTexts.push({
        pageNumber: pageNum,
        text: pageText.trim(),
      });
      
      fullText += pageText.trim();
      if (pageNum < Math.min(endPage, totalPages)) {
        fullText += "\n\n"; // Page separator
      }
    }
    
    console.log(`✅ [PDF Text Extractor] Extracted ${fullText.length} characters from ${pageTexts.length} pages`);
    
    return {
      text: fullText.trim(),
      pages: totalPages,
      extractedPages: pageTexts.length,
      pageTexts: pageTexts, // Per-page text for debugging
      source: "textlayer",
    };
  } catch (error) {
    console.error(`❌ [PDF Text Extractor] Error extracting text:`, error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}

module.exports = {
  hasTextLayer,
  extractTextFromPdf,
};
