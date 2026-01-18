// Smart OCR Vision Service - Calls smartOcrVisionPdf Cloud Function
// Vision-first, OCR-free pipeline

// Vision mode URL (Cloud Functions v2 endpoint)
// Function name: smartOcrVisionPdf
// Deployed URL: https://us-central1-ocr-system-c3bea.cloudfunctions.net/smartOcrVisionPdf
const FIREBASE_SMART_OCR_VISION_URL = 
  import.meta.env.VITE_FIREBASE_SMART_OCR_VISION_URL || 
  "https://us-central1-ocr-system-c3bea.cloudfunctions.net/smartOcrVisionPdf"

/**
 * Converts file to base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1] // Remove data:image/png;base64, prefix
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Calls Smart OCR for PDF file - DEPRECATED
 * This function has been removed. Use smartOcrVisionPdf instead.
 */

/**
 * Calls Smart OCR Vision for PDF/image file.
 * Returns JSON array of records (Vision-first, OCR-free).
 * 
 * @param pdfFile - PDF or image file
 * @param options - Options (startPage, endPage) - not used in Vision mode but kept for compatibility
 * @returns Smart OCR Vision result with records array and metadata
 */
export async function smartOcrVisionPdf(
  pdfFile: File,
  options?: { startPage?: number; endPage?: number; pageRange?: number[]; scanMode?: string; normalizedPages?: Array<{ pageNumber: number; imageBufferBase64: string; width: number; height: number }>; sessionId?: string; userId?: string; deviceId?: string; signal?: AbortSignal }
) {
  try {
    console.log(`🤖 [Smart OCR Vision] Converting file to base64: ${pdfFile.name}`)
    const fileBase64 = await fileToBase64(pdfFile)
    console.log(`✅ [Smart OCR Vision] File converted, base64 length: ${fileBase64.length}`)

    // Detect mime type from file extension
    const fileName = pdfFile.name.toLowerCase()
    const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || 
                    fileName.endsWith('.png') || fileName.endsWith('.gif') || 
                    fileName.endsWith('.bmp') || fileName.endsWith('.webp')
    const mimeType = isImage 
      ? (fileName.endsWith('.png') ? 'image/png' : 
         fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' : 
         'image/png')
      : 'application/pdf'

    // Use scanMode from options, default to "direct" if not provided
    const scanMode = options?.scanMode || "direct"

    const requestBody: any = {
      pdf_base64: fileBase64,
      fileName: pdfFile.name,
      mimeType: mimeType,
      scanMode: scanMode, // Use scanMode from options: "direct", "perPage", or "ocr"
    }
    
    // If sessionId is provided, send it for progress tracking
    if (options?.sessionId) {
      requestBody.sessionId = options.sessionId;
      console.log(`📊 [Smart OCR Vision] Using sessionId for progress tracking: ${options.sessionId}`);
    }
    
    // If userId is provided, send it for user isolation
    if (options?.userId) {
      requestBody.userId = options.userId;
      console.log(`👤 [Smart OCR Vision] Using userId: ${options.userId}`);
    }
    
    // If deviceId is provided, send it for device isolation
    if (options?.deviceId) {
      requestBody.deviceId = options.deviceId;
      console.log(`🖥️ [Smart OCR Vision] Using deviceId: ${options.deviceId}`);
    }
    
    // If pageRange array is provided, send it for page range filtering (priority)
    if (options?.pageRange && Array.isArray(options.pageRange) && options.pageRange.length > 0) {
      requestBody.pageRange = options.pageRange;
      console.log(`📄 [Smart OCR Vision] Using pageRange: [${options.pageRange.join(', ')}]`);
    } else {
      // Fallback: use startPage/endPage if pageRange not provided
      if (options?.startPage !== undefined) {
        requestBody.startPage = options.startPage;
        console.log(`📄 [Smart OCR Vision] Using startPage: ${options.startPage}`);
      }
      
      if (options?.endPage !== undefined) {
        requestBody.endPage = options.endPage;
        console.log(`📄 [Smart OCR Vision] Using endPage: ${options.endPage}`);
      }
    }
    
    // If normalizedPages are provided (from ocrImageGemini), send them to avoid duplicate normalization
    if (options?.normalizedPages && Array.isArray(options.normalizedPages)) {
      requestBody.skipNormalization = true;
      requestBody.normalizedPages = options.normalizedPages;
      console.log(`📄 [Smart OCR Vision] Using provided normalized pages: ${options.normalizedPages.length} pages`);
    }
    
    console.log(`🌐 [Smart OCR Vision] Calling Smart OCR Vision API...`, {
      url: FIREBASE_SMART_OCR_VISION_URL,
      fileName: pdfFile.name,
      mimeType: mimeType,
    })
    
    // Timeout 15 minutes (900 seconds) to match backend timeout
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    
    // Use provided signal if available, otherwise use internal controller
    const abortSignal = options?.signal || controller.signal;
    
    const startTime = Date.now();
    console.log(`⏱️ [Smart OCR Vision] Starting request with ${TIMEOUT_MS / 1000}s timeout...`);
    console.log(`⏳ [Smart OCR Vision] Waiting for backend response (this may take 3-12 minutes)...`);
    
    let response: Response;
    try {
      response = await fetch(FIREBASE_SMART_OCR_VISION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });
      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [Smart OCR Vision] Request completed in ${duration}s`);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (fetchError.name === 'AbortError' || abortSignal.aborted) {
        console.log(`⚠️ [Smart OCR Vision] Request cancelled/aborted after ${duration}s`);
        throw new Error(`Smart OCR Vision request cancelled: การสแกนถูกยกเลิก`);
      }
      console.error(`❌ [Smart OCR Vision] Fetch error after ${duration}s:`, fetchError);
      throw new Error(`Failed to connect to Smart OCR Vision service: ${fetchError.message}`);
    }

    console.log(`📡 [Smart OCR Vision] Response status: ${response.status}`)
    
    if (response.status === 503) {
      console.error(`❌ [Smart OCR Vision] Service unavailable (503)`);
      throw new Error("Smart OCR Vision service is temporarily unavailable. Please try again later.");
    }

    const responseText = await response.text()
    console.log(`📄 [Smart OCR Vision] Response text length: ${responseText.length}`)

    if (!response.ok) {
      console.error(`❌ [Smart OCR Vision] Error response:`, responseText)
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`
      )
    }

    // Check content-type
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ [Smart OCR Vision] Response is not JSON. Content-Type: ${contentType}`)
      throw new Error(
        `Invalid response format. Expected JSON but got ${contentType}. Response: ${responseText.substring(0, 200)}`
      )
    }

    // Parse JSON
    let data
    try {
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response body")
      }
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error(`❌ [Smart OCR Vision] Failed to parse JSON:`, parseError)
      throw new Error(
        `Failed to parse JSON response: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`
      )
    }

    console.log(`📄 [Smart OCR Vision] Response:`, {
      success: data.success,
      scanMode: data.scanMode,
      mode: data.mode,
      totalPages: data.totalPages,
      recordsCount: data.records?.length || 0,
      pagesCount: data.pages?.length || 0,
    })

    if (!data.success) {
      throw new Error(data.error || "Smart OCR Vision failed")
    }

    // Handle perPage response format
    if (data.scanMode === "perPage" && data.pages) {
      // PerPage mode: return pages array directly
      return {
        success: true,
        scanMode: "perPage",
        pages: data.pages,
        meta: data.meta || {},
      }
    }

    // Handle OCR mode response format
    if (data.scanMode === "ocr" && data.result) {
      // OCR mode: return OCR result
      return {
        success: true,
        scanMode: "ocr",
        result: data.result,
        meta: data.meta || {},
      }
    }

    // Vision mode (direct) response format: { success, mode, totalPages, totalRecords, records, meta }
    // Backend sends records with template labels (e.g., "ชื่อ-สกุล", "บ้านเลขที่")
    // Map to normalized format for frontend
    const normalizedRecords = (data.records || []).map((record, index) => {
      // Extract values from template labels or field keys
      const name = record["ชื่อ-สกุล"] || record.name || "";
      const houseNumber = record["บ้านเลขที่"] || record.houseNumber || "";
      const page = record.page || data.meta?.pagesProcessed || 1;
      
      return {
        page: page,
        name: name,
        houseNumber: houseNumber,
        // Preserve original record for debugging
        _original: record,
      };
    });
    
    return {
      success: true,
      records: normalizedRecords,
      metadata: {
        source: "smart-ocr-vision",
        mode: data.mode || "vision",
        pages: data.totalPages || 0,
        totalRecords: data.totalRecords || 0,
        progress: data.meta?.progress || null, // Include progress if available
        progressHistory: data.meta?.progressHistory || null, // Include detailed progress history
        ...(data.meta || {}),
      },
    }
  } catch (error) {
    console.error("❌ [Smart OCR Vision] Error:", error)
    throw error
  }
}
