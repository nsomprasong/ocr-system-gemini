// OCR Router - Gemini ONLY (no v1/v2 fallback)
// This project uses OCR Gemini exclusively
// v1 and v2 are maintained in separate projects and not used here

import { ocrFileGemini } from "./ocr.service.gemini"
import type { OCRResult } from "../../core/types"
import type { Template } from "../../template/template.schema"

interface UserProfile {
  enableTemplateMode?: boolean
  [key: string]: any
}

/**
 * Routes OCR request to OCR Gemini ONLY.
 * No fallback to v1/v2 - Gemini is the only supported version in this project.
 * 
 * @param imageFile - Image file to process
 * @param user - User profile with feature flag (optional, not used but kept for compatibility)
 * @param template - Selected template (optional)
 * @param options - OCR options (pageRange, startPage, endPage)
 * @returns OCRResult
 */
export async function routeOCR(
  imageFile: File,
  user: UserProfile | null = null,
  template: Template | null = null,
  options?: { pageRange?: string; startPage?: number; endPage?: number }
): Promise<OCRResult> {
  console.log(`🔀 [OCR Router] routeOCR called (Gemini ONLY):`, {
    fileName: imageFile.name,
    fileType: imageFile.type,
    hasUser: !!user,
    userEnableTemplateMode: user?.enableTemplateMode,
    hasTemplate: !!template,
    templateId: template?.templateId,
  })
  
  try {
    // Get rotation from template if available (manual rotation set by user)
    const rotation = template?.rotation !== undefined && template?.rotation !== null 
      ? template.rotation 
      : undefined;
    if (rotation !== undefined) {
      console.log(`🔄 [OCR Router] Using template rotation: ${rotation}°`)
    } else {
      console.log(`🔄 [OCR Router] No rotation in template, using auto-detect`)
    }
    
    // Always use Gemini - no fallback
    const scanMode = true // Always use scan mode when called from routeOCR (Scan page)
    console.log(`📋 [OCR Router] Calling ocrFileGemini with scanMode=${scanMode}, rotation=${rotation}, pageRange=${options?.pageRange || "all"}`)
    
    const result = await ocrFileGemini(imageFile, rotation, scanMode, options)
    console.log(`✅ [OCR Router] OCR Gemini success:`, {
      hasWords: !!(result?.words),
      wordsCount: result?.words?.length || 0,
      hasPage: !!(result?.page),
      pageWidth: result?.page?.width,
      pageHeight: result?.page?.height,
      fileName: result?.fileName,
    })
    
    // Validate result
    if (!result || !result.page || result.page.width === 0 || result.page.height === 0) {
      throw new Error("OCR Gemini returned invalid result (page size 0x0)")
    }
    
    return result
  } catch (error) {
    console.error(`❌ [OCR Router] OCR Gemini failed:`, error)
    console.error(`❌ [OCR Router] Error details:`, {
      message: error?.message,
      stack: error?.stack,
      errorName: error?.name,
    })
    // Don't fallback - throw error instead
    throw error
  }
}

/**
 * Convenience function for batch OCR processing.
 * Routes each file to OCR Gemini.
 * 
 * @param files - Array of image files
 * @param user - User profile with feature flag (optional, kept for compatibility)
 * @param template - Selected template (optional)
 * @returns Array of OCRResult (one per file)
 */
export async function routeOCRBatch(
  files: File[],
  user: UserProfile | null = null,
  template: Template | null = null
): Promise<OCRResult[]> {
  const results = await Promise.all(
    files.map((file) => routeOCR(file, user, template))
  )
  return results
}
