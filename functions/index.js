console.log("🚀 SMART OCR MODULE START", new Date().toISOString());

// ====================================
// DEBUG LOG PIPE (SAFE - NO LOGIC CHANGE)
// ====================================
const DEBUG_LOGS = [];

function debugLog(...args) {
  const msg = args.map(a =>
    typeof a === "string" ? a : JSON.stringify(a)
  ).join(" ");
  DEBUG_LOGS.push(msg);
  console.log(msg);
}

// ====================================
// COLD-START PROOF (STEP A)
// ====================================
const BUILD_ID = "SMART_OCR_BUILD_2026_01_16_STEP7";
console.log("🚀 [SMART_OCR_REVISION] SMART OCR BOOT", {
  build: BUILD_ID,
  time: new Date().toISOString(),
  pid: process.pid,
  target: process.env.FUNCTION_TARGET,
  service: process.env.K_SERVICE,
});

// ====================================
// RUNTIME VALIDATION (STEP C)
// Moved to handler entry - log only, don't fail
// ====================================

let onRequest;
try {
  const httpsModule = require("firebase-functions/v2/https");
  onRequest = httpsModule.onRequest;
  console.log("[BOOT] firebase-functions/v2/https loaded");
} catch (e) {
  console.error("[BOOT FAIL] firebase-functions/v2/https", e);
  throw e;
}

let defineSecret;
try {
  const paramsModule = require("firebase-functions/params");
  defineSecret = paramsModule.defineSecret;
  console.log("[BOOT] firebase-functions/params loaded");
} catch (e) {
  console.error("[BOOT FAIL] firebase-functions/params", e);
  throw e;
}

let admin;
try {
  admin = require("firebase-admin");
  console.log("[BOOT] firebase-admin loaded");
} catch (e) {
  console.error("[BOOT FAIL] firebase-admin", e);
  throw e;
}

let vision;
try {
  vision = require("@google-cloud/vision");
  console.log("[BOOT] @google-cloud/vision loaded");
} catch (e) {
  console.error("[BOOT FAIL] @google-cloud/vision", e);
  throw e;
}

let cors;
try {
  cors = require("cors")({ origin: true });
  console.log("[BOOT] cors loaded");
} catch (e) {
  console.error("[BOOT FAIL] cors", e);
  throw e;
}

let GEMINI_API_KEY;
try {
  GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
  console.log("[BOOT] GEMINI_API_KEY defined");
} catch (e) {
  console.error("[BOOT FAIL] defineSecret GEMINI_API_KEY", e);
  throw e;
}

console.log("[BOOT] BEFORE admin.initializeApp()");
try {
  admin.initializeApp();
  console.log("[BOOT] AFTER admin.initializeApp()");
} catch (e) {
  console.error("[BOOT FAIL] admin.initializeApp()", e);
  throw e;
}

let visionClient;
try {
  visionClient = new vision.ImageAnnotatorClient();
  console.log("[BOOT] visionClient created");
} catch (e) {
  console.error("[BOOT FAIL] vision.ImageAnnotatorClient()", e);
  throw e;
}

// ====================================
// BOOT-TIME DEBUG CHECK (Temporary, safe)
// ====================================
try {
  const fs = require("fs");
  const path = require("path");
  const utilsPath = path.join(__dirname, "utils");
  const ocrImageBufferPath = path.join(utilsPath, "ocrImageBuffer.js");
  
  console.log("[BOOT] Checking utils directory:", {
    __dirname: __dirname,
    utilsPath: utilsPath,
    utilsExists: fs.existsSync(utilsPath),
    ocrImageBufferPath: ocrImageBufferPath,
    ocrImageBufferExists: fs.existsSync(ocrImageBufferPath),
  });
} catch (checkError) {
  console.warn("[BOOT] Could not perform utils check (non-fatal):", checkError.message);
}

// Simple OCR function for image buffer
async function ocrImageBuffer(imageBuffer, fileName = "image") {
  const [result] = await visionClient.textDetection({
    image: { content: imageBuffer },
    imageContext: {
      languageHints: ['th'], // Emphasize Thai language for better OCR accuracy
    },
  });

  const detections = result.textAnnotations || [];
  const words = [];

  if (detections.length > 0) {
    const fullText = detections[0].description || "";
    const lines = fullText.split("\n");

    for (let i = 1; i < detections.length; i++) {
      const detection = detections[i];
      const vertices = detection.boundingPoly?.vertices || [];
      if (vertices.length >= 2) {
        const x = vertices[0].x || 0;
        const y = vertices[0].y || 0;
        const w = (vertices[2]?.x || vertices[1]?.x || x) - x;
        const h = (vertices[2]?.y || vertices[1]?.y || y) - y;

        words.push({
          text: detection.description || "",
          x: x,
          y: y,
          w: w,
          h: h,
        });
      }
    }
  }

  return {
    fileName: fileName,
    page: {
      width: 0,
      height: 0,
    },
    words: words,
    fullText: detections[0]?.description || "",
  };
}

// [STEP 6] Deterministic row segmentation using OCR word positions
// NEW PHASE 6 DESIGN
function segmentWordsIntoRows(words) {
  if (!words || words.length === 0) {
    return {
      rawRows: [],
      candidateRows: [],
      personRows: [],
      uncertainRows: [],
      stats: {
        rawCount: 0,
        candidateCount: 0,
        personCount: 0,
        uncertainCount: 0,
      },
    };
  }

  // Phase 6A — Candidate Row Detection (NO DROPPING)
  console.log("[SMART_OCR_REVISION] [STEP 6A] Candidate Row Detection START");
  
  // Calculate average word height for Y tolerance
  const heights = words.filter(w => w.h > 0).map(w => w.h);
  const avgHeight = heights.length > 0
    ? heights.reduce((sum, h) => sum + h, 0) / heights.length
    : 10;
  const yTolerance = avgHeight * 0.8;

  // Sort words by Y ascending, then X ascending
  const sortedWords = [...words].sort((a, b) => {
    if (Math.abs(a.y - b.y) <= yTolerance) {
      return a.x - b.x; // Same row: sort by X
    }
    return a.y - b.y; // Different rows: sort by Y
  });

  // Group words into rows using Y-axis clustering
  const rawRows = [];
  let currentRow = null;

  for (const word of sortedWords) {
    if (currentRow === null || Math.abs(word.y - currentRow.y) > yTolerance) {
      // Start new row
      if (currentRow !== null) {
        // Finalize previous row
        currentRow.words.sort((a, b) => a.x - b.x);
        currentRow.text = currentRow.words.map(w => w.text).join(" ");
        currentRow.wordCount = currentRow.words.length;
        
        // Count Thai words and numeric tokens
        const thaiWords = currentRow.text.match(/[\u0E00-\u0E7F]+/g) || [];
        const numericTokens = currentRow.text.match(/\b\d+\b/g) || [];
        currentRow.thaiWordCount = thaiWords.length;
        currentRow.numericTokenCount = numericTokens.length;
        
        // Only drop if contains only digits/symbols (no Thai at all)
        if (currentRow.thaiWordCount === 0 && currentRow.numericTokenCount > 0) {
          // Drop - no Thai characters
        } else {
          rawRows.push(currentRow);
        }
      }
      currentRow = {
        y: word.y,
        words: [word],
        text: "",
        wordCount: 0,
        thaiWordCount: 0,
        numericTokenCount: 0,
      };
    } else {
      // Add to current row
      currentRow.words.push(word);
    }
  }

  // Process last row
  if (currentRow !== null) {
    currentRow.words.sort((a, b) => a.x - b.x);
    currentRow.text = currentRow.words.map(w => w.text).join(" ");
    currentRow.wordCount = currentRow.words.length;
    
    const thaiWords = currentRow.text.match(/[\u0E00-\u0E7F]+/g) || [];
    const numericTokens = currentRow.text.match(/\b\d+\b/g) || [];
    currentRow.thaiWordCount = thaiWords.length;
    currentRow.numericTokenCount = numericTokens.length;
    
    if (currentRow.thaiWordCount === 0 && currentRow.numericTokenCount > 0) {
      // Drop - no Thai characters
    } else {
      rawRows.push(currentRow);
    }
  }

  console.log(`[SMART_OCR_REVISION] [STEP 6A] Total raw rows: ${rawRows.length}`);
  if (rawRows.length > 0) {
    console.log("[SMART_OCR_REVISION] [STEP 6A] First 10 raw rows:");
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const row = rawRows[i];
      console.log(`[SMART_OCR_REVISION] [STEP 6A] Row ${i + 1} (y=${row.y}, thai=${row.thaiWordCount}, num=${row.numericTokenCount}): "${row.text}"`);
    }
  }
  console.log("[SMART_OCR_REVISION] [STEP 6A] Candidate Row Detection END");

  // Phase 6B — Header / Noise Soft Filtering
  console.log("[SMART_OCR_REVISION] [STEP 6B] Header / Noise Soft Filtering START");
  
  const hardHeaderKeywords = ["เลือกตั้ง", "ลายพิมพ์", "ประจําตัวประชาชน", "เลขหมาย", "PROCESS", "DATEMI"];
  const candidateRows = [];
  
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const text = row.text.trim();
    const upperText = text.toUpperCase();
    let dropReason = null;
    
    // Check hard header keywords
    for (const keyword of hardHeaderKeywords) {
      if (upperText.includes(keyword.toUpperCase())) {
        dropReason = `Contains hard header keyword: "${keyword}"`;
        break;
      }
    }
    
    if (!dropReason) {
      // Check: Thai words < 2 AND numeric tokens > Thai tokens
      if (row.thaiWordCount < 2 && row.numericTokenCount > row.thaiWordCount) {
        dropReason = `Thai words (${row.thaiWordCount}) < 2 AND numeric tokens (${row.numericTokenCount}) > Thai tokens`;
      }
    }
    
    if (dropReason) {
      console.log(`[SMART_OCR_REVISION] [STEP 6B] DROPPED row ${i + 1}: "${text.substring(0, 50)}..." - ${dropReason}`);
    } else {
      candidateRows.push(row);
    }
  }
  
  console.log(`[SMART_OCR_REVISION] [STEP 6B] Candidate rows after filtering: ${candidateRows.length}`);
  console.log(`[SMART_OCR_REVISION] [STEP 6B] Expected range: ~20-25 rows`);
  console.log("[SMART_OCR_REVISION] [STEP 6B] Header / Noise Soft Filtering END");

  // Phase 6C — Person Row Classification (SCORE-BASED)
  console.log("[SMART_OCR_REVISION] [STEP 6C] Person Row Classification START");
  
  const personRows = [];
  const uncertainRows = [];
  
  for (const row of candidateRows) {
    let score = 0;
    
    // +2 if thaiWordCount >= 3
    if (row.thaiWordCount >= 3) {
      score += 2;
    }
    
    // +1 if contains Thai honorific fragment (even broken)
    const honorificPattern = /[นส]|นา|นาย|นาง/;
    if (honorificPattern.test(row.text)) {
      score += 1;
    }
    
    // +1 if contains trailing number (likely house number / index)
    const trailingNumberPattern = /\d+([\/-]\d+)?\s*$/;
    if (trailingNumberPattern.test(row.text)) {
      score += 1;
    }
    
    // +1 if text length > 15 chars
    if (row.text.length > 15) {
      score += 1;
    }
    
    row.score = score;
    
    if (score >= 3) {
      personRows.push(row);
    } else {
      uncertainRows.push(row);
    }
  }
  
  console.log(`[SMART_OCR_REVISION] [STEP 6C] Person rows (score >= 3): ${personRows.length}`);
  console.log(`[SMART_OCR_REVISION] [STEP 6C] Uncertain rows (score < 3): ${uncertainRows.length}`);
  console.log("[SMART_OCR_REVISION] [STEP 6C] Person Row Classification END");

  return {
    rawRows,
    candidateRows,
    personRows,
    uncertainRows,
    stats: {
      rawCount: rawRows.length,
      candidateCount: candidateRows.length,
      personCount: personRows.length,
      uncertainCount: uncertainRows.length,
    },
  };
}

// OLD FUNCTION - KEPT FOR REFERENCE
function segmentWordsIntoRows_OLD(words) {
  if (!words || words.length === 0) {
    return [];
  }

  // STEP 6A: Define patterns
  // CHANGE 1: Relax house number position - can appear ANYWHERE in row
  const houseNumberPattern = /\b\d+([\/-]\d+)?\b/;
  const thaiNamePattern = /[ก-๙]{2,}/;
  const headerKeywords = ["เลขหมาย", "ลายมือ", "เลือกตั้ง", "บัญชี", "PROCESS"];

  // Helper: Check if text contains house number (anywhere)
  function hasHouseNumber(text) {
    return houseNumberPattern.test(text);
  }

  // Helper: Extract house number from text
  function extractHouseNumber(text) {
    const match = text.match(houseNumberPattern);
    return match ? match[0] : null;
  }

  // CHANGE 3: Thai name detection (loosen slightly)
  // Helper: Check if text contains Thai name (exclude headers)
  function hasThaiName(text) {
    if (!thaiNamePattern.test(text)) {
      return false;
    }
    // Exclude if contains header keywords AND no Thai name
    const upperText = text.toUpperCase();
    const hasHeaderKeyword = headerKeywords.some(keyword => upperText.includes(keyword.toUpperCase()));
    
    if (hasHeaderKeyword) {
      // Only exclude if it's clearly a header (no meaningful Thai name)
      const thaiWords = text.match(/[ก-๙]+/g) || [];
      // Filter out stray chars and titles
      const meaningfulWords = thaiWords.filter(w => 
        w.length >= 2 && 
        !["นาย", "นาง", "น.ส.", "น.ส", "일", "I", "ร", "ญ"].includes(w)
      );
      if (meaningfulWords.length < 2) {
        return false; // Header with no meaningful name
      }
    }
    
    // Must have at least 2 Thai words (allow titles)
    const thaiWords = text.match(/[ก-๙]+/g) || [];
    const meaningfulWords = thaiWords.filter(w => w.length >= 2);
    return meaningfulWords.length >= 2;
  }

  // PASS 1: Build visual rows (current logic OK)
  // Calculate median word height (more robust than average)
  const heights = words.filter(w => w.h > 0).map(w => w.h).sort((a, b) => a - b);
  const medianHeight = heights.length > 0
    ? heights[Math.floor(heights.length / 2)]
    : 10; // fallback
  const threshold = medianHeight * 0.8;

  // Sort words by y ascending, then x ascending
  const sortedWords = [...words].sort((a, b) => {
    if (Math.abs(a.y - b.y) <= threshold) {
      return a.x - b.x; // Same row: sort by x
    }
    return a.y - b.y; // Different rows: sort by y
  });

  // Group words into visual rows
  const visualRows = [];
  let currentRow = null;

  for (const word of sortedWords) {
    if (currentRow === null || Math.abs(word.y - currentRow.y) > threshold) {
      // Start new row
      if (currentRow !== null) {
        currentRow.words.sort((a, b) => a.x - b.x);
        currentRow.text = currentRow.words.map(w => w.text).join(" ");
        visualRows.push(currentRow);
      }
      currentRow = {
        y: word.y,
        words: [word],
        text: "",
      };
    } else {
      // Add to current row
      currentRow.words.push(word);
    }
  }

  // Process last row
  if (currentRow !== null) {
    currentRow.words.sort((a, b) => a.x - b.x);
    currentRow.text = currentRow.words.map(w => w.text).join(" ");
    visualRows.push(currentRow);
  }

  // PASS 2: Assemble logical person rows (CHANGE 2: Two-pass row assembly)
  const personRows = [];
  let currentPersonRow = null;

  for (let i = 0; i < visualRows.length; i++) {
    const row = visualRows[i];
    const rowText = row.text.trim();
    const hasHouse = hasHouseNumber(rowText);
    const hasName = hasThaiName(rowText);
    const houseNumber = extractHouseNumber(rowText);

    if (hasName && !hasHouse) {
      // Row contains Thai name BUT no house number
      if (currentPersonRow === null) {
        // Start new person row
        currentPersonRow = {
          rowIndex: personRows.length,
          y: row.y,
          text: rowText,
        };
      } else {
        // Continue current person row (merge name continuation)
        currentPersonRow.text += " " + rowText;
      }
    } else if (hasHouse) {
      // Row contains house number
      if (currentPersonRow !== null) {
        // Attach house number to current person row
        currentPersonRow.text += " " + houseNumber;
        personRows.push(currentPersonRow);
        currentPersonRow = null;
      } else if (hasName) {
        // Standalone person row with both name and house number
        personRows.push({
          rowIndex: personRows.length,
          y: row.y,
          text: rowText,
        });
      } else {
        // House number only - check if next row has name
        if (i < visualRows.length - 1) {
          const nextRow = visualRows[i + 1];
          const nextText = nextRow.text.trim();
          if (hasThaiName(nextText)) {
            // Merge with next row
            personRows.push({
              rowIndex: personRows.length,
              y: row.y,
              text: houseNumber + " " + nextText,
            });
            i++; // Skip next row
            continue;
          }
        }
        // Standalone house number - keep if previous row had name
        if (i > 0) {
          const prevRow = visualRows[i - 1];
          const prevText = prevRow.text.trim();
          if (hasThaiName(prevText)) {
            // Should have been merged in previous iteration
            // Add as standalone if not already added
            personRows.push({
              rowIndex: personRows.length,
              y: row.y,
              text: rowText,
            });
          }
        }
      }
    } else {
      // Row has neither name nor house number
      // Check if it's continuation of current person row
      if (currentPersonRow !== null) {
        // Might be continuation - merge if it contains Thai text
        if (thaiNamePattern.test(rowText)) {
          currentPersonRow.text += " " + rowText;
        }
      }
    }
  }

  // Push remaining person row if exists
  if (currentPersonRow !== null) {
    personRows.push(currentPersonRow);
  }

  // CHANGE 4: Filtering logic (LESS AGGRESSIVE)
  // Keep row if:
  // - Has Thai name
  // - OR has house number AND previous row had Thai name
  const preFilteredRows = [];
  for (let i = 0; i < personRows.length; i++) {
    const row = personRows[i];
    const text = row.text.trim();
    const hasHouse = hasHouseNumber(text);
    const hasName = hasThaiName(text);
    
    // Check if previous row had Thai name
    const prevHasName = i > 0 ? hasThaiName(personRows[i - 1].text.trim()) : false;
    
    // Only drop rows if:
    // - Contains header keywords AND no Thai name
    const upperText = text.toUpperCase();
    const hasHeaderKeyword = headerKeywords.some(keyword => upperText.includes(keyword.toUpperCase()));
    const shouldDrop = hasHeaderKeyword && !hasName;
    
    if (!shouldDrop && (hasName || (hasHouse && prevHasName))) {
      preFilteredRows.push(row);
    }
  }

  // FINAL GATE: Header / Metadata Exclusion (MANDATORY)
  const hardHeaderKeywords = [
    "ผู้มีสิทธิ",
    "เลือกตั้ง",
    "บัญชี",
    "วัน ที่ เลือกตั้ง",
    "เลขหมาย",
    "ลายมือ",
    "ลาย พิมพ์",
    "หมายเหตุ",
    "PROCESS",
    "DATEMI"
  ];

  const validTitles = ["นาย", "นาง", "น.ส", "น . ส ."];

  const finalRows = [];
  for (let i = 0; i < preFilteredRows.length; i++) {
    const row = preFilteredRows[i];
    const text = row.text.trim();
    const upperText = text.toUpperCase();
    let dropReason = null;

    // RULE A: Hard header keyword block
    for (const keyword of hardHeaderKeywords) {
      if (upperText.includes(keyword.toUpperCase())) {
        dropReason = `RULE A: Contains hard header keyword "${keyword}"`;
        break;
      }
    }
    if (dropReason) {
      console.log(`[STEP 6] DROPPED row ${i + 1}: "${text.substring(0, 50)}..." - ${dropReason}`);
      continue;
    }

    // RULE B: Thai name must be dominant
    const thaiWords = text.match(/[\u0E00-\u0E7F]+/g) || [];
    const numericTokens = text.match(/\b\d+\b/g) || [];
    if (numericTokens.length > thaiWords.length || thaiWords.length < 2) {
      dropReason = `RULE B: Thai words (${thaiWords.length}) not dominant over numeric tokens (${numericTokens.length}) or < 2 Thai words`;
      console.log(`[STEP 6] DROPPED row ${i + 1}: "${text.substring(0, 50)}..." - ${dropReason}`);
      continue;
    }

    // RULE C: Title-based validation
    const hasValidTitle = validTitles.some(title => text.includes(title));
    if (!hasValidTitle) {
      dropReason = `RULE C: Missing valid title (นาย, นาง, น.ส, etc.)`;
      console.log(`[STEP 6] DROPPED row ${i + 1}: "${text.substring(0, 50)}..." - ${dropReason}`);
      continue;
    }

    // RULE D: Remove column-title rows
    if (text.includes("ชื่อ") && text.includes("เพศ")) {
      dropReason = `RULE D: Contains column header ("ชื่อ" and "เพศ")`;
      console.log(`[STEP 6] DROPPED row ${i + 1}: "${text.substring(0, 50)}..." - ${dropReason}`);
      continue;
    }

    // Row passed all rules
    finalRows.push(row);
  }

  return finalRows;
}

// ====================================
// PROCESS PAGE FUNCTION (Multi-page support)
// ====================================
async function processPage(pageNumber, page, config, reqId, generateGeminiText, fileName) {
  console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] Processing page`, { reqId });
  
  try {
    // STEP 2: OCR this page
    // FIX: ocrImageBuffer is defined in this file (line 108), not in ./utils/ocrImageBuffer
    // Use the function directly from the same module scope
    if (typeof ocrImageBuffer !== "function") {
      const errorMsg = `[PAGE ${pageNumber}] FATAL: ocrImageBuffer is not available`;
      console.error(`[SMART_OCR_REVISION] ${errorMsg}`, { reqId });
      return {
        page: pageNumber,
        records: [],
        error: errorMsg,
      };
    }
    
    const ocrResult = await ocrImageBuffer(page.imageBuffer, fileName);
    
    if (!ocrResult || !ocrResult.words || ocrResult.words.length === 0) {
      console.warn(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] No OCR words detected`, { reqId });
      return {
        page: pageNumber,
        records: [],
        error: "No OCR words detected",
      };
    }
    
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] OCR words: ${ocrResult.words.length}`, { reqId });
    
    // STEP 6: Row Segmentation
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 6] Row Segmentation START`, { reqId });
    const segmentResult = segmentWordsIntoRows(ocrResult.words);
    const personRowsText = segmentResult.personRows.map(r => r.text);
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 6] Person rows: ${personRowsText.length}`, { reqId });
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 6] Row Segmentation END`, { reqId });
    
    if (personRowsText.length === 0) {
      console.warn(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] No person rows detected`, { reqId });
      return {
        page: pageNumber,
        records: [],
        error: "No person rows detected",
      };
    }
    
    // STEP 7: Gemini Formatting
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 7] START`, { reqId });
    let formattedRows = personRowsText;
    
    if (personRowsText.length > 0) {
      const geminiPromptStep7 = `Normalize the following OCR text rows.

CRITICAL RULE (MUST DO FIRST):
- ALWAYS remove "/" symbol if it appears at the VERY START of the row
- Examples: "/ ชื่อ" → "ชื่อ", "/นายสมชาย" → "นายสมชาย", "/ น.ส.เบญจมาศ" → "น.ส.เบญจมาศ"
- This is MANDATORY - do this for EVERY row that starts with "/"

Rules (apply to EACH row independently):
1. Output must be exactly ONE line per input row.
2. Remove leading "/" symbol FIRST (before any other processing).
3. Keep all Thai characters and all numbers.
4. Do NOT drop house numbers, indexes, or other symbols (except leading "/").
5. You may fix broken Thai syllables (เช่น "นั น" → "นัน").
6. You may fix spacing ONLY.
7. Do NOT guess missing data.
8. Do NOT classify fields.
9. Do NOT merge rows.
10. Do NOT split rows.
11. Do NOT remove any information (except leading "/").
12. Do NOT add new information.

EXAMPLES OF LEADING "/" REMOVAL:
Input: "/ ชื่อ"
Output: "ชื่อ"

Input: "/นายสมชาย"
Output: "นายสมชาย"

Input: "/ น.ส.เบญจมาศ ขนบ"
Output: "น.ส.เบญจมาศ ขนบ"

INPUT ROWS:
${personRowsText.map((r, i) => `Row ${i + 1}: "${r}"`).join('\n')}

Return ONLY the normalized row text, one row per line, in the same order as input.
No explanations. No markdown. No JSON.`;

      console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 7] Gemini request sent`, { reqId });
      const geminiResponseStep7 = await generateGeminiText(geminiPromptStep7, {
        maxOutputTokens: 8192,
        temperature: 0,
      });
      
      console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 7] Gemini response received`, { reqId });
      
      // Parse Gemini response
      if (typeof geminiResponseStep7 === 'string') {
        const lines = geminiResponseStep7.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        const cleanedLines = lines.map(line => {
          const match = line.match(/^\d+\.\s*(.+)$/);
          return match ? match[1] : line;
        });
        
        if (cleanedLines.length > 0) {
          formattedRows = cleanedLines;
        }
      }
      
      console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 7] Input rows: ${personRowsText.length}, Output rows: ${formattedRows.length}`, { reqId });
    }
    
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 7] END`, { reqId });
    
    // STEP 8: Row Classification
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8] START`, { reqId });
    const personRows = [];
    const headerKeywords = ["ประจำบ้าน", "เลขประจำตัว", "ลายพิมพ์", "หมายเหตุ", "เลือกตั้ง"];
    const thaiTitlePattern = /(นาย|นาง|น\.ส|น\.ส\.)/;
    const thaiWordPattern = /[\u0E00-\u0E7F]+/g;
    
    for (let i = 0; i < formattedRows.length; i++) {
      const rowText = formattedRows[i];
      let score = 0;
      
      if (thaiTitlePattern.test(rowText)) score += 2;
      const thaiWords = rowText.match(thaiWordPattern) || [];
      if (thaiWords.length >= 2) score += 2;
      if (/\d+\s*$/.test(rowText.trim())) score += 1;
      if (rowText.length > 15) score += 1;
      
      const hasHeaderKeyword = headerKeywords.some(keyword => rowText.includes(keyword));
      if (hasHeaderKeyword) score -= 3;
      if (rowText.length < 10 && thaiWords.length < 2) score -= 2;
      
      if (score >= 3 || rowText.length > 0) {
        personRows.push(rowText);
      }
    }
    
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8] Person rows: ${personRows.length}`, { reqId });
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8] END`, { reqId });
    
    // STEP 8.5: Table Header Detection
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8.5] START`, { reqId });
    const step8_5HeaderKeywords = [
      "บ้านเลขที่", "เลขหมายประจำบ้าน", "เลขประจำบ้าน", "เลขประจำตัวประชาชน",
      "ชื่อ", "ชื่อ-สกุล", "ชื่อตัว", "ลำดับ", "ลำดับที่", "เพศ"
    ];
    
    let hasHeader = false;
    let headerRowIndex = null;
    const detectedColumns = {};
    
    const rowsToScan = Math.min(5, formattedRows.length);
    for (let i = 0; i < rowsToScan; i++) {
      const row = formattedRows[i];
      const foundKeywords = step8_5HeaderKeywords.filter(kw => row.includes(kw));
      
      if (foundKeywords.length >= 2) {
        hasHeader = true;
        headerRowIndex = i;
        const headerTokens = row.trim().split(/\s+/);
        for (let tokenIndex = 0; tokenIndex < headerTokens.length; tokenIndex++) {
          const token = headerTokens[tokenIndex];
          if (token.includes("บ้าน") || token.includes("เลขหมาย")) detectedColumns.houseNumber = tokenIndex;
          if (token.includes("ประชาชน")) detectedColumns.citizenId = tokenIndex;
          if (token.includes("ชื่อ")) detectedColumns.name = tokenIndex;
          if (token.includes("เพศ")) detectedColumns.gender = tokenIndex;
          if (token.includes("ลำดับ")) detectedColumns.order = tokenIndex;
        }
        break;
      }
    }
    
    const houseNumberRegex = /^[0-9]+([-/][0-9]+)*$/;
    const extractHouseNumberFromRow = (rowText, rowIndex) => {
      if (!hasHeader || detectedColumns.houseNumber === undefined) return null;
      const tokens = rowText.trim().split(/\s+/);
      if (detectedColumns.houseNumber >= tokens.length) return null;
      const candidate = tokens[detectedColumns.houseNumber].trim();
      if (!/\d/.test(candidate)) return null;
      const normalized = candidate.replace(/\s*([-/])\s*/g, "$1");
      return houseNumberRegex.test(normalized) ? normalized : null;
    };
    
    const step8_5Result = {
      hasHeader,
      headerRowIndex,
      detectedColumns,
      extractHouseNumber: extractHouseNumberFromRow,
    };
    
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8.5] hasHeader: ${hasHeader}`, { reqId });
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8.5] END`, { reqId });
    
    // STEP 8.6: Exclude Header Row
    let finalPersonRows = personRows;
    if (hasHeader && headerRowIndex !== null && headerRowIndex < personRows.length) {
      finalPersonRows = personRows.filter((_, i) => i !== headerRowIndex);
      console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 8.6] Excluded header row at index ${headerRowIndex}`, { reqId });
    }
    
    // STEP 9: Map to Fixed Schema
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9] START`, { reqId });
    const mappedRecords = [];
    
    for (let i = 0; i < finalPersonRows.length; i++) {
      const originalRow = finalPersonRows[i];
      let extractedName = "";
      let extractedAddress = null;
      
      try {
        let nameText = originalRow.trim().replace(/^\d+([-\s]\d+)?\s*/, "");
        
        if (step8_5Result.hasHeader && step8_5Result.detectedColumns.houseNumber !== undefined) {
          const houseNumberFromColumn = step8_5Result.extractHouseNumber(originalRow, i);
          if (houseNumberFromColumn) {
            extractedAddress = houseNumberFromColumn;
            const houseNumberPattern = houseNumberFromColumn.replace(/[-\/]/g, "[\\s\\-\\/]*");
            nameText = nameText.replace(new RegExp(`\\s*${houseNumberPattern}\\s*`, "g"), " ").trim();
          }
        } else {
          const trailingNumberMatch = nameText.match(/\s+(\d+([\/-]\d+)*)\s*$/);
          if (trailingNumberMatch) {
            extractedAddress = trailingNumberMatch[1];
            nameText = nameText.replace(/\s+\d+([\/-]\d+)*\s*$/, "").trim();
          }
        }
        
        extractedName = nameText.trim();
        if (!extractedName || extractedName.length === 0) {
          extractedName = originalRow.trim();
        }
        
        // Cleanup Name
        let cleanedName = extractedName;
        const genderTokens = ["ช", "ญ", "ร"];
        const lastToken = cleanedName.trim().split(/\s+/).pop();
        if (genderTokens.includes(lastToken)) {
          cleanedName = cleanedName.replace(new RegExp(`\\s*${lastToken}\\s*$`), "").trim();
        }
        
        const tokens = cleanedName.trim().split(/\s+/);
        if (tokens.length > 0) {
          const lastToken2 = tokens[tokens.length - 1];
          const thaiTitlePattern2 = /^(นาย|นาง|น\.ส|น\.ส\.|อ\.)$/;
          const thaiWordPattern2 = /^[\u0E00-\u0E7F]+$/;
          if (lastToken2.length <= 2 && !thaiTitlePattern2.test(lastToken2) && !thaiWordPattern2.test(lastToken2)) {
            tokens.pop();
            cleanedName = tokens.join(" ").trim();
          }
        }
        
        cleanedName = cleanedName.replace(/\d+/g, "").trim().replace(/\s+/g, " ").trim();
        if (!cleanedName || cleanedName.length === 0) {
          cleanedName = extractedName;
        } else {
          extractedName = cleanedName;
        }
        
      } catch (extractError) {
        extractedName = originalRow.trim();
      }
      
      mappedRecords.push({
        Name: extractedName,
        Address: extractedAddress,
        Age: null,
        Zone: null,
        Province: null,
        District: null,
        SubDistrict: null,
        Village: null,
      });
    }
    
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9] Mapped ${mappedRecords.length} records`, { reqId });
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9] END`, { reqId });
    
    // ====================================
    // STEP 9.5 – Name Cleanup
    // ====================================
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] START`, { reqId });
    
    /**
     * Clean up name field according to strict rules
     * @param {string|null} name - Original name
     * @returns {string|null} - Cleaned name or null if invalid
     */
    function cleanName(name) {
      if (!name || typeof name !== 'string') {
        return null;
      }
      
      // 1) Normalize spacing
      let cleaned = name.replace(/\s+/g, ' ').trim();
      
      // 2) ลบเพศท้ายชื่อ (เฉพาะท้าย string เท่านั้น)
      cleaned = cleaned.replace(/\s+(ญ|ช)\s*$/, '');
      
      // 3) ตรวจจับและลบชื่อที่ไม่ใช่ชื่อคน
      const nonPersonKeywords = ["ถนน", "ตลาด", "หมู่", "ตำบล", "อำเภอ", "จังหวัด"];
      const hasNonPersonKeyword = nonPersonKeywords.some(keyword => cleaned.includes(keyword));
      if (hasNonPersonKeyword) {
        return null;
      }
      
      // 4) ลบค่าไร้ความหมาย (length < 3)
      if (cleaned.length < 3) {
        return null;
      }
      
      return cleaned;
    }
    
    const cleanedRecords = [];
    let discardedCount = 0;
    
    for (let i = 0; i < mappedRecords.length; i++) {
      const record = mappedRecords[i];
      const originalName = record.Name;
      
      try {
        const cleanedName = cleanName(originalName);
        
        if (cleanedName === null) {
          // Discard record if name is invalid
          discardedCount++;
          console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] Discarded record ${i + 1}: "${originalName}" → null`, { reqId });
          continue;
        }
        
        // Update record with cleaned name
        const cleanedRecord = {
          ...record,
          Name: cleanedName,
        };
        
        cleanedRecords.push(cleanedRecord);
        
        if (originalName !== cleanedName) {
          console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] Cleaned record ${i + 1}: "${originalName}" → "${cleanedName}"`, { reqId });
        }
      } catch (cleanupError) {
        // Safe guard: if cleanup fails, skip this record (don't throw)
        console.warn(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] Cleanup error for record ${i + 1}, skipping: ${cleanupError.message}`, { reqId });
        discardedCount++;
        continue;
      }
    }
    
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] Cleaned ${cleanedRecords.length} records, discarded ${discardedCount} records`, { reqId });
    console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] END`, { reqId });
    
    return {
      page: pageNumber,
      records: cleanedRecords,
    };
    
  } catch (error) {
    console.error(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] ERROR: ${error.message}`, { reqId, stack: error.stack });
    return {
      page: pageNumber,
      records: [],
      error: error.message,
    };
  }
}

exports.smartOcr = onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 540,
    memory: "4GiB",
    maxInstances: 10,
    secrets: [GEMINI_API_KEY],
  },
  (req, res) => {
    const setCorsHeaders = () => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    };

    if (req.method === "OPTIONS") {
      const reqId = `OPTIONS-${Date.now()}`;
      console.log("📥 [SMART_OCR_REVISION] SMART OCR OPTIONS REQUEST", { reqId });
      setCorsHeaders();
      res.set("Access-Control-Max-Age", "3600");
      console.log("📤 [SMART_OCR_REVISION] SMART OCR RESPONSE SENT", { reqId, status: 204 });
      return res.status(204).send("");
    }

    setCorsHeaders();

    cors(req, res, async () => {
      // ====================================
      // HANDLER ENTRY PROOF (STEP B)
      // ====================================
      // Reset DEBUG_LOGS for this request
      DEBUG_LOGS.length = 0;
      
      const reqId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      debugLog("📥 [SMART_OCR_REVISION] SMART OCR REQUEST ENTERED", JSON.stringify({
        reqId,
        method: req.method,
        timestamp: Date.now(),
        traceContext: req.headers["x-cloud-trace-context"] || "none",
        build: BUILD_ID,
        kService: process.env.K_SERVICE || "not-set",
        functionTarget: process.env.FUNCTION_TARGET || "not-set",
      }));
      console.log("📥 [SMART_OCR_REVISION] SMART OCR REQUEST ENTERED", {
        reqId,
        method: req.method,
        timestamp: Date.now(),
        traceContext: req.headers["x-cloud-trace-context"] || "none",
        build: BUILD_ID,
        kService: process.env.K_SERVICE || "not-set",
        functionTarget: process.env.FUNCTION_TARGET || "not-set",
      });
      
      if (req.method !== "POST") {
        console.log("📤 [SMART_OCR_REVISION] SMART OCR RESPONSE SENT", {
          reqId,
          status: 405,
          reason: "Method not allowed",
        });
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
      }

      try {
        // [STEP 1] Receive file
        debugLog("[SMART_OCR_REVISION] [STEP 1] File received", reqId);
        console.log("[SMART_OCR_REVISION] [STEP 1] File received", { reqId });

        // OCR Mode Selection (classic | vision)
        const ocrMode = req.body.mode === "vision" ? "vision" : "classic";
        console.log(`[SMART_OCR_REVISION] [SMART_OCR] Mode selected: ${ocrMode}`, { reqId });
        debugLog(`[SMART_OCR_REVISION] [SMART_OCR] Mode selected: ${ocrMode}`, reqId);

        if (!req.body || !req.body.pdf_base64) {
          console.log("📤 [SMART_OCR_REVISION] SMART OCR RESPONSE SENT", {
            reqId,
            status: 400,
            reason: "Missing pdf_base64",
          });
          return res.status(400).json({
            success: false,
            error: "Missing pdf_base64",
          });
        }

        const fileName = req.body.fileName || req.body.filename || "input.pdf";
        const pdfBase64 = req.body.pdf_base64;
        const fileBuffer = Buffer.from(pdfBase64, "base64");
        const fileSize = fileBuffer.length;
        
        // Detect file type from mimeType or fileName extension
        const mimeType = req.body.mimeType || req.body.mimetype || req.body.contentType || null;
        const fileExtension = fileName.toLowerCase().split('.').pop() || '';
        const isImage = mimeType?.startsWith('image/') || 
                       ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
        const isPdf = mimeType === 'application/pdf' || fileExtension === 'pdf';

        console.log(`[SMART_OCR_REVISION] [STEP 1] name=${fileName} size=${fileSize} bytes mimeType=${mimeType || 'unknown'} isImage=${isImage} isPdf=${isPdf}`, { reqId });

        // [STEP 2] OCR - Input type guard
        debugLog("[SMART_OCR_REVISION] [STEP 2] OCR START", reqId);
        console.log("[SMART_OCR_REVISION] [STEP 2] OCR START", { reqId });

        let normalizedPages;
        
        if (isPdf) {
          // PDF input: use normalizePdfToImages
          console.log("[SMART_OCR_REVISION] [Normalize] Detected PDF input", { reqId });
          const { normalizePdfToImages } = require("./utils/normalizePdfToImages");
          normalizedPages = await normalizePdfToImages(fileBuffer, fileName, {});
          
          if (!normalizedPages || normalizedPages.length === 0) {
            throw new Error("PDF conversion failed: No pages extracted");
          }
        } else if (isImage) {
          // Image input: skip PDF normalization, treat as single-page document
          console.log("[SMART_OCR_REVISION] [Normalize] Detected image input, skipping PDF normalization", { reqId });
          
          // Create single-page structure matching normalizePdfToImages output
          normalizedPages = [{
            pageNumber: 1,
            imageBuffer: fileBuffer,
            width: 0, // Will be determined during OCR if needed
            height: 0, // Will be determined during OCR if needed
            source: "image"
          }];
        } else {
          // Unsupported file type
          const errorMsg = `Unsupported file type. Expected PDF or image (jpg/png), got: ${mimeType || fileExtension || 'unknown'}`;
          console.error(`[SMART_OCR_REVISION] ${errorMsg}`, { reqId });
          throw new Error(errorMsg);
        }

        console.log(`[SMART_OCR_REVISION] [STEP 2] Pages: ${normalizedPages.length}`, { reqId });
        debugLog("[SMART_OCR_REVISION] [STEP 2] OCR END", reqId);
        console.log("[SMART_OCR_REVISION] [STEP 2] OCR END", { reqId });

        // Load generateGeminiText once for all pages
        let generateGeminiText;
        try {
          const geminiClientModule = require("./utils/geminiClient");
          generateGeminiText = geminiClientModule.generateGeminiText;
          if (!generateGeminiText) {
            throw new Error("generateGeminiText is not exported from geminiClient");
          }
          console.log("[SMART_OCR_REVISION] geminiClient loaded", { reqId });
        } catch (e) {
          debugLog("[SMART_OCR_REVISION] FAILED to load geminiClient", e.message);
          console.error("[SMART_OCR_REVISION] FAILED to load geminiClient", { reqId, error: e.message, stack: e.stack });
          throw e;
        }

        // Feature flags
        const config = {
          useColumnDetection: req.body.useColumnDetection !== false,
          useSafeColumnMerge: req.body.useSafeColumnMerge !== false,
        };

        // ====================================
        // MULTI-PAGE PROCESSING LOOP
        // ====================================
        const pageResults = [];
        const mergedRecords = [];

        for (let pageIndex = 0; pageIndex < normalizedPages.length; pageIndex++) {
          const page = normalizedPages[pageIndex];
          const pageNumber = pageIndex + 1;
          
          console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] START`, { reqId });
          
          try {
            // Process this page in isolation
            const pageResult = await processPage(
              pageNumber,
              page,
              config,
              reqId,
              generateGeminiText,
              fileName
            );
            
            pageResults.push(pageResult);
            // SAFE GUARD: Ensure records is always an array
            const pageRecords = Array.isArray(pageResult.records) ? pageResult.records : [];
            mergedRecords.push(...pageRecords);
            
            console.log(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] END - Records: ${pageRecords.length}`, { reqId });
          } catch (pageError) {
            console.error(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] ERROR: ${pageError.message}`, { reqId });
            // Continue with other pages even if one fails
            pageResults.push({
              page: pageNumber,
              records: [],
              error: pageError.message,
            });
          }
        }

        // ====================================
        // MULTI-PAGE PROCESSING COMPLETE
        // ====================================
        // All processing happens inside processPage() function per page
        // Results are collected in pageResults and mergedRecords

        // [STEP 4] Return production JSON response (multi-page format)
        // SAFE GUARD: Ensure mergedRecords is always an array
        const safeMergedRecords = Array.isArray(mergedRecords) ? mergedRecords : [];
        const totalPages = normalizedPages ? normalizedPages.length : 0;
        const totalRecords = safeMergedRecords.length;
        
        console.log("📤 [SMART_OCR_REVISION] SMART OCR RESPONSE SENT", {
          reqId,
          status: 200,
          build: BUILD_ID,
          totalRecords,
          totalPages,
        });
        
        res.set("Content-Type", "application/json");
        return res.status(200).json({
          success: true,
          records: safeMergedRecords, // Frontend expects 'records' field (always an array)
          pages: pageResults.map(pr => ({
            page: pr.page,
            records: Array.isArray(pr.records) ? pr.records : [], // Ensure array
            error: pr.error || undefined,
          })),
          mergedRecords: safeMergedRecords, // Keep for backward compatibility
          meta: {
            requestId: reqId,
            totalRecords: totalRecords,
            totalPages: totalPages,
          },
        });

      } catch (err) {
        const reqId = req.reqId || `ERROR-${Date.now()}`;
        debugLog("[SMART_OCR_REVISION] ❌ [Smart OCR] Error:", err.message, err.name);
        console.error("[SMART_OCR_REVISION] ❌ [Smart OCR] Error:", { reqId, error: err.message, build: BUILD_ID });
        console.error("[SMART_OCR_REVISION] ❌ [Smart OCR] Error stack:", { reqId, stack: err.stack });

        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");

        try {
          console.log("📤 [SMART_OCR_REVISION] SMART OCR RESPONSE SENT", {
            reqId,
            status: 500,
            build: BUILD_ID,
            error: err.message,
          });
          return res.status(500).json({
            success: false,
            error: err.message || "Smart OCR failed",
            errorType: err.name || "UnknownError",
            logs: DEBUG_LOGS,
            records: [], // Ensure records array is always present
            meta: {
              requestId: reqId,
              totalRecords: 0,
              totalPages: 0,
            },
          });
        } catch (responseError) {
          console.error("[SMART_OCR_REVISION] ❌ [Smart OCR] Failed to send error response:", { reqId, error: responseError.message });
        }
      }
    });
  }
);

// ====================================
// VISION TEMPLATE HELPERS
// ====================================

/**
 * STEP H.1 — Template Validation
 * Validates vision template structure
 * 
 * @param {Object} template - Template object from request
 * @throws {Error} If template is invalid
 */
function validateVisionTemplate(template) {
  if (!template || typeof template !== 'object') {
    throw new Error("[VISION_TEMPLATE] Template is missing or invalid");
  }
  
  if (!template.columns || !Array.isArray(template.columns)) {
    throw new Error("[VISION_TEMPLATE] template.columns must be an array");
  }
  
  if (template.columns.length === 0) {
    throw new Error("[VISION_TEMPLATE] template.columns cannot be empty");
  }
  
  const ALLOWED_KEYS = ["name", "address", "age", "province", "district", "subDistrict", "village"];
  
  for (const col of template.columns) {
    if (!col.key || typeof col.key !== 'string') {
      throw new Error("[VISION_TEMPLATE] Column key must be a non-empty string");
    }
    
    if (!ALLOWED_KEYS.includes(col.key)) {
      throw new Error(`[VISION_TEMPLATE] Invalid column key: ${col.key}. Allowed: ${ALLOWED_KEYS.join(', ')}`);
    }
    
    if (!col.label || typeof col.label !== 'string') {
      throw new Error("[VISION_TEMPLATE] Column label must be a non-empty string");
    }
    
    if (typeof col.required !== 'boolean') {
      throw new Error("[VISION_TEMPLATE] Column required must be a boolean");
    }
  }
}

/**
 * STEP H.2 — Prompt Builder
 * Builds dynamic Vision prompt based on template
 * 
 * @param {number} pageNumber - Page number
 * @param {Object} template - Validated template object
 * @returns {string} Vision prompt
 */
function buildVisionPrompt(pageNumber, template) {
  const columns = template.columns || [];
  
  // Build field descriptions
  const fieldDescriptions = columns.map(col => {
    const key = col.key;
    const label = col.label;
    const required = col.required;
    
    let description = `- \`${label}\` → `;
    
    switch (key) {
      case "name":
        description += `Thai full name - EXTRACT EXACTLY AS SEEN
  - **CRITICAL: NO GUESSING, NO MODIFICATION**
  - Read the name EXACTLY as it appears in the document
  - PRESERVE everything: titles ("นาย", "นาง", "น.ส.", "น.ส"), spaces, all words
  - ONLY remove "/" symbol if it appears at the VERY START (e.g., "/ ชื่อ" → "ชื่อ")
  - DO NOT remove, add, or modify any other characters
  - DO NOT normalize spacing
  - DO NOT remove gender markers
  - DO NOT clean or fix OCR errors
  - Extract EXACTLY what you see in the name column
  - If you see "นายสมชาย ใจดี" → extract "นายสมชาย ใจดี" (exactly)
  - If you see "น.ส.เบญจมาศ ขนบ" → extract "น.ส.เบญจมาศ ขนบ" (exactly)`;
        break;
      case "address":
        description += `House number (บ้านเลขที่) - EXTRACT EXACTLY AS SEEN
  - **CRITICAL: NO GUESSING, NO MODIFICATION**
  - **FIRST: Identify the "บ้านเลขที่" column in the table**
    - Look for column header: "บ้านเลขที่", "เลขที่", "บ้าน", "เลขหมายประจำบ้าน"
    - This column typically contains numbers (1, 2, 10, 12/3, 10-15, etc.)
    - It is usually positioned after the name column
  - **THEN: Extract EXACTLY what you see in THIS SPECIFIC COLUMN in the SAME row**
    - For each person row, read the value EXACTLY as it appears in the "บ้านเลขที่" column
    - The house number MUST be from the SAME row as the person's name
    - Read EXACTLY: if you see "12" → extract "12", if you see "12/3" → extract "12/3", if you see "10-15" → extract "10-15"
    - DO NOT modify, normalize, or clean the house number
    - DO NOT convert formats (e.g., don't change "10-15" to "10" or "15")
    - DO NOT add or remove characters
  - **CRITICAL RULES:**
    - DO NOT use house numbers from other rows
    - DO NOT use numbers from other columns (like order numbers, ID numbers)
    - DO NOT guess or infer house numbers
    - DO NOT fill in missing house numbers
    - If the "บ้านเลขที่" column is empty for this person → return \`null\`
    - Extract EXACTLY what you see, nothing more, nothing less`;
        break;
      case "age":
        description += `Age in years (numeric only)
  - If missing, return \`null\``;
        break;
      case "province":
        description += `Province name (Thai)
  - If missing, return \`null\``;
        break;
      case "district":
        description += `District name (Thai)
  - If missing, return \`null\``;
        break;
      case "subDistrict":
        description += `Sub-district name (Thai)
  - If missing, return \`null\``;
        break;
      case "village":
        description += `Village name (Thai)
  - If missing, return \`null\``;
        break;
      default:
        description += `Extract this field from the table
  - If missing, return \`null\``;
    }
    
    if (!required) {
      description += `\n  - This field is optional`;
    }
    
    return description;
  }).join('\n\n');
  
  // Build JSON schema example
  const jsonExample = {
    page: pageNumber,
    records: [
      columns.reduce((acc, col) => {
        acc[col.label] = col.key === "name" ? "น.ส.เบญจมาศ ขนบ" : 
                        col.key === "address" ? "10/5" : null;
        return acc;
      }, {})
    ]
  };
  
  const jsonSchema = JSON.stringify(jsonExample, null, 2);
  
  // Build required fields list
  const requiredFields = columns.filter(col => col.required).map(col => col.label);
  const optionalFields = columns.filter(col => !col.required).map(col => col.label);
  
  return `You are a document-vision extraction AI.

Your task is to read a Thai official tabular document from this image and extract ONLY real person records.

The document is a table listing eligible voters or residents.

IMPORTANT:
- This is a structured table.
- Use visual layout, column alignment, and headers to understand meaning.
- Ignore OCR noise, decorations, stamps, footnotes, and explanatory text.

From the provided image:

1. Visually detect the table structure.
2. Identify the column headers by their visual position (top row of the table).
3. **CRITICAL: Identify which column contains "บ้านเลขที่" (house number)**
   - Look for column headers like: "บ้านเลขที่", "เลขที่", "บ้าน", "เลขหมายประจำบ้าน"
   - The house number column is usually a numeric column (contains numbers like 1, 2, 10, 12/3, etc.)
   - This column is typically located after the name column
4. Extract ONLY rows that represent REAL PEOPLE.

⛔ DO NOT include:
- Header rows
- Sub-headers
- Notes
- Explanations
- Footers
- Stamps
- Signatures
- Words like:
  "ประจำบ้าน", "ลายพิมพ์นิ้วมือ", "หมายเหตุ",
  "เลขประจำตัวประชาชน", "เลือกตั้ง",
  "CU", "HOME", English noise, symbols, or stray letters

---

## 🎯 TARGET FIELDS (STRICT)

Extract ONLY these fields:

${fieldDescriptions}

${requiredFields.length > 0 ? `\n**REQUIRED FIELDS (must extract):**\n${requiredFields.map(f => `- ${f}`).join('\n')}` : ''}
${optionalFields.length > 0 ? `\n**OPTIONAL FIELDS (return null if missing):**\n${optionalFields.map(f => `- ${f}`).join('\n')}` : ''}

---

## 📐 ROW RULES (VERY IMPORTANT)

- One table row = one person
- NEVER merge two people into one record
- NEVER split one person into multiple records
- NEVER drop rows
- Preserve visual row order from top to bottom
- If a row does NOT clearly represent a person → SKIP it
- If a required field is missing → use \`null\` (do NOT skip the row)

## 🏠 HOUSE NUMBER EXTRACTION (CRITICAL RULES)

For the "บ้านเลขที่" (house number) field:

**RULE 1 - SAME ROW ONLY:**
- Extract house number ONLY from the SAME row as the person's name
- The house number MUST be in the same visual row as the person
- DO NOT use house numbers from adjacent rows
- DO NOT use house numbers from the row above or below

**RULE 2 - NO GUESSING:**
- If a person's row does NOT have a house number → return \`null\`
- DO NOT guess or infer house numbers
- DO NOT copy house numbers from other people
- DO NOT fill in missing house numbers

**RULE 3 - COLUMN IDENTIFICATION & EXACT EXTRACTION:**
- **FIRST STEP: Identify the "บ้านเลขที่" column**
  - Look for column header: "บ้านเลขที่", "เลขที่", "บ้าน", "เลขหมายประจำบ้าน"
  - This column contains numeric values (house numbers)
  - It is typically located after the name column
  - Remember which column position this is (e.g., 3rd column, 4th column)
- **SECOND STEP: Extract EXACTLY as seen from the identified column**
  - For each person row, read ONLY from the "บ้านเลขที่" column you identified
  - Extract EXACTLY what you see: if you see "12" → extract "12", if you see "12/3" → extract "12/3", if you see "10-15" → extract "10-15"
  - DO NOT modify, normalize, or clean the value
  - DO NOT convert formats (e.g., don't change "10-15" to "10" or "15")
  - DO NOT add or remove characters
  - DO NOT read from other columns (order numbers, ID numbers, etc.)
  - If the "บ้านเลขที่" column is empty for this person → return \`null\`
  - **CRITICAL: Extract EXACTLY as seen, nothing more, nothing less**

**RULE 4 - ACCURACY:**
- Each person's house number must be correct for that specific person
- One person = one row = one house number (or null if missing)
- Never mix house numbers between different people

---

## 📦 OUTPUT FORMAT (STRICT JSON ONLY)

Return ONLY valid JSON.
No markdown.
No explanation.
No comments.

Schema:

${jsonSchema}

---

## 🚨 VALIDATION RULES (STRICT - NO GUESSING)

- **EXTRACTION RULE: Extract EXACTLY as seen, NO modification**
  - Read text EXACTLY as it appears in the document
  - DO NOT normalize, clean, or fix OCR errors
  - DO NOT add or remove characters
  - DO NOT modify spacing or formatting
  - If you see "นายสมชาย ใจดี" → extract "นายสมชาย ใจดี" (exactly)
  - If you see "12/3" → extract "12/3" (exactly, not "12" or "3")

- **MISSING VALUE RULE:**
  - If a value is unclear → use null
  - If a row is ambiguous → SKIP the row
  - DO NOT hallucinate missing people
  - DO NOT guess missing values
  - DO NOT fill in empty fields
  - DO NOT infer or assume values

- **QUALITY RULE:**
  - DO NOT add extra columns not in the template
  - Quality > quantity
  - Preserve all rows (use null for missing values)
  - Accuracy > completeness

Return ONLY the JSON object.
No explanations. No markdown. No additional text.`;
}

/**
 * STEP H.6 — Default Template
 * Returns default template (name + address only)
 */
function getDefaultVisionTemplate() {
  return {
    columns: [
      { key: "name", label: "ชื่อ-สกุล", required: true },
      { key: "address", label: "บ้านเลขที่", required: true },
    ]
  };
}

/**
 * STEP J.1 — Credit Model (Pricing Constants)
 */
const VISION_CLASSIFY_COST = 0.2; // credit per page
const VISION_DATA_EXTRACT_COST = 1.0; // credit per page

/**
 * STEP J.2 — Get User Credits from Firestore
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>} Current user credits
 */
async function getUserCredits(userId) {
  try {
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      console.warn(`[CREDIT] User ${userId} not found, defaulting to 0 credits`);
      return 0;
    }
    
    const userData = userDoc.data();
    let credits = userData?.credits;
    
    // Normalize credits to number
    if (credits === null || credits === undefined) {
      credits = 0;
    } else if (typeof credits === 'string') {
      credits = parseFloat(credits);
      if (isNaN(credits)) {
        credits = 0;
      }
    } else if (typeof credits !== 'number') {
      credits = Number(credits);
      if (isNaN(credits)) {
        credits = 0;
      }
    }
    
    return Math.max(0, credits);
  } catch (error) {
    console.error(`[CREDIT] Failed to get user credits for ${userId}`, {
      error: error.message,
    });
    // Fail-safe: return 0 to prevent unauthorized access
    return 0;
  }
}

/**
 * STEP J.4 — Deduct User Credits in Firestore
 * 
 * @param {string} userId - User ID
 * @param {number} amount - Amount to deduct
 * @returns {Promise<{success: boolean, newCredits: number}>} Deduction result
 */
async function deductUserCredits(userId, amount) {
  try {
    const db = admin.firestore();
    const userRef = db.collection("users").doc(userId);
    
    // Use transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists) {
        throw new Error(`User ${userId} not found`);
      }
      
      const userData = userDoc.data();
      let currentCredits = userData?.credits || 0;
      
      // Normalize to number
      if (typeof currentCredits === 'string') {
        currentCredits = parseFloat(currentCredits);
        if (isNaN(currentCredits)) currentCredits = 0;
      } else if (typeof currentCredits !== 'number') {
        currentCredits = Number(currentCredits);
        if (isNaN(currentCredits)) currentCredits = 0;
      }
      
      const newCredits = Math.max(0, currentCredits - amount);
      
      transaction.update(userRef, {
        credits: newCredits,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return {
        previousCredits: currentCredits,
        newCredits: newCredits,
        deducted: amount,
      };
    });
    
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error(`[CREDIT] Failed to deduct credits for ${userId}`, {
      error: error.message,
      amount,
    });
    throw error;
  }
}

/**
 * STEP I.1 — Page Classification (Light Vision)
 * Classifies a page to determine if it contains tabular person data
 * 
 * @param {Buffer} imageBuffer - Image buffer to classify
 * @param {string} reqId - Request ID for logging
 * @returns {Promise<{type: string, confidence: number}>} Classification result
 */
async function classifyVisionPage(imageBuffer, reqId) {
  try {
    const { generateGeminiVision } = require("./utils/geminiClient");
    
    // STEP I.2 — Classifier Prompt (STRICT)
    const classifierPrompt = `You are classifying a document page.

Classify this page into ONE of the following types:
- DATA → contains rows of people with name / house number
- HEADER → contains column titles only
- NOISE → instructions, notes, paragraphs
- EMPTY → blank or almost blank

Return JSON ONLY:
{
  "type": "DATA | HEADER | NOISE | EMPTY",
  "confidence": 0.0-1.0
}

Rules:
- DATA must have at least 2 rows of people
- HEADER has column labels but no people
- If unsure, choose NOISE
- Do not extract data
- Do not explain

Return ONLY the JSON object. No markdown. No additional text.`;

    const response = await generateGeminiVision(
      imageBuffer,
      classifierPrompt,
      {
        maxOutputTokens: 512, // Very short response
        temperature: 0,
      }
    );
    
    // Parse JSON response
    let jsonText = response.trim();
    
    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }
    
    // Find JSON object
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonText);
      
      // Validate type
      const validTypes = ["DATA", "HEADER", "NOISE", "EMPTY"];
      if (parsed.type && validTypes.includes(parsed.type)) {
        const confidence = typeof parsed.confidence === 'number' 
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5;
        
        return {
          type: parsed.type,
          confidence: confidence,
        };
      }
    }
    
    // STEP I.6 — Fail-safe: Default to DATA if parsing fails
    console.warn("[VISION_CLASSIFIER] Failed to parse classification, fallback to DATA", { reqId });
    return {
      type: "DATA",
      confidence: 0.5,
    };
    
  } catch (error) {
    // STEP I.6 — Fail-safe: Default to DATA on error
    console.warn("[VISION_CLASSIFIER] Classification error, fallback to DATA", {
      reqId,
      error: error.message,
    });
    return {
      type: "DATA",
      confidence: 0.5,
    };
  }
}

// ====================================
// SMART OCR VISION PDF ENDPOINT
// Vision-first, OCR-free pipeline (placeholder)
// ====================================
exports.smartOcrVisionPdf = onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 540,
    memory: "4GiB",
    maxInstances: 10,
    secrets: [GEMINI_API_KEY],
  },
  (req, res) => {
    // CORS headers helper
    function setCorsHeaders() {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    }

    setCorsHeaders();

    cors(req, res, async () => {
      // Reset DEBUG_LOGS for this request
      DEBUG_LOGS.length = 0;
      
      const reqId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const requestStartTime = Date.now();
      
      console.log("📥 [SMART_OCR_VISION] Request entered", {
        reqId,
        method: req.method,
        timestamp: Date.now(),
        traceContext: req.headers["x-cloud-trace-context"] || "none",
        build: BUILD_ID,
        kService: process.env.K_SERVICE || "not-set",
        functionTarget: process.env.FUNCTION_TARGET || "not-set",
        mode: "vision",
      });
      
      if (req.method !== "POST") {
        console.log("📤 [SMART_OCR_VISION] Response sent", {
          reqId,
          status: 405,
          reason: "Method not allowed",
        });
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
      }

      // A) Feature Flag (Kill Switch)
      const ENABLE_VISION_OCR = process.env.ENABLE_VISION_OCR || "true";
      if (ENABLE_VISION_OCR !== "true") {
        console.log("📤 [SMART_OCR_VISION] Response sent", {
          reqId,
          status: 403,
          reason: "Feature disabled",
        });
        return res.status(403).json({
          success: false,
          error: "Vision OCR mode is temporarily disabled",
          mode: "vision",
        });
      }

      try {
        // [STEP 1] Receive and validate file
        console.log("[SMART_OCR_VISION] [STEP 1] File validation", { reqId });

        if (!req.body || !req.body.pdf_base64) {
          console.log("📤 [SMART_OCR_VISION] Response sent", {
            reqId,
            status: 400,
            reason: "Missing pdf_base64",
          });
          return res.status(400).json({
            success: false,
            error: "Missing pdf_base64",
          });
        }

        const fileName = req.body.fileName || req.body.filename || "input.pdf";
        const pdfBase64 = req.body.pdf_base64;
        const fileBuffer = Buffer.from(pdfBase64, "base64");
        const fileSize = fileBuffer.length;
        
        // Detect file type from mimeType or fileName extension
        const mimeType = req.body.mimeType || req.body.mimetype || req.body.contentType || null;
        const fileExtension = fileName.toLowerCase().split('.').pop() || '';
        const isImage = mimeType?.startsWith('image/') || 
                       ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
        const isPdf = mimeType === 'application/pdf' || fileExtension === 'pdf';

        console.log(`[SMART_OCR_VISION] [STEP 1] name=${fileName} size=${fileSize} bytes mimeType=${mimeType || 'unknown'} isImage=${isImage} isPdf=${isPdf}`, { reqId });

        // B) File Guard - Size check
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
        if (fileSize > MAX_FILE_SIZE) {
          console.log("📤 [SMART_OCR_VISION] Response sent", {
            reqId,
            status: 400,
            reason: "File too large",
            fileSize,
            maxSize: MAX_FILE_SIZE,
          });
          return res.status(400).json({
            success: false,
            error: `File size exceeds limit: ${(fileSize / 1024 / 1024).toFixed(2)} MB (max: 10 MB)`,
            mode: "vision",
          });
        }

        // B) File Guard - Mime type check
        const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
        const allowedMimeType = ALLOWED_MIME_TYPES.includes(mimeType);
        if (!allowedMimeType && !isPdf && !isImage) {
          console.log("📤 [SMART_OCR_VISION] Response sent", {
            reqId,
            status: 400,
            reason: "Invalid mime type",
            mimeType,
          });
          return res.status(400).json({
            success: false,
            error: `Unsupported file type. Allowed: PDF, JPEG, PNG. Got: ${mimeType || fileExtension || 'unknown'}`,
            mode: "vision",
          });
        }

        // Validate file size (basic check)
        if (fileSize === 0) {
          console.log("📤 [SMART_OCR_VISION] Response sent", {
            reqId,
            status: 400,
            reason: "Empty file",
          });
          return res.status(400).json({
            success: false,
            error: "File is empty",
            mode: "vision",
          });
        }

        // [STEP C] PDF/Image to Images
        console.log("[SMART_OCR_VISION] [STEP C] START", { reqId });
        
        let pages = [];
        
        try {
          if (isPdf) {
            // PDF input: convert to images per page
            console.log("[SMART_OCR_VISION] [STEP C] Detected PDF input, converting to images", { reqId });
            const { normalizePdfToImages } = require("./utils/normalizePdfToImages");
            const normalizedPages = await normalizePdfToImages(fileBuffer, fileName, {});
            
            if (!normalizedPages || normalizedPages.length === 0) {
              throw new Error("PDF conversion failed: No pages extracted");
            }
            
            // Standardize output format
            pages = normalizedPages.map(page => ({
              page: page.pageNumber,
              imageBuffer: page.imageBuffer,
              width: page.width || null,
              height: page.height || null,
            }));
            
            console.log(`[SMART_OCR_VISION] [STEP C] PDF converted: ${pages.length} pages`, { reqId });
          } else if (isImage) {
            // Image input: treat as single-page image
            console.log("[SMART_OCR_VISION] [STEP C] Detected image input, treating as single-page", { reqId });
            
            pages = [{
              page: 1,
              imageBuffer: fileBuffer,
              width: null, // Will be determined during Vision processing if needed
              height: null, // Will be determined during Vision processing if needed
            }];
            
            console.log(`[SMART_OCR_VISION] [STEP C] Image prepared as single page`, { reqId });
          } else {
            // Unsupported file type
            const errorMsg = `Unsupported file type. Expected PDF or image (jpg/png/webp), got: ${mimeType || fileExtension || 'unknown'}`;
            console.log("📤 [SMART_OCR_VISION] Response sent", {
              reqId,
              status: 400,
              reason: errorMsg,
            });
            return res.status(400).json({
              success: false,
              error: errorMsg,
            });
          }
        } catch (err) {
          console.error("[SMART_OCR_VISION] [STEP C] PDF normalize failed", {
            reqId,
            error: err.message,
            stack: err.stack,
          });
          return res.status(500).json({
            success: false,
            error: `PDF normalization failed: ${err.message}`,
            errorType: err.name || "NormalizationError",
            mode: "vision",
            records: [],
            meta: {
              requestId: reqId,
              totalRecords: 0,
              totalPages: 0,
            },
          });
        }
        
        console.log(`[SMART_OCR_VISION] [STEP C] Pages prepared: ${pages.length}`, { reqId });
        console.log("[SMART_OCR_VISION] [STEP C] END", { reqId });

        // C) Page Guard (Cost Control)
        const MAX_PAGES = 20;
        if (pages.length > MAX_PAGES) {
          console.log("📤 [SMART_OCR_VISION] Response sent", {
            reqId,
            status: 400,
            reason: "Too many pages",
            pages: pages.length,
            maxPages: MAX_PAGES,
          });
          return res.status(400).json({
            success: false,
            error: `ไฟล์เกิน ${MAX_PAGES} หน้า (Vision mode จำกัด)`,
            mode: "vision",
            totalPages: pages.length,
            maxPages: MAX_PAGES,
          });
        }

        // [STEP H] Vision Template Support
        console.log("[SMART_OCR_VISION] [STEP H] Template validation", { reqId });
        
        let visionTemplate;
        try {
          // STEP H.6 — Backward Compatibility: Use default if template missing
          if (req.body.template && req.body.template.columns) {
            validateVisionTemplate(req.body.template);
            visionTemplate = req.body.template;
            console.log("[VISION_TEMPLATE] Loaded template", {
              reqId,
              columnKeys: visionTemplate.columns.map(c => c.key),
              columnCount: visionTemplate.columns.length,
            });
          } else {
            visionTemplate = getDefaultVisionTemplate();
            console.log("[VISION_TEMPLATE] Using default template", {
              reqId,
              columnKeys: visionTemplate.columns.map(c => c.key),
            });
          }
        } catch (templateError) {
          console.error("[VISION_TEMPLATE] Validation failed", {
            reqId,
            error: templateError.message,
          });
          return res.status(400).json({
            success: false,
            error: templateError.message,
            mode: "vision",
          });
        }

        // [STEP J.2] Preflight Credit Estimation
        console.log("[SMART_OCR_VISION] [STEP J.2] Preflight credit estimation START", { reqId });
        
        // Get user ID from request (optional for now, will be required for credit check)
        const userId = req.body.userId || req.body.uid || null;
        let userCredits = 0;
        let creditCheckRequired = false;
        
        if (userId) {
          creditCheckRequired = true;
          userCredits = await getUserCredits(userId);
          console.log(`[CREDIT_ESTIMATE] User ${userId} current credits: ${userCredits}`, { reqId });
        } else {
          console.warn(`[CREDIT_ESTIMATE] No userId provided, skipping credit check`, { reqId });
        }

        // [STEP I] Vision Page Classifier (Preflight - Classify ALL pages first)
        console.log("[SMART_OCR_VISION] [STEP I] Page classification START (preflight)", { reqId });
        
        const pageClassifications = [];
        let firstDataPageIndex = -1;
        let dataStarted = false;
        
        // STEP I.3 — Classify each page (PREFLIGHT - for cost estimation)
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const pageNumber = page.page;
          
          try {
            const classification = await classifyVisionPage(page.imageBuffer, reqId);
            pageClassifications.push({
              pageIndex: i,
              pageNumber: pageNumber,
              type: classification.type,
              confidence: classification.confidence,
            });
            
            // STEP I.5 — Logging (SAFE)
            console.log(`[VISION_CLASSIFIER] Page ${pageNumber} → ${classification.type} (${classification.confidence.toFixed(2)})`, { reqId });
            
            // STEP I.4 — Track first DATA page
            if (classification.type === "DATA" && firstDataPageIndex === -1) {
              firstDataPageIndex = i;
              dataStarted = true;
            }
            
            // STEP I.4 — STOP after EMPTY if data already started
            // BUT: Only stop if we see 2 consecutive EMPTY pages (to avoid single-page false positives)
            if (dataStarted && classification.type === "EMPTY") {
              // Check if previous page was also EMPTY
              const prevClassification = pageClassifications.length >= 2 ? pageClassifications[pageClassifications.length - 2] : null;
              if (prevClassification && prevClassification.type === "EMPTY") {
                console.log(`[VISION_CLASSIFIER] STOP after page ${pageNumber} (2 consecutive EMPTY pages detected)`, { reqId });
                break; // Stop processing remaining pages
              } else {
                console.log(`[VISION_CLASSIFIER] Page ${pageNumber} is EMPTY but previous was not, continuing...`, { reqId });
              }
            }
            
          } catch (classifyError) {
            // STEP I.6 — Fail-safe: Default to DATA
            console.warn(`[VISION_CLASSIFIER] Page ${pageNumber} classification failed, fallback to DATA`, {
              reqId,
              error: classifyError.message,
            });
            pageClassifications.push({
              pageIndex: i,
              pageNumber: pageNumber,
              type: "DATA",
              confidence: 0.5,
            });
            
            if (firstDataPageIndex === -1) {
              firstDataPageIndex = i;
              dataStarted = true;
            }
          }
        }
        
        // STEP I.4 — Filter pages: only process DATA pages after first DATA page
        const pagesToProcess = [];
        let dataPagesCount = 0;
        
        for (let i = 0; i < pages.length; i++) {
          const classification = pageClassifications[i];
          
          if (!classification) {
            // Skip if classification failed
            continue;
          }
          
          // Skip pages before first DATA page
          if (firstDataPageIndex >= 0 && i < firstDataPageIndex) {
            console.log(`[VISION_CLASSIFIER] Skipping page ${classification.pageNumber} (before first DATA page)`, { reqId });
            continue;
          }
          
          // Only process DATA pages
          if (classification.type === "DATA") {
            pagesToProcess.push({
              page: pages[i],
              classification: classification,
            });
            dataPagesCount++;
          } else {
            console.log(`[VISION_CLASSIFIER] Skipping page ${classification.pageNumber} (type: ${classification.type}, confidence: ${classification.confidence.toFixed(2)})`, { reqId });
            // Log warning if confidence is low (might be misclassified)
            if (classification.confidence < 0.7) {
              console.warn(`[VISION_CLASSIFIER] WARNING: Page ${classification.pageNumber} classified as ${classification.type} with low confidence (${classification.confidence.toFixed(2)}), might be misclassified`, { reqId });
            }
          }
        }
        
        console.log(`[VISION_CLASSIFIER] Processing ${pagesToProcess.length} DATA pages out of ${pages.length} total pages`, { reqId });
        console.log("[SMART_OCR_VISION] [STEP I] Page classification END", { reqId });

        // STEP J.2 — Calculate estimated cost
        const totalPages = pages.length;
        const estimatedCost = 
          (totalPages * VISION_CLASSIFY_COST) + 
          (dataPagesCount * VISION_DATA_EXTRACT_COST);
        
        const estimatedCostRounded = Math.round(estimatedCost * 10) / 10; // Round to 1 decimal
        
        console.log(`[CREDIT_ESTIMATE] pages=${totalPages}, dataPages=${dataPagesCount}, estimated=${estimatedCostRounded}`, { reqId });
        
        // STEP J.3 — Credit Guard
        if (creditCheckRequired) {
          if (userCredits < estimatedCostRounded) {
            console.log(`[CREDIT_GUARD] INSUFFICIENT_CREDIT`, {
              reqId,
              required: estimatedCostRounded,
              available: userCredits,
            });
            
            return res.status(402).json({
              success: false,
              error: "INSUFFICIENT_CREDIT",
              required: estimatedCostRounded,
              available: userCredits,
              mode: "vision",
            });
          }
          
          console.log(`[CREDIT_GUARD] Credit check passed`, {
            reqId,
            required: estimatedCostRounded,
            available: userCredits,
          });
        }
        
        console.log("[SMART_OCR_VISION] [STEP J.2] Preflight credit estimation END", { reqId });

        // [STEP D] Gemini Vision - Extract person records from images
        console.log("[SMART_OCR_VISION] [STEP D] START", { reqId });
        
        const { generateGeminiVision } = require("./utils/geminiClient");
        const pageResults = []; // Store per-page results
        const warnings = []; // Store page failures for partial success
        let successPages = 0;
        let failedPages = 0;
        
        // Process each DATA page through Gemini Vision
        for (let i = 0; i < pagesToProcess.length; i++) {
          const { page, classification } = pagesToProcess[i];
          const pageNumber = page.page;
          const pageStartTime = Date.now();
          
          console.log(`[SMART_OCR_VISION] [STEP D] Processing page ${pageNumber}/${pages.length}`, { reqId });
          
          try {
            // D) Per-page Timeout Guard (60 seconds per page)
            const PAGE_TIMEOUT_MS = 60 * 1000; // 60 seconds (increased from 15s for complex documents)
            
            // STEP H.2 — Build prompt using template
            const visionPrompt = buildVisionPrompt(pageNumber, visionTemplate);
            console.log("[VISION_PROMPT] Built for page", {
              reqId,
              page: pageNumber,
              columnCount: visionTemplate.columns.length,
            });

            // D) Per-page Timeout Guard - Wrap Gemini call in timeout
            const pageResultPromise = (async () => {
              // Call Gemini Vision
              console.log(`[SMART_OCR_VISION] [STEP D] Calling Gemini Vision for page ${pageNumber}`, { reqId });
              const visionResponse = await generateGeminiVision(
                page.imageBuffer,
                visionPrompt,
                {
                  maxOutputTokens: 8192,
                  temperature: 0,
                }
              );
              
              console.log(`[SMART_OCR_VISION] [STEP D] Gemini Vision response received for page ${pageNumber}`, {
                reqId,
                responseLength: visionResponse.length,
              });
              
              // Parse JSON response
              let pageRecords = [];
              try {
                // Extract JSON from response (handle markdown code blocks)
                let jsonText = visionResponse.trim();
                
                // Remove markdown code blocks if present
                const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                  jsonText = jsonMatch[1].trim();
                }
                
                // Find JSON object
                const jsonStart = jsonText.indexOf('{');
                const jsonEnd = jsonText.lastIndexOf('}');
                
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                  jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
                  const parsed = JSON.parse(jsonText);
                  
                  if (parsed.records && Array.isArray(parsed.records)) {
                    // STEP H.3 — Parse records with template labels
                    pageRecords = parsed.records;
                    console.log("[VISION_PAGE] Extracted records", {
                      reqId,
                      page: pageNumber,
                      recordCount: pageRecords.length,
                    });
                  } else {
                    console.warn(`[SMART_OCR_VISION] [STEP D] No records array in response for page ${pageNumber}`, { reqId });
                  }
                } else {
                  console.warn(`[SMART_OCR_VISION] [STEP D] Could not find JSON in response for page ${pageNumber}`, { reqId });
                }
              } catch (parseError) {
                console.error(`[SMART_OCR_VISION] [STEP D] Failed to parse JSON for page ${pageNumber}`, {
                  reqId,
                  error: parseError.message,
                  responsePreview: visionResponse.substring(0, 500),
                });
                throw new Error(`JSON parse failed: ${parseError.message}`);
              }
              
              return {
                page: pageNumber,
                records: pageRecords,
                success: true,
              };
            })();

            // Wrap in timeout
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Page ${pageNumber} timeout: exceeded ${PAGE_TIMEOUT_MS / 1000} seconds`));
              }, PAGE_TIMEOUT_MS);
            });

            try {
              const pageResult = await Promise.race([pageResultPromise, timeoutPromise]);
              const pageElapsed = Date.now() - pageStartTime;
              
              if (pageResult.success) {
                successPages++;
                console.log(`[SMART_OCR_VISION] [STEP D] Page ${pageNumber} completed in ${pageElapsed}ms`, {
                  reqId,
                  records: pageResult.records.length,
                });
              } else {
                failedPages++;
                warnings.push({
                  page: pageNumber,
                  reason: pageResult.error || "Unknown error",
                });
                console.warn(`[SMART_OCR_VISION] [STEP D] Page ${pageNumber} failed: ${pageResult.error}`, { reqId });
              }
              
              pageResults.push({
                page: pageNumber,
                records: pageResult.records || [],
              });
              
            } catch (pageError) {
              failedPages++;
              const pageElapsed = Date.now() - pageStartTime;
              const errorReason = pageError.message || "Unknown error";
              
              warnings.push({
                page: pageNumber,
                reason: errorReason,
              });
              
              console.error(`[SMART_OCR_VISION] [STEP D] Error processing page ${pageNumber}`, {
                reqId,
                error: errorReason,
                elapsed: pageElapsed,
                timeout: errorReason.includes('timeout'),
              });
              
              // Store empty result for failed page (continue processing)
              pageResults.push({
                page: pageNumber,
                records: [],
              });
            }
          } catch (pageError) {
            // Outer catch for any unexpected errors
            failedPages++;
            const pageElapsed = Date.now() - pageStartTime;
            const errorReason = pageError.message || "Unknown error";
            
            warnings.push({
              page: pageNumber,
              reason: errorReason,
            });
            
            console.error(`[SMART_OCR_VISION] [STEP D] Unexpected error processing page ${pageNumber}`, {
              reqId,
              error: errorReason,
              elapsed: pageElapsed,
            });
            
            // Store empty result for failed page (continue processing)
            pageResults.push({
              page: pageNumber,
              records: [],
            });
          }
        }
        
        // F) Deterministic Logging
        const stepDElapsed = Date.now() - requestStartTime;
        console.log(`[SMART_OCR_VISION] [STEP D] Pages processed: ${pageResults.length}`, {
          reqId,
          successPages,
          failedPages,
          elapsedMs: stepDElapsed,
        });
        console.log("[SMART_OCR_VISION] [STEP D] END", { reqId });

        // [STEP E] Multi-page Guard + Final Response Contract
        console.log("[SMART_OCR_VISION] [STEP E] START", { reqId });
        console.log(`[SMART_OCR_VISION] [STEP E] Pages received: ${pageResults.length}`, { reqId });
        
        // A) Multi-page Guard: Iterate pagesResults in page order
        const validPageResults = [];
        let totalValidRecords = 0;
        let allPagesFailedCheck = true;
        
        for (let i = 0; i < pageResults.length; i++) {
          const pageResult = pageResults[i];
          const pageNum = pageResult.page;
          
          // Guard: If records is not an array, treat as empty
          if (!Array.isArray(pageResult.records)) {
            console.warn(`[SMART_OCR_VISION] [STEP E] Page ${pageNum} records is not an array, treating as empty`, { reqId });
            validPageResults.push({
              page: pageNum,
              records: [],
            });
            continue;
          }
          
          // B) Record Integrity Filter: Accept if at least one required field is not null
          const validRecords = [];
          for (const record of pageResult.records) {
            // Check if record has at least one non-null field (using template labels)
            let hasAnyValue = false;
            for (const col of visionTemplate.columns) {
              const value = record[col.label];
              if (value !== null && value !== undefined && String(value).trim() !== '') {
                hasAnyValue = true;
                break;
              }
            }
            
            if (hasAnyValue) {
              // Preserve record with template labels (no page number in record, it's in meta)
              validRecords.push(record);
            }
            // Reject records where ALL fields are null/empty
          }
          
          if (validRecords.length > 0) {
            allPagesFailedCheck = false;
          }
          
          totalValidRecords += validRecords.length;
          console.log(`[SMART_OCR_VISION] [STEP E] Page ${pageNum} valid records: ${validRecords.length}`, { reqId });
          
          validPageResults.push({
            page: pageNum,
            records: validRecords,
          });
        }
        
        // C) Dedup Guard (Soft, Optional): Deduplicate based on all template fields
        const finalRecords = [];
        for (const pageResult of validPageResults) {
          const seen = new Set();
          for (const record of pageResult.records) {
            // Create dedup key from all template column values
            const dedupKeyParts = visionTemplate.columns.map(col => {
              const value = record[col.label] || '';
              return String(value).trim();
            });
            const dedupKey = dedupKeyParts.join('|||');
            
            if (!seen.has(dedupKey)) {
              seen.add(dedupKey);
              finalRecords.push(record);
            }
            // Otherwise skip duplicate (all fields match in same page)
          }
        }
        
        console.log(`[SMART_OCR_VISION] [STEP E] Total records: ${finalRecords.length}`, { reqId });
        console.log("[SMART_OCR_VISION] [STEP E] END", { reqId });

        // STEP J.4 — Credit Deduction (ONLY after successful extraction)
        let creditDeducted = false;
        let totalDeducted = 0;
        let classificationCost = 0;
        let extractionCost = 0;
        
        if (creditCheckRequired && userId) {
          try {
            // Calculate actual costs
            classificationCost = totalPages * VISION_CLASSIFY_COST;
            extractionCost = successPages * VISION_DATA_EXTRACT_COST; // Only successful pages
            totalDeducted = classificationCost + extractionCost;
            totalDeducted = Math.round(totalDeducted * 10) / 10; // Round to 1 decimal
            
            // Deduct credits
            const deductResult = await deductUserCredits(userId, totalDeducted);
            creditDeducted = true;
            
            console.log(`[CREDIT_DEDUCT] classify=${classificationCost.toFixed(1)} extract=${extractionCost.toFixed(1)} total=${totalDeducted.toFixed(1)}`, {
              reqId,
              previousCredits: deductResult.previousCredits,
              newCredits: deductResult.newCredits,
            });
          } catch (deductError) {
            // STEP J.5 — Fail Safety: If deduction fails, abort
            console.error(`[CREDIT_ABORT] reason=CREDIT_DEDUCTION_FAILED`, {
              reqId,
              error: deductError.message,
            });
            
            return res.status(500).json({
              success: false,
              error: "Credit deduction failed",
              errorType: "CreditDeductionError",
              mode: "vision",
            });
          }
        }

        // D) Final Response Contract
        // E) Partial Success Policy
        const hasPartialSuccess = failedPages > 0 && successPages > 0;
        const allPagesFailed = failedPages === pages.length && pages.length > 0 && allPagesFailedCheck;
        
        // Error handling: If ALL pages failed → success=false
        if (allPagesFailed) {
          // STEP J.5 — Fail Safety: No credit deducted if all pages failed
          if (creditDeducted) {
            console.error(`[CREDIT_ABORT] reason=ALL_PAGES_FAILED_AFTER_DEDUCTION`, { reqId });
            // Note: Credits already deducted, but we should still return error
          } else {
            console.log(`[CREDIT_ABORT] reason=ALL_PAGES_FAILED_BEFORE_DEDUCTION`, { reqId });
          }
          
          console.error(`[SMART_OCR_VISION] [STEP E] All pages failed to extract records`, { reqId });
          return res.status(500).json({
            success: false,
            mode: "vision",
            templateUsed: true,
            columns: visionTemplate.columns.map(col => ({
              key: col.key,
              label: col.label,
            })),
            error: "All pages failed to extract records",
            totalPages: pages.length,
            totalRecords: 0,
            records: [],
            warnings: warnings,
            meta: {
              build: BUILD_ID,
              timestamp: new Date().toISOString(),
              pagesProcessed: pages.length,
              estimatedGeminiCalls: 0,
              mode: "vision",
            },
          });
        }
        
        // F) Deterministic Logging
        const totalElapsed = Date.now() - requestStartTime;
        console.log("📤 [SMART_OCR_VISION] Response sent", {
          reqId,
          status: 200,
          mode: "vision",
          pages: pages.length,
          successPages,
          failedPages,
          totalRecords: finalRecords.length,
          elapsedMs: totalElapsed,
          hasWarnings: warnings.length > 0,
        });
        
        // G) Cost Safety Header
        const estimatedGeminiCalls = successPages; // One call per successful page
        
        res.set("Content-Type", "application/json");
        
        // E) Partial Success: If some pages failed but some succeeded, return success with warnings
        if (allPagesFailed) {
          return res.status(500).json({
            success: false,
            mode: "vision",
            error: "All pages failed to extract records",
            totalPages: pages.length,
            totalRecords: 0,
            records: [],
            warnings: warnings,
            meta: {
              build: BUILD_ID,
              timestamp: new Date().toISOString(),
              pagesProcessed: pages.length,
              estimatedGeminiCalls: 0,
              mode: "vision",
            },
          });
        }
        
        // STEP H.4 — Response Format with Template
        // STEP J.6 — Response Metadata (NON-BREAKING)
        const responseMeta = {
          build: BUILD_ID,
          timestamp: new Date().toISOString(),
          pagesProcessed: pages.length,
          estimatedGeminiCalls: estimatedGeminiCalls,
          mode: "vision",
          totalPages: pages.length,
          totalRecords: finalRecords.length,
        };
        
        // Add Vision credit metadata if credit was deducted
        if (creditDeducted) {
          responseMeta.vision = {
            pages: totalPages,
            dataPages: successPages,
            creditUsed: totalDeducted,
          };
        }
        
        return res.status(200).json({
          success: true,
          mode: "vision",
          templateUsed: true,
          columns: visionTemplate.columns.map(col => ({
            key: col.key,
            label: col.label,
          })),
          totalPages: pages.length,
          totalRecords: finalRecords.length,
          records: finalRecords,
          ...(hasPartialSuccess && warnings.length > 0 ? { warnings: warnings } : {}),
          meta: responseMeta,
        });

      } catch (err) {
        const reqId = req.reqId || `ERROR-${Date.now()}`;
        
        // STEP J.5 — Fail Safety: No credit deducted on error
        console.error(`[CREDIT_ABORT] reason=ERROR_BEFORE_COMMIT`, {
          reqId,
          error: err.message,
        });
        
        console.error("[SMART_OCR_VISION] ❌ Error:", { reqId, error: err.message, build: BUILD_ID });
        console.error("[SMART_OCR_VISION] ❌ Error stack:", { reqId, stack: err.stack });

        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");

        try {
          console.log("📤 [SMART_OCR_VISION] Response sent", {
            reqId,
            status: 500,
            build: BUILD_ID,
            error: err.message,
          });
          return res.status(500).json({
            success: false,
            error: err.message || "Smart OCR Vision failed",
            errorType: err.name || "UnknownError",
            mode: "vision",
            records: [],
            meta: {
              requestId: reqId,
              totalRecords: 0,
              totalPages: 0,
            },
          });
        } catch (responseError) {
          console.error("[SMART_OCR_VISION] ❌ Failed to send error response:", { reqId, error: responseError.message });
        }
      }
    });
  }
);
