// Smart OCR Service - Calls smartOcr Cloud Function
// Uses Gemini for semantic document understanding (no template layout)

// Get URL from environment or use default
// Deployed function URL (Cloud Run v2): https://smartocr-3vghmazr7q-uc.a.run.app
// Priority: VITE_FIREBASE_SMART_OCR_URL > deployed URL
const FIREBASE_SMART_OCR_URL = 
  import.meta.env.VITE_FIREBASE_SMART_OCR_URL || 
  "https://smartocr-3vghmazr7q-uc.a.run.app"

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
 * Calls Smart OCR for PDF file.
 * Returns JSON array of records (semantic understanding, no template layout).
 * 
 * @param pdfFile - PDF file
 * @param columnDefinitions - Column definitions from template (for Gemini mapping)
 * @param options - Options (startPage, endPage)
 * @returns Smart OCR result with records array and metadata
 */
export async function smartOcrPdf(
  pdfFile: File,
  columnDefinitions: Array<{ columnKey: string; label: string }>,
  options?: { startPage?: number; endPage?: number }
) {
  try {
    console.log(`🤖 [Smart OCR] Converting PDF to base64: ${pdfFile.name}`)
    const pdfBase64 = await fileToBase64(pdfFile)
    console.log(`✅ [Smart OCR] PDF converted, base64 length: ${pdfBase64.length}`)

    console.log(`📋 [Smart OCR] ColumnDefinitions before sending:`, {
      count: columnDefinitions.length,
      columns: columnDefinitions.map(c => `${c.columnKey}(${c.label})`).join(", "),
    })
    
    if (columnDefinitions.length === 0) {
      console.error(`❌ [Smart OCR] ERROR: columnDefinitions is empty! This will cause backend to skip Pass #2 and return empty records.`)
      throw new Error("columnDefinitions is empty. Please provide at least one column definition.")
    }
    
    const requestBody: any = {
      pdf_base64: pdfBase64,
      fileName: pdfFile.name,
      columnDefinitions: columnDefinitions,
    }
    
    if (options?.startPage !== undefined) {
      requestBody.startPage = options.startPage
    }
    if (options?.endPage !== undefined) {
      requestBody.endPage = options.endPage
    }
    
    console.log(`🌐 [Smart OCR] Calling Smart OCR API...`, {
      url: FIREBASE_SMART_OCR_URL,
      fileName: pdfFile.name,
      columnsCount: columnDefinitions.length,
      hasColumnDefinitions: !!requestBody.columnDefinitions && requestBody.columnDefinitions.length > 0,
    })
    
    // เพิ่ม timeout 12 นาที (720 วินาที) เพื่อให้พอดีกับ backend timeout (720 วินาที)
    const TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    
    const startTime = Date.now();
    console.log(`⏱️ [Smart OCR] Starting request with ${TIMEOUT_MS / 1000}s timeout...`);
    console.log(`⏳ [Smart OCR] Waiting for backend response (this may take 3-12 minutes)...`);
    
    let response: Response;
    try {
      response = await fetch(FIREBASE_SMART_OCR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [Smart OCR] Request completed in ${duration}s`);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (fetchError.name === 'AbortError') {
        console.error(`❌ [Smart OCR] Request timeout after ${duration}s`);
        throw new Error(`Smart OCR request timeout: เกิน ${TIMEOUT_MS / 1000} วินาที. กรุณาลองใหม่อีกครั้ง`);
      }
      console.error(`❌ [Smart OCR] Fetch error after ${duration}s:`, fetchError);
      throw new Error(`Failed to connect to Smart OCR service: ${fetchError.message}`);
    }

    console.log(`📡 [Smart OCR] Response status: ${response.status}`)
    
    if (response.status === 503) {
      console.error(`❌ [Smart OCR] Service unavailable (503)`);
      throw new Error("Smart OCR service is temporarily unavailable. Please try again later.");
    }

    const responseText = await response.text()
    console.log(`📄 [Smart OCR] Response text length: ${responseText.length}`)

    if (!response.ok) {
      console.error(`❌ [Smart OCR] Error response:`, responseText)
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`
      )
    }

    // Check content-type
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ [Smart OCR] Response is not JSON. Content-Type: ${contentType}`)
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
      console.error(`❌ [Smart OCR] Failed to parse JSON:`, parseError)
      throw new Error(
        `Failed to parse JSON response: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`
      )
    }

    console.log(`📄 [Smart OCR] Response:`, {
      success: data.success,
      recordsCount: data.records?.length || data.result?.records?.length || 0,
      source: data.result?.metadata?.source,
      confidence: data.result?.metadata?.confidence,
    })

    if (!data.success) {
      throw new Error(data.error || "Smart OCR failed")
    }

    // Handle new response format (records directly) or old format (result.records)
    if (data.records) {
      // New format: { success: true, meta: {...}, records: [...] }
      return {
        records: data.records,
        metadata: data.meta || {
          source: "smart-ocr",
          pages: data.meta?.totalPages || 0,
          confidence: "medium",
        },
      }
    } else if (data.result) {
      // Old format: { success: true, result: { records: [...], metadata: {...} } }
      return data.result
    } else {
      throw new Error("Invalid response format: missing records")
    }
  } catch (error) {
    console.error("❌ [Smart OCR] Error:", error)
    throw error
  }
}

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
  options?: { startPage?: number; endPage?: number }
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

    const requestBody: any = {
      pdf_base64: fileBase64,
      fileName: pdfFile.name,
      mimeType: mimeType,
    }
    
    console.log(`🌐 [Smart OCR Vision] Calling Smart OCR Vision API...`, {
      url: FIREBASE_SMART_OCR_VISION_URL,
      fileName: pdfFile.name,
      mimeType: mimeType,
    })
    
    // Timeout 12 minutes (720 seconds) to match backend timeout
    const TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    
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
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [Smart OCR Vision] Request completed in ${duration}s`);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (fetchError.name === 'AbortError') {
        console.error(`❌ [Smart OCR Vision] Request timeout after ${duration}s`);
        throw new Error(`Smart OCR Vision request timeout: เกิน ${TIMEOUT_MS / 1000} วินาที. กรุณาลองใหม่อีกครั้ง`);
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
      mode: data.mode,
      totalPages: data.totalPages,
      recordsCount: data.records?.length || 0,
    })

    if (!data.success) {
      throw new Error(data.error || "Smart OCR Vision failed")
    }

    // Vision mode response format: { success, mode, totalPages, totalRecords, records, meta }
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
      records: normalizedRecords,
      metadata: {
        source: "smart-ocr-vision",
        mode: data.mode || "vision",
        pages: data.totalPages || 0,
        totalRecords: data.totalRecords || 0,
        ...(data.meta || {}),
      },
    }
  } catch (error) {
    console.error("❌ [Smart OCR Vision] Error:", error)
    throw error
  }
}
