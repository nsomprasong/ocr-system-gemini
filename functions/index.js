const DEBUG_LOGS = [];

function debugLog(...args) {
  const msg = args.map(a =>
    typeof a === "string" ? a : JSON.stringify(a)
  ).join(" ");
  DEBUG_LOGS.push(msg);
}

const BUILD_ID = "SMART_OCR_BUILD_2026_01_16_STEP7";

let onRequest;
try {
  const httpsModule = require("firebase-functions/v2/https");
  onRequest = httpsModule.onRequest;
} catch (e) {
  console.error("[BOOT FAIL] firebase-functions/v2/https", e);
  throw e;
}

let defineSecret;
try {
  const paramsModule = require("firebase-functions/params");
  defineSecret = paramsModule.defineSecret;
} catch (e) {
  console.error("[BOOT FAIL] firebase-functions/params", e);
  throw e;
}

let admin;
try {
  admin = require("firebase-admin");
} catch (e) {
  console.error("[BOOT FAIL] firebase-admin", e);
  throw e;
}

let vision;
try {
  vision = require("@google-cloud/vision");
} catch (e) {
  console.error("[BOOT FAIL] @google-cloud/vision", e);
  throw e;
}

let cors;
try {
  cors = require("cors")({ origin: true });
} catch (e) {
  console.error("[BOOT FAIL] cors", e);
  throw e;
}

let GEMINI_API_KEY;
try {
  GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
} catch (e) {
  console.error("[BOOT FAIL] defineSecret GEMINI_API_KEY", e);
  throw e;
}

try {
  admin.initializeApp();
} catch (e) {
  console.error("[BOOT FAIL] admin.initializeApp()", e);
  throw e;
}

let visionClient;
try {
  visionClient = new vision.ImageAnnotatorClient();
} catch (e) {
  console.error("[BOOT FAIL] vision.ImageAnnotatorClient()", e);
  throw e;
}

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

  const heights = words.filter(w => w.h > 0).map(w => w.h);
  const avgHeight = heights.length > 0
    ? heights.reduce((sum, h) => sum + h, 0) / heights.length
    : 10;
  const yTolerance = avgHeight * 0.8;

  const sortedWords = [...words].sort((a, b) => {
    if (Math.abs(a.y - b.y) <= yTolerance) {
      return a.x - b.x; // Same row: sort by X
    }
    return a.y - b.y; // Different rows: sort by Y
  });

  const rawRows = [];
  let currentRow = null;

  for (const word of sortedWords) {
    if (currentRow === null || Math.abs(word.y - currentRow.y) > yTolerance) {
      if (currentRow !== null) {
        currentRow.words.sort((a, b) => a.x - b.x);
        currentRow.text = currentRow.words.map(w => w.text).join(" ");
        currentRow.wordCount = currentRow.words.length;
        const thaiWords = currentRow.text.match(/[\u0E00-\u0E7F]+/g) || [];
        const numericTokens = currentRow.text.match(/\b\d+\b/g) || [];
        currentRow.thaiWordCount = thaiWords.length;
        currentRow.numericTokenCount = numericTokens.length;
        
        if (currentRow.thaiWordCount === 0 && currentRow.numericTokenCount > 0) {
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
    } else {
      rawRows.push(currentRow);
    }
  }

  const hardHeaderKeywords = ["เลือกตั้ง", "ลายพิมพ์", "ประจําตัวประชาชน", "เลขหมาย", "PROCESS", "DATEMI"];
  const candidateRows = [];
  
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const text = row.text.trim();
    const upperText = text.toUpperCase();
    let dropReason = null;
    for (const keyword of hardHeaderKeywords) {
      if (upperText.includes(keyword.toUpperCase())) {
        dropReason = `Contains hard header keyword: "${keyword}"`;
        break;
      }
    }
    
    if (!dropReason) {
      if (row.thaiWordCount < 2 && row.numericTokenCount > row.thaiWordCount) {
        dropReason = `Thai words (${row.thaiWordCount}) < 2 AND numeric tokens (${row.numericTokenCount}) > Thai tokens`;
      }
    }
    
    if (!dropReason) {
      candidateRows.push(row);
    }
  }

  const personRows = [];
  const uncertainRows = [];
  
  for (const row of candidateRows) {
    let score = 0;
    if (row.thaiWordCount >= 3) {
      score += 2;
    }
    const honorificPattern = /[นส]|นา|นาย|นาง/;
    if (honorificPattern.test(row.text)) {
      score += 1;
    }
    const trailingNumberPattern = /\d+([\/-]\d+)?\s*$/;
    if (trailingNumberPattern.test(row.text)) {
      score += 1;
    }
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

function segmentWordsIntoRows_OLD(words) {
  if (!words || words.length === 0) {
    return [];
  }

  const houseNumberPattern = /\b\d+([\/-]\d+)?\b/;
  const thaiNamePattern = /[ก-๙]{2,}/;
  const headerKeywords = ["เลขหมาย", "ลายมือ", "เลือกตั้ง", "บัญชี", "PROCESS"];

  function hasHouseNumber(text) {
    return houseNumberPattern.test(text);
  }

  function extractHouseNumber(text) {
    const match = text.match(houseNumberPattern);
    return match ? match[0] : null;
  }

  function hasThaiName(text) {
    if (!thaiNamePattern.test(text)) {
      return false;
    }
    const upperText = text.toUpperCase();
    const hasHeaderKeyword = headerKeywords.some(keyword => upperText.includes(keyword.toUpperCase()));
    
    if (hasHeaderKeyword) {
      const thaiWords = text.match(/[ก-๙]+/g) || [];
      const meaningfulWords = thaiWords.filter(w => 
        w.length >= 2 && 
        !["นาย", "นาง", "น.ส.", "น.ส", "일", "I", "ร", "ญ"].includes(w)
      );
      if (meaningfulWords.length < 2) {
        return false;
      }
    }
    const thaiWords = text.match(/[ก-๙]+/g) || [];
    const meaningfulWords = thaiWords.filter(w => w.length >= 2);
    return meaningfulWords.length >= 2;
  }

  const heights = words.filter(w => w.h > 0).map(w => w.h).sort((a, b) => a - b);
  const medianHeight = heights.length > 0
    ? heights[Math.floor(heights.length / 2)]
    : 10;
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
      continue;
    }

    // RULE B: Thai name must be dominant
    const thaiWords = text.match(/[\u0E00-\u0E7F]+/g) || [];
    const numericTokens = text.match(/\b\d+\b/g) || [];
    if (numericTokens.length > thaiWords.length || thaiWords.length < 2) {
      continue;
    }

    // RULE C: Title-based validation
    const hasValidTitle = validTitles.some(title => text.includes(title));
    if (!hasValidTitle) {
      continue;
    }

    // RULE D: Remove column-title rows
    if (text.includes("ชื่อ") && text.includes("เพศ")) {
      continue;
    }

    // Row passed all rules
    finalRows.push(row);
  }

  return finalRows;
}

async function processPage(pageNumber, page, config, reqId, generateGeminiText, fileName) {
  try {
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
    
    const segmentResult = segmentWordsIntoRows(ocrResult.words);
    const personRowsText = segmentResult.personRows.map(r => r.text);
    
    if (personRowsText.length === 0) {
      console.warn(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] No person rows detected`, { reqId });
      return {
        page: pageNumber,
        records: [],
        error: "No person rows detected",
      };
    }
    
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

      const geminiResponseStep7 = await generateGeminiText(geminiPromptStep7, {
        maxOutputTokens: 8192,
        temperature: 0,
      });
      
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
    }
    
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
    
    let finalPersonRows = personRows;
    if (hasHeader && headerRowIndex !== null && headerRowIndex < personRows.length) {
      finalPersonRows = personRows.filter((_, i) => i !== headerRowIndex);
    }
    
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
    
    function cleanName(name) {
      if (!name || typeof name !== 'string') {
        return null;
      }
      
      let cleaned = name.replace(/\s+/g, ' ').trim();
      
      cleaned = cleaned.replace(/\s+(ญ|ช)\s*$/, '');
      
      const nonPersonKeywords = ["ถนน", "ตลาด", "หมู่", "ตำบล", "อำเภอ", "จังหวัด"];
      const hasNonPersonKeyword = nonPersonKeywords.some(keyword => cleaned.includes(keyword));
      if (hasNonPersonKeyword) {
        return null;
      }
      
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
          discardedCount++;
          continue;
        }
        const cleanedRecord = {
          ...record,
          Name: cleanedName,
        };
        
        cleanedRecords.push(cleanedRecord);
      } catch (cleanupError) {
        console.warn(`[SMART_OCR_REVISION] [PAGE ${pageNumber}] [STEP 9.5] Cleanup error for record ${i + 1}, skipping: ${cleanupError.message}`, { reqId });
        discardedCount++;
        continue;
      }
    }
    
    
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

function buildVisionPrompt(pageNumber, template) {
  const columns = template.columns || [];
  
  const nameLabel = columns.find(c => c.key === "name")?.label || "ชื่อ-สกุล";
  const addressLabel = columns.find(c => c.key === "address")?.label || "บ้านเลขที่";
  
  return `คุณคือระบบสกัดข้อมูลจากภาพ (Vision-based Extractor) 
หน้าที่ของคุณคือ “คัดลอกข้อความจากภาพตามตำแหน่งจริง” 
ไม่ใช่การตีความ ไม่ใช่การเดา และไม่ใช่การแก้ไขข้อมูลให้ถูกต้องเชิงภาษา

━━━━━━━━━━━━━━━━━━━━━━
ข้อมูลนำเข้า
━━━━━━━━━━━━━━━━━━━━━━
คุณจะได้รับภาพ (image) ของเอกสาร PDF ที่มีข้อมูลในรูปแบบตาราง
ข้อความในภาพอาจมีความผิดเพี้ยนจาก OCR หรือจากคุณภาพภาพ
ถือว่าข้อความที่เห็นในภาพคือ “ต้นฉบับสูงสุด”

━━━━━━━━━━━━━━━━━━━━━━
วัตถุประสงค์
━━━━━━━━━━━━━━━━━━━━━━
ดึงข้อมูลจากตารางเฉพาะ 2 คอลัมน์เท่านั้น:
1) "ชื่อตัว - ชื่อสกุล" (Full Name)
2) "เลขหมายประจำบ้าน" (House Number)

━━━━━━━━━━━━━━━━━━━━━━
กฎสำคัญสูงสุด (ห้ามละเมิด)
━━━━━━━━━━━━━━━━━━━━━━

❗ กฎที่ 1: ห้ามเปลี่ยนตัวตนของชื่อโดยเด็ดขาด
- ห้ามเดา
- ห้ามแก้ชื่อให้เป็นชื่ออื่น
- ห้ามปรับให้เป็นชื่อที่สมเหตุสมผลกว่า
- ห้ามรวม / แยก / แก้คำ
- ห้ามแทนชื่อหนึ่งด้วยอีกชื่อหนึ่ง

ชื่อที่ส่งออกต้องเป็น “ข้อความเดียวกับที่มองเห็นในภาพ”
แม้จะสะกดผิด แปลก หรือไม่สมบูรณ์ ก็ต้องคงไว้

❗ กฎที่ 2: ห้ามใช้ความรู้ทั่วไปหรือบริบทภายนอก
- ห้ามใช้ความรู้ว่า “ชื่อคนไทยควรเป็นแบบไหน”
- ห้ามใช้เหตุผลว่า “น่าจะเป็นคนนี้”
- ห้ามเชื่อมโยงชื่อข้ามแถว

━━━━━━━━━━━━━━━━━━━━━━
กฎการดึงข้อมูลรายแถว
━━━━━━━━━━━━━━━━━━━━━━

สำหรับแต่ละแถวเชิงตรรกะ (logical row):

1) ต้องดึงค่า "ชื่อตัว - ชื่อสกุล" เสมอ
   - ใช้ข้อความตามที่ปรากฏในภาพ
   - คัดลอกตามลำดับตัวอักษร
   - ห้ามเปลี่ยนตำแหน่งอักษร
   - ห้ามแทนที่อักษรหนึ่งด้วยอีกอักษรหนึ่ง

2) การจัดการชื่อที่ผิดเพี้ยน:
   - ถ้ายังเห็นโครงอักษร → คงข้อความนั้นไว้ตามเดิม
   - ถ้าข้อความเสียหายจนไม่เห็นโครงอักษรใดเลย →
     ให้ใช้ค่า "[ชื่อไม่ชัดเจน]"
   - ห้ามสร้างชื่อใหม่ขึ้นมาเองไม่ว่ากรณีใด

━━━━━━━━━━━━━━━━━━━━━━
กฎการจับคู่บ้านเลขที่
━━━━━━━━━━━━━━━━━━━━━━

- ให้เพิ่ม "เลขหมายประจำบ้าน" เฉพาะกรณีที่:
  - อยู่ในแถวเดียวกันทางสายตา (visual alignment)
  - ตำแหน่งแนวตั้งสอดคล้องกับชื่อ
  - มั่นใจว่าเป็นของบุคคลเดียวกันจริง ๆ

- หากไม่มั่นใจแม้เพียงเล็กน้อย:
  → ห้ามใส่บ้านเลขที่
  → ดีกว่าเว้นว่าง มากกว่าจับคู่ผิด

- ห้ามย้ายบ้านเลขที่จากแถวอื่นมาใส่

━━━━━━━━━━━━━━━━━━━━━━
การควบคุมจำนวนแถว
━━━━━━━━━━━━━━━━━━━━━━

- จำนวนผลลัพธ์ต้องสอดคล้องกับจำนวนชื่อที่เห็นในภาพ
- ห้ามรวมหลายชื่อเป็นหนึ่งรายการ
- ห้ามสร้างหรือหายรายการ
- ถ้าเห็น 22 ชื่อ → ต้องได้ 22 records

━━━━━━━━━━━━━━━━━━━━━━
รูปแบบผลลัพธ์ (JSON เท่านั้น)
━━━━━━━━━━━━━━━━━━━━━━

{
  "records": [
    {
      "${nameLabel}": "สมชาย ใจดี",
      "${addressLabel}": "123/45"
    },
    {
      "${nameLabel}": "สุภาพร สุขใจ"
    },
    {
      "${nameLabel}": "มานะ พัฒนา",
      "${addressLabel}": "50/2"
    },
    {
      "${nameLabel}": "นิดหน่อย รักเรียน"
    },
    {
      "${nameLabel}": "ธรรา สุรพร"
    },
    {
      "${nameLabel}": "[ชื่อไม่ชัดเจน]"
    },
    {
      "${nameLabel}": "วิภาวดี มีสุข"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━
ข้อห้ามสุดท้าย
━━━━━━━━━━━━━━━━━━━━━━
- ห้ามสรุป
- ห้ามอธิบาย
- ห้ามเพิ่มข้อความนอก JSON
- ห้ามใช้ markdown
- ส่งกลับเฉพาะ JSON เท่านั้น

`;
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

exports.smartOcrVisionPdf = onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 900, // เพิ่มจาก 540 เป็น 900 (15 นาที)
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
      
      // Ensure req.body is available
      if (!req.body) {
        req.body = {};
      }
      
      // Get userId from request
      const userId = req.body.userId || 'anonymous';
      
      // Get deviceId from request (for device isolation)
      const deviceId = req.body.deviceId || null;
      
      // Get sessionId from request or generate new one
      const sessionId = req.body.sessionId || `scan_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Initialize Firestore for progress tracking
      const db = admin.firestore();
      const progressRef = db.collection("scanProgress").doc(sessionId);
      
      // Helper function to update progress in Firestore
      const updateProgress = async (progressData) => {
        try {
          await progressRef.set({
            ...progressData,
            userId: userId, // Always include userId for user isolation
            deviceId: deviceId, // Include deviceId for device isolation (if provided)
            sessionId: sessionId, // Always include sessionId to identify which file/session this progress belongs to
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.error(`[SMART_OCR_VISION] Failed to update progress in Firestore:`, err);
        }
      };
      
      // Initialize progress document
      await updateProgress({
        requestId: reqId,
        userId: userId,
        deviceId: deviceId,
        sessionId: sessionId,
        status: "processing",
        percentage: 0,
        message: "กำลังเริ่มต้น...",
        totalPages: 0,
        currentPage: 0,
        progressHistory: [],
      });
      
      if (req.method !== "POST") {
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
      }

      // A) Feature Flag (Kill Switch)
      const ENABLE_VISION_OCR = process.env.ENABLE_VISION_OCR || "true";
      if (ENABLE_VISION_OCR !== "true") {
        return res.status(403).json({
          success: false,
          error: "Vision OCR mode is temporarily disabled",
          mode: "vision",
        });
      }

      try {
        // Get file data directly
        const fileName = req.body.fileName || req.body.filename || "input.pdf";
        const pdfBase64 = req.body.pdf_base64;
        const imageBase64 = req.body.image_base64;
        
        // Validate that at least one file is provided
        if (!pdfBase64 && !imageBase64) {
          return res.status(400).json({
            success: false,
            error: "Missing pdf_base64 or image_base64",
          });
        }
        
        // Detect file type from mimeType or fileName extension
        const mimeType = req.body.mimeType || req.body.mimetype || req.body.contentType || null;
        const fileExtension = fileName.toLowerCase().split('.').pop() || '';
        const isImage = !!imageBase64 || mimeType?.startsWith('image/') || 
                       ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
        const isPdf = !!pdfBase64 || mimeType === 'application/pdf' || fileExtension === 'pdf';
        
        // Convert base64 to buffer
        const fileBuffer = Buffer.from(pdfBase64 || imageBase64, "base64");

        // Progress tracking
        const progressHistory = [];
        
        // Step 1: Normalize (0-20%)
        const initialProgress = {
          step: "normalize",
          percentage: 0,
          message: "กำลังเริ่มต้น...",
          timestamp: Date.now(),
        };
        progressHistory.push(initialProgress);
        await updateProgress({
          status: "processing",
          percentage: 0,
          message: "กำลังเริ่มต้น...",
          totalPages: 0,
          currentPage: 0,
          progressHistory: [initialProgress],
        });
        
        // Normalize: Convert PDF to Images
        let pages = [];
        
        try {
          if (isPdf) {
            // PDF input: convert to images per page
            const normalizeProgress = {
              step: "normalize",
              percentage: 5,
              message: "กำลังแปลง PDF เป็นภาพ...",
              timestamp: Date.now(),
            };
            progressHistory.push(normalizeProgress);
            await updateProgress({
              status: "processing",
              percentage: 5,
              message: "กำลังแปลง PDF เป็นภาพ...",
              totalPages: 0,
              currentPage: 0,
              progressHistory: progressHistory,
            });
            
            const { normalizePdfToImages } = require("./utils/normalizePdfToImages");
            
            // Get pageRange or startPage/endPage from request for normalization
            const normalizeOptions = {};
            
            // Priority 1: pageRange array (supports ranges like 1,2,5-7)
            if (req.body.pageRange && Array.isArray(req.body.pageRange) && req.body.pageRange.length > 0) {
              // Validate and convert to numbers
              const pageRange = req.body.pageRange.map(p => parseInt(p, 10)).filter(p => !isNaN(p) && p >= 1);
              if (pageRange.length > 0) {
                normalizeOptions.pageRange = pageRange;
                console.log(`📄 [SMART_OCR_VISION] Using pageRange for ${fileName}: [${pageRange.join(', ')}]`, { reqId, sessionId, fileName });
              }
            } else {
              // Fallback: use startPage/endPage
              const normalizeStartPage = req.body.startPage !== undefined ? parseInt(req.body.startPage, 10) : undefined;
              const normalizeEndPage = req.body.endPage !== undefined ? parseInt(req.body.endPage, 10) : undefined;
              
              if (normalizeStartPage !== undefined) {
                normalizeOptions.startPage = normalizeStartPage;
              }
              if (normalizeEndPage !== undefined) {
                normalizeOptions.endPage = normalizeEndPage;
              }
            }
            
            console.log(`📄 [SMART_OCR_VISION] Starting PDF normalization for ${fileName}...`, { reqId, sessionId, fileName, pageRange: normalizeOptions.pageRange, startPage: normalizeOptions.startPage, endPage: normalizeOptions.endPage });
            const normalizedPages = await normalizePdfToImages(fileBuffer, fileName, normalizeOptions);
            console.log(`✅ [SMART_OCR_VISION] PDF normalization completed for ${fileName}: ${normalizedPages.length} pages`, { reqId, sessionId, fileName, pageCount: normalizedPages.length });
            
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
            
            const normalizeCompleteProgress = {
              step: "normalize",
              percentage: 20,
              message: `แปลง PDF เป็นภาพเสร็จสิ้น: ${pages.length} หน้า`,
              timestamp: Date.now(),
            };
            progressHistory.push(normalizeCompleteProgress);
            await updateProgress({
              status: "processing",
              percentage: 20,
              message: `แปลง PDF เป็นภาพเสร็จสิ้น: ${pages.length} หน้า`,
              totalPages: pages.length,
              currentPage: 0,
              progressHistory: progressHistory,
            });
          } else if (isImage) {
            // Image input: treat as single-page image
            pages = [{
              page: 1,
              imageBuffer: fileBuffer,
              width: null,
              height: null,
            }];
            
            progressHistory.push({
              step: "normalize",
              percentage: 20,
              message: "เตรียมภาพเสร็จสิ้น",
              timestamp: Date.now(),
            });
          } else {
            // Unsupported file type
            const errorMsg = `Unsupported file type. Expected PDF or image (jpg/png/webp), got: ${mimeType || fileExtension || 'unknown'}`;
            return res.status(400).json({
              success: false,
              error: errorMsg,
            });
          }
        } catch (err) {
          console.error("[SMART_OCR_VISION] Normalization failed", {
            reqId,
            userId,
            sessionId,
            fileName,
            error: err.message,
            stack: err.stack,
          });
          return res.status(500).json({
            success: false,
            error: `Normalization failed: ${err.message}`,
            errorType: err.name || "NormalizationError",
            records: [],
            meta: {
              requestId: reqId,
              totalRecords: 0,
              totalPages: 0,
              progressHistory: progressHistory,
            },
          });
        }
        
        // Get scanMode from request
        const scanMode = req.body.scanMode || req.body.scan_mode || "direct";
        
        // Filter pages based on pageRange (priority) or startPage/endPage (fallback)
        let pagesToProcess = pages;
        
        // Priority 1: pageRange array (supports ranges like 1,2,5-7)
        if (req.body.pageRange && Array.isArray(req.body.pageRange) && req.body.pageRange.length > 0) {
          const pageRange = req.body.pageRange.map(p => parseInt(p, 10)).filter(p => !isNaN(p) && p >= 1);
          if (pageRange.length > 0) {
            // Filter pages to only include those in pageRange
            pagesToProcess = pages.filter(p => pageRange.includes(p.page));
            console.log(`📄 [SMART_OCR_VISION] Filtered pages using pageRange [${pageRange.join(', ')}]: ${pagesToProcess.length} pages`);
          }
        } else {
          // Fallback: use startPage/endPage
          const startPage = req.body.startPage !== undefined ? parseInt(req.body.startPage, 10) : undefined;
          const endPage = req.body.endPage !== undefined ? parseInt(req.body.endPage, 10) : undefined;
          
          if (startPage !== undefined || endPage !== undefined) {
            const actualStart = startPage !== undefined ? Math.max(1, startPage) : 1;
            const actualEnd = endPage !== undefined ? Math.min(pages.length, endPage) : pages.length;
            pagesToProcess = pages.filter(p => p.page >= actualStart && p.page <= actualEnd);
            console.log(`📄 [SMART_OCR_VISION] Filtered pages using startPage/endPage ${actualStart}-${actualEnd}: ${pagesToProcess.length} pages`);
          }
        }
        
        // Load default template (required for buildVisionPrompt)
        const visionTemplate = getDefaultVisionTemplate();
        
        // Process each page with Gemini Vision (20-95%)
        const { generateGeminiVision } = require("./utils/geminiClient");
        const pageResults = [];
        const totalPages = pagesToProcess.length;
        
        for (let i = 0; i < pagesToProcess.length; i++) {
          const page = pagesToProcess[i];
          const pageNumber = page.page;
          
          // Calculate progress: 20% (normalize) + 75% (processing pages)
          const pageProgress = 20 + Math.floor((i / totalPages) * 75);
          
          // Check for cancellation request in Firestore BEFORE processing this page
          try {
            const progressDoc = await progressRef.get();
            if (progressDoc.exists) {
              const progressData = progressDoc.data();
              if (progressData.cancelled === true) {
                console.log(`⚠️ [SMART_OCR_VISION] Cancellation requested for session ${sessionId}, stopping before page ${pageNumber}...`);
                await updateProgress({
                  status: "cancelled",
                  percentage: pageProgress,
                  message: "การสแกนถูกยกเลิก - กำลังรอให้หน้าปัจจุบันเสร็จสิ้น...",
                  totalPages: totalPages,
                  currentPage: i > 0 ? pagesToProcess[i - 1].page : 0,
                  progressHistory: progressHistory,
                  pageResults: pageResults,
                });
                break; // Stop processing remaining pages
              }
            }
          } catch (cancelCheckError) {
            console.warn(`⚠️ [SMART_OCR_VISION] Failed to check cancellation status:`, cancelCheckError.message);
            // Continue processing if check fails
          }
          
          console.log(`[SMART_OCR_VISION] 📤 Sending page ${pageNumber}/${totalPages} to Gemini...`, { reqId, userId, deviceId, sessionId, fileName, pageNumber, totalPages, progress: pageProgress });
          
          const processingProgress = {
            step: "processing",
            percentage: pageProgress,
            message: `กำลังส่งภาพเข้า Gemini หน้าที่ ${pageNumber}/${totalPages}...`,
            page: pageNumber,
            totalPages: totalPages,
            timestamp: Date.now(),
          };
          progressHistory.push(processingProgress);
          await updateProgress({
            status: "processing",
            percentage: pageProgress,
            message: `กำลังส่งภาพเข้า Gemini หน้าที่ ${pageNumber}/${totalPages}...`,
            totalPages: totalPages,
            currentPage: pageNumber,
            progressHistory: progressHistory,
          });
          
          try {
            // Build prompt using existing function
            const visionPrompt = buildVisionPrompt(pageNumber, visionTemplate);
            
            console.log(`[SMART_OCR_VISION] 🔍 About to call generateGeminiVision for page ${pageNumber}`, { 
              reqId, 
              userId,
              sessionId,
              fileName,
              pageNumber, 
              imageBufferSize: page.imageBuffer.length,
              promptLength: visionPrompt.length 
            });
            
            // Call Gemini Vision ONCE per page
            const visionResponse = await generateGeminiVision(
              page.imageBuffer,
              visionPrompt,
              {
                maxOutputTokens: 8192,
                temperature: 0,
                disableRetry: true, // เรียกเพียงครั้งเดียว ไม่ retry
              }
            );
            
            console.log(`[SMART_OCR_VISION] ✅ generateGeminiVision completed for page ${pageNumber}`, { 
              reqId, 
              userId,
              sessionId,
              fileName,
              pageNumber,
              responseLength: visionResponse?.length || 0 
            });
            
            // Parse JSON response
            let pageRecords = [];
            try {
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
                  pageRecords = parsed.records;
                } else {
                  console.warn(`[SMART_OCR_VISION] No records array in response for page ${pageNumber}`, { reqId, userId, sessionId });
                }
              } else {
                console.warn(`[SMART_OCR_VISION] Could not find JSON in response for page ${pageNumber}`, { reqId, userId, sessionId });
              }
            } catch (parseError) {
              console.error(`[SMART_OCR_VISION] Failed to parse JSON for page ${pageNumber}`, {
                reqId,
                userId,
                sessionId,
                error: parseError.message,
                responsePreview: visionResponse.substring(0, 500),
              });
              // Continue with empty records for this page
              pageRecords = [];
            }
            
            pageResults.push({
              page: pageNumber,
              records: pageRecords,
            });
            
            console.log(`[SMART_OCR_VISION] ✅ Page ${pageNumber}/${totalPages} completed: ${pageRecords.length} records`, { reqId, userId, deviceId, sessionId, pageNumber, totalPages, recordsCount: pageRecords.length });
            
            // Update progress after page completed
            const completedProgress = 20 + Math.floor(((i + 1) / totalPages) * 75);
            const completedProgressData = {
              step: "processing",
              percentage: completedProgress,
              message: `เสร็จสิ้นหน้า ${pageNumber}/${totalPages} (พบ ${pageRecords.length} รายการ)`,
              page: pageNumber,
              totalPages: totalPages,
              recordsCount: pageRecords.length,
              timestamp: Date.now(),
            };
            progressHistory.push(completedProgressData);
            
            // Send page result to Firestore immediately for frontend preview
            await updateProgress({
              status: "processing",
              percentage: completedProgress,
              message: `เสร็จสิ้นหน้า ${pageNumber}/${totalPages} (พบ ${pageRecords.length} รายการ)`,
              totalPages: totalPages,
              currentPage: pageNumber,
              progressHistory: progressHistory,
              pageResults: pageResults.map(pr => ({
                page: pr.page,
                records: pr.records,
                recordsCount: pr.records.length,
              })), // Send all completed pages so far
            });
            
            // Check for cancellation AFTER completing current page
            try {
              const progressDoc = await progressRef.get();
              if (progressDoc.exists) {
                const progressData = progressDoc.data();
                if (progressData.cancelled === true) {
                  console.log(`⚠️ [SMART_OCR_VISION] Cancellation requested for session ${sessionId}, stopping after page ${pageNumber}...`);
                  await updateProgress({
                    status: "cancelled",
                    percentage: completedProgress,
                    message: "การสแกนถูกยกเลิก - หน้าปัจจุบันเสร็จสิ้นแล้ว",
                    totalPages: totalPages,
                    currentPage: pageNumber,
                    progressHistory: progressHistory,
                    pageResults: pageResults.map(pr => ({
                      page: pr.page,
                      records: pr.records,
                      recordsCount: pr.records.length,
                    })),
                  });
                  break; // Stop processing remaining pages
                }
              }
            } catch (cancelCheckError) {
              console.warn(`⚠️ [SMART_OCR_VISION] Failed to check cancellation status after page:`, cancelCheckError.message);
              // Continue processing if check fails
            }
            
          } catch (pageError) {
            console.error(`[SMART_OCR_VISION] Error processing page ${pageNumber}`, {
              reqId,
              userId,
              sessionId,
              error: pageError.message,
            });
            // Store empty result for failed page (continue processing)
            pageResults.push({
              page: pageNumber,
              records: [],
            });
            
            progressHistory.push({
              step: "processing",
              percentage: 20 + Math.floor(((i + 1) / totalPages) * 75),
              message: `เกิดข้อผิดพลาดในหน้า ${pageNumber}/${totalPages}`,
              page: pageNumber,
              totalPages: totalPages,
              error: pageError.message,
              timestamp: Date.now(),
            });
          }
        }
        
        // Step 3: Finalizing (95-100%)
        progressHistory.push({
          step: "finalizing",
          percentage: 95,
          message: "กำลังประมวลผลข้อมูลและจัดเตรียมผลลัพธ์...",
          timestamp: Date.now(),
        });
        
        // Flatten all records from all pages
        const allRecords = [];
        for (const pageResult of pageResults) {
          for (const record of pageResult.records) {
            allRecords.push(record);
          }
        }
        
        const totalElapsed = Date.now() - requestStartTime;
        
        // Handle perPage mode response format
        if (scanMode === "perPage") {
          // Convert pageResults to perPage format expected by frontend
          const perPageResults = pageResults.map(pageResult => {
            const nameLabel = visionTemplate.columns.find(c => c.key === "name")?.label || "ชื่อ-สกุล";
            const addressLabel = visionTemplate.columns.find(c => c.key === "address")?.label || "บ้านเลขที่";
            
            // Convert Vision records to OCR-like words format for compatibility
            const words = [];
            pageResult.records.forEach((record, index) => {
              const name = record[nameLabel] || record.name || "";
              const address = record[addressLabel] || record.houseNumber || "";
              
              // Create word objects for name
              if (name && name !== "[ชื่อไม่ชัดเจน]") {
                const nameWords = name.split(/\s+/).filter(w => w.length > 0);
                nameWords.forEach((word, wordIndex) => {
                  words.push({
                    text: word,
                    boundingBox: {
                      x: 0 + wordIndex * 50,
                      y: index * 30,
                      width: word.length * 10,
                      height: 20,
                    },
                  });
                });
              }
              
              // Create word object for address
              if (address) {
                words.push({
                  text: address,
                  boundingBox: {
                    x: 200,
                    y: index * 30,
                    width: address.length * 10,
                    height: 20,
                  },
                });
              }
            });
            
            // Build fullText from records
            const fullText = pageResult.records.map(r => {
              const name = r[nameLabel] || r.name || "";
              const address = r[addressLabel] || r.houseNumber || "";
              return `${name} ${address}`.trim();
            }).join("\n");
            
            return {
              pageNumber: pageResult.page,
              data: {
                words: words,
                page: {
                  width: pages.find(p => p.page === pageResult.page)?.width || 0,
                  height: pages.find(p => p.page === pageResult.page)?.height || 0,
                },
                fullText: fullText,
              },
              records: pageResult.records, // Include Vision records for Excel export
            };
          });
          
          const completeProgress = {
            step: "complete",
            percentage: 100,
            message: "ประมวลผลเสร็จสิ้น",
            timestamp: Date.now(),
          };
          progressHistory.push(completeProgress);
          await updateProgress({
            status: "completed",
            percentage: 100,
            message: "ประมวลผลเสร็จสิ้น",
            totalPages: pagesToProcess.length,
            currentPage: pagesToProcess.length,
            progressHistory: progressHistory,
            pageResults: pageResults.map(pr => ({
              page: pr.page,
              records: pr.records,
              recordsCount: pr.records.length,
            })), // Send all completed pages
          });
          
          return res.status(200).json({
            success: true,
            scanMode: "perPage",
            pages: perPageResults,
            sessionId: sessionId,
            meta: {
              requestId: reqId,
              totalPages: pagesToProcess.length,
              pagesProcessed: pageResults.length,
              elapsedMs: totalElapsed,
              progressHistory: progressHistory,
              progress: progressHistory[progressHistory.length - 1] || { percentage: 100, message: "เสร็จสิ้น" },
            },
          });
        }
        
        // Step 3: Finalizing (95-100%)
        progressHistory.push({
          step: "finalizing",
          percentage: 95,
          message: "กำลังประมวลผลข้อมูลและจัดเตรียมผลลัพธ์...",
          timestamp: Date.now(),
        });
        
        const completeProgress = {
          step: "complete",
          percentage: 100,
          message: "ประมวลผลเสร็จสิ้น",
          timestamp: Date.now(),
        };
        progressHistory.push(completeProgress);
        await updateProgress({
          status: "completed",
          percentage: 100,
          message: "ประมวลผลเสร็จสิ้น",
          totalPages: pages.length,
          currentPage: pages.length,
          progressHistory: progressHistory,
          pageResults: pageResults.map(pr => ({
            page: pr.page,
            records: pr.records,
            recordsCount: pr.records.length,
          })), // Send all completed pages
        });
        
        // Default (direct) mode response format
        return res.status(200).json({
          success: true,
          totalPages: pages.length,
          totalRecords: allRecords.length,
          records: allRecords,
          pageResults: pageResults, // Include per-page results
          sessionId: sessionId,
          meta: {
            build: BUILD_ID,
            timestamp: new Date().toISOString(),
            pagesProcessed: pages.length,
            elapsedMs: totalElapsed,
            progressHistory: progressHistory,
            progress: progressHistory[progressHistory.length - 1] || { percentage: 100, message: "เสร็จสิ้น" },
          },
        });

      } catch (err) {
        const reqId = req.reqId || `ERROR-${Date.now()}`;
        const userId = req.body?.userId || 'anonymous';
        const deviceId = req.body?.deviceId || null;
        const sessionId = req.body?.sessionId || `scan_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        
        console.error("[SMART_OCR_VISION] Error:", { reqId, userId, deviceId, error: err.message });

        // Update progress to error status
        try {
          const db = admin.firestore();
          const progressRef = db.collection("scanProgress").doc(sessionId);
          await progressRef.set({
            userId: userId,
            deviceId: deviceId,
            status: "error",
            percentage: 0,
            message: `เกิดข้อผิดพลาด: ${err.message}`,
            error: err.message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (progressError) {
          console.error("[SMART_OCR_VISION] Failed to update error progress:", progressError);
        }

        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");

        try {
          return res.status(500).json({
            success: false,
            error: err.message || "Smart OCR Vision failed",
            errorType: err.name || "UnknownError",
            mode: "vision",
            records: [],
            sessionId: sessionId,
            meta: {
              requestId: reqId,
              totalRecords: 0,
              totalPages: 0,
            },
          });
        } catch (responseError) {
          console.error("[SMART_OCR_VISION] Failed to send error response:", { reqId, error: responseError.message });
        }
      }
    });
  }
);

// ====================================
// OCR IMAGE GEMINI ENDPOINT - DEPRECATED
// This function has been merged into smartOcrVisionPdf
// Use smartOcrVisionPdf with scanMode: "ocr" or "perPage" instead
// ====================================