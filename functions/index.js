const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const vision = require("@google-cloud/vision");
const { Storage } = require("@google-cloud/storage");
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors")({ origin: true });

// Define Gemini API Key secret (Firebase Secret Manager)
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Note: Removed pdfjs-dist and canvas dependencies
// Now using v1 method (asyncBatchAnnotateFiles) which is proven to work

// DOMPoint polyfill (simple implementation)
if (!global.DOMPoint) {
  global.DOMPoint = class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
  };
}

// ImageData polyfill for Node.js (needed by pdfjs-dist)
if (!global.ImageData) {
  global.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

// Polyfill for Promise.withResolvers (Node.js < 22)
if (!Promise.withResolvers) {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Note: Removed pdfjs-dist usage - using v1 method (asyncBatchAnnotateFiles) instead
// This avoids compatibility issues with Node.js environment

admin.initializeApp();

const visionClient = new vision.ImageAnnotatorClient();
const storage = new Storage();
const db = admin.firestore();

// 🔒 ใช้ bucket ที่สร้างไว้ล่วงหน้าเท่านั้น (ถ้ามี)
const BUCKET_NAME = process.env.GCS_BUCKET || "ocr-system-c3bea-ocr-temp";

// ---------- UTIL ----------
function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

// ---------- FIRESTORE STATUS UPDATER ----------
/**
 * Update scan status in Firestore
 * @param {string} sessionId - Session ID for tracking
 * @param {string} status - Status: "detecting_orientation" | "rotating" | "scanning_ocr" | "completed" | "error"
 * @param {number} pageNumber - Current page number
 * @param {string} message - Status message
 * @param {object} extraData - Extra data (e.g., rotation angle)
 */
async function updateScanStatus(sessionId, status, pageNumber, message, extraData = {}) {
  if (!sessionId) {
    return; // Skip if no sessionId
  }
  
  try {
    const statusRef = db.collection("scanStatus").doc(sessionId);
    await statusRef.set({
      status,
      pageNumber,
      message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...extraData,
    }, { merge: true });
    console.log(`📊 [Status] Updated: ${status} - Page ${pageNumber} - ${message}`);
  } catch (error) {
    console.error(`❌ [Status] Failed to update status:`, error);
    // Don't throw - status update failure shouldn't break OCR
  }
}



// ---------- OCR IMAGE GEMINI (BASE64 → OCR → OCRResult) ----------
// GEMINI PIPELINE: Image → OCR directly (NO normalization/rotation)
// This is different from v2 - we don't normalize/rotate images
async function ocrImageBase64Gemini(base64, fileName = "image", manualRotation = null) {
  console.log("📸 [OCR Gemini] Processing image (NO normalization - Gemini pipeline)");
  const imageBuffer = Buffer.from(base64, "base64");
  
  // OCR image directly without normalization/rotation
  // Note: manualRotation parameter is ignored in Gemini pipeline
  if (manualRotation !== null) {
    console.log(`⚠️ [OCR Gemini] manualRotation parameter ignored (Gemini pipeline does not normalize/rotate)`);
  }
  
  console.log(`📸 [OCR Gemini] Running OCR on original image...`);
  const ocrResult = await ocrImageBufferGemini(imageBuffer, fileName);
  
  // Do NOT add normalizedImageBase64 - Gemini pipeline doesn't normalize images
  // Frontend should use original image, not normalized version
  
  console.log(`✅ [OCR Gemini] Image OCR completed (Gemini pipeline - no normalization)`);
  
  return ocrResult;
}

// ---------- UTILITIES ----------
const { normalizePdfToImages } = require("./utils/normalizePdfToImages");
const { normalizeImage } = require("./utils/normalizeImage");
const { parsePageRange } = require("./utils/parsePageRange");

// ---------- HELPER FUNCTIONS ----------
/**
 * Extracts text from a Vision API word object, preserving spaces and line breaks
 * @param {Object} word - Vision API word object
 * @returns {string} Extracted text
 */
function extractTextFromWord(word) {
  if (!word.symbols || word.symbols.length === 0) {
    return "";
  }
  
  let text = "";
  for (let i = 0; i < word.symbols.length; i++) {
    const symbol = word.symbols[i];
    if (symbol.text) {
      text += symbol.text;
    }
    // Check if there's a break after this symbol
    if (symbol.property) {
      if (symbol.property.detectedBreak) {
        const breakType = symbol.property.detectedBreak.type;
        if (breakType === "SPACE" || breakType === "SURE_SPACE") {
          text += " ";
        } else if (breakType === "EOL_SURE_SPACE" || breakType === "LINE_BREAK") {
          text += "\n";
        }
      }
    }
  }
  
  return text;
}

// ---------- OCR IMAGE BUFFER GEMINI (INTERNAL) ----------
// Internal function that OCRs an image buffer (used after normalization)
// IMPORTANT: Must be defined before scanSinglePageGemini which uses it
async function ocrImageBufferGemini(imageBuffer, fileName = "image") {
  console.log(`📸 [OCR Gemini] Processing image buffer: ${fileName}`);

  // Use documentTextDetection for structured documents (preserves layout)
  const [result] = await visionClient.documentTextDetection({
    image: { content: imageBuffer },
    imageContext: {
      languageHints: ["th", "en"], // Thai first, then English
    },
  });

  const fullTextAnnotation = result.fullTextAnnotation;
  if (!fullTextAnnotation) {
    console.warn("⚠️ [OCR Gemini] No fullTextAnnotation found");
    return {
      fileName,
      page: { width: 0, height: 0 },
      words: [],
    };
  }

  // Extract page dimensions
  const page = fullTextAnnotation.pages?.[0];
  const pageWidth = page?.width || 0;
  const pageHeight = page?.height || 0;

  // Extract words with bounding boxes
  // IMPORTANT: Use extractTextFromWord to preserve all spaces, line breaks, and formatting
  const words = [];
  
  if (fullTextAnnotation.pages) {
    for (const page of fullTextAnnotation.pages) {
      if (page.blocks) {
        for (const block of page.blocks) {
          if (block.paragraphs) {
            for (const paragraph of block.paragraphs) {
              if (paragraph.words) {
                for (const word of paragraph.words) {
                  // Use extractTextFromWord to preserve spaces and breaks from OCR
                  const wordText = extractTextFromWord(word);
                  
                  if (wordText && word.boundingBox?.vertices) {
                    const vertices = word.boundingBox.vertices;
                    if (vertices.length >= 2) {
                      const x = Math.min(...vertices.map((v) => v.x || 0));
                      const y = Math.min(...vertices.map((v) => v.y || 0));
                      const maxX = Math.max(...vertices.map((v) => v.x || 0));
                      const maxY = Math.max(...vertices.map((v) => v.y || 0));
                      const w = maxX - x;
                      const h = maxY - y;
                      
                      if (w > 0 && h > 0) {
                        words.push({
                          text: wordText,
                          x,
                          y,
                          w,
                          h,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`📊 [OCR Gemini] Extracted ${words.length} words from documentTextDetection`);
  
  // Sort words by Y position (top to bottom), then X (left to right)
  // IMPORTANT: Use ROW_TOLERANCE (10px) to determine if words are on the same row
  // This ensures proper row ordering (records start from top row, not middle of page)
  const ROW_TOLERANCE = 10; // pixels - adjust based on DPI
  words.sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff > ROW_TOLERANCE) {
      return a.y - b.y; // Different rows - sort by Y (top → bottom)
    }
    return a.x - b.x; // Same row - sort by X (left → right)
  });
  
  // Log first few words for debugging row order
  if (words.length > 0) {
    const firstRowY = words[0].y;
    const firstRowWords = words.filter(w => Math.abs(w.y - firstRowY) <= ROW_TOLERANCE).slice(0, 3);
    const firstRowPreview = firstRowWords.map(w => w.text).join(" ");
    console.log(`📄 [RowSort] Total words: ${words.length}, firstRowY: ${firstRowY}, firstRowPreview: "${firstRowPreview}..."`);
  }

  console.log(`✅ [OCR Gemini] Image buffer OCR completed. Found ${words.length} words`);
  
  // Log sample words to verify space preservation and number detection
  if (words.length > 0) {
    const sampleWords = words.slice(0, 10);
    console.log(`📝 [OCR Gemini] Sample words (first 10):`, sampleWords.map(w => ({
      text: `"${w.text}"`,
      hasSpace: w.text.includes(" "),
      hasNewline: w.text.includes("\n"),
      length: w.text.length,
      isNumber: /^\d+$/.test(w.text.trim()),
      containsNumber: /\d/.test(w.text),
    })));
    
    // Check for potential number misreadings (common OCR errors: 5→เก, 0→O, 1→l)
    const numberMisreadings = words.filter(w => {
      const text = w.text.trim();
      // Check if text looks like a misread number (Thai characters that might be numbers)
      return /^[เกกขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ]+$/.test(text) && text.length === 1;
    });
    if (numberMisreadings.length > 0) {
      console.warn(`⚠️ [OCR Gemini] Potential number misreadings detected:`, numberMisreadings.slice(0, 5).map(w => `"${w.text}"`));
    }
  }
  
  // Additional debugging info
  if (words.length === 0) {
    console.warn("⚠️ [OCR Gemini] No words extracted from OCR result");
    console.log("📊 [OCR Gemini] FullTextAnnotation details:", {
      hasPages: !!fullTextAnnotation.pages,
      pagesCount: fullTextAnnotation.pages?.length || 0,
      hasText: !!fullTextAnnotation.text,
      textLength: fullTextAnnotation.text?.length || 0,
      textPreview: fullTextAnnotation.text?.substring(0, 200) || "(no text)",
    });
  }
  
  return {
    fileName,
    page: {
      width: pageWidth,
      height: pageHeight,
    },
    words,
  };
}


/**
 * Scan a single page (helper for perPage mode) - Gemini version
 * Processes one page: PDF → Image → Normalize → OCR → Sort → Group
 * 
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {number} pageNumber - Page number (1-based)
 * @param {string} fileName - File name for logging
 * @param {number|null} manualRotation - Manual rotation (0, 90, 180, 270) or null for auto-detect
 * @returns {Promise<OCRResult|null>} OCR result for this page, or null if page not found
 */
async function scanSinglePageGemini(pdfBuffer, pageNumber, fileName, manualRotation = null, sessionId = null) {
  try {
    console.log(`📄 [ScanMode: perPage] Processing page ${pageNumber} (Gemini)`);
    
    // Convert PDF → Image (single page only)
    const normalizedPages = await normalizePdfToImages(pdfBuffer, fileName, {
      startPage: pageNumber,
      endPage: pageNumber,
    });
    
    if (!normalizedPages || normalizedPages.length === 0) {
      console.warn(`⚠️ [ScanMode: perPage] Page ${pageNumber} not found`);
      if (sessionId) {
        await updateScanStatus(sessionId, "error", pageNumber, `หน้า ${pageNumber} ไม่พบ`);
      }
      return null;
    }
    
    const page = normalizedPages[0];
    console.log(`📄 [ScanMode: perPage] Page ${pageNumber}: ${page.width}x${page.height}`);
    
    // Update status: scanning OCR (GEMINI PIPELINE: no normalization/rotation)
    if (sessionId) {
      await updateScanStatus(sessionId, "scanning_ocr", pageNumber, `กำลังสแกน OCR: หน้า ${pageNumber}`);
    }
    
    // GEMINI PIPELINE: OCR original image directly (NO normalization/rotation)
    // Note: manualRotation parameter is ignored in Gemini pipeline
    if (manualRotation !== null) {
      console.log(`⚠️ [OCR Gemini] manualRotation parameter ignored (Gemini pipeline does not normalize/rotate)`);
    }
    
    // OCR original image (no normalization)
    const ocrResult = await ocrImageBufferGemini(page.imageBuffer, `${fileName}-page-${pageNumber}`);
    
    // Use OCR result dimensions (original image, not normalized)
    // ocrResult.page already has correct dimensions from OCR
    
    // IMPORTANT: Words are already sorted by Y then X in ocrImageBufferGemini
    // No need to sort again - words are in reading order (top → bottom, left → right)
    
    // Update status: completed
    if (sessionId) {
      await updateScanStatus(sessionId, "completed", pageNumber, `เสร็จสิ้น: หน้า ${pageNumber}`, {
        wordsCount: ocrResult.words?.length || 0,
      });
    }
    
    console.log(`✅ [ScanMode: perPage] Page ${pageNumber}: Completed, ${ocrResult.words?.length || 0} words`);
    
    return ocrResult;
  } catch (error) {
    console.error(`❌ [ScanMode: perPage] Error processing page ${pageNumber}:`, error);
    if (sessionId) {
      await updateScanStatus(sessionId, "error", pageNumber, `เกิดข้อผิดพลาด: หน้า ${pageNumber} - ${error.message}`);
    }
    throw error;
  }
}

// ---------- OCR PDF GEMINI (BASE64 → IMAGE → OCR → OCRResult) ----------
async function ocrPdfBase64Gemini(pdfBase64, fileName = "input.pdf", manualRotation = null, scanMode = false, options = {}) {
  const sessionId = options?.sessionId || null; // Get sessionId from options
  try {
    // Normalize scanMode: support both boolean (backward compatible) and string ("batch"/"perPage")
    // Default to "batch" for backward compatibility
    let scanModeType = "batch"; // Default: batch mode (process all pages, combine results)
    if (typeof scanMode === "string") {
      scanModeType = scanMode === "perPage" ? "perPage" : "batch";
    } else if (scanMode === true) {
      scanModeType = "batch"; // Boolean true = batch mode (backward compatible)
    } else if (scanMode === false) {
      scanModeType = "template"; // Boolean false = template mode (first page only)
    }
    
    console.log(`📄 [OCR V2] Processing PDF with normalization pipeline: ${fileName}, scanMode: ${scanModeType}`);
    console.log(`📄 [OCR V2] PDF base64 length: ${pdfBase64?.length || 0}`);
    
    if (!pdfBase64 || pdfBase64.length === 0) {
      throw new Error("PDF base64 is empty");
    }
    
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    console.log(`📄 [OCR V2] PDF buffer size: ${pdfBuffer.length} bytes`);
    
    // STEP 1: Convert PDF → Images
    // For template setup: first page only
    // For scan mode: use pageRange, startPage/endPage, or all pages
    let pageRange = null; // null = all pages
    let startPage = undefined;
    let endPage = undefined;
    
    // Check for startPage/endPage (new feature - takes priority over pageRange)
    // IMPORTANT: Check for undefined/null explicitly (not falsy) to allow 0 values
    const hasStartPage = options?.startPage !== undefined && options?.startPage !== null;
    const hasEndPage = options?.endPage !== undefined && options?.endPage !== null;
    
    if (hasStartPage) {
      startPage = parseInt(options.startPage, 10);
      if (isNaN(startPage)) {
        console.warn(`⚠️ [OCR V2] Invalid startPage: ${options.startPage}, ignoring`);
        startPage = undefined;
      }
    }
    if (hasEndPage) {
      endPage = parseInt(options.endPage, 10);
      if (isNaN(endPage)) {
        console.warn(`⚠️ [OCR V2] Invalid endPage: ${options.endPage}, ignoring`);
        endPage = undefined;
      }
    }
    
    // Parse pageRange from options if provided (for scan mode) - only if startPage/endPage not provided
    if (!hasStartPage && !hasEndPage && scanMode && options?.pageRange) {
      if (typeof options.pageRange === "string") {
        // Parse string to array (will get totalPages later after loading PDF)
        // For now, just store the string and parse after loading PDF
        pageRange = options.pageRange;
      } else if (Array.isArray(options.pageRange)) {
        pageRange = options.pageRange;
      }
    } else if (!hasStartPage && !hasEndPage && !scanMode) {
      // Template mode: first page only (ONLY if startPage/endPage not provided)
      // If startPage/endPage is provided, use it instead
      pageRange = [1];
      console.log(`📄 [OCR V2] Template mode: No startPage/endPage provided, using first page only`);
    }
    
    // Log what we detected
    if (hasStartPage || hasEndPage) {
      console.log(`📄 [OCR V2] Detected startPage/endPage: startPage=${startPage}, endPage=${endPage}, scanMode=${scanMode}`);
    }
    
    // Log what we're processing
    if (hasStartPage || hasEndPage) {
      console.log(`📄 [OCR V2] Step 1: Converting PDF to images (pages: ${startPage || 1}-${endPage || "end"})...`);
    } else {
      console.log(`📄 [OCR V2] Step 1: Converting PDF to images (${scanMode ? (pageRange ? `pages: ${typeof pageRange === "string" ? pageRange : pageRange.join(", ")}` : "all pages") : "first page only"})...`);
    }
    
    // Load PDF first to get total pages (needed for pageRange validation)
    // Only needed if using pageRange (not needed for startPage/endPage as normalizePdfToImages handles it)
    let pageRangeArray = null;
    if (pageRange && !hasStartPage && !hasEndPage) {
      const { getPdfjsLib } = require("./utils/normalizePdfToImages");
      const pdfjsLib = await getPdfjsLib();
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array, verbosity: 0 });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      
      // Parse pageRange string to array if needed
      if (typeof pageRange === "string") {
        pageRangeArray = parsePageRange(pageRange, totalPages);
      } else if (Array.isArray(pageRange)) {
        // Validate array against total pages
        pageRangeArray = pageRange.filter(p => p >= 1 && p <= totalPages);
        if (pageRangeArray.length === 0) {
          throw new Error(`No valid pages to process. Specified pages: [${pageRange.join(", ")}], total pages: ${totalPages}`);
        }
      }
    }
    
    // Build options for normalizePdfToImages
    const normalizeOptions = {};
    if (hasStartPage || hasEndPage) {
      // Use startPage/endPage (new feature)
      if (hasStartPage) normalizeOptions.startPage = startPage;
      if (hasEndPage) normalizeOptions.endPage = endPage;
      console.log(`📄 [OCR V2] Using startPage/endPage: ${normalizeOptions.startPage || 1}-${normalizeOptions.endPage || "end"}`);
    } else if (pageRangeArray !== null) {
      // Use pageRange (existing feature)
      normalizeOptions.pageRange = pageRangeArray;
      console.log(`📄 [OCR V2] Using pageRange: [${pageRangeArray.join(", ")}]`);
    }
    // If neither is provided, normalizeOptions is empty {} = all pages (NON-BREAKING)
    
    let normalizedPages;
    try {
      normalizedPages = await normalizePdfToImages(pdfBuffer, fileName, normalizeOptions);
    } catch (pdfError) {
      console.error(`❌ [OCR V2] PDF conversion failed:`, pdfError);
      throw new Error(`PDF conversion failed: ${pdfError.message}`);
    }
    
    if (!normalizedPages || normalizedPages.length === 0) {
      throw new Error("PDF conversion failed: No pages extracted");
    }
    
    console.log(`📄 [OCR V2] Extracted ${normalizedPages.length} page(s)`);
  
  // Handle different scan modes
  if (scanModeType === "perPage") {
    // PER-PAGE MODE: Process each page separately, return per-page results
    console.log(`📄 [ScanMode: perPage] Processing pages separately...`);
    
    // IMPORTANT: In perPage mode, we need to get the total pages from the PDF first
    // because normalizedPages only contains the pages we extracted (based on startPage/endPage)
    // We need to process the ORIGINAL page range, not the extracted pages
    
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const results = [];
    
    // Get total pages from PDF (needed to validate page range)
    const { getPdfjsLib } = require("./utils/normalizePdfToImages");
    const pdfjsLib = await getPdfjsLib();
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array, verbosity: 0 });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    
    console.log(`📄 [ScanMode: perPage] PDF has ${totalPages} total pages`);
    
    // Determine page range from options (use the ORIGINAL request, not normalizedPages)
    let startPage = 1;
    let endPage = totalPages;
    
    if (options?.startPage !== undefined && options?.startPage !== null) {
      startPage = parseInt(options.startPage, 10);
      if (isNaN(startPage) || startPage < 1) {
        console.warn(`⚠️ [ScanMode: perPage] Invalid startPage: ${options.startPage}, using 1`);
        startPage = 1;
      }
    }
    if (options?.endPage !== undefined && options?.endPage !== null) {
      endPage = parseInt(options.endPage, 10);
      if (isNaN(endPage) || endPage < startPage) {
        console.warn(`⚠️ [ScanMode: perPage] Invalid endPage: ${options.endPage}, using ${totalPages}`);
        endPage = totalPages;
      }
    }
    
    // Ensure endPage doesn't exceed available pages
    endPage = Math.min(endPage, totalPages);
    
    console.log(`📄 [ScanMode: perPage] Page range: ${startPage}-${endPage} (${endPage - startPage + 1} pages)`);
    
    // Process each page separately
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      console.log(`📄 [ScanMode: perPage] Processing page ${pageNum}...`);
      
      try {
        const pageResult = await scanSinglePageGemini(pdfBuffer, pageNum, fileName, manualRotation, sessionId);
        
        if (pageResult) {
          results.push({
            pageNumber: pageNum,
            data: pageResult, // OCRResult for this page
          });
          console.log(`✅ [ScanMode: perPage] Page ${pageNum}: Completed, ${pageResult.words?.length || 0} words`);
        } else {
          console.warn(`⚠️ [ScanMode: perPage] Page ${pageNum}: No result (page not found or empty)`);
        }
      } catch (pageError) {
        console.error(`❌ [ScanMode: perPage] Error processing page ${pageNum}:`, pageError);
        // Continue processing other pages even if one fails
        // Optionally add error entry to results
        results.push({
          pageNumber: pageNum,
          error: pageError.message || "Failed to process page",
        });
      }
    }
    
    console.log(`✅ [ScanMode: perPage] Completed ${results.length} pages`);
    
    // Return per-page results
    return {
      scanMode: "perPage",
      pages: results,
    };
  } else if (scanModeType === "batch" || scanMode === true) {
    // SCAN MODE: Process all pages and combine words
    // IMPORTANT: For page-local grouping, we store words with pageNumber but keep original Y coordinates
    console.log(`📄 [OCR Gemini] Scan mode: Processing all ${normalizedPages.length} pages...`);
    const allWords = [];
    const pages = []; // Store per-page data for page-local grouping
    let maxWidth = 0;
    let maxHeight = 0;
    
    for (let i = 0; i < normalizedPages.length; i++) {
      const page = normalizedPages[i];
      const pageNumber = i + 1; // 1-based page number
      console.log(`📄 [OCR Gemini] Processing page ${pageNumber}/${normalizedPages.length}: ${page.width}x${page.height}`);
      
      try {
        // GEMINI PIPELINE: OCR original image directly (NO normalization/rotation)
        // Note: manualRotation parameter is ignored in Gemini pipeline
        if (manualRotation !== null) {
          console.log(`⚠️ [OCR Gemini] manualRotation parameter ignored (Gemini pipeline does not normalize/rotate)`);
        }
        
        // OCR original image (no normalization)
        const ocrResult = await ocrImageBufferGemini(page.imageBuffer, `${fileName}-page-${pageNumber}`);
        
        // IMPORTANT: Keep original Y coordinates (page-local) - DO NOT add offset
        // Add pageNumber to each word for page-local grouping
        if (ocrResult.words && ocrResult.words.length > 0) {
          const pageWords = ocrResult.words.map(word => ({
            ...word,
            pageNumber: pageNumber, // Store page number for page-local grouping
            // y: word.y (keep original Y - page-local coordinate)
          }));
          allWords.push(...pageWords);
          
          // Store per-page data for page-local grouping
          pages.push({
            pageNumber: pageNumber,
            width: ocrResult.page.width, // Use OCR result dimensions (original image)
            height: ocrResult.page.height,
            words: pageWords, // Words with original Y coordinates (page-local)
          });
          
          console.log(`📄 [OCR Gemini] Page ${pageNumber}: Added ${pageWords.length} words (page-local Y coordinates, no offset)`);
        } else {
          // Store empty page data
          pages.push({
            pageNumber: pageNumber,
            width: ocrResult.page.width || page.width,
            height: ocrResult.page.height || page.height,
            words: [],
          });
        }
        
        // Track max dimensions (use OCR result dimensions)
        maxWidth = Math.max(maxWidth, ocrResult.page.width || page.width);
        maxHeight = Math.max(maxHeight, ocrResult.page.height || page.height);
      } catch (pageError) {
        console.error(`❌ [OCR Gemini] Error processing page ${pageNumber}/${normalizedPages.length}:`, pageError);
        console.error(`❌ [OCR Gemini] Page error details:`, {
          message: pageError.message,
          stack: pageError.stack,
        });
        // Continue processing other pages even if one fails
        // Store empty page data
        if (page.width && page.height) {
          pages.push({
            pageNumber: pageNumber,
            width: page.width,
            height: page.height,
            words: [],
          });
          maxWidth = Math.max(maxWidth, page.width);
          maxHeight = Math.max(maxHeight, page.height);
        }
      }
    }
    
    // Create combined OCR result
    // For backward compatibility: single page object with max dimensions
    // But include pages array for page-local grouping
    const combinedResult = {
      fileName: fileName,
      page: {
        width: maxWidth,
        height: maxHeight, // Max page height (not cumulative)
      },
      words: allWords, // All words with pageNumber and original Y coordinates
      pages: pages, // Per-page data for page-local grouping
    };
    
    // IMPORTANT: Do NOT include normalizedImageBase64 in scan mode
    console.log(`✅ [OCR Gemini] PDF OCR completed (batch mode): ${allWords.length} words from ${normalizedPages.length} pages`);
    console.log(`📄 [OCR Gemini] Page-local grouping enabled: words have pageNumber, Y coordinates are page-local (no offset)`);
    return combinedResult;
  } else {
    // TEMPLATE MODE: Use only first page
    const firstPage = normalizedPages[0];
    console.log(`📄 [OCR Gemini] Template mode: Using first page: ${firstPage.width}x${firstPage.height}`);
    
    // GEMINI PIPELINE: OCR original image directly (NO normalization/rotation)
    // Note: manualRotation parameter is ignored in Gemini pipeline
    if (manualRotation !== null) {
      console.log(`⚠️ [OCR Gemini] manualRotation parameter ignored (Gemini pipeline does not normalize/rotate)`);
    }
    
    console.log(`📄 [OCR Gemini] Running OCR on original image (NO normalization)...`);
    let ocrResult;
    try {
      ocrResult = await ocrImageBufferGemini(firstPage.imageBuffer, fileName);
    } catch (ocrError) {
      console.error(`❌ [OCR Gemini] OCR failed:`, ocrError);
      throw new Error(`OCR failed: ${ocrError.message}`);
    }
    
    // Update page dimensions to match original image (not normalized)
    ocrResult.page = {
      width: firstPage.width,
      height: firstPage.height,
    };
    
    // Do NOT add normalizedImageBase64 - Gemini pipeline doesn't normalize images
    // Frontend should use original image, not normalized version
    
    console.log(`✅ [OCR Gemini] PDF OCR completed (Gemini pipeline - no normalization)`);
    
    return ocrResult;
  }
  } catch (error) {
    console.error(`❌ [OCR Gemini] Error in ocrPdfBase64Gemini:`, error);
    console.error(`❌ [OCR Gemini] Error stack:`, error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// ---------- OCR PDF GEMINI (BASE64 → IMAGE → OCR → OCRResult) ----------
// NEW PIPELINE: PDF → Image → Normalize (detect orientation + rotate) → OCR
// This ensures Template and Scan use the same normalized images
async function ocrPdfBase64Gemini(pdfBase64, fileName = "input.pdf", manualRotation = null, scanMode = false, options = {}) {
  const sessionId = options?.sessionId || null; // Get sessionId from options
  try {
    // Normalize scanMode: support both boolean (backward compatible) and string ("batch"/"perPage")
    // Default to "batch" for backward compatibility
    let scanModeType = "batch"; // Default: batch mode (process all pages, combine results)
    if (typeof scanMode === "string") {
      scanModeType = scanMode === "perPage" ? "perPage" : "batch";
    } else if (scanMode === true) {
      scanModeType = "batch"; // Boolean true = batch mode (backward compatible)
    } else if (scanMode === false) {
      scanModeType = "template"; // Boolean false = template mode (first page only)
    }
    
    console.log(`📄 [OCR Gemini] Processing PDF with normalization pipeline: ${fileName}, scanMode: ${scanModeType}`);
    console.log(`📄 [OCR Gemini] PDF base64 length: ${pdfBase64?.length || 0}`);
    
    if (!pdfBase64 || pdfBase64.length === 0) {
      throw new Error("PDF base64 is empty");
    }
    
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    console.log(`📄 [OCR Gemini] PDF buffer size: ${pdfBuffer.length} bytes`);
    
    // STEP 1: Convert PDF → Images
    // For template setup: first page only
    // For scan mode: use pageRange, startPage/endPage, or all pages
    let pageRange = null; // null = all pages
    let startPage = undefined;
    let endPage = undefined;
    
    // Check for startPage/endPage (new feature - takes priority over pageRange)
    // IMPORTANT: Check for undefined/null explicitly (not falsy) to allow 0 values
    const hasStartPage = options?.startPage !== undefined && options?.startPage !== null;
    const hasEndPage = options?.endPage !== undefined && options?.endPage !== null;
    
    if (hasStartPage) {
      startPage = parseInt(options.startPage, 10);
      if (isNaN(startPage)) {
        console.warn(`⚠️ [OCR Gemini] Invalid startPage: ${options.startPage}, ignoring`);
        startPage = undefined;
      }
    }
    if (hasEndPage) {
      endPage = parseInt(options.endPage, 10);
      if (isNaN(endPage)) {
        console.warn(`⚠️ [OCR Gemini] Invalid endPage: ${options.endPage}, ignoring`);
        endPage = undefined;
      }
    }
    
    // Parse pageRange from options if provided (for scan mode) - only if startPage/endPage not provided
    if (!hasStartPage && !hasEndPage && scanMode && options?.pageRange) {
      if (typeof options.pageRange === "string") {
        // Parse string to array (will get totalPages later after loading PDF)
        // For now, just store the string and parse after loading PDF
        pageRange = options.pageRange;
      } else if (Array.isArray(options.pageRange)) {
        pageRange = options.pageRange;
      }
    } else if (!hasStartPage && !hasEndPage && !scanMode) {
      // Template mode: first page only (ONLY if startPage/endPage not provided)
      // If startPage/endPage is provided, use it instead
      pageRange = [1];
      console.log(`📄 [OCR Gemini] Template mode: No startPage/endPage provided, using first page only`);
    }
    
    // Log what we detected
    if (hasStartPage || hasEndPage) {
      console.log(`📄 [OCR Gemini] Detected startPage/endPage: startPage=${startPage}, endPage=${endPage}, scanMode=${scanMode}`);
    }
    
    // Log what we're processing
    if (hasStartPage || hasEndPage) {
      console.log(`📄 [OCR Gemini] Step 1: Converting PDF to images (pages: ${startPage || 1}-${endPage || "end"})...`);
    } else {
      console.log(`📄 [OCR Gemini] Step 1: Converting PDF to images (${scanMode ? (pageRange ? `pages: ${typeof pageRange === "string" ? pageRange : pageRange.join(", ")}` : "all pages") : "first page only"})...`);
    }
    
    // Load PDF first to get total pages (needed for pageRange validation)
    // Only needed if using pageRange (not needed for startPage/endPage as normalizePdfToImages handles it)
    let pageRangeArray = null;
    if (pageRange && !hasStartPage && !hasEndPage) {
      const { getPdfjsLib } = require("./utils/normalizePdfToImages");
      const pdfjsLib = await getPdfjsLib();
      const pdfUint8Array = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array, verbosity: 0 });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      
      // Parse pageRange string to array if needed
      if (typeof pageRange === "string") {
        pageRangeArray = parsePageRange(pageRange, totalPages);
      } else if (Array.isArray(pageRange)) {
        // Validate array against total pages
        pageRangeArray = pageRange.filter(p => p >= 1 && p <= totalPages);
        if (pageRangeArray.length === 0) {
          throw new Error(`No valid pages to process. Specified pages: [${pageRange.join(", ")}], total pages: ${totalPages}`);
        }
      }
    }
    
    // Build options for normalizePdfToImages
    const normalizeOptions = {};
    if (hasStartPage || hasEndPage) {
      // Use startPage/endPage (new feature)
      if (hasStartPage) normalizeOptions.startPage = startPage;
      if (hasEndPage) normalizeOptions.endPage = endPage;
      console.log(`📄 [OCR Gemini] Using startPage/endPage: ${normalizeOptions.startPage || 1}-${normalizeOptions.endPage || "end"}`);
    } else if (pageRangeArray !== null) {
      // Use pageRange (existing feature)
      normalizeOptions.pageRange = pageRangeArray;
      console.log(`📄 [OCR Gemini] Using pageRange: [${pageRangeArray.join(", ")}]`);
    }
    // If neither is provided, normalizeOptions is empty {} = all pages (NON-BREAKING)
    
    let normalizedPages;
    try {
      normalizedPages = await normalizePdfToImages(pdfBuffer, fileName, normalizeOptions);
    } catch (pdfError) {
      console.error(`❌ [OCR Gemini] PDF conversion failed:`, pdfError);
      throw new Error(`PDF conversion failed: ${pdfError.message}`);
    }
    
    if (!normalizedPages || normalizedPages.length === 0) {
      throw new Error("PDF conversion failed: No pages extracted");
    }
    
    console.log(`📄 [OCR Gemini] Extracted ${normalizedPages.length} page(s)`);
  
  // Handle different scan modes
  if (scanModeType === "perPage") {
    // PER-PAGE MODE: Process each page separately, return per-page results
    console.log(`📄 [ScanMode: perPage] Processing pages separately...`);
    
    // IMPORTANT: In perPage mode, we need to get the total pages from the PDF first
    // because normalizedPages only contains the pages we extracted (based on startPage/endPage)
    // We need to process the ORIGINAL page range, not the extracted pages
    
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const results = [];
    
    // Get total pages from PDF (needed to validate page range)
    const { getPdfjsLib } = require("./utils/normalizePdfToImages");
    const pdfjsLib = await getPdfjsLib();
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array, verbosity: 0 });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    
    console.log(`📄 [ScanMode: perPage] PDF has ${totalPages} total pages`);
    
    // Determine page range from options (use the ORIGINAL request, not normalizedPages)
    let startPage = 1;
    let endPage = totalPages;
    
    if (options?.startPage !== undefined && options?.startPage !== null) {
      startPage = parseInt(options.startPage, 10);
      if (isNaN(startPage) || startPage < 1) {
        console.warn(`⚠️ [ScanMode: perPage] Invalid startPage: ${options.startPage}, using 1`);
        startPage = 1;
      }
    }
    if (options?.endPage !== undefined && options?.endPage !== null) {
      endPage = parseInt(options.endPage, 10);
      if (isNaN(endPage) || endPage < startPage) {
        console.warn(`⚠️ [ScanMode: perPage] Invalid endPage: ${options.endPage}, using ${totalPages}`);
        endPage = totalPages;
      }
    }
    
    // Ensure endPage doesn't exceed available pages
    endPage = Math.min(endPage, totalPages);
    
    console.log(`📄 [ScanMode: perPage] Page range: ${startPage}-${endPage} (${endPage - startPage + 1} pages)`);
    
    // Process each page separately
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      console.log(`📄 [ScanMode: perPage] Processing page ${pageNum}...`);
      
      try {
        const pageResult = await scanSinglePageGemini(pdfBuffer, pageNum, fileName, manualRotation, sessionId);
        
        if (pageResult) {
          results.push({
            pageNumber: pageNum,
            data: pageResult, // OCRResult for this page
          });
          console.log(`✅ [ScanMode: perPage] Page ${pageNum}: Completed, ${pageResult.words?.length || 0} words`);
        } else {
          // Page not found or empty - add error entry to results
          console.warn(`⚠️ [ScanMode: perPage] Page ${pageNum}: No result (page not found or empty)`);
          results.push({
            pageNumber: pageNum,
            error: `Page ${pageNum} not found or empty`,
          });
        }
      } catch (pageError) {
        console.error(`❌ [ScanMode: perPage] Error processing page ${pageNum}:`, pageError);
        // Continue processing other pages even if one fails
        // Add error entry to results
        results.push({
          pageNumber: pageNum,
          error: pageError.message || "Failed to process page",
        });
      }
    }
    
    console.log(`✅ [ScanMode: perPage] Completed ${results.length} pages`);
    
    // Return per-page results
    return {
      scanMode: "perPage",
      pages: results,
    };
  } else if (scanModeType === "batch" || scanMode === true) {
    // SCAN MODE: Process all pages and combine words
    // IMPORTANT: For page-local grouping, we store words with pageNumber but keep original Y coordinates
    console.log(`📄 [OCR Gemini] Scan mode: Processing all ${normalizedPages.length} pages...`);
    const allWords = [];
    const pages = []; // Store per-page data for page-local grouping
    let maxWidth = 0;
    let maxHeight = 0;
    
    for (let i = 0; i < normalizedPages.length; i++) {
      const page = normalizedPages[i];
      const pageNumber = i + 1; // 1-based page number
      console.log(`📄 [OCR Gemini] Processing page ${pageNumber}/${normalizedPages.length}: ${page.width}x${page.height}`);
      
      try {
        // GEMINI PIPELINE: OCR original image directly (NO normalization/rotation)
        // Note: manualRotation parameter is ignored in Gemini pipeline
        if (manualRotation !== null) {
          console.log(`⚠️ [OCR Gemini] manualRotation parameter ignored (Gemini pipeline does not normalize/rotate)`);
        }
        
        // OCR original image (no normalization)
        const ocrResult = await ocrImageBufferGemini(page.imageBuffer, `${fileName}-page-${pageNumber}`);
        
        // IMPORTANT: Keep original Y coordinates (page-local) - DO NOT add offset
        // Add pageNumber to each word for page-local grouping
        if (ocrResult.words && ocrResult.words.length > 0) {
          const pageWords = ocrResult.words.map(word => ({
            ...word,
            pageNumber: pageNumber, // Store page number for page-local grouping
            // y: word.y (keep original Y - page-local coordinate)
          }));
          allWords.push(...pageWords);
          
          // Store per-page data for page-local grouping
          pages.push({
            pageNumber: pageNumber,
            width: ocrResult.page.width, // Use OCR result dimensions (original image)
            height: ocrResult.page.height,
            words: pageWords, // Words with original Y coordinates (page-local)
          });
          
          console.log(`📄 [OCR Gemini] Page ${pageNumber}: Added ${pageWords.length} words (page-local Y coordinates, no offset)`);
        } else {
          // Store empty page data
          pages.push({
            pageNumber: pageNumber,
            width: ocrResult.page.width || page.width,
            height: ocrResult.page.height || page.height,
            words: [],
          });
        }
        
        // Track max dimensions (use OCR result dimensions)
        maxWidth = Math.max(maxWidth, ocrResult.page.width || page.width);
        maxHeight = Math.max(maxHeight, ocrResult.page.height || page.height);
      } catch (pageError) {
        console.error(`❌ [OCR Gemini] Error processing page ${pageNumber}/${normalizedPages.length}:`, pageError);
        console.error(`❌ [OCR Gemini] Page error details:`, {
          message: pageError.message,
          stack: pageError.stack,
        });
        // Continue processing other pages even if one fails
        // Store empty page data
        if (page.width && page.height) {
          pages.push({
            pageNumber: pageNumber,
            width: page.width,
            height: page.height,
            words: [],
          });
          maxWidth = Math.max(maxWidth, page.width);
          maxHeight = Math.max(maxHeight, page.height);
        }
      }
    }
    
    // Create combined OCR result
    // For backward compatibility: single page object with max dimensions
    // But include pages array for page-local grouping
    const combinedResult = {
      fileName: fileName,
      page: {
        width: maxWidth,
        height: maxHeight, // Max page height (not cumulative)
      },
      words: allWords, // All words with pageNumber and original Y coordinates
      pages: pages, // Per-page data for page-local grouping
    };
    
    // IMPORTANT: Do NOT include normalizedImageBase64 in scan mode
    console.log(`✅ [OCR Gemini] PDF OCR completed (batch mode): ${allWords.length} words from ${normalizedPages.length} pages`);
    console.log(`📄 [OCR Gemini] Page-local grouping enabled: words have pageNumber, Y coordinates are page-local (no offset)`);
    return combinedResult;
  } else {
    // TEMPLATE MODE: Use only first page
    const firstPage = normalizedPages[0];
    console.log(`📄 [OCR Gemini] Template mode: Using first page: ${firstPage.width}x${firstPage.height}`);
    
    // GEMINI PIPELINE: OCR original image directly (NO normalization/rotation)
    // Note: manualRotation parameter is ignored in Gemini pipeline
    if (manualRotation !== null) {
      console.log(`⚠️ [OCR Gemini] manualRotation parameter ignored (Gemini pipeline does not normalize/rotate)`);
    }
    
    console.log(`📄 [OCR Gemini] Running OCR on original image (NO normalization)...`);
    let ocrResult;
    try {
      ocrResult = await ocrImageBufferGemini(firstPage.imageBuffer, fileName);
    } catch (ocrError) {
      console.error(`❌ [OCR Gemini] OCR failed:`, ocrError);
      throw new Error(`OCR failed: ${ocrError.message}`);
    }
    
    // Update page dimensions to match original image (not normalized)
    ocrResult.page = {
      width: firstPage.width,
      height: firstPage.height,
    };
    
    // Do NOT add normalizedImageBase64 - Gemini pipeline doesn't normalize images
    // Frontend should use original image, not normalized version
    
    console.log(`✅ [OCR Gemini] PDF OCR completed (Gemini pipeline - no normalization)`);
    
    return ocrResult;
  }
  } catch (error) {
    console.error(`❌ [OCR Gemini] Error in ocrPdfBase64Gemini:`, error);
    console.error(`❌ [OCR Gemini] Error stack:`, error.stack);
    throw error; // Re-throw to be caught by caller
  }
}

// ---------- HELPER: Extract text from word preserving spaces and breaks ----------
// DEPRECATED: This function has been moved earlier in the file (before ocrImageBufferGemini)
// The actual function is defined at line ~378 (after utilities imports)

// ---------- OCR IMAGE BUFFER V2 (INTERNAL) ----------
// DEPRECATED: This function is removed. Use ocrImageBufferGemini instead.
// This function belongs to v2 project and should not be used in this Gemini project.
/*
async function ocrImageBufferV2(imageBuffer, fileName = "image") {
  console.log(`📸 [OCR V2] Processing image buffer: ${fileName}`);

  // Use documentTextDetection for structured documents (preserves layout)
  const [result] = await visionClient.documentTextDetection({
    image: { content: imageBuffer },
    imageContext: {
      languageHints: ["th", "en"], // Thai first, then English
    },
  });

  const fullTextAnnotation = result.fullTextAnnotation;
  if (!fullTextAnnotation) {
    console.warn("⚠️ [OCR V2] No fullTextAnnotation found");
    return {
      fileName,
      page: { width: 0, height: 0 },
      words: [],
    };
  }

  // Extract page dimensions
  const page = fullTextAnnotation.pages?.[0];
  const pageWidth = page?.width || 0;
  const pageHeight = page?.height || 0;

  // Extract words with bounding boxes
  // IMPORTANT: Use extractTextFromWord to preserve all spaces, line breaks, and formatting
  const words = [];
  
  if (fullTextAnnotation.pages) {
    for (const page of fullTextAnnotation.pages) {
      if (page.blocks) {
        for (const block of page.blocks) {
          if (block.paragraphs) {
            for (const paragraph of block.paragraphs) {
              if (paragraph.words) {
                for (const word of paragraph.words) {
                  // Use extractTextFromWord to preserve spaces and breaks from OCR
                  const wordText = extractTextFromWord(word);
                  
                  if (wordText && word.boundingBox?.vertices) {
                    const vertices = word.boundingBox.vertices;
                    if (vertices.length >= 2) {
                      const x = Math.min(...vertices.map((v) => v.x || 0));
                      const y = Math.min(...vertices.map((v) => v.y || 0));
                      const maxX = Math.max(...vertices.map((v) => v.x || 0));
                      const maxY = Math.max(...vertices.map((v) => v.y || 0));
                      const w = maxX - x;
                      const h = maxY - y;
                      
                      if (w > 0 && h > 0) {
                        words.push({
                          text: wordText,
                          x,
                          y,
                          w,
                          h,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`📊 [OCR V2] Extracted ${words.length} words from documentTextDetection`);
  
  // Sort words by Y position (top to bottom), then X (left to right)
  // IMPORTANT: Use ROW_TOLERANCE (10px) to determine if words are on the same row
  // This ensures proper row ordering (records start from top row, not middle of page)
  const ROW_TOLERANCE = 10; // pixels - adjust based on DPI
  words.sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff > ROW_TOLERANCE) {
      return a.y - b.y; // Different rows - sort by Y (top → bottom)
    }
    return a.x - b.x; // Same row - sort by X (left → right)
  });
  
  // Log first few words for debugging row order
  if (words.length > 0) {
    const firstRowY = words[0].y;
    const firstRowWords = words.filter(w => Math.abs(w.y - firstRowY) <= ROW_TOLERANCE).slice(0, 3);
    const firstRowPreview = firstRowWords.map(w => w.text).join(" ");
    console.log(`📄 [RowSort] Total words: ${words.length}, firstRowY: ${firstRowY}, firstRowPreview: "${firstRowPreview}..."`);
  }

  console.log(`✅ [OCR V2] Image buffer OCR completed. Found ${words.length} words`);
  
  // Log sample words to verify space preservation and number detection
  if (words.length > 0) {
    const sampleWords = words.slice(0, 10);
    console.log(`📝 [OCR V2] Sample words (first 10):`, sampleWords.map(w => ({
      text: `"${w.text}"`,
      hasSpace: w.text.includes(" "),
      hasNewline: w.text.includes("\n"),
      length: w.text.length,
      isNumber: /^\d+$/.test(w.text.trim()),
      containsNumber: /\d/.test(w.text),
    })));
    
    // Check for potential number misreadings (common OCR errors: 5→เก, 0→O, 1→l)
    const numberMisreadings = words.filter(w => {
      const text = w.text.trim();
      // Check if text looks like a misread number (Thai characters that might be numbers)
      return /^[เกกขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ]+$/.test(text) && text.length === 1;
    });
    if (numberMisreadings.length > 0) {
      console.warn(`⚠️ [OCR V2] Potential number misreadings detected:`, numberMisreadings.slice(0, 5).map(w => `"${w.text}"`));
    }
  }
  
  // Additional debugging info
  if (words.length === 0) {
    console.warn("⚠️ [OCR V2] No words extracted from OCR result");
    console.log("📊 [OCR V2] FullTextAnnotation details:", {
      hasPages: !!fullTextAnnotation.pages,
      pagesCount: fullTextAnnotation.pages?.length || 0,
      hasText: !!fullTextAnnotation.text,
      textLength: fullTextAnnotation.text?.length || 0,
      textPreview: fullTextAnnotation.text?.substring(0, 200) || "(no text)",
    });
  }
  
  return {
    fileName,
    page: {
      width: pageWidth,
      height: pageHeight,
    },
    words,
  };
}

// ---------- OCR IMAGE BUFFER GEMINI (INTERNAL) ----------
// DEPRECATED: This function has been moved earlier in the file (before scanSinglePageGemini)
// This duplicate definition is kept for reference but should not be used
// The actual function is defined at line ~370 (after ocrImageBase64Gemini)

// ---------- OCR IMAGE V2 FUNCTION ----------
// DEPRECATED: This function is removed. This function belongs to v2 project and should not be used in this Gemini project.
// exports.ocrImageV2 = onRequest(
//   {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 540,
    memory: "4GiB", // Increased from 2GiB for large multi-page PDF processing (39+ pages)
    maxInstances: 10,
  },
  (req, res) => {
    // IMPORTANT: Set CORS headers BEFORE any async operations
    // This ensures CORS headers are always sent, even if function crashes
    const setCorsHeaders = () => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    };
    
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      setCorsHeaders();
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).send("");
    }

    // Set CORS headers for all responses
    setCorsHeaders();

    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
      }

      try {
        // Debug logging
        console.log("📥 [OCR V2] Request received:", {
          method: req.method,
          contentType: req.headers["content-type"],
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          hasImageBase64: !!(req.body && req.body.image_base64),
          hasPdfBase64: !!(req.body && req.body.pdf_base64),
        });

        // ===== IMAGE BASE64 =====
        if (req.body && req.body.image_base64) {
          console.log("📸 [OCR V2] Processing image...");
          const fileName = req.body.fileName || "image";
          const manualRotation = req.body.rotation !== undefined && req.body.rotation !== null 
            ? parseInt(req.body.rotation) 
            : null;
          if (manualRotation !== null) {
            console.log(`🔄 [OCR V2] Using manual rotation: ${manualRotation}°`);
          }
          const ocrResult = await ocrImageBase64V2(
            req.body.image_base64,
            fileName,
            manualRotation
          );
          return res.json({
            success: true,
            result: ocrResult, // Returns OCRResult
          });
        }

        // ===== PDF BASE64 =====
        if (req.body && req.body.pdf_base64) {
          console.log("📄 [OCR V2] Processing PDF...");
          const fileName = req.body.fileName || req.body.filename || "input.pdf";
          const manualRotation = req.body.rotation !== undefined && req.body.rotation !== null 
            ? parseInt(req.body.rotation) 
            : null;
          // Support both boolean (backward compatible) and string scanMode
          const scanModeInput = req.body.scanMode;
          let scanMode = false; // Default: template mode (backward compatible)
          if (typeof scanModeInput === "string" && scanModeInput === "perPage") {
            scanMode = "perPage"; // New: perPage mode
          } else if (scanModeInput === true) {
            scanMode = true; // Boolean true = batch mode (backward compatible)
          } else if (scanModeInput === false) {
            scanMode = false; // Boolean false = template mode (backward compatible)
          }
          // If scanMode is undefined/null, default to false (template mode)
          
          const pageRange = req.body.pageRange; // Optional: page range string like "1,2-6,20-22"
          const startPage = req.body.startPage; // Optional: start page number (1-based, inclusive)
          const endPage = req.body.endPage; // Optional: end page number (1-based, inclusive)
          const sessionId = req.body.sessionId || null; // Optional: session ID for status tracking
          
          // Debug: Log what we received
          console.log(`📋 [OCR V2] Request body keys:`, Object.keys(req.body));
          console.log(`📋 [OCR V2] Received startPage:`, startPage, `(type: ${typeof startPage})`);
          console.log(`📋 [OCR V2] Received endPage:`, endPage, `(type: ${typeof endPage})`);
          console.log(`📋 [OCR V2] Received pageRange:`, pageRange);
          console.log(`📋 [OCR V2] Received scanMode:`, scanModeInput, `→ normalized: ${scanMode}`);
          
          if (manualRotation !== null) {
            console.log(`🔄 [OCR V2] Using manual rotation: ${manualRotation}°`);
          }
          if (startPage !== undefined || endPage !== undefined) {
            console.log(`📋 [OCR V2] Page range: ${startPage || 1}-${endPage || "end"}`);
          } else if (pageRange) {
            console.log(`📋 [OCR V2] Page range: ${pageRange}`);
          }
          
          // Determine mode description
          let modeDescription = "TEMPLATE (first page, with image)";
          if (scanMode === "perPage") {
            modeDescription = "PER-PAGE (process each page separately)";
          } else if (scanMode === true) {
            modeDescription = "BATCH (all pages, no image)";
          }
          console.log(`📋 [OCR V2] Mode: ${modeDescription}`);
          
          // Build options object (only include defined values)
          const ocrOptions = {};
          if (startPage !== undefined || endPage !== undefined) {
            // New: startPage/endPage takes priority
            if (startPage !== undefined) ocrOptions.startPage = startPage;
            if (endPage !== undefined) ocrOptions.endPage = endPage;
            console.log(`📋 [OCR V2] Built ocrOptions with startPage/endPage:`, ocrOptions);
          } else if (pageRange !== undefined) {
            // Existing: pageRange
            ocrOptions.pageRange = pageRange;
            console.log(`📋 [OCR V2] Built ocrOptions with pageRange:`, ocrOptions);
          } else {
            console.log(`📋 [OCR V2] No page options provided, ocrOptions is empty:`, ocrOptions);
          }
          // If neither is provided, ocrOptions is {} = all pages (NON-BREAKING)
          
          // Add sessionId to options if provided
          if (sessionId) {
            ocrOptions.sessionId = sessionId;
            console.log(`📋 [OCR V2] Added sessionId to options: ${sessionId}`);
          }
          
          const ocrResult = await ocrPdfBase64Gemini(
            req.body.pdf_base64,
            fileName,
            manualRotation,
            scanMode,
            ocrOptions
          );
          
          // Handle different response formats based on scanMode
          if (scanMode === "perPage" && ocrResult.scanMode === "perPage") {
            // Per-page mode: return per-page results
            return res.json({
              success: true,
              scanMode: "perPage",
              pages: ocrResult.pages,
            });
          } else {
            // Batch or template mode: return original format (backward compatible)
            return res.json({
              success: true,
              result: ocrResult, // Returns OCRResult
            });
          }
        }

        // ===== INVALID =====
        console.error("❌ [OCR V2] Missing required field. Request body:", JSON.stringify(req.body).substring(0, 200));
        return res.status(400).json({
          success: false,
          error: "Missing image_base64 or pdf_base64",
        });
      } catch (err) {
        console.error("❌ [OCR V2] Error:", err);
        console.error("❌ [OCR V2] Error stack:", err.stack);
        console.error("❌ [OCR V2] Error name:", err.name);
        console.error("❌ [OCR V2] Error message:", err.message);
        
        // IMPORTANT: Set CORS headers even on error (already set above, but ensure)
        // Use the setCorsHeaders from outer scope
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        
        // Return error response with CORS headers
        try {
          return res.status(500).json({
            success: false,
            error: err.message || "OCR V2 failed",
            errorType: err.name || "UnknownError",
          });
        } catch (responseError) {
          // If response already sent, log the error
          console.error("❌ [OCR V2] Failed to send error response:", responseError);
        }
      }
    });
  }
);
*/

// ---------- OCR IMAGE GEMINI FUNCTION ----------
// ⚠️ CRITICAL: This is a NEW function - does NOT modify ocrImageV2
// This function uses Gemini pipeline and will be deployed separately
exports.ocrImageGemini = onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 540,
    memory: "4GiB", // Increased from 2GiB for large multi-page PDF processing (39+ pages)
    maxInstances: 10,
  },
  (req, res) => {
    // IMPORTANT: Set CORS headers BEFORE any async operations
    // This ensures CORS headers are always sent, even if function crashes
    const setCorsHeaders = () => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    };
    
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      setCorsHeaders();
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).send("");
    }

    // Set CORS headers for all responses
    setCorsHeaders();

    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
      }

      try {
        // Debug logging
        console.log("📥 [OCR Gemini] Request received:", {
          method: req.method,
          contentType: req.headers["content-type"],
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          hasImageBase64: !!(req.body && req.body.image_base64),
          hasPdfBase64: !!(req.body && req.body.pdf_base64),
        });

        // ===== IMAGE BASE64 =====
        if (req.body && req.body.image_base64) {
          console.log("📸 [OCR Gemini] Processing image...");
          const fileName = req.body.fileName || "image";
          const manualRotation = req.body.rotation !== undefined && req.body.rotation !== null 
            ? parseInt(req.body.rotation) 
            : null;
          if (manualRotation !== null) {
            console.log(`🔄 [OCR Gemini] Using manual rotation: ${manualRotation}°`);
          }
          const ocrResult = await ocrImageBase64Gemini(
            req.body.image_base64,
            fileName,
            manualRotation
          );
          return res.json({
            success: true,
            result: ocrResult, // Returns OCRResult
          });
        }

        // ===== PDF BASE64 =====
        if (req.body && req.body.pdf_base64) {
          console.log("📄 [OCR Gemini] Processing PDF...");
          const fileName = req.body.fileName || req.body.filename || "input.pdf";
          const manualRotation = req.body.rotation !== undefined && req.body.rotation !== null 
            ? parseInt(req.body.rotation) 
            : null;
          // Support both boolean (backward compatible) and string scanMode
          const scanModeInput = req.body.scanMode;
          let scanMode = false; // Default: template mode (backward compatible)
          if (typeof scanModeInput === "string" && scanModeInput === "perPage") {
            scanMode = "perPage"; // New: perPage mode
          } else if (scanModeInput === true) {
            scanMode = true; // Boolean true = batch mode (backward compatible)
          } else if (scanModeInput === false) {
            scanMode = false; // Boolean false = template mode (backward compatible)
          }
          // If scanMode is undefined/null, default to false (template mode)
          
          const pageRange = req.body.pageRange; // Optional: page range string like "1,2-6,20-22"
          const startPage = req.body.startPage; // Optional: start page number (1-based, inclusive)
          const endPage = req.body.endPage; // Optional: end page number (1-based, inclusive)
          const sessionId = req.body.sessionId || null; // Optional: session ID for status tracking
          
          // Debug: Log what we received
          console.log(`📋 [OCR Gemini] Request body keys:`, Object.keys(req.body));
          console.log(`📋 [OCR Gemini] Received startPage:`, startPage, `(type: ${typeof startPage})`);
          console.log(`📋 [OCR Gemini] Received endPage:`, endPage, `(type: ${typeof endPage})`);
          console.log(`📋 [OCR Gemini] Received pageRange:`, pageRange);
          console.log(`📋 [OCR Gemini] Received scanMode:`, scanModeInput, `→ normalized: ${scanMode}`);
          
          if (manualRotation !== null) {
            console.log(`🔄 [OCR Gemini] Using manual rotation: ${manualRotation}°`);
          }
          if (startPage !== undefined || endPage !== undefined) {
            console.log(`📋 [OCR Gemini] Page range: ${startPage || 1}-${endPage || "end"}`);
          } else if (pageRange) {
            console.log(`📋 [OCR Gemini] Page range: ${pageRange}`);
          }
          
          // Determine mode description
          let modeDescription = "TEMPLATE (first page, with image)";
          if (scanMode === "perPage") {
            modeDescription = "PER-PAGE (process each page separately)";
          } else if (scanMode === true) {
            modeDescription = "BATCH (all pages, no image)";
          }
          console.log(`📋 [OCR Gemini] Mode: ${modeDescription}`);
          
          // Build options object (only include defined values)
          const ocrOptions = {};
          if (startPage !== undefined || endPage !== undefined) {
            // New: startPage/endPage takes priority
            if (startPage !== undefined) ocrOptions.startPage = startPage;
            if (endPage !== undefined) ocrOptions.endPage = endPage;
            console.log(`📋 [OCR Gemini] Built ocrOptions with startPage/endPage:`, ocrOptions);
          } else if (pageRange !== undefined) {
            // Existing: pageRange
            ocrOptions.pageRange = pageRange;
            console.log(`📋 [OCR Gemini] Built ocrOptions with pageRange:`, ocrOptions);
          } else {
            console.log(`📋 [OCR Gemini] No page options provided, ocrOptions is empty:`, ocrOptions);
          }
          // If neither is provided, ocrOptions is {} = all pages (NON-BREAKING)
          
          // Add sessionId to options if provided
          if (sessionId) {
            ocrOptions.sessionId = sessionId;
            console.log(`📋 [OCR Gemini] Added sessionId to options: ${sessionId}`);
          }
          
          const ocrResult = await ocrPdfBase64Gemini(
            req.body.pdf_base64,
            fileName,
            manualRotation,
            scanMode,
            ocrOptions
          );
          
          // Handle different response formats based on scanMode
          if (scanMode === "perPage" && ocrResult.scanMode === "perPage") {
            // Per-page mode: return per-page results
            return res.json({
              success: true,
              scanMode: "perPage",
              pages: ocrResult.pages,
            });
          } else {
            // Batch or template mode: return original format (backward compatible)
            return res.json({
              success: true,
              result: ocrResult, // Returns OCRResult
            });
          }
        }

        // ===== INVALID =====
        console.error("❌ [OCR Gemini] Missing required field. Request body:", JSON.stringify(req.body).substring(0, 200));
        return res.status(400).json({
          success: false,
          error: "Missing image_base64 or pdf_base64",
        });
      } catch (err) {
        console.error("❌ [OCR Gemini] Error:", err);
        console.error("❌ [OCR Gemini] Error stack:", err.stack);
        console.error("❌ [OCR Gemini] Error name:", err.name);
        console.error("❌ [OCR Gemini] Error message:", err.message);
        
        // IMPORTANT: Set CORS headers even on error (already set above, but ensure)
        // Use the setCorsHeaders from outer scope
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        
        // Return error response with CORS headers
        try {
          return res.status(500).json({
            success: false,
            error: err.message || "OCR Gemini failed",
            errorType: err.name || "UnknownError",
          });
        } catch (responseError) {
          // If response already sent, log the error
          console.error("❌ [OCR Gemini] Failed to send error response:", responseError);
        }
      }
    });
  }
);

// ---------- SMART OCR (GEMINI) FUNCTION ----------
// Smart OCR pipeline: PDF → Check text layer → Extract/OCR → Normalize → Gemini 2-pass → JSON
// ⚠️ CRITICAL: This is a NEW function - does NOT modify existing functions
// This function uses semantic understanding instead of template layout (x/y)

const { hasTextLayer, extractTextFromPdf } = require("./utils/pdfTextExtractor");
const { normalizeAndCleanup } = require("./utils/textNormalizer");
const { analyzeDocumentStructure, convertToJsonTable } = require("./utils/geminiClient");
const { thaiOcrPreValidation } = require("./utils/thaiOcrPreValidation");

/**
 * Smart OCR: PDF → Text extraction/OCR → Gemini → JSON table
 * 
 * @param {string} pdfBase64 - PDF base64 string
 * @param {string} fileName - File name for logging
 * @param {Array} columnDefinitions - Column definitions from template (for Gemini mapping)
 * @param {Object} options - Options
 * @param {number} options.startPage - Start page (1-based)
 * @param {number} options.endPage - End page (1-based)
 * @returns {Promise<Object>} Smart OCR result with JSON table and metadata
 */
async function smartOcrPdf(pdfBase64, fileName = "input.pdf", columnDefinitions = [], options = {}) {
  try {
    console.log(`🤖 [Smart OCR] Starting Smart OCR pipeline: ${fileName}`);
    
    if (!pdfBase64 || pdfBase64.length === 0) {
      throw new Error("PDF base64 is empty");
    }
    
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    console.log(`📄 [Smart OCR] PDF buffer size: ${pdfBuffer.length} bytes`);
    
    // STEP 1: Check if PDF has text layer
    console.log(`📄 [Smart OCR] Step 1: Checking PDF text layer...`);
    const hasText = await hasTextLayer(pdfBuffer);
    
    let extractedText = "";
    let source = "";
    let pages = 0;
    
    if (hasText) {
      // STEP 2a: Extract text directly from PDF
      console.log(`📄 [Smart OCR] Step 2a: Extracting text from PDF text layer...`);
      const textResult = await extractTextFromPdf(pdfBuffer, fileName, {
        startPage: options.startPage,
        endPage: options.endPage,
      });
      extractedText = textResult.text;
      pages = textResult.pages;
      source = "textlayer";
      console.log(`✅ [Smart OCR] Extracted ${extractedText.length} characters from text layer`);
    } else {
      // STEP 2b: Use OCR (Google Vision)
      console.log(`📄 [Smart OCR] Step 2b: No text layer found, using OCR...`);
      console.log(`⏱️ [Smart OCR] OCR step may take 1-3 minutes depending on PDF size...`);
      const ocrStartTime = Date.now();
      const ocrResult = await ocrPdfBase64Gemini(
        pdfBase64,
        fileName,
        null, // No manual rotation
        true, // Batch mode (process all pages, not just first page)
        {
          startPage: options.startPage,
          endPage: options.endPage,
        }
      );
      
      // Convert OCR words to text
      if (ocrResult.words && ocrResult.words.length > 0) {
        console.log(`📄 [Smart OCR] OCR extracted ${ocrResult.words.length} words from ${ocrResult.pages?.length || 1} pages`);
        
        // Sort words by Y then X (reading order)
        const sortedWords = [...ocrResult.words].sort((a, b) => {
          const yDiff = Math.abs(a.y - b.y);
          if (yDiff > 10) {
            return a.y - b.y; // Different rows
          }
          return a.x - b.x; // Same row
        });
        
        // Log first few words to verify extraction
        if (sortedWords.length > 0) {
          const firstWords = sortedWords.slice(0, 10).map(w => w.text).join(" ");
          console.log(`📄 [Smart OCR] First 10 words: "${firstWords}..."`);
        }
        
        // Combine words into text (preserve line breaks)
        // IMPORTANT: Use newline between words on different Y positions to preserve structure
        let textLines = [];
        let currentLine = [];
        let currentY = null;
        
        for (const word of sortedWords) {
          const wordY = Math.round(word.y / 10) * 10; // Round to nearest 10px for row grouping
          
          if (currentY === null || Math.abs(wordY - currentY) > 10) {
            // New line
            if (currentLine.length > 0) {
              textLines.push(currentLine.join(" "));
            }
            currentLine = [word.text];
            currentY = wordY;
          } else {
            // Same line
            currentLine.push(word.text);
          }
        }
        
        // Add last line
        if (currentLine.length > 0) {
          textLines.push(currentLine.join(" "));
        }
        
        extractedText = textLines.join("\n");
        pages = ocrResult.pages?.length || 1;
        
        console.log(`📄 [Smart OCR] Combined text: ${extractedText.length} characters, ${textLines.length} lines`);
        if (textLines.length > 0) {
          console.log(`📄 [Smart OCR] First 3 lines:`, textLines.slice(0, 3));
        }
      } else {
        extractedText = "";
        pages = 1;
      }
      source = "vision";
      const ocrDuration = ((Date.now() - ocrStartTime) / 1000).toFixed(2);
      console.log(`✅ [Smart OCR] OCR extracted ${extractedText.length} characters from ${pages} page(s) in ${ocrDuration}s`);
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text extracted from PDF");
    }
    
    // STEP 3: Normalize and cleanup text
    console.log(`📝 [Smart OCR] Step 3: Normalizing and cleaning text...`);
    const normalizedText = normalizeAndCleanup(extractedText);
    console.log(`✅ [Smart OCR] Normalized text length: ${normalizedText.length} characters (from ${pages} page(s))`);
    
    // Warn if text seems too short for multiple pages
    if (pages > 1 && normalizedText.length < 1000) {
      console.warn(`⚠️ [Smart OCR] Warning: PDF has ${pages} pages but extracted text is only ${normalizedText.length} chars. This might indicate incomplete extraction.`);
    }
    
    // STEP 3.5: Pre-validation - EARLY EXIT GATEKEEPER
    console.log(`🔍 [Smart OCR] Step 3.5: Pre-validating OCR text...`);
    const preValidation = thaiOcrPreValidation(normalizedText);
    console.log(`📊 [Smart OCR] Pre-validation result:`, {
      shouldExtractTable: preValidation.shouldExtractTable,
      score: preValidation.score,
      reasons: preValidation.reasons,
    });
    
    // CRITICAL: Early exit if pre-validation fails - NO GEMINI CALLS
    if (!preValidation.shouldExtractTable) {
      console.log(`⏭️ [Smart OCR] Pre-validation failed (score: ${preValidation.score}). Returning early - NO Gemini calls.`);
      return {
        success: true,
        records: [],
        recordsCount: 0,
        confidence: "low",
        source: source,
        reason: "pre_validation_failed",
        preValidation: preValidation,
        metadata: {
          source: source,
          pages: pages,
          confidence: "low",
          textLength: normalizedText.length,
          preValidation: preValidation,
        },
        rawText: normalizedText,
      };
    }
    
    // STEP 4: Gemini Pass #1 - Analyze document structure (ONLY if pre-validation passed)
    console.log(`🤖 [Smart OCR] Step 4: Gemini Pass #1 - Analyzing document structure via REST API...`);
    const pass1StartTime = Date.now();
    let structureAnalysis;
    try {
      structureAnalysis = await analyzeDocumentStructure(normalizedText, null); // apiKey not used (uses secret)
      const pass1Duration = ((Date.now() - pass1StartTime) / 1000).toFixed(2);
      console.log(`✅ [Smart OCR] Step 4 completed in ${pass1Duration}s`);
    } catch (geminiError) {
      const pass1Duration = ((Date.now() - pass1StartTime) / 1000).toFixed(2);
      console.error(`❌ [Smart OCR] Gemini Pass #1 failed after ${pass1Duration}s:`, geminiError);
      // Fallback: Use basic structure
      structureAnalysis = {
        documentType: "บัญชีรายชื่อ",
        recordDefinition: "1 บรรทัด = 1 record",
        repeatingPatterns: [],
        sharedValues: [],
        headerFooter: "",
        dataRelationships: "",
        confidence: "low",
      };
    }
    
    // STEP 5: Gemini Pass #2 - Convert to JSON table (ONLY if pre-validation passed)
    console.log(`🤖 [Smart OCR] Step 5: Gemini Pass #2 - Converting to JSON table...`);
    console.log(`⏱️ [Smart OCR] This step may take 2-5 minutes depending on document size...`);
    const pass2StartTime = Date.now();
    let jsonTable = [];
    let confidence = "low";
    
    if (columnDefinitions && columnDefinitions.length > 0) {
      try {
        jsonTable = await convertToJsonTable(normalizedText, structureAnalysis, columnDefinitions, null);
        const pass2Duration = ((Date.now() - pass2StartTime) / 1000).toFixed(2);
        console.log(`✅ [Smart OCR] Step 5 completed in ${pass2Duration}s, extracted ${jsonTable.length} records`);
        confidence = structureAnalysis.confidence || (jsonTable.length > 0 ? "medium" : "low");
      } catch (geminiError) {
        const pass2Duration = ((Date.now() - pass2StartTime) / 1000).toFixed(2);
        console.error(`❌ [Smart OCR] Gemini Pass #2 failed after ${pass2Duration}s:`, geminiError);
        jsonTable = [];
        confidence = "low";
      }
    } else {
      console.warn(`⚠️ [Smart OCR] No column definitions provided, skipping Pass #2`);
      jsonTable = [];
      confidence = "low";
    }
    
    console.log(`✅ [Smart OCR] Smart OCR completed: ${jsonTable.length} records, confidence: ${confidence}`);
    
    return {
      success: true,
      records: jsonTable,
      recordsCount: jsonTable.length,
      confidence: confidence,
      source: `${source}+gemini`,
      metadata: {
        source: `${source}+gemini`,
        pages: pages,
        confidence: confidence,
        textLength: normalizedText.length,
        structureAnalysis: structureAnalysis,
        preValidation: preValidation,
      },
      rawText: normalizedText,
    };
  } catch (error) {
    console.error(`❌ [Smart OCR] Error:`, error);
    console.error(`❌ [Smart OCR] Error stack:`, error.stack);
    throw error;
  }
}

// ---------- SMART OCR FUNCTION (EXPORT) ----------
exports.smartOcr = onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 540,
    memory: "4GiB",
    maxInstances: 10,
    secrets: [GEMINI_API_KEY], // Gemini REST API v1 requires API key
  },
  (req, res) => {
    // IMPORTANT: Set CORS headers BEFORE any async operations
    const setCorsHeaders = () => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    };
    
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      setCorsHeaders();
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).send("");
    }

    // Set CORS headers for all responses
    setCorsHeaders();

    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
      }

      try {
        console.log("📥 [Smart OCR] Request received:", {
          method: req.method,
          hasPdfBase64: !!(req.body && req.body.pdf_base64),
          hasColumnDefinitions: !!(req.body && req.body.columnDefinitions),
        });

        if (!req.body || !req.body.pdf_base64) {
          return res.status(400).json({
            success: false,
            error: "Missing pdf_base64",
          });
        }

        const fileName = req.body.fileName || req.body.filename || "input.pdf";
        const columnDefinitions = req.body.columnDefinitions || [];
        const options = {
          startPage: req.body.startPage,
          endPage: req.body.endPage,
        };

        console.log(`🤖 [Smart OCR] Processing PDF: ${fileName}, columns: ${columnDefinitions.length}`);
        if (columnDefinitions.length === 0) {
          console.warn(`⚠️ [Smart OCR] No column definitions provided! This will skip Pass #2 and return empty records.`);
        } else {
          console.log(`📋 [Smart OCR] Column definitions:`, columnDefinitions.map(c => `${c.columnKey}(${c.label})`).join(", "));
        }

        console.log(`⏱️ [Smart OCR] Starting Smart OCR processing...`);
        console.log(`📊 [Smart OCR] Estimated time: 3-8 minutes (depending on document size and Gemini API response)`);
        const startTime = Date.now();
        
        const result = await smartOcrPdf(
          req.body.pdf_base64,
          fileName,
          columnDefinitions,
          options
        );
        
        const duration = Date.now() - startTime;
        const durationSeconds = (duration / 1000).toFixed(2);
        const durationMinutes = (duration / 60000).toFixed(2);
        console.log(`✅ [Smart OCR] Processing completed in ${durationSeconds}s (${durationMinutes} minutes)`);
        console.log(`📊 [Smart OCR] Returning result:`, {
          success: true,
          recordsCount: result.records?.length || 0,
          recordsCountField: result.recordsCount || 0,
          confidence: result.confidence,
          source: result.source,
        });

        return res.json({
          success: true,
          result: result,
        });
      } catch (err) {
        console.error("❌ [Smart OCR] Error:", err);
        console.error("❌ [Smart OCR] Error stack:", err.stack);
        
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        
        try {
          return res.status(500).json({
            success: false,
            error: err.message || "Smart OCR failed",
            errorType: err.name || "UnknownError",
          });
        } catch (responseError) {
          console.error("❌ [Smart OCR] Failed to send error response:", responseError);
        }
      }
    });
  }
);