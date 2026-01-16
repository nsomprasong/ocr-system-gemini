// OCR Service V2 - DEPRECATED: Redirects to OCR Gemini
// This file is kept for backward compatibility but all functions redirect to Gemini
// DO NOT USE: Use ocr.service.gemini.ts instead

import { ocrImageGemini, ocrPdfGemini, ocrFileGemini } from "./ocr.service.gemini"

/**
 * DEPRECATED: Calls OCR v2 for image file.
 * Now redirects to OCR Gemini for backward compatibility.
 * 
 * @deprecated Use ocrImageGemini from ocr.service.gemini.ts instead
 * @param imageFile - Image file (JPG, PNG)
 * @param rotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @returns OCRResult with words array and page dimensions
 */
export async function ocrImageV2(imageFile: File, rotation?: number) {
  console.warn(`⚠️ [OCR V2] ocrImageV2 is deprecated. Redirecting to OCR Gemini...`)
  // Redirect to Gemini
  return await ocrImageGemini(imageFile, rotation)
}

/**
 * DEPRECATED: Calls OCR v2 for PDF file.
 * Now redirects to OCR Gemini for backward compatibility.
 * 
 * @deprecated Use ocrPdfGemini from ocr.service.gemini.ts instead
 * @param pdfFile - PDF file
 * @param rotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @param scanMode - If true, scan all pages and don't return normalized image. If false, scan first page only and return normalized image (for template setup)
 * @returns OCRResult with words array and page dimensions
 */
export async function ocrPdfV2(
  pdfFile: File, 
  rotation?: number, 
  scanMode: boolean | string = false, 
  options?: { pageRange?: string; startPage?: number; endPage?: number; sessionId?: string }
) {
  console.warn(`⚠️ [OCR V2] ocrPdfV2 is deprecated. Redirecting to OCR Gemini...`)
  // Redirect to Gemini
  return await ocrPdfGemini(pdfFile, rotation, scanMode, options)
}

/**
 * DEPRECATED: Calls OCR v2 based on file type (image or PDF).
 * Now redirects to OCR Gemini for backward compatibility.
 * 
 * @deprecated Use ocrFileGemini from ocr.service.gemini.ts instead
 * @param file - Image file (JPG, PNG) or PDF file
 * @param rotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @param scanMode - If true, scan all pages and don't return normalized image. If false, scan first page only and return normalized image (for template setup)
 * @returns OCRResult with words array and page dimensions
 */
export async function ocrFileV2(
  file: File, 
  rotation?: number, 
  scanMode: boolean | string = false, 
  options?: { pageRange?: string; startPage?: number; endPage?: number; sessionId?: string }
) {
  console.warn(`⚠️ [OCR V2] ocrFileV2 is deprecated. Redirecting to OCR Gemini...`)
  // Redirect to Gemini
  return await ocrFileGemini(file, rotation, scanMode, options)
}
