/**
 * People Table Extractor
 * 
 * Fast, accurate, structure-preserving extraction of Thai person names and house numbers
 * from PDF OCR with guaranteed row count preservation.
 */

const { generateGeminiText } = require("./geminiClient");

/**
 * Groups OCR words into logical rows using Y-axis proximity
 * O(n log n) implementation - single pass grouping after sort
 * @param {Array} words - Array of word objects with {text, x, y, w, h}
 * @returns {Array} Array of row objects {text: string, centerY: number}
 */
function groupWordsIntoRows(words) {
  if (!words || words.length === 0) {
    return [];
  }
  
  // Step 1: Compute centerY and height for each word (O(n))
  const tokens = words.map(word => ({
    ...word,
    centerY: word.y + (word.h / 2),
    height: word.h,
  }));
  
  // Step 2: Compute ROW_THRESHOLD ONCE (O(n))
  const avgHeight = tokens.reduce((sum, t) => sum + t.height, 0) / tokens.length;
  const ROW_THRESHOLD = avgHeight * 0.8;
  
  // Step 3: Sort tokens by centerY ascending (O(n log n))
  tokens.sort((a, b) => a.centerY - b.centerY);
  
  // Step 4: Single-pass grouping (O(n))
  const rows = [];
  let currentRow = null;
  let currentRowCenterY = null;
  let currentRowSumY = 0;
  let currentRowCount = 0;
  
  for (const token of tokens) {
    if (currentRowCenterY === null) {
      // First token - start new row
      currentRow = [token];
      currentRowCenterY = token.centerY;
      currentRowSumY = token.centerY;
      currentRowCount = 1;
    } else {
      // Check if token belongs to current row
      if (Math.abs(token.centerY - currentRowCenterY) <= ROW_THRESHOLD) {
        // Same row - add to current row
        currentRow.push(token);
        currentRowSumY += token.centerY;
        currentRowCount++;
        // Update centerY using running average (no recalculation)
        currentRowCenterY = currentRowSumY / currentRowCount;
      } else {
        // New row - save current row and start new one
        rows.push(currentRow);
        currentRow = [token];
        currentRowCenterY = token.centerY;
        currentRowSumY = token.centerY;
        currentRowCount = 1;
      }
    }
  }
  
  // Add last row
  if (currentRow && currentRow.length > 0) {
    rows.push(currentRow);
  }
  
  // Step 5: Normalize each row - sort by X-axis and join with spaces (O(n log n) total)
  const normalizedRows = rows.map(row => {
    // Sort tokens by X-axis (left → right)
    row.sort((a, b) => a.x - b.x);
    
    // Join tokens with single spaces
    const text = row.map(t => t.text.trim()).filter(t => t.length > 0).join(" ");
    
    // Compute row centerY from tokens
    const rowCenterY = row.reduce((sum, t) => sum + t.centerY, 0) / row.length;
    
    return {
      text,
      centerY: rowCenterY,
    };
  });
  
  // Step 6: Filter rows - discard rows with no Thai characters AND no house-number patterns (O(n))
  const filteredRows = normalizedRows.filter(row => {
    const text = row.text;
    const hasThai = /[ก-๙]/.test(text);
    const hasHouseNumber = /\d{1,3}(\/\d{1,3})?(-?\d{0,3})?(,\d{1,3}(-\d{0,3})?)?/.test(text);
    
    // Keep row if it has Thai characters OR house number pattern
    return hasThai || hasHouseNumber;
  });
  
  return filteredRows;
}

/**
 * Format a single row using Gemini
 * @param {string} rawRowText - Raw row text from OCR
 * @returns {Promise<{name: string, houseNumber: string}>} Extracted name and house number
 */
async function formatRowWithGemini(rawRowText) {
  if (!rawRowText || rawRowText.trim().length === 0) {
    return { name: "", houseNumber: "" };
  }

  const prompt = `Extract person name and house number from this Thai text row.

Text: ${rawRowText}

Rules:
- Extract Thai person name (if present)
- Extract house number (format: number, number/number, or number-number)
- Return JSON only: {"name": "...", "houseNumber": "..."}
- If field is missing, use empty string ""
- No explanation, no markdown, JSON only

JSON:`;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Gemini timeout")), 5000);
    });

    const geminiPromise = generateGeminiText(prompt, {
      maxOutputTokens: 256,
      temperature: 0,
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    
    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*"name"[\s\S]*"houseNumber"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name || "",
        houseNumber: parsed.houseNumber || "",
      };
    }
    
    return { name: "", houseNumber: "" };
  } catch (error) {
    // Return empty fields on error (do NOT throw)
    return { name: "", houseNumber: "" };
  }
}

/**
 * Extract people table from PDF
 * @param {Buffer|string} pdfFile - PDF file buffer or base64 string
 * @returns {Promise<{rows: Array, confidence: string, stats: Object}>} Extracted table
 */
async function extractPeopleTableFromPdf(pdfFile) {
  // Import required functions from parent module
  const indexModule = require("../index");
  const ocrPdfBase64Gemini = indexModule.ocrPdfBase64Gemini;
  
  if (!ocrPdfBase64Gemini || typeof ocrPdfBase64Gemini !== "function") {
    throw new Error("ocrPdfBase64Gemini function not available. Ensure it is exported from index.js");
  }
  
  // Convert to base64 if buffer
  let pdfBase64;
  if (Buffer.isBuffer(pdfFile)) {
    pdfBase64 = pdfFile.toString("base64");
  } else {
    pdfBase64 = pdfFile;
  }

  // PHASE 1: Vision OCR
  const ocrResult = await ocrPdfBase64Gemini(
    pdfBase64,
    "input.pdf",
    null,
    true,
    {}
  );

  if (!ocrResult.words || ocrResult.words.length === 0) {
    return {
      rows: [],
      confidence: "low",
      stats: {
        totalRows: 0,
        rowsWithName: 0,
        rowsWithHouseNumber: 0,
      },
    };
  }

  // PHASE 2: Row Builder
  const rowObjects = groupWordsIntoRows(ocrResult.words);
  
  // PHASE 3: Light Row Filter (already done in groupWordsIntoRows)
  // Rows are already filtered for Thai characters or house numbers

  // PHASE 4: Row-level Gemini Formatter
  const formattedRows = [];
  for (const rowObj of rowObjects) {
    const rawRowText = rowObj.text;
    
    // Skip Gemini if row is empty
    if (!rawRowText || rawRowText.trim().length === 0) {
      formattedRows.push({
        name: "",
        houseNumber: "",
        rawRowText: "",
      });
      continue;
    }

    const formatted = await formatRowWithGemini(rawRowText);
    formattedRows.push({
      name: formatted.name || "",
      houseNumber: formatted.houseNumber || "",
      rawRowText: rawRowText,
    });
  }

  // PHASE 5: Count Preservation (guaranteed - one output row per input row)
  // PHASE 6: Confidence + Stats
  const stats = {
    totalRows: formattedRows.length,
    rowsWithName: formattedRows.filter(r => r.name && r.name.trim().length > 0).length,
    rowsWithHouseNumber: formattedRows.filter(r => r.houseNumber && r.houseNumber.trim().length > 0).length,
  };

  const nameRatio = stats.totalRows > 0 ? stats.rowsWithName / stats.totalRows : 0;
  let confidence;
  if (nameRatio >= 0.7) {
    confidence = "high";
  } else if (nameRatio >= 0.3) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    rows: formattedRows,
    confidence,
    stats,
  };
}

module.exports = {
  extractPeopleTableFromPdf,
};
