/**
 * PDF Normalization Utility
 * 
 * Converts PDF to images with consistent DPI and automatic orientation correction.
 * This ensures Template and Scan use the same normalized images.
 * 
 * Pipeline:
 * 1. Convert PDF → Image (fixed DPI)
 * 2. Detect orientation from text (OCR OSD)
 * 3. Rotate image until upright
 * 4. Return normalized images
 */

// DOMMatrix polyfill MUST be set before requiring pdfjs-dist
if (typeof global.DOMMatrix === "undefined") {
  try {
    const dommatrix = require("dommatrix");
    global.DOMMatrix = dommatrix.DOMMatrix || dommatrix;
  } catch (e) {
    // Fallback: simple DOMMatrix
    global.DOMMatrix = class DOMMatrix {
      constructor(init) {
        this.a = init?.a ?? 1;
        this.b = init?.b ?? 0;
        this.c = init?.c ?? 0;
        this.d = init?.d ?? 1;
        this.e = init?.e ?? 0;
        this.f = init?.f ?? 0;
      }
    };
  }
}

// Try @napi-rs/canvas first (better compatibility with pdfjs-dist)
// Fallback to node-canvas if not available
let createCanvas;
try {
  const napiCanvas = require("@napi-rs/canvas");
  createCanvas = napiCanvas.createCanvas;
  console.log("✅ [Normalize] Using @napi-rs/canvas");
} catch (e) {
  const nodeCanvas = require("canvas");
  createCanvas = nodeCanvas.createCanvas;
  console.log("✅ [Normalize] Using node-canvas (fallback)");
}
const path = require("path");
const fs = require("fs");
const os = require("os");

// Fixed DPI for consistent image size
const PDF_DPI = 300;

// Load pdfjs-dist using dynamic import (ESM)
// pdfjs-dist v4.x legacy build uses ESM (.mjs)
let pdfjsLibPromise = null;

async function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      try {
        // Use legacy build for Node.js compatibility with node-canvas
        // pdfjs-dist v4.x legacy build uses ESM (.mjs), not CommonJS (.js)
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        
        console.log("✅ [Normalize] Loaded pdfjs-dist v4.x legacy build (ESM)");
        
        // Set up CanvasFactory for node-canvas compatibility
        // This tells pdfjs-dist how to create canvas objects
        if (pdfjs.GlobalWorkerOptions) {
          // Disable worker in Node.js environment
          pdfjs.GlobalWorkerOptions.workerSrc = false;
        }
        
        // Create CanvasFactory - try @napi-rs/canvas first, fallback to node-canvas
        let createCanvasNode;
        try {
          const napiCanvas = require("@napi-rs/canvas");
          createCanvasNode = napiCanvas.createCanvas;
          console.log("✅ [Normalize] Using @napi-rs/canvas for CanvasFactory");
        } catch (e) {
          const nodeCanvas = require("canvas");
          createCanvasNode = nodeCanvas.createCanvas;
          console.log("✅ [Normalize] Using node-canvas for CanvasFactory (fallback)");
        }
        
        // Create custom CanvasFactory for node-canvas
        // pdfjs-dist expects a factory that creates canvas objects
        class NodeCanvasFactory {
          create(width, height) {
            const canvas = createCanvasNode(width, height);
            const context = canvas.getContext("2d");
            return {
              canvas: canvas,
              context: context,
            };
          }
          reset(canvasAndContext, width, height) {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
          }
          destroy(canvasAndContext) {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
          }
        }
        
        // Set custom CanvasFactory
        pdfjs.CanvasFactory = NodeCanvasFactory;
        console.log("✅ [Normalize] Set custom CanvasFactory for node-canvas");
        
        return pdfjs;
      } catch (legacyError) {
        console.warn("⚠️ [Normalize] Legacy build failed, trying standard import:", legacyError.message);
        try {
          // Fallback: try standard dynamic import
          const pdfjs = await import("pdfjs-dist");
          console.log("✅ [Normalize] Loaded pdfjs-dist standard build (ESM)");
          return pdfjs;
        } catch (error) {
          console.error("❌ [Normalize] Failed to load pdfjs-dist:", error);
          throw error;
        }
      }
    })();
  }
  return pdfjsLibPromise;
}

/**
 * Convert PDF buffer to images
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Original PDF filename (for logging)
 * @param {Object} options - Options for conversion
 * @param {number} options.maxPages - Maximum number of pages to process (deprecated, use pageRange instead)
 * @param {number[]|null} options.pageRange - Array of page numbers to process (1-indexed), or null for all pages
 * @param {number} options.startPage - Start page number (1-based, inclusive). If provided, only process pages from startPage to endPage.
 * @param {number} options.endPage - End page number (1-based, inclusive). If provided, only process pages from startPage to endPage.
 * @returns {Promise<Array<{imageBuffer: Buffer, pageNumber: number, width: number, height: number}>>}
 */
async function normalizePdfToImages(pdfBuffer, fileName = "input.pdf", options = {}) {
  // Support both maxPages (legacy) and pageRange (new) and startPage/endPage (new)
  let pagesToProcess = null; // null = all pages
  
  // Check for startPage/endPage first (new feature)
  const hasStartPage = options.startPage !== undefined && options.startPage !== null;
  const hasEndPage = options.endPage !== undefined && options.endPage !== null;
  
  if (options.pageRange && Array.isArray(options.pageRange)) {
    // New: Use pageRange array
    pagesToProcess = options.pageRange;
    console.log(`📄 [Normalize] Starting PDF normalization: ${fileName}, pageRange: [${pagesToProcess.join(", ")}]`);
  } else if (options.maxPages !== undefined) {
    // Legacy: Use maxPages (first N pages)
    pagesToProcess = Array.from({ length: options.maxPages }, (_, i) => i + 1);
    console.log(`📄 [Normalize] Starting PDF normalization: ${fileName}, maxPages: ${options.maxPages} (legacy mode)`);
  } else {
    // Default: all pages
    console.log(`📄 [Normalize] Starting PDF normalization: ${fileName}, processing all pages`);
  }
  
  const tempDir = os.tmpdir();
  const tempPdfPath = path.join(tempDir, `pdf-${Date.now()}-${fileName}`);
  
  try {
    // Write PDF buffer to temp file
    fs.writeFileSync(tempPdfPath, pdfBuffer);
    
    // Get pdfjs-dist library (ESM dynamic import)
    const pdfjsLib = await getPdfjsLib();
    
    // pdfjs-dist v4.x can use Buffer directly, but Uint8Array is also supported
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    
    // Load PDF document
    // In Node.js, pdfjs-dist v4.x should work without explicit workerSrc
    const loadingTask = pdfjsLib.getDocument({
      data: pdfUint8Array, // Use Uint8Array for compatibility
      verbosity: 0,
      // Don't set useWorkerFetch or useSystemFonts - let library handle it
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    console.log(`📄 [Normalize] PDF has ${numPages} page(s)`);
    
    // Handle startPage/endPage (NON-BREAKING: only if explicitly provided)
    if (hasStartPage || hasEndPage) {
      // Validate startPage/endPage
      const startPage = hasStartPage ? parseInt(options.startPage, 10) : 1;
      const endPage = hasEndPage ? parseInt(options.endPage, 10) : numPages;
      
      // Validation: must be valid numbers and startPage <= endPage
      if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage < 1) {
        console.warn(`⚠️ [Normalize] Invalid startPage/endPage (startPage=${startPage}, endPage=${endPage}), falling back to all pages`);
        // Fallback to default behavior (all pages)
        pagesToProcess = null;
      } else if (startPage > endPage) {
        console.warn(`⚠️ [Normalize] startPage (${startPage}) > endPage (${endPage}), falling back to all pages`);
        // Fallback to default behavior (all pages)
        pagesToProcess = null;
      } else {
        // Calculate actual range (clamp to valid range)
        const actualStart = Math.max(1, Math.min(startPage, numPages));
        const actualEnd = Math.max(actualStart, Math.min(endPage, numPages));
        
        // Generate page range array
        pagesToProcess = Array.from({ length: actualEnd - actualStart + 1 }, (_, i) => actualStart + i);
        console.log(`📄 [PDF Slice] totalPages=${numPages}, range=${actualStart}-${actualEnd}, processed=${pagesToProcess.length}`);
      }
    }
    
    // Determine which pages to process
    let pagesToProcessList;
    if (pagesToProcess === null) {
      // Process all pages (default behavior - NON-BREAKING)
      pagesToProcessList = Array.from({ length: numPages }, (_, i) => i + 1);
    } else {
      // Process specified pages (validate against total pages)
      pagesToProcessList = pagesToProcess.filter(p => p >= 1 && p <= numPages);
      if (pagesToProcessList.length === 0) {
        throw new Error(`No valid pages to process. Specified pages: [${pagesToProcess.join(", ")}], total pages: ${numPages}`);
      }
      // Warn if some pages are out of range
      const invalidPages = pagesToProcess.filter(p => p < 1 || p > numPages);
      if (invalidPages.length > 0) {
        console.warn(`⚠️ [Normalize] Some pages are out of range and will be skipped: [${invalidPages.join(", ")}]`);
      }
    }
    
    console.log(`📄 [Normalize] Will process ${pagesToProcessList.length} page(s): [${pagesToProcessList.join(", ")}]`);
    
    const normalizedImages = [];
    
    // Process each specified page
    for (const pageNum of pagesToProcessList) {
      console.log(`📄 [Normalize] Processing page ${pageNum}/${numPages}...`);
      
      const page = await pdf.getPage(pageNum);
      
      // Get page rotation from PDF metadata
      const pdfRotation = page.rotate || 0;
      console.log(`📐 [Normalize] Page ${pageNum} PDF rotation: ${pdfRotation}°`);
      
      // Calculate scale for target DPI
      // PDF default is 72 DPI, so scale = targetDPI / 72
      const scale = PDF_DPI / 72;
      
      // Get viewport with PDF's native rotation
      const viewport = page.getViewport({ scale, rotation: pdfRotation });
      
      console.log(`📐 [Normalize] Page ${pageNum} viewport: ${viewport.width}x${viewport.height} (scale: ${scale.toFixed(2)}, rotation: ${pdfRotation}°)`);
      
      // Create canvas using node-canvas
      // Important: Set canvas dimensions explicitly after getting viewport
      const canvasWidth = Math.ceil(viewport.width);
      const canvasHeight = Math.ceil(viewport.height);
      
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const context = canvas.getContext("2d");
      
      // Verify canvas and context are valid
      if (!canvas || !context) {
        throw new Error("Failed to create canvas or context");
      }
      
      // Verify context has required methods
      if (typeof context.drawImage !== "function") {
        throw new Error("Canvas context missing drawImage method");
      }
      
      console.log(`🎨 [Normalize] Canvas created: ${canvas.width}x${canvas.height}, context type: ${typeof context}`);
      console.log(`🎨 [Normalize] Canvas methods: drawImage=${typeof context.drawImage}, fillRect=${typeof context.fillRect}`);
      
      // Render page to canvas
      // pdfjs-dist v4.x expects canvasContext to be the 2d context from node-canvas
      // The context must have all Canvas 2D API methods
      // IMPORTANT: Use canvas object directly, not just context
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        // Add canvas object for compatibility
        canvas: canvas,
      };
      
      console.log(`🖼️ [Normalize] Rendering page ${pageNum} to canvas (${canvas.width}x${canvas.height})...`);
      console.log(`🖼️ [Normalize] Render context:`, {
        hasCanvasContext: !!renderContext.canvasContext,
        hasCanvas: !!renderContext.canvas,
        viewportWidth: renderContext.viewport.width,
        viewportHeight: renderContext.viewport.height,
        pdfjsLibVersion: pdfjsLib.version || "unknown",
      });
      
      // Render the page
      try {
        const renderTask = page.render(renderContext);
        await renderTask.promise;
        console.log(`✅ [Normalize] Page ${pageNum} rendered successfully`);
      } catch (renderError) {
        console.error(`❌ [Normalize] Render error for page ${pageNum}:`, renderError);
        console.error(`   Error details:`, {
          message: renderError.message,
          stack: renderError.stack,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          contextType: typeof context,
          contextConstructor: context.constructor?.name,
          hasDrawImage: typeof context.drawImage === "function",
          canvasType: typeof canvas,
          canvasConstructor: canvas.constructor?.name,
          pdfjsLibPath: pdfjsLib ? "loaded" : "not loaded",
        });
        throw renderError;
      }
      
      // Convert canvas to image buffer
      const imageBuffer = canvas.toBuffer("image/png");
      
      console.log(`✅ [Normalize] Page ${pageNum} converted to image: ${imageBuffer.length} bytes, ${viewport.width}x${viewport.height}`);
      
      normalizedImages.push({
        imageBuffer,
        pageNumber: pageNum,
        width: viewport.width,
        height: viewport.height,
        pdfRotation, // Store original PDF rotation for reference
      });
    }
    
    console.log(`✅ [Normalize] PDF normalization completed: ${normalizedImages.length} page(s)`);
    
    return normalizedImages;
  } catch (error) {
    console.error(`❌ [Normalize] Failed to normalize PDF:`, error);
    throw new Error(`PDF normalization failed: ${error.message}`);
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
  }
}

module.exports = {
  normalizePdfToImages,
  PDF_DPI,
  getPdfjsLib, // Export for use in other modules
};
