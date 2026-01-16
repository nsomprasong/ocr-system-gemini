// PDF Service - สำหรับนับจำนวนหน้าของ PDF
import * as pdfjsLib from "pdfjs-dist"

// ตั้งค่า worker สำหรับ PDF.js
// NOTE: Use CDN worker that matches pdfjs-dist version 4.3.136
// The local worker file might be a different version, so use CDN instead
try {
  // Try to use CDN worker for version 4.3.136
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`
  console.log("✅ PDF.js worker configured from CDN (version 4.3.136)")
} catch (error) {
  // Fallback: disable worker if CDN fails
  console.warn("⚠️ Failed to set PDF.js worker, will use fallback method:", error.message)
  pdfjsLib.GlobalWorkerOptions.workerSrc = "" // Empty string disables worker
}

/**
 * Fallback method: Count PDF pages by parsing PDF binary directly
 * This method searches for /Count in the PDF trailer/catalog and Pages dictionary
 */
function countPagesFromBinary(arrayBuffer) {
  try {
    // IMPORTANT: Clone ArrayBuffer to avoid "detached ArrayBuffer" error
    // ArrayBuffer might be transferred/detached after being used by PDF.js
    const clonedBuffer = arrayBuffer.slice(0) // Clone the buffer
    const uint8Array = new Uint8Array(clonedBuffer)
    const textDecoder = new TextDecoder('latin1')
    
    // Read more data for better accuracy (first 2MB or full file if smaller)
    const readLength = Math.min(uint8Array.length, 2 * 1024 * 1024)
    const pdfText = textDecoder.decode(uint8Array.slice(0, readLength))
    
    // Method 1: Search for /Count in Pages dictionary (most reliable)
    // Pattern: /Type\s*/Pages[\s\S]*?/Count\s+(\d+)
    const pagesCountMatch = pdfText.match(/\/Type\s*\/Pages[\s\S]{0,500}?\/Count\s+(\d+)/)
    if (pagesCountMatch) {
      const count = parseInt(pagesCountMatch[1], 10)
      if (count > 0 && count < 10000) { // Sanity check
        console.log("📄 Found page count from Pages/Count:", count)
        return count
      }
    }
    
    // Method 2: Search for /Count in trailer (second most reliable)
    // Pattern: /Count\s+(\d+) near end of file
    const trailerText = textDecoder.decode(uint8Array.slice(Math.max(0, uint8Array.length - 50000))) // Last 50KB
    const countMatches = trailerText.match(/\/Count\s+(\d+)/g)
    if (countMatches && countMatches.length > 0) {
      // Get the last occurrence (usually in trailer)
      const lastMatch = countMatches[countMatches.length - 1]
      const count = parseInt(lastMatch.match(/\d+/)[0], 10)
      if (count > 0 && count < 10000) {
        console.log("📄 Found page count from trailer /Count:", count)
        return count
      }
    }
    
    // Method 3: Count /Type/Page occurrences (less reliable but works for most PDFs)
    const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g)
    if (pageMatches && pageMatches.length > 0) {
      const count = pageMatches.length
      if (count > 0 && count < 10000) {
        console.log("📄 Estimated page count from /Type/Page:", count)
        return count
      }
    }
    
    return null
  } catch (error) {
    console.warn("⚠️ Fallback page count method failed:", error.message)
    return null
  }
}

/**
 * นับจำนวนหน้าของ PDF
 * IMPORTANT: File object can only be read once, so we need to clone it
 */
export async function getPdfPageCount(file) {
  try {
    console.log("📄 Counting pages for PDF:", file.name, "size:", file.size, "bytes")
    
    // IMPORTANT: File.arrayBuffer() can only be called once per file
    // If file was already read, we need to create a new File object
    // Clone file by reading as blob and creating new File
    let arrayBuffer
    try {
      // Try to read file directly
      arrayBuffer = await file.arrayBuffer()
      console.log("📦 ArrayBuffer size:", arrayBuffer.byteLength, "bytes")
    } catch (readError) {
      console.warn("⚠️ Failed to read file directly, trying alternative method:", readError.message)
      // Alternative: Read as blob and convert
      const blob = file instanceof Blob ? file : new Blob([file])
      arrayBuffer = await blob.arrayBuffer()
      console.log("📦 ArrayBuffer size (from blob):", arrayBuffer.byteLength, "bytes")
    }
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("PDF file is empty or could not be read")
    }
    
    // Use binary parsing method only (fast, reliable, no worker issues, no timeout)
    // IMPORTANT: Clone ArrayBuffer before using
    console.log("🔄 Using binary parsing method: parsing PDF binary...")
    const fallbackArrayBuffer = arrayBuffer.slice(0) // Clone
    const pageCount = countPagesFromBinary(fallbackArrayBuffer)
    
    if (pageCount !== null && pageCount >= 1) {
      console.log("✅ PDF page count:", pageCount, "pages for", file.name)
      return pageCount
    }
    
    // If binary parsing fails, log warning but don't try PDF.js (to avoid timeout)
    console.warn("⚠️ Binary parsing failed to extract page count from PDF structure")
    
    // If all methods fail, throw error
    throw new Error("All page counting methods failed")
    
  } catch (error) {
    console.error("❌ Error counting PDF pages for", file.name, ":", error)
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      fileSize: file.size,
      fileType: file.type,
    })
    
    // ถ้านับไม่ได้ ให้ return 1 เป็นค่า default
    // แต่ log warning เพื่อให้ user รู้
    console.warn("⚠️ Failed to count PDF pages, defaulting to 1 page. This may cause incorrect credit calculation.")
    return 1
  }
}

/**
 * ตรวจสอบว่าเป็นไฟล์ PDF หรือไม่
 */
export function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}
