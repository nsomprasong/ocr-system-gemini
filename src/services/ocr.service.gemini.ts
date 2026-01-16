// OCR Service Gemini - Calls ocrImageGemini Cloud Function with Normalization Pipeline
// This is a NEW service file - uses Gemini pipeline instead of V2
// Uses the new normalization pipeline: PDF → Image → Normalize (detect orientation + rotate) → OCR

// Get URL from environment or use default
// Deployed function URL format: https://us-central1-{PROJECT_ID}.cloudfunctions.net/ocrImageGemini
// Priority: VITE_FIREBASE_OCR_GEMINI_URL > default URL
// Project: ocr-system-c3bea
const FIREBASE_OCR_GEMINI_URL = 
  import.meta.env.VITE_FIREBASE_OCR_GEMINI_URL || 
  "https://us-central1-ocr-system-c3bea.cloudfunctions.net/ocrImageGemini"

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
 * Calls OCR Gemini for image file.
 * Returns OCRResult with words and bounding boxes.
 * 
 * @param imageFile - Image file (JPG, PNG)
 * @param rotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @returns OCRResult with words array and page dimensions
 */
export async function ocrImageGemini(imageFile: File, rotation?: number) {
  try {
    console.log(`📸 [OCR Gemini] Converting image to base64: ${imageFile.name}`)
    const imageBase64 = await fileToBase64(imageFile)
    console.log(`✅ [OCR Gemini] Image converted, base64 length: ${imageBase64.length}`)

    console.log(`🌐 [OCR Gemini] Calling OCR Gemini API...`)
    const response = await fetch(FIREBASE_OCR_GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        fileName: imageFile.name,
        ...(rotation !== undefined && rotation !== null ? { rotation } : {}), // Include rotation if provided
      }),
    })

    console.log(`📡 [OCR Gemini] Response status: ${response.status}`)

    const responseText = await response.text()
    console.log(`📄 [OCR Gemini] Response text length: ${responseText.length}`)

    if (!response.ok) {
      console.error(`❌ [OCR Gemini] Error response:`, responseText)
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`
      )
    }

    // Check content-type
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ [OCR Gemini] Response is not JSON. Content-Type: ${contentType}`)
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
      console.error(`❌ [OCR Gemini] Failed to parse JSON:`, parseError)
      throw new Error(
        `Failed to parse JSON response: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`
      )
    }

    console.log(`📄 [OCR Gemini] Response:`, {
      success: data.success,
      wordsCount: data.result?.words?.length || 0,
    })

    if (!data.success) {
      throw new Error(data.error || "OCR Gemini failed")
    }

    // Return OCRResult
    return data.result
  } catch (error) {
    console.error("❌ [OCR Gemini] Error:", error)
    throw error
  }
}

/**
 * Calls OCR Gemini for PDF file.
 * Returns OCRResult with words and bounding boxes.
 * 
 * @param pdfFile - PDF file
 * @param rotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @param scanMode - If true, scan all pages and don't return normalized image. If false, scan first page only and return normalized image (for template setup)
 * @returns OCRResult with words array and page dimensions
 */
export async function ocrPdfGemini(pdfFile: File, rotation?: number, scanMode: boolean | string = false, options?: { pageRange?: string; startPage?: number; endPage?: number; sessionId?: string }) {
  try {
    console.log(`📄 [OCR Gemini] Converting PDF to base64: ${pdfFile.name}, scanMode: ${scanMode}`)
    const pdfBase64 = await fileToBase64(pdfFile)
    console.log(`✅ [OCR Gemini] PDF converted, base64 length: ${pdfBase64.length}`)

    const requestBody: any = {
      pdf_base64: pdfBase64,
      fileName: pdfFile.name,
      scanMode: scanMode, // Send scanMode to Firebase (boolean or string "perPage")
    }
    
    // Include rotation if provided (manual rotation from user)
    if (rotation !== undefined && rotation !== null) {
      requestBody.rotation = rotation
      console.log(`🔄 [OCR Gemini] Sending manual rotation: ${rotation}°`)
    }
    
    // Include startPage/endPage or pageRange if provided (for both scan mode and template mode)
    // Priority: startPage/endPage > pageRange
    // Note: Template mode can also use startPage/endPage to preview specific pages
    if (options?.startPage !== undefined || options?.endPage !== undefined) {
      // New: startPage/endPage (takes priority, works for both scanMode and template mode)
      if (options.startPage !== undefined) {
        requestBody.startPage = options.startPage
      }
      if (options.endPage !== undefined) {
        requestBody.endPage = options.endPage
      }
      console.log(`📄 [OCR Gemini] Sending page range: ${options.startPage || 1}-${options.endPage || "end"} (scanMode: ${scanMode})`)
    } else if (options?.pageRange) {
      // Existing: pageRange (only for scan mode)
      if (scanMode) {
        requestBody.pageRange = options.pageRange
        console.log(`📄 [OCR Gemini] Sending page range: ${options.pageRange}`)
      }
    }
    
    // Include sessionId if provided (for status tracking)
    if (options?.sessionId) {
      requestBody.sessionId = options.sessionId
      console.log(`📋 [OCR Gemini] Sending sessionId: ${options.sessionId}`)
    }
    
    console.log(`🌐 [OCR Gemini] Calling OCR Gemini API for PDF...`, {
      url: FIREBASE_OCR_GEMINI_URL,
      fileName: pdfFile.name,
      pdfBase64Length: pdfBase64.length,
      requestBodyKeys: Object.keys(requestBody),
    })
    
    const response = await fetch(FIREBASE_OCR_GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }).catch((fetchError) => {
      console.error(`❌ [OCR Gemini] Fetch error:`, fetchError);
      throw new Error(`Failed to connect to OCR service: ${fetchError.message}`);
    });

    console.log(`📡 [OCR Gemini] Response status: ${response.status}`)
    
    // Check for 503 Service Unavailable
    if (response.status === 503) {
      console.error(`❌ [OCR Gemini] Service unavailable (503) - Firebase function may be down or crashed`);
      throw new Error("OCR service is temporarily unavailable. Please try again later.");
    }

    const responseText = await response.text()
    console.log(`📄 [OCR Gemini] Response text length: ${responseText.length}`)

    if (!response.ok) {
      console.error(`❌ [OCR Gemini] Error response:`, responseText)
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`
      )
    }

    // Check content-type
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ [OCR Gemini] Response is not JSON. Content-Type: ${contentType}`)
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
      console.error(`❌ [OCR Gemini] Failed to parse JSON:`, parseError)
      throw new Error(
        `Failed to parse JSON response: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`
      )
    }

    console.log(`📄 [OCR Gemini] Response:`, {
      success: data.success,
      scanMode: data.scanMode,
      hasPages: !!(data.pages),
      pagesCount: data.pages?.length || 0,
      wordsCount: data.result?.words?.length || 0,
      hasResult: !!data.result,
      hasPage: !!data.result?.page,
      pageWidth: data.result?.page?.width,
      pageHeight: data.result?.page?.height,
      error: data.error,
    })

    if (!data.success) {
      console.error(`❌ [OCR Gemini] Firebase function returned error:`, data.error)
      throw new Error(data.error || "OCR Gemini failed")
    }

    // Handle perPage response format
    if (data.scanMode === "perPage" && data.pages) {
      console.log(`✅ [OCR Gemini] PerPage mode: Returning perPage result with ${data.pages.length} pages`)
      // Return perPage format as-is (has scanMode and pages array)
      return {
        scanMode: "perPage",
        pages: data.pages,
      }
    }

    // Handle standard response format (batch or template mode)
    // Validate result
    if (!data.result) {
      console.error(`❌ [OCR Gemini] Firebase function returned no result`)
      throw new Error("OCR Gemini returned no result")
    }

    if (!data.result.page || data.result.page.width === 0 || data.result.page.height === 0) {
      console.error(`❌ [OCR Gemini] Firebase function returned invalid page size:`, data.result.page)
      throw new Error(`OCR Gemini returned invalid page size: ${data.result.page?.width}x${data.result.page?.height}`)
    }

    // Return OCRResult
    console.log(`✅ [OCR Gemini] Returning valid result:`, {
      wordsCount: data.result.words?.length || 0,
      pageSize: `${data.result.page.width}x${data.result.page.height}`,
    })
    return data.result
  } catch (error) {
    console.error("❌ [OCR Gemini] Error:", error)
    throw error
  }
}

/**
 * Calls OCR Gemini based on file type (image or PDF).
 * Returns OCRResult with words and bounding boxes.
 * 
 * @param file - Image file (JPG, PNG) or PDF file
 * @param rotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @param scanMode - If true, scan all pages and don't return normalized image. If false, scan first page only and return normalized image (for template setup)
 * @returns OCRResult with words array and page dimensions
 */
export async function ocrFileGemini(file: File, rotation?: number, scanMode: boolean | string = false, options?: { pageRange?: string; startPage?: number; endPage?: number; sessionId?: string }) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  
  if (isPdf) {
    return await ocrPdfGemini(file, rotation, scanMode, options)
  } else {
    // Images don't need scanMode (always single page)
    return await ocrImageGemini(file, rotation)
  }
}
