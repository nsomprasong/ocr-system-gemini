import type { OCRResult } from "../../core/types"
import type { Template } from "../../template/template.schema"
import { ocrFileGemini } from "../services/ocr.service.gemini"
import { routeOCR } from "../services/ocr.router"

// UserProfile interface (matches ocr.router.ts)
interface UserProfile {
  enableTemplateMode?: boolean
}

/**
 * Options for running OCR
 */
export interface RunOCROptions {
  /** Manual rotation (0, 90, 180, 270) - only used in template mode */
  rotation?: number
  /** Scan mode: true = batch mode (all pages), "perPage" = per-page mode, false = template mode (first page only) */
  scanMode?: boolean | string
  /** Page range options */
  pageRange?: string | number[]
  /** Start page (1-based, inclusive) */
  startPage?: number
  /** End page (1-based, inclusive) */
  endPage?: number
  /** Template to use for OCR (optional) */
  template?: Template | null
  /** User profile (optional, for template mode) */
  userProfile?: UserProfile | null
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number
  /** Session ID for status tracking (optional) */
  sessionId?: string | null
}

/**
 * Result of running OCR
 */
export interface RunOCRResult {
  /** OCR result with words and page info */
  ocrResult: OCRResult
  /** Normalized image base64 (only in template mode) */
  normalizedImageBase64?: string
  /** Normalized image URL (blob URL, only in template mode) */
  normalizedImageUrl?: string
}

/**
 * Runs OCR on a file with consistent logic for both Template Settings and Scan page.
 * 
 * This function ensures that:
 * - Template Settings and Scan page use the same OCR pipeline
 * - Results are consistent between preview and actual scanning
 * - Normalization pipeline is applied consistently
 * 
 * @param file - File to process (PDF or image)
 * @param options - OCR options
 * @returns OCR result with optional normalized image
 */
export async function runOCR(
  file: File,
  options: RunOCROptions = {}
): Promise<RunOCRResult> {
  const {
    rotation,
    scanMode = false,
    pageRange,
    startPage,
    endPage,
    template = null,
    userProfile = null,
    timeout = 5 * 60 * 1000, // 5 minutes default
    sessionId = null,
  } = options

  console.log("🔍 [runOCR] Starting OCR with unified pipeline...")
  console.log("📋 [runOCR] Options:", {
    fileName: file.name,
    fileType: file.type,
    rotation: rotation !== undefined ? `${rotation}°` : "auto-detect",
    scanMode,
    pageRange,
    startPage,
    endPage,
    hasTemplate: !!template,
    templateName: template?.templateName,
    hasUserProfile: !!userProfile,
  })

  // Build ocrOptions from page range parameters
  const ocrOptions: {
    pageRange?: string | number[]
    startPage?: number
    endPage?: number
    sessionId?: string
  } = {}

  if (startPage !== undefined || endPage !== undefined) {
    // Priority: startPage/endPage
    if (startPage !== undefined) ocrOptions.startPage = startPage
    if (endPage !== undefined) ocrOptions.endPage = endPage
    console.log(`📄 [runOCR] Using startPage/endPage: ${startPage || 1}-${endPage || "end"}`)
  } else if (pageRange !== undefined) {
    // Fallback: pageRange
    ocrOptions.pageRange = pageRange
    console.log(`📄 [runOCR] Using pageRange: ${pageRange}`)
  }
  
  // Add sessionId if provided
  if (sessionId) {
    ocrOptions.sessionId = sessionId
    console.log(`📋 [runOCR] Using sessionId: ${sessionId}`)
  }

  let ocrResult: OCRResult

    // Determine which OCR function to use
    if (template || userProfile) {
      // Use routeOCR (handles template and user profile)
      // But routeOCR hardcodes scanMode=true, so we need to use ocrFileGemini directly for perPage mode
      if (scanMode === "perPage") {
        console.log("📋 [runOCR] Using ocrFileGemini directly (perPage mode with template)")
        
        // Get rotation from template if available
        const rotationToSend = template?.rotation !== undefined && template?.rotation !== null 
          ? template.rotation 
          : (rotation !== 0 ? rotation : undefined)
        
        console.log(`🔄 [runOCR] Rotation: ${rotationToSend !== undefined ? `${rotationToSend}°` : "auto-detect"}`)
        console.log(`📋 [runOCR] Mode: PER-PAGE (batch scanning)`)
        
        ocrResult = await Promise.race([
          ocrFileGemini(
            file,
            rotationToSend,
            "perPage", // Send "perPage" string to backend
            Object.keys(ocrOptions).length > 0 ? ocrOptions : undefined
          ),
          new Promise<OCRResult>((_, reject) =>
            setTimeout(() => reject(new Error("OCR timeout: เกิน 5 นาที")), timeout)
          ),
        ])
      
      // Handle perPage response format
      if (ocrResult && typeof ocrResult === 'object' && 'scanMode' in ocrResult && ocrResult.scanMode === "perPage") {
        // Return the perPage result as-is (it has pages array)
        return {
          ocrResult: ocrResult as any, // PerPage result format
        }
      }
    } else {
      // Use routeOCR for batch mode (scanMode=true) or template mode
      console.log("📋 [runOCR] Using routeOCR (template/user profile mode)")
      
      ocrResult = await Promise.race([
        routeOCR(
          file,
          userProfile,
          template,
          Object.keys(ocrOptions).length > 0 ? ocrOptions : undefined
        ),
        new Promise<OCRResult>((_, reject) =>
          setTimeout(() => reject(new Error("OCR timeout: เกิน 5 นาที")), timeout)
        ),
      ])
    }
  } else {
    // Use ocrFileGemini directly (template settings mode)
    console.log("📋 [runOCR] Using ocrFileGemini (direct mode)")
    
    // Determine rotation to send
    // In template mode, send rotation if provided (non-zero)
    // In scan mode, rotation comes from template
    const rotationToSend = scanMode ? undefined : (rotation !== 0 ? rotation : undefined)
    
    console.log(`🔄 [runOCR] Rotation: ${rotationToSend !== undefined ? `${rotationToSend}°` : "auto-detect"}`)
    console.log(`📋 [runOCR] Mode: ${scanMode === "perPage" ? "PER-PAGE" : scanMode ? "SCAN" : "TEMPLATE"}`)
    
    ocrResult = await Promise.race([
      ocrFileGemini(
        file,
        rotationToSend,
        scanMode, // Can be boolean or "perPage" string
        Object.keys(ocrOptions).length > 0 ? ocrOptions : undefined
      ),
      new Promise<OCRResult>((_, reject) =>
        setTimeout(() => reject(new Error("OCR timeout: เกิน 5 นาที")), timeout)
      ),
    ])
    
    // Handle perPage response format
    if (ocrResult && typeof ocrResult === 'object' && 'scanMode' in ocrResult && ocrResult.scanMode === "perPage") {
      // Return the perPage result as-is (it has pages array)
      return {
        ocrResult: ocrResult as any, // PerPage result format
      }
    }
  }

  // Log OCR result summary
  console.log("📊 [runOCR] OCR completed:", {
    hasResult: !!ocrResult,
    hasWords: !!(ocrResult?.words),
    wordsCount: ocrResult?.words?.length || 0,
    hasPage: !!(ocrResult?.page),
    pageWidth: ocrResult?.page?.width,
    pageHeight: ocrResult?.page?.height,
    hasNormalizedImage: !!(ocrResult?.normalizedImageBase64),
  })

  // Extract normalized image if available (only in template mode)
  let normalizedImageUrl: string | undefined
  if (ocrResult.normalizedImageBase64 && !scanMode) {
    try {
      // Validate that normalizedImageBase64 is actually base64 image data
      const base64Data = ocrResult.normalizedImageBase64
      if (base64Data && base64Data.length > 100 && !base64Data.includes("token") && !base64Data.includes("error")) {
        console.log("📸 [runOCR] Creating blob URL from normalized image...")
        console.log(`📸 [runOCR] Base64 length: ${base64Data.length} bytes (${(base64Data.length / 1024).toFixed(2)} KB)`)
        console.log(`📸 [runOCR] Base64 preview: ${base64Data.substring(0, 50)}...`)
        
        // Create image element to check dimensions
        const img = new Image()
        const imagePromise = new Promise<{width: number, height: number}>((resolve, reject) => {
          img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight })
          }
          img.onerror = reject
          img.src = `data:image/png;base64,${base64Data}`
        })
        
        const normalizedImageBlob = await fetch(
          `data:image/png;base64,${base64Data}`
        ).then((r) => r.blob())
        normalizedImageUrl = URL.createObjectURL(normalizedImageBlob)
        
        // Check image dimensions
        try {
          const dimensions = await imagePromise
          console.log(`📐 [runOCR] Normalized image dimensions: ${dimensions.width}x${dimensions.height}`)
          console.log(`📐 [runOCR] OCR page dimensions: ${ocrResult.page?.width || "N/A"}x${ocrResult.page?.height || "N/A"}`)
          
          if (ocrResult.page) {
            const widthMatch = Math.abs(dimensions.width - ocrResult.page.width) < 1
            const heightMatch = Math.abs(dimensions.height - ocrResult.page.height) < 1
            if (widthMatch && heightMatch) {
              console.log(`✅ [runOCR] Image dimensions match OCR dimensions perfectly`)
            } else {
              console.warn(`⚠️ [runOCR] Image dimensions mismatch!`)
              console.warn(`   Image: ${dimensions.width}x${dimensions.height}`)
              console.warn(`   OCR: ${ocrResult.page.width}x${ocrResult.page.height}`)
              console.warn(`   Difference: ${Math.abs(dimensions.width - ocrResult.page.width)}x${Math.abs(dimensions.height - ocrResult.page.height)}`)
            }
          }
        } catch (dimError) {
          console.warn(`⚠️ [runOCR] Could not check image dimensions:`, dimError)
        }
        
        console.log(`✅ [runOCR] Normalized image URL created: ${normalizedImageUrl.substring(0, 50)}...`)
      } else {
        console.warn("⚠️ [runOCR] normalizedImageBase64 appears to be invalid (too short or contains token/error)")
        console.warn(`⚠️ [runOCR] Base64 preview: ${base64Data ? base64Data.substring(0, 100) : "null"}`)
      }
    } catch (err) {
      console.error("❌ [runOCR] Failed to create normalized image URL:", err)
    }
  }

  return {
    ocrResult,
    normalizedImageBase64: ocrResult.normalizedImageBase64,
    normalizedImageUrl,
  }
}
