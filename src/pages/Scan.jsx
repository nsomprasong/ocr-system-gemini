import { useState, useEffect, useRef } from "react"
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Chip,
  Alert,
  IconButton,
  CircularProgress,
  Grid,
  AppBar,
  Toolbar,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  LinearProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from "@mui/material"
import CloudUploadIcon from "@mui/icons-material/CloudUpload"
import CloseIcon from "@mui/icons-material/Close"
import DescriptionIcon from "@mui/icons-material/Description"
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf"
import ImageIcon from "@mui/icons-material/Image"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import CancelIcon from "@mui/icons-material/Cancel"
import WarningIcon from "@mui/icons-material/Warning"
import { Slide } from "@mui/material"
import { getPdfPageCount, isPdfFile } from "../services/pdf.service"
import { auth, db } from "../firebase"
import { updateUserCredits, getUserProfile, deductCreditsFromFirebase, refundCreditsToFirebase } from "../services/user.service"
import { doc, onSnapshot, updateDoc } from "firebase/firestore"
// Removed: import { ocrFile } from "../services/ocr.service" - not used, using runOCR (v2) instead
import { extractDataFromText } from "../services/textProcessor.service"
import {
  createSeparateExcelFiles,
  createCombinedExcelFile,
  createExcelFile,
  createVisionExcelFile,
} from "../services/excel.service"
// Removed: import { runOCR } from "../utils/runOCR" - not used, using smartOcrVisionPdf directly
import { smartOcrVisionPdf } from "../services/smartOcr.service"
import { getDeviceId } from "../utils/deviceId"

// Batch Scan Configuration
const BATCH_SIZE = 10 // Number of pages per batch

/**
 * Parse page range string to array of page numbers
 * Examples:
 * - "1" → [1]
 * - "1-5" → [1,2,3,4,5]
 * - "1,3,5" → [1,3,5]
 * - "1,2-6,20-22" → [1,2,3,4,5,6,20,21,22]
 * @param {string} pageRange - Page range string
 * @param {number} totalPages - Total pages in PDF (for validation)
 * @returns {number[]|null} Array of page numbers or null for all pages
 */
function parsePageRange(pageRange, totalPages) {
  if (!pageRange || pageRange.trim() === "" || pageRange.trim().toLowerCase() === "all") {
    return null // null means all pages
  }

  const pages = new Set()
  const parts = pageRange.split(",").map(p => p.trim()).filter(p => p.length > 0)

  for (const part of parts) {
    if (part.includes("-")) {
      // Range: "1-5"
      const [start, end] = part.split("-").map(s => parseInt(s.trim(), 10))
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
        throw new Error(`Invalid page range: "${part}"`)
      }
      if (totalPages && end > totalPages) {
        throw new Error(`Page ${end} exceeds total pages (${totalPages})`)
      }
      for (let i = start; i <= end; i++) {
        pages.add(i)
      }
    } else {
      // Single page: "1"
      const pageNum = parseInt(part, 10)
      if (isNaN(pageNum) || pageNum < 1) {
        throw new Error(`Invalid page number: "${part}"`)
      }
      if (totalPages && pageNum > totalPages) {
        throw new Error(`Page ${pageNum} exceeds total pages (${totalPages})`)
      }
      pages.add(pageNum)
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b)
  return sortedPages.length > 0 ? sortedPages : null
}

/**
 * Calculate pages to scan based on user input
 * @param {string} pageRange - Page range string (e.g. "1,2-6,20-22")
 * @param {string} startPage - Start page number (string from input)
 * @param {string} endPage - End page number (string from input)
 * @param {number} totalPages - Total pages in PDF
 * @returns {number[]|null} Array of page numbers to scan, or null for all pages
 */
function calculatePagesToScan(pageRange, startPage, endPage, totalPages) {
  console.log(`🔍 [calculatePagesToScan] Input: pageRange="${pageRange}", startPage="${startPage}", endPage="${endPage}", totalPages=${totalPages}`)
  
  // Priority 1: startPage/endPage
  if (startPage || endPage) {
    const start = startPage ? parseInt(startPage, 10) : 1
    const end = endPage ? parseInt(endPage, 10) : totalPages
    console.log(`🔍 [calculatePagesToScan] Using startPage/endPage: start=${start}, end=${end}`)
    if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= start && end <= totalPages) {
      const result = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      console.log(`✅ [calculatePagesToScan] Result from startPage/endPage: [${result.join(', ')}]`)
      return result
    } else {
      console.log(`⚠️ [calculatePagesToScan] Invalid startPage/endPage, falling back to pageRange`)
    }
  }
  
  // Priority 2: pageRange string
  if (pageRange && pageRange.trim() !== "") {
    try {
      const result = parsePageRange(pageRange, totalPages)
      console.log(`✅ [calculatePagesToScan] Result from pageRange: ${result ? `[${result.join(', ')}]` : 'null (all pages)'}`)
      return result
    } catch (err) {
      console.error("❌ [calculatePagesToScan] Error parsing pageRange:", err)
      return null // Fallback to all pages
    }
  }
  
  // Default: all pages
  console.log(`📄 [calculatePagesToScan] No page range specified, returning null (all pages)`)
  return null
}

/**
 * Scan File State Structure
 * @typedef {Object} ScanFileState
 * @property {File} file
 * @property {string} originalName
 * @property {number} totalPages
 * @property {number[]|null} pagesToScan - Pages to scan (null = all pages)
 * @property {Set<number>} receivedPages
 * @property {Record<number, any>} pageResults - pageNumber -> OCRResult
 * @property {"pending" | "scanning" | "done" | "error"} status
 * @property {string} [error]
 */

export default function Scan({ credits, files, setFiles, onNext, columnConfig, onConsume }) {
  // Ensure files is always an array
  const safeFiles = Array.isArray(files) ? files : []
  
  const [loadingFiles, setLoadingFiles] = useState(new Set())
  const [mode, setMode] = useState("separate")
  const [scanMode, setScanMode] = useState("vision") // OCR or Vision mode: "ocr" | "vision"
  const [fileType, setFileType] = useState("xlsx")
  const [status, setStatus] = useState("idle")
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState("")
  const [currentFile, setCurrentFile] = useState("")
  const [error, setError] = useState("")
  const [ocrResults, setOcrResults] = useState([])
  const [pageRange, setPageRange] = useState("") // Page range string like "1,2-6,20-22"
  const [startPage, setStartPage] = useState("") // Start page number (1-based)
  const [endPage, setEndPage] = useState("") // End page number (1-based)
  
  // Batch Scan State
  const [scanQueue, setScanQueue] = useState([]) // Array of ScanFileState objects
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [currentBatch, setCurrentBatch] = useState({ start: 0, end: 0 })
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [isScanning, setIsScanning] = useState(false) // Track if scanning is in progress
  const [showCancelDialog, setShowCancelDialog] = useState(false) // Show cancel confirmation dialog
  const [cancelRequested, setCancelRequested] = useState(false) // Flag to request cancellation after current file (for UI)
  const cancelRequestedRef = useRef(false) // Ref to track cancellation in async functions
  const [abortController, setAbortController] = useState(null) // State to store AbortController for current scan
  const [showCreditErrorDialog, setShowCreditErrorDialog] = useState(false) // Show credit error dialog
  const [creditErrorInfo, setCreditErrorInfo] = useState(null) // Store credit error info: { fileState, error, queue, currentCredits, onCreditUpdate, fileIndex }
  const creditErrorResolveRef = useRef(null) // Ref to store promise resolve function for credit error dialog
  const scanStartTimeRef = useRef(null) // Start time of scanning (use ref for immediate access)
  const [elapsedTime, setElapsedTime] = useState(0) // Elapsed time in seconds
  const [currentSessionId, setCurrentSessionId] = useState(null) // Current scan session ID
  const progressListenerRef = useRef(null) // Ref for Firestore real-time listener unsubscribe function
  const [previewData, setPreviewData] = useState(null) // Preview data from Firestore: { pageResults: [], totalPages: number, currentFile: string }
  
  // Refs to access latest state in async functions
  const scanQueueRef = useRef([]) // Ref to track scanQueue state
  const safeFilesRef = useRef([]) // Ref to track safeFiles state
  
  // Update refs when state changes (must be after state and ref declarations)
  useEffect(() => {
    safeFilesRef.current = safeFiles
  }, [safeFiles])
  
  useEffect(() => {
    scanQueueRef.current = scanQueue
  }, [scanQueue])

  const handleSelect = async (fileList) => {
    try {
      setLoadingFiles(new Set(Array.from(fileList).map((f) => f.name)))
      
      const selected = await Promise.all(
        Array.from(fileList).map(async (f) => {
          let pageCount = 1
          
          // ถ้าเป็น PDF ให้นับจำนวนหน้าจริง
          if (isPdfFile(f)) {
            try {
              console.log("🔍 Processing PDF file:", f.name, "size:", f.size, "bytes")
              
              // IMPORTANT: Clone file before reading to avoid "file already read" error
              // Create a new File object from the original file
              const fileClone = new File([f], f.name, { type: f.type, lastModified: f.lastModified })
              
              pageCount = await getPdfPageCount(fileClone)
              console.log("📊 Page count result for", f.name, ":", pageCount, "pages")
              
              // Validate page count
              if (!pageCount || pageCount < 1 || !Number.isInteger(pageCount)) {
                console.warn("⚠️ Invalid page count:", pageCount, "for", f.name, "defaulting to 1")
                pageCount = 1
              }
            } catch (error) {
              console.error("❌ Error counting PDF pages for", f.name, ":", error)
              console.error("Error details:", {
                message: error.message,
                stack: error.stack,
                fileSize: f.size,
                fileType: f.type,
              })
              pageCount = 1
            }
          } else {
            // สำหรับไฟล์รูปภาพ ให้เป็น 1 หน้า
            pageCount = 1
          }
          
          return {
            file: f, // Keep original file object for actual processing
            originalName: f.name,
            pageCount,
          }
        })
      )
      
      setFiles((prev) => {
        const prevArray = Array.isArray(prev) ? prev : []
        return [...prevArray, ...selected]
      })
      setLoadingFiles(new Set())
      
      // If scanning is in progress, add new files to queue
      if (isScanning && scanQueueRef.current.length > 0) {
        const newFileStates = selected.map(fileItem => {
          // Calculate pagesToScan for new file (similar to handleRun)
          let pagesToScan = null // null = all pages
          
          // Only apply page range to single PDF file (if only one file in total)
          const totalFilesAfterAdd = safeFilesRef.current.length + selected.length
          if (totalFilesAfterAdd === 1 && isPdfFile(fileItem.file)) {
            try {
              pagesToScan = calculatePagesToScan(pageRange, startPage, endPage, fileItem.pageCount)
            } catch (err) {
              console.warn(`⚠️ [BatchScan] Error calculating pages for new file ${fileItem.originalName}:`, err)
              pagesToScan = null // Fallback to all pages
            }
          }
          
          return {
            file: fileItem.file,
            originalName: fileItem.originalName,
            totalPages: fileItem.pageCount,
            pagesToScan: pagesToScan, // Array of page numbers to scan, or null for all pages
            receivedPages: new Set(),
            pageResults: {},
            status: "pending",
          }
        })
        
        setScanQueue((prev) => [...prev, ...newFileStates])
        console.log(`📎 [BatchScan] Added ${newFileStates.length} new file(s) to queue during scan:`, newFileStates.map(f => f.originalName))
      }
    } catch (error) {
      console.error("❌ Error in handleSelect:", error)
      setError(`เกิดข้อผิดพลาดในการเลือกไฟล์: ${error.message}`)
      setLoadingFiles(new Set())
    }
  }

  const removeFile = (index) => {
    const fileToRemove = safeFiles[index]
    setFiles((prev) => prev.filter((_, i) => i !== index))
    
    // If scanning is in progress, also remove from queue
    if (isScanning && fileToRemove) {
      setScanQueue((prev) => prev.filter((fileState) => fileState.file !== fileToRemove.file))
      console.log(`🗑️ [BatchScan] Removed file from queue: ${fileToRemove.originalName}`)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleSelect(e.dataTransfer.files)
  }


  const totalPages = safeFiles.reduce((s, f) => s + f.pageCount, 0)
  const creditEnough = credits >= totalPages

  // Timer effect - update elapsed time every second when scanning
  useEffect(() => {
    if (status === "running") {
      // Set start time if not already set
      if (!scanStartTimeRef.current) {
        scanStartTimeRef.current = Date.now()
      }
      
      const interval = setInterval(() => {
        if (scanStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - scanStartTimeRef.current) / 1000)
          setElapsedTime(elapsed)
        }
      }, 1000)

      return () => clearInterval(interval)
    } else {
      // Reset timer when not running
      scanStartTimeRef.current = null
      setElapsedTime(0)
    }
  }, [status])

  // Format elapsed time to HH:MM:SS
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    } else {
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
  }

  // Generate session ID
  const generateSessionId = () => {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  // Start real-time progress listener
  const startProgressListener = (sessionId, deviceId) => {
    if (!sessionId) return
    
    const user = auth.currentUser;
    if (!user) {
      console.warn(`⚠️ [Progress] User not authenticated, cannot start listener`);
      return;
    }
    
    // Stop existing listener if any
    stopProgressListener()
    
    try {
      const progressRef = doc(db, "scanProgress", sessionId)
      
      // Set up real-time listener
      const unsubscribe = onSnapshot(
        progressRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const progressData = snapshot.data()
            
            // ตรวจสอบว่า progress document เป็นของ user คนนี้หรือไม่
            if (progressData.userId && progressData.userId !== user.uid) {
              console.warn(`⚠️ [Progress] Progress document belongs to different user (${progressData.userId} vs ${user.uid}), ignoring...`);
              stopProgressListener();
              return;
            }
            
            // ตรวจสอบว่า progress document เป็นของ device นี้หรือไม่ (ถ้ามี deviceId)
            if (deviceId && progressData.deviceId && progressData.deviceId !== deviceId) {
              console.warn(`⚠️ [Progress] Progress document belongs to different device (${progressData.deviceId} vs ${deviceId}), ignoring...`);
              stopProgressListener();
              return;
            }
            
            console.log(`📊 [Progress] Real-time update:`, progressData)
            
            // Update progress state
            if (progressData.percentage !== undefined) {
              setProgress(Math.min(100, progressData.percentage))
            }
            if (progressData.message) {
              setProgressMessage(progressData.message)
            }
            
            // Update preview data if pageResults are available
            // Only update if this progress update is for the current session
            if (progressData.sessionId === sessionId && progressData.pageResults && Array.isArray(progressData.pageResults)) {
              // Flatten all records from all pages for preview
              const allRecords = []
              progressData.pageResults.forEach(pageResult => {
                if (pageResult.records && Array.isArray(pageResult.records)) {
                  allRecords.push(...pageResult.records)
                }
              })
              
              setPreviewData({
                pageResults: progressData.pageResults,
                allRecords: allRecords,
                totalPages: progressData.totalPages || 0,
                currentPage: progressData.currentPage || 0,
                fileName: currentFile || "กำลังประมวลผล...",
                sessionId: sessionId, // Store sessionId to verify it matches
              })
              
              console.log(`📋 [Preview] Updated preview for session ${sessionId}: ${allRecords.length} records from ${progressData.pageResults.length} pages`, {
                sessionId: sessionId,
                fileName: currentFile,
                recordCount: allRecords.length,
                pageCount: progressData.pageResults.length
              })
            } else if (progressData.sessionId && progressData.sessionId !== sessionId) {
              console.warn(`⚠️ [Preview] Ignoring progress update from different session: ${progressData.sessionId} (current: ${sessionId})`)
            }
            
            // Stop listener if completed or error
            if (progressData.status === "completed" || progressData.status === "error") {
              console.log(`✅ [Progress] Scan ${progressData.status}, stopping listener...`)
              stopProgressListener()
            }
          } else {
            console.log(`📊 [Progress] No progress document found for session: ${sessionId}`)
          }
        },
        (error) => {
          console.error(`❌ [Progress] Listener error:`, error)
        }
      )
      
      // Store unsubscribe function
      progressListenerRef.current = unsubscribe
    } catch (error) {
      console.error(`❌ [Progress] Failed to start listener:`, error)
    }
  }

  // Stop progress listener
  const stopProgressListener = () => {
    if (progressListenerRef.current) {
      progressListenerRef.current()
      progressListenerRef.current = null
    }
  }

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      stopProgressListener()
    }
  }, [])

  // Custom error class for credit deduction errors
  class CreditDeductionError extends Error {
    constructor(message) {
      super(message)
      this.name = 'CreditDeductionError'
      this.isCreditError = true
    }
  }

  /**
   * Scan a single file using batch processing (perPage mode)
   * Processes pages in batches of BATCH_SIZE
   * @param {ScanFileState} fileState
   * @param {Array} queue - Array of ScanFileState objects (for progress calculation)
   * @param {number} currentCredits - Current user credits
   * @param {Function} onCreditUpdate - Callback to update credits
   */
  const scanSingleFile = async (fileState, queue, currentCredits, onCreditUpdate) => {
    fileState.status = "scanning"
    setCurrentFile(fileState.originalName)
    
    // Determine which pages to scan
    const pagesToScan = fileState.pagesToScan || Array.from({ length: fileState.totalPages }, (_, i) => i + 1)
    const actualTotalPages = pagesToScan.length
    
    console.log(`📄 [BatchScan] Starting scan for: ${fileState.originalName}`)
    console.log(`📄 [BatchScan] fileState.pagesToScan:`, fileState.pagesToScan)
    console.log(`📄 [BatchScan] Calculated pagesToScan:`, pagesToScan)
    console.log(`📄 [BatchScan] Total pages in file: ${fileState.totalPages}, Pages to scan: ${pagesToScan.length} (${pagesToScan.length === fileState.totalPages ? 'all' : pagesToScan.join(', ')})`)
    
    const user = auth.currentUser
    if (!user) {
      throw new Error("User not authenticated")
    }
    
    // Deduct credits for this file BEFORE sending to Firebase
    // Calculate pages to scan for this file
    const pagesToDeduct = actualTotalPages
    
    // Deduct credits from Firebase directly (fetch current value, deduct, save immediately)
    console.log(`💳 [BatchScan] Deducting credits from Firebase for ${fileState.originalName}: ${pagesToDeduct} pages`)
    setCurrentFile(`กำลังหักเครดิต: ${fileState.originalName}...`)
    
    let creditResult
    try {
      // ดึงเครดิตจาก Firebase, หัก, และบันทึกกลับทันที
      creditResult = await deductCreditsFromFirebase(user.uid, pagesToDeduct)
      console.log(`✅ [BatchScan] Credits deducted successfully: ${creditResult.previousCredits} -> ${creditResult.newCredits} (${creditResult.deducted} pages)`)
      
      // Update credits in parent component with actual value from Firebase
      if (onCreditUpdate) {
        onCreditUpdate(creditResult.deducted, creditResult.newCredits)
      }
    } catch (creditError) {
      console.error(`❌ [BatchScan] Failed to deduct credits:`, creditError)
      // Throw CreditDeductionError so we can handle it differently
      throw new CreditDeductionError(`ไม่สามารถหักเครดิตได้: ${creditError.message}`)
    }
    
    // Use the new credits from Firebase for next file
    const updatedCredits = creditResult.newCredits
    
    // Process all pages in one request (backend will process page by page)
    try {
      // Determine page range
      const startPage = pagesToScan[0]
      const endPage = pagesToScan[pagesToScan.length - 1]
      
      setCurrentBatch({ start: startPage, end: endPage })
      
      console.log(`📄 [Scan] Processing all pages: ${startPage}-${endPage} (${pagesToScan.length} pages)`)
      
      // Generate session ID (unique for this file)
      const sessionId = generateSessionId()
      setCurrentSessionId(sessionId)
      
      console.log(`🆔 [Scan] Generated sessionId for ${fileState.originalName}: ${sessionId}`)
      
      // Show initial progress
      setProgress(0)
      setProgressMessage(`กำลังเริ่มต้น...`)
      
      // Get device ID for device isolation
      const deviceId = getDeviceId()
      
      // Stop any existing listener first (should already be stopped, but ensure it)
      stopProgressListener()
      
      // Start real-time progress listener for this file's session
      startProgressListener(sessionId, deviceId)
      
      // Create AbortController for this scan
      const newAbortController = new AbortController()
      setAbortController(newAbortController)
      
      // Call smartOcrVisionPdf with perPage mode for all pages
      const visionResult = await smartOcrVisionPdf(fileState.file, {
        scanMode: "perPage", // Use perPage mode
        pageRange: pagesToScan, // Send pageRange array (supports ranges like 1,2,5-7)
        sessionId: sessionId, // Send sessionId to backend
        userId: user.uid, // Send userId to backend for user isolation
        deviceId: deviceId, // Send deviceId to backend for device isolation
        signal: newAbortController.signal, // Pass AbortSignal for cancellation
      }).finally(() => {
        // Stop listener when API call completes
        stopProgressListener()
        // Clear abortController when done
        setAbortController(null)
      })
        
      // Handle perPage response format from smartOcrVisionPdf
      if (!visionResult.success) {
        throw new Error(visionResult.error || "smartOcrVisionPdf failed")
      }
      
      // Display progress from backend (use progressHistory to show actual progress)
      if (visionResult.meta?.progressHistory && Array.isArray(visionResult.meta.progressHistory) && visionResult.meta.progressHistory.length > 0) {
        // Use the last progress entry from backend
        const lastProgress = visionResult.meta.progressHistory[visionResult.meta.progressHistory.length - 1]
        if (lastProgress) {
          setProgress(Math.min(95, lastProgress.percentage || 100))
          setProgressMessage(lastProgress.message || "ประมวลผลเสร็จสิ้น")
          
          // Log progress history for debugging
          console.log(`📊 [Scan] Progress history from backend:`, {
            totalEntries: visionResult.meta.progressHistory.length,
            lastProgress: lastProgress,
            allPages: visionResult.meta.progressHistory.filter(p => p.page).map(p => `Page ${p.page}: ${p.message}`)
          })
        }
      } else if (visionResult.meta?.progress) {
        setProgress(Math.min(95, visionResult.meta.progress.percentage || 100))
        setProgressMessage(visionResult.meta.progress.message || "ประมวลผลเสร็จสิ้น")
      } else {
        setProgress(95)
        setProgressMessage("ประมวลผลเสร็จสิ้น")
      }
      
      if (visionResult.scanMode === "perPage" && visionResult.pages) {
        // Per-page results format
        console.log(`✅ [Scan] Received ${visionResult.pages.length} pages (expected: ${pagesToScan.length})`)
        
        const receivedPageNumbers = []
        const pagesWithErrors = []
        const pagesWithNoData = []
        
        for (const pageResult of visionResult.pages) {
          // Only process pages that are in our pagesToScan list
          if (!pagesToScan.includes(pageResult.pageNumber)) {
            console.warn(`⚠️ [Scan] Skipping page ${pageResult.pageNumber} (not in pagesToScan)`)
            continue
          }
          
          // Handle error case
          if (pageResult.error) {
            console.error(`❌ [Scan] Page ${pageResult.pageNumber} error:`, pageResult.error)
            pagesWithErrors.push({ pageNumber: pageResult.pageNumber, error: pageResult.error })
            continue
          }
          
          // Handle null or missing data case
          if (!pageResult.data) {
            console.warn(`⚠️ [Scan] Page ${pageResult.pageNumber} has no data (null or missing)`)
            pagesWithNoData.push(pageResult.pageNumber)
            continue
          }
          
          // Valid page result
          fileState.pageResults[pageResult.pageNumber] = pageResult.data
          fileState.receivedPages.add(pageResult.pageNumber)
          receivedPageNumbers.push(pageResult.pageNumber)
          
          // Store Vision records if available (for Excel export)
          if (pageResult.records && Array.isArray(pageResult.records)) {
            if (!fileState.visionRecords) {
              fileState.visionRecords = {}
            }
            fileState.visionRecords[pageResult.pageNumber] = pageResult.records
            console.log(`💾 [Scan] Stored ${pageResult.records.length} Vision records for page ${pageResult.pageNumber} of file ${fileState.originalName}`, {
              fileName: fileState.originalName,
              pageNumber: pageResult.pageNumber,
              recordCount: pageResult.records.length,
              sessionId: sessionId
            })
          } else {
            console.warn(`⚠️ [Scan] Page ${pageResult.pageNumber} has no records (records: ${pageResult.records ? 'exists but not array' : 'missing'})`, {
              fileName: fileState.originalName,
              pageNumber: pageResult.pageNumber
            })
          }
          
          console.log(`✅ [Scan] Page ${pageResult.pageNumber} stored`)
        }
        
        // Log summary
        if (pagesWithErrors.length > 0) {
          console.error(`❌ [Scan] Has ${pagesWithErrors.length} pages with errors:`, pagesWithErrors.map(p => `${p.pageNumber}(${p.error})`).join(', '))
        }
        if (pagesWithNoData.length > 0) {
          console.warn(`⚠️ [Scan] Has ${pagesWithNoData.length} pages with no data:`, pagesWithNoData.join(', '))
        }
        
        console.log(`📊 [Scan] Received ${fileState.receivedPages.size}/${actualTotalPages} pages`)
        console.log(`📋 [Scan] Pages received: ${receivedPageNumbers.sort((a, b) => a - b).join(', ')}`)
        
        // Check if all expected pages were received
        // But if cancelled, don't throw error - just log and continue (will export partial data)
        const missingPages = pagesToScan.filter(pageNum => !fileState.receivedPages.has(pageNum))
        
        if (missingPages.length > 0) {
          if (cancelRequestedRef.current) {
            const receivedCount = fileState.receivedPages.size
            if (receivedCount > 0) {
              console.warn(`⚠️ [Scan] Missing pages (cancelled): ${missingPages.join(', ')} - will export partial data (${receivedCount} pages)`)
            } else {
              console.warn(`⚠️ [Scan] Missing pages (cancelled): ${missingPages.join(', ')} - no data to export (0 pages received)`)
            }
            // Don't throw error when cancelled - allow export of partial data (if any)
          } else {
            console.error(`❌ [Scan] Missing pages: ${missingPages.join(', ')}`)
            throw new Error(`Incomplete: missing pages ${missingPages.join(', ')}`)
          }
        } else {
          console.log(`✅ [Scan] Complete: all ${pagesToScan.length} pages received`)
        }
      } else {
        // Fallback: treat as single result (for backward compatibility)
        console.warn(`⚠️ [Scan] Received non-perPage result, treating as single page`)
        if (visionResult.result && visionResult.result.words) {
          const firstPage = pagesToScan[0] || 1
          fileState.pageResults[firstPage] = visionResult.result
          fileState.receivedPages.add(firstPage)
        }
      }
      
      // Update progress
      setBatchProgress({ 
        current: fileState.receivedPages.size, 
        total: actualTotalPages 
      })
      
      // Update overall progress
      const fileIndex = queue.findIndex(f => f.file === fileState.file)
      const overallFileProgressBase = 10 + (fileIndex / queue.length) * 80
      const overallFileProgressRange = 80 / queue.length
      const overallFileProgressWithin = (fileState.receivedPages.size / actualTotalPages) * overallFileProgressRange
      const totalProgress = overallFileProgressBase + overallFileProgressWithin
      
      setProgress(Math.min(90, totalProgress))
      
      const progressPercent = (fileState.receivedPages.size / actualTotalPages) * 100
      console.log(`📊 [Scan] Progress: ${fileState.receivedPages.size}/${actualTotalPages} pages (${progressPercent.toFixed(1)}%), total: ${totalProgress.toFixed(1)}%`)
      
      // Verify all pages were received
      // But if cancelled, don't throw error - just log and continue (will export partial data)
      const receivedCount = fileState.receivedPages.size
      const expectedCount = actualTotalPages
      
      // Check if cancelled and refund credits if needed (before checking completeness)
      if (cancelRequestedRef.current) {
        console.log(`⚠️ [Scan] User cancelled - calculating and refunding remaining credits for ${fileState.originalName}`)
        console.log(`📊 [Scan] Cancel refund calculation: pagesToDeduct=${pagesToDeduct}, fileState.visionRecords=`, fileState.visionRecords, `fileState.receivedPages=`, fileState.receivedPages)
        try {
          const totalPages = pagesToDeduct
          let processedPages = 0
          if (fileState.visionRecords && typeof fileState.visionRecords === 'object') {
            if (Array.isArray(fileState.visionRecords)) {
              processedPages = fileState.visionRecords.length
            } else {
              processedPages = Object.keys(fileState.visionRecords).length
            }
          } else if (fileState.receivedPages) {
            processedPages = fileState.receivedPages.size
          }
          const remainingPages = totalPages - processedPages
          
          console.log(`📊 [Scan] Refund calculation: totalPages=${totalPages}, processedPages=${processedPages}, remainingPages=${remainingPages}`)
          
          if (remainingPages > 0) {
            console.log(`💰 [Scan] Refunding remaining credits: ${remainingPages} pages (${processedPages}/${totalPages} processed)`)
            const refundResult = await refundCreditsToFirebase(user.uid, remainingPages)
            console.log(`✅ [Scan] Credits refunded: ${refundResult.previousCredits} -> ${refundResult.newCredits} (${refundResult.refunded} pages)`)
            if (onCreditUpdate) {
              onCreditUpdate(-refundResult.refunded, refundResult.newCredits)
            }
          } else {
            console.log(`ℹ️ [Scan] No remaining credits to refund (${processedPages}/${totalPages} pages processed)`)
          }
        } catch (refundError) {
          console.error(`❌ [Scan] Failed to refund remaining credits:`, refundError)
        }
      }
      
      if (receivedCount !== expectedCount) {
        if (cancelRequestedRef.current) {
          if (receivedCount > 0) {
            console.warn(`⚠️ [Scan] File ${fileState.originalName} incomplete (cancelled): ${receivedCount}/${expectedCount} pages - will export partial data`)
          } else {
            console.warn(`⚠️ [Scan] File ${fileState.originalName} incomplete (cancelled): ${receivedCount}/${expectedCount} pages - no data to export`)
          }
          // Don't throw error when cancelled - allow export of partial data (if any)
          fileState.status = "done" // Mark as done even if incomplete (due to cancellation)
        } else {
          console.error(`❌ [Scan] File ${fileState.originalName} incomplete: ${receivedCount}/${expectedCount} pages`)
          throw new Error(`File incomplete: ${receivedCount}/${expectedCount} pages received`)
        }
      } else {
        fileState.status = "done"
        console.log(`✅ [Scan] Completed: ${fileState.originalName} (${receivedCount}/${expectedCount} pages)`)
      }
      
    } catch (scanError) {
      console.error(`❌ [Scan] Error processing file:`, scanError)
      fileState.status = "error"
      fileState.error = `Scan failed: ${scanError.message}`
      
      // Check if error is due to cancellation
      const isCancelled = cancelRequestedRef.current || scanError.message?.includes('cancelled') || scanError.message?.includes('ยกเลิก')
      
      // Refund credits if error occurred after deduction (but not if user cancelled or credit deduction failed)
      const isCreditError = scanError.isCreditError || scanError.name === 'CreditDeductionError' || scanError.message?.includes('หักเครดิต')
      
      if (creditResult && !isCancelled && !isCreditError) {
        try {
          console.log(`💰 [Scan] Refunding credits for ${fileState.originalName}: ${pagesToDeduct} pages`)
          const refundResult = await refundCreditsToFirebase(user.uid, pagesToDeduct)
          console.log(`✅ [Scan] Credits refunded successfully: ${refundResult.previousCredits} -> ${refundResult.newCredits} (${refundResult.refunded} pages)`)
          
          // Update credits in parent component
          if (onCreditUpdate) {
            onCreditUpdate(-refundResult.refunded, refundResult.newCredits) // Negative to indicate refund
          }
        } catch (refundError) {
          console.error(`❌ [Scan] Failed to refund credits:`, refundError)
          // Don't throw - we've already logged the error
        }
      } else if (isCancelled) {
        // When cancelled, refund remaining credits (pages that were not processed)
        console.log(`⚠️ [Scan] User cancelled - calculating and refunding remaining credits for ${fileState.originalName}`)
        console.log(`📊 [Scan] Cancel refund calculation: pagesToDeduct=${pagesToDeduct}, fileState.visionRecords=`, fileState.visionRecords, `fileState.receivedPages=`, fileState.receivedPages)
        try {
          // Calculate remaining pages (pages that were deducted but not processed)
          // Use pagesToDeduct (which was deducted) as totalPages
          const totalPages = pagesToDeduct
          let processedPages = 0
          if (fileState.visionRecords && typeof fileState.visionRecords === 'object') {
            if (Array.isArray(fileState.visionRecords)) {
              processedPages = fileState.visionRecords.length
            } else {
              processedPages = Object.keys(fileState.visionRecords).length
            }
          } else if (fileState.receivedPages) {
            processedPages = fileState.receivedPages.size
          }
          const remainingPages = totalPages - processedPages
          
          console.log(`📊 [Scan] Refund calculation: totalPages=${totalPages}, processedPages=${processedPages}, remainingPages=${remainingPages}`)
          
          if (remainingPages > 0) {
            console.log(`💰 [Scan] Refunding remaining credits: ${remainingPages} pages (${processedPages}/${totalPages} processed)`)
            const refundResult = await refundCreditsToFirebase(user.uid, remainingPages)
            console.log(`✅ [Scan] Credits refunded: ${refundResult.previousCredits} -> ${refundResult.newCredits} (${refundResult.refunded} pages)`)
            if (onCreditUpdate) {
              onCreditUpdate(-refundResult.refunded, refundResult.newCredits)
            }
          } else {
            console.log(`ℹ️ [Scan] No remaining credits to refund (${processedPages}/${totalPages} pages processed)`)
          }
        } catch (refundError) {
          console.error(`❌ [Scan] Failed to refund remaining credits:`, refundError)
        }
      } else if (isCreditError) {
        console.log(`⚠️ [Scan] Credit deduction failed - not refunding (credits were not deducted)`)
      }
      
      // Try to export existing data if available
      if (fileState.visionRecords && Object.keys(fileState.visionRecords).length > 0) {
        console.log(`⚠️ [Scan] Error occurred but found existing data, attempting to export...`)
        try {
          // Convert visionRecords object to flat array
          let allVisionRecords = []
          if (typeof fileState.visionRecords === 'object' && !Array.isArray(fileState.visionRecords)) {
            const sortedPageNumbers = Object.keys(fileState.visionRecords)
              .map(Number)
              .sort((a, b) => a - b)
            for (const pageNum of sortedPageNumbers) {
              const pageRecords = fileState.visionRecords[pageNum]
              if (Array.isArray(pageRecords)) {
                allVisionRecords.push(...pageRecords)
              }
            }
          } else if (Array.isArray(fileState.visionRecords)) {
            allVisionRecords = fileState.visionRecords
          }
          
          if (allVisionRecords.length > 0) {
            console.log(`✅ [Scan] Exporting ${allVisionRecords.length} records despite error`)
            await exportSingleFile(fileState.originalName, allVisionRecords, "vision")
            setPreviewData(null)
            console.log(`✅ [Scan] Exported partial data successfully`)
          }
        } catch (exportError) {
          console.error(`❌ [Scan] Failed to export partial data:`, exportError)
        }
      }
      
      throw scanError
    }
  }

  /**
   * Export single file immediately after scan completion
   * @param {string} filename - Original filename
   * @param {Array} data - Extracted data rows
   * @returns {Promise<void>} Promise that resolves when download is complete
   */
  const exportSingleFile = async (filename, data, currentScanMode = "vision") => {
    const configToUse = columnConfig || []
    
    if (fileType === "xlsx") {
      if (mode === "separate") {
        // Export immediately as separate file
        const baseName = filename.replace(/\.[^/.]+$/, "")
        console.log(`💾 [BatchScan] Starting export: ${baseName}.xlsx (mode: ${currentScanMode})`)
        
        // Trigger download - use Vision Excel export if scanMode is "vision"
        if (currentScanMode === "vision") {
          createVisionExcelFile(data, `${baseName}.xlsx`)
        } else {
          createExcelFile(data, configToUse, `${baseName}.xlsx`)
        }
        
        // Wait for browser to process the download (give it time to start)
        // This ensures the download dialog appears and browser processes it
        await new Promise((resolve) => {
          // Use requestAnimationFrame to ensure browser has processed the download trigger
          requestAnimationFrame(() => {
            // Additional delay to ensure download starts
            setTimeout(() => {
              console.log(`✅ [BatchScan] Download initiated for: ${baseName}.xlsx`)
              resolve()
            }, 300) // 300ms should be enough for browser to start download
          })
        })
        
        console.log(`✅ [BatchScan] Export completed: ${baseName}.xlsx`)
      } else {
        // For combine mode, we'll collect all files and export at the end
        // This function won't be called in combine mode
      }
    } else {
      console.warn(`⚠️ [BatchScan] Word export not supported for single file export`)
    }
  }

  /**
   * Handle cancel scan request
   */
  const handleCancelScan = () => {
    setShowCancelDialog(true)
  }

  /**
   * Confirm cancel - send cancel request to backend, wait for current page to finish, then export data and refund credits
   */
  const handleConfirmCancel = async () => {
    setShowCancelDialog(false)
    setCancelRequested(true)
    cancelRequestedRef.current = true // Set ref immediately for async functions
    console.log(`⚠️ [BatchScan] Cancel requested - will finish current page then stop`)
    
    // Send cancel request to backend via Firestore (backend will stop after current page)
    if (currentSessionId) {
      try {
        const progressRef = doc(db, "scanProgress", currentSessionId)
        await updateDoc(progressRef, {
          cancelled: true,
          cancelRequestedAt: new Date().toISOString(),
        })
        console.log(`✅ [BatchScan] Cancel request sent to backend for session: ${currentSessionId}`)
        console.log(`⏳ [BatchScan] Waiting for current page to finish...`)
      } catch (error) {
        console.error(`❌ [BatchScan] Failed to send cancel request to backend:`, error)
      }
    }
    
    // Don't abort API call - let it finish current page
    // Don't stop progress listener - let it continue to receive updates
    // Export and refund will be handled in runScanQueue after current file finishes
  }

  /**
   * Cancel the cancel request
   */
  const handleCancelCancel = () => {
    setShowCancelDialog(false)
  }

  /**
   * Handle credit error dialog - user chose to retry
   */
  const handleCreditErrorRetry = () => {
    setShowCreditErrorDialog(false)
    if (creditErrorResolveRef.current) {
      creditErrorResolveRef.current('retry')
      creditErrorResolveRef.current = null
    }
  }

  /**
   * Handle credit error dialog - user chose to exit
   */
  const handleCreditErrorExit = () => {
    setShowCreditErrorDialog(false)
    if (creditErrorResolveRef.current) {
      creditErrorResolveRef.current('cancel')
      creditErrorResolveRef.current = null
    }
  }

  /**
   * Run scan queue - process all files with batch scanning
   * Uses scanQueueRef to access latest queue state (allows adding/removing files during scan)
   * @param {Array} initialQueue - Initial array of ScanFileState objects (for initial setup)
   * @param {number} initialCredits - Initial user credits
   * @param {Function} onCreditUpdate - Callback to update credits
   */
  const runScanQueue = async (initialQueue, initialCredits, onCreditUpdate) => {
    // Initialize queue from parameter, but will use ref for subsequent iterations
    if (!initialQueue || initialQueue.length === 0) {
      console.warn(`⚠️ [BatchScan] Initial scan queue is empty`)
      return
    }
    
    // Reset cancel flag (both state and ref)
    setCancelRequested(false)
    cancelRequestedRef.current = false
    
    // Update state for UI (initial queue)
    setScanQueue(initialQueue)
    scanQueueRef.current = initialQueue // Update ref
    setStatus("running")
    setIsScanning(true) // Mark scanning as in progress
    setProgress(0)
    setError("")
    setCurrentFile("กำลังเริ่มต้น...")
    scanStartTimeRef.current = Date.now() // Start timer
    setElapsedTime(0) // Reset elapsed time
    
    const fileData = [] // For combine mode - collect all files
    const combinedData = [] // For combine mode - collect all data rows
    
    // Track current credits (updated after each file)
    let currentCredits = initialCredits
    
    // Track processed file indices to avoid reprocessing
    const processedIndices = new Set()
    
    try {
      // Process files in a loop that checks for new files
      let processedCount = 0
      let currentIndex = 0
      
      // Keep processing until all files in queue are processed
      while (true) {
        // Check if cancel was requested - if so, stop immediately
        if (cancelRequestedRef.current) {
          console.log(`⚠️ [BatchScan] Cancel requested - stopping immediately`)
          break
        }
        
        // Get current queue from ref (may have changed if files were added/removed)
        const currentQueue = scanQueueRef.current
        
        // If we've processed all files in current queue, check for new files
        if (currentIndex >= currentQueue.length) {
          // Wait a bit and check again for new files
          await new Promise(resolve => setTimeout(resolve, 500))
          const updatedQueue = scanQueueRef.current
          
          // If queue hasn't changed, we're done
          if (updatedQueue.length === currentQueue.length) {
            console.log(`✅ [BatchScan] All files processed, no new files added`)
            break
          }
          
          // Queue has new files, continue processing
          console.log(`📎 [BatchScan] New files detected in queue: ${updatedQueue.length - currentQueue.length} new file(s)`)
          continue
        }
        
        const fileState = currentQueue[currentIndex]
        
        // Skip if already processed
        if (processedIndices.has(currentIndex)) {
          currentIndex++
          continue
        }
        
        // Skip if file was removed from files list
        const fileStillExists = safeFilesRef.current.some(f => f.file === fileState.file)
        if (!fileStillExists) {
          console.log(`⏭️ [BatchScan] Skipping removed file: ${fileState.originalName}`)
          processedIndices.add(currentIndex)
          currentIndex++
          continue
        }
        
        setCurrentFileIndex(processedCount)
        processedCount++
        
        console.log(`📄 [BatchScan] Processing file ${processedCount}/${currentQueue.length}: ${fileState.originalName} (index: ${currentIndex})`)
        
        // Clear preview and reset state for new file
        setPreviewData(null)
        setCurrentSessionId(null) // Reset session ID for new file
        setProgress(0)
        setProgressMessage("")
        
        // Ensure fileState has fresh state for this file
        // Reset visionRecords and pageResults to prevent data mixing
        if (!fileState.visionRecords) {
          fileState.visionRecords = {}
        } else {
          // Clear existing visionRecords to prevent mixing with previous file
          fileState.visionRecords = {}
        }
        if (!fileState.pageResults) {
          fileState.pageResults = {}
        } else {
          // Clear existing pageResults to prevent mixing with previous file
          fileState.pageResults = {}
        }
        if (!fileState.receivedPages) {
          fileState.receivedPages = new Set()
        } else {
          // Clear existing receivedPages to prevent mixing with previous file
          fileState.receivedPages.clear()
        }
        
        try {
          // Calculate pages to scan for this file
          const pagesToScan = fileState.pagesToScan || Array.from({ length: fileState.totalPages }, (_, i) => i + 1)
          const pagesToDeduct = pagesToScan.length
          
          // Note: Credit check will be done inside scanSingleFile by fetching from Firebase
          // We don't check here because credits might have changed from other devices
          
          // Scan file (credits will be deducted inside scanSingleFile by fetching from Firebase first)
          await scanSingleFile(fileState, currentQueue, currentCredits, (deducted, newCreditsFromFirebase) => {
            // Update current credits with actual value from Firebase
            if (newCreditsFromFirebase !== undefined) {
              currentCredits = newCreditsFromFirebase
            } else {
              // Fallback: deduct from current (should not happen)
              currentCredits = currentCredits - deducted
            }
            if (onCreditUpdate) {
              // Pass both deducted amount and new credits
              if (newCreditsFromFirebase !== undefined) {
                onCreditUpdate(deducted, newCreditsFromFirebase)
              } else {
                onCreditUpdate(deducted)
              }
            }
          })
          
          // Credits already deducted in scanSingleFile via callback above
          
          // Verify that all pages have been processed
          const expectedPages = fileState.pagesToScan ? fileState.pagesToScan.length : fileState.totalPages
          if (fileState.receivedPages.size !== expectedPages) {
            if (cancelRequestedRef.current) {
              if (fileState.receivedPages.size > 0) {
                console.warn(`⚠️ [BatchScan] File ${fileState.originalName} incomplete (cancelled): ${fileState.receivedPages.size}/${expectedPages} pages - will export partial data`)
                
                // Export partial data immediately when cancelled
                try {
                  let dataToExport = null
                  if (fileState.visionRecords) {
                    if (Array.isArray(fileState.visionRecords)) {
                      dataToExport = fileState.visionRecords
                    } else if (typeof fileState.visionRecords === 'object') {
                      const sortedPageNumbers = Object.keys(fileState.visionRecords).map(Number).sort((a, b) => a - b)
                      dataToExport = []
                      for (const pageNum of sortedPageNumbers) {
                        const pageRecords = fileState.visionRecords[pageNum]
                        if (Array.isArray(pageRecords)) {
                          dataToExport.push(...pageRecords)
                        }
                      }
                    }
                  }
                  
                  if (dataToExport && dataToExport.length > 0) {
                    console.log(`💾 [BatchScan] Exporting partial data on cancel: ${dataToExport.length} records`)
                    setCurrentFile(`กำลังดาวน์โหลดไฟล์ (ข้อมูลบางส่วน): ${fileState.originalName}...`)
                    setProgress(95)
                    setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                    await exportSingleFile(fileState.originalName, dataToExport, "vision")
                    console.log(`✅ [BatchScan] Partial data exported successfully`)
                  }
                } catch (exportError) {
                  console.error(`❌ [BatchScan] Failed to export partial data on cancel:`, exportError)
                }
              } else {
                console.warn(`⚠️ [BatchScan] File ${fileState.originalName} incomplete (cancelled): ${fileState.receivedPages.size}/${expectedPages} pages - no data to export`)
              }
            } else {
              console.warn(`⚠️ [BatchScan] File ${fileState.originalName} incomplete: ${fileState.receivedPages.size}/${expectedPages} pages`)
            }
            // Don't process incomplete files
            processedIndices.add(currentIndex)
            currentIndex++
            continue
          }
          
          // Combine all page results into single OCRResult (only after all pages are complete)
          if (fileState.receivedPages.size > 0) {
            // Sort page numbers
            const sortedPageNumbers = Array.from(fileState.receivedPages).sort((a, b) => a - b)
            
            // Combine words from all pages
            const allWords = []
            const pages = []
            let maxWidth = 0
            let maxHeight = 0
            
            for (const pageNum of sortedPageNumbers) {
              const pageResult = fileState.pageResults[pageNum]
              if (pageResult && pageResult.words) {
                // Add pageNumber to each word
                const pageWords = pageResult.words.map(word => ({
                  ...word,
                  pageNumber: pageNum,
                }))
                allWords.push(...pageWords)
                
                // Store page data
                pages.push({
                  pageNumber: pageNum,
                  width: pageResult.page?.width || 0,
                  height: pageResult.page?.height || 0,
                  words: pageWords,
                })
                
                maxWidth = Math.max(maxWidth, pageResult.page?.width || 0)
                maxHeight = Math.max(maxHeight, pageResult.page?.height || 0)
              }
            }
            
            // Create combined OCRResult
            const combinedResult = {
              fileName: fileState.originalName,
              page: {
                width: maxWidth,
                height: maxHeight,
              },
              words: allWords,
              pages: pages,
            }
            
            setOcrResults((prev) => [...prev, combinedResult])
            
            // Call Smart OCR to get records and export Excel
            if (!columnConfig || columnConfig.length === 0) {
              console.error(`❌ [BatchScan] Cannot call Smart OCR: columnConfig is empty or undefined`)
              console.error(`❌ [BatchScan] columnConfig:`, columnConfig)
              setError(`ไม่พบการตั้งค่าคอลัมน์ (columnConfig) ไม่สามารถเรียก Smart OCR ได้`)
            } else if (!fileState.file) {
              console.error(`❌ [BatchScan] Cannot call Smart OCR: file is missing`)
            } else {
              try {
                console.log(`🤖 [BatchScan] Calling Smart OCR for: ${fileState.originalName}`)
                console.log(`📋 [BatchScan] ColumnConfig:`, columnConfig.length, "columns", columnConfig.map(c => `${c.key}(${c.label})`).join(", "))
                
                // Convert columnConfig to columnDefinitions format
                const columnDefinitions = columnConfig.map((col) => ({
                  columnKey: col.key,
                  label: col.label || col.key,
                }))
                console.log(`📋 [BatchScan] ColumnDefinitions:`, columnDefinitions.length, "columns", columnDefinitions.map(c => `${c.columnKey}(${c.label})`).join(", "))
                
            // Use Vision records from scanSingleFile if available (avoid duplicate API call)
            let smartOcrResult = null
            
            // Convert visionRecords object to flat array if it exists
            let allVisionRecords = []
            if (fileState.visionRecords) {
              if (Array.isArray(fileState.visionRecords)) {
                // Already an array
                allVisionRecords = fileState.visionRecords
              } else if (typeof fileState.visionRecords === 'object') {
                // Convert object to array (visionRecords[pageNumber] = records[])
                const sortedPageNumbers = Object.keys(fileState.visionRecords)
                  .map(Number)
                  .sort((a, b) => a - b)
                for (const pageNum of sortedPageNumbers) {
                  const pageRecords = fileState.visionRecords[pageNum]
                  if (Array.isArray(pageRecords)) {
                    allVisionRecords.push(...pageRecords)
                  }
                }
              }
            }
            
            if (allVisionRecords.length > 0) {
              console.log(`✅ [BatchScan] Using Vision records from scanSingleFile: ${allVisionRecords.length} records`)
              console.log(`📊 [BatchScan] visionRecords structure:`, {
                isObject: typeof fileState.visionRecords === 'object' && !Array.isArray(fileState.visionRecords),
                isArray: Array.isArray(fileState.visionRecords),
                keys: fileState.visionRecords ? Object.keys(fileState.visionRecords) : [],
                totalRecords: allVisionRecords.length,
              })
              smartOcrResult = {
                records: allVisionRecords,
                metadata: {
                  source: "smart-ocr-vision",
                  mode: "vision",
                  pages: fileState.totalPages || 0,
                  totalRecords: allVisionRecords.length,
                },
              }
              setProgress(90)
              setProgressMessage("กำลังเตรียมข้อมูลสำหรับส่งออก...")
            } else {
              // Fallback: call smartOcrVisionPdf if Vision records not available
              console.warn(`⚠️ [BatchScan] No Vision records found in fileState.visionRecords, calling API again...`)
              console.log(`📊 [BatchScan] visionRecords state:`, {
                exists: !!fileState.visionRecords,
                type: typeof fileState.visionRecords,
                isArray: Array.isArray(fileState.visionRecords),
                isObject: typeof fileState.visionRecords === 'object' && fileState.visionRecords !== null,
                keys: fileState.visionRecords ? Object.keys(fileState.visionRecords) : [],
              })
              const apiName = "Smart OCR Vision"
              console.log(`⏱️ [BatchScan] Starting ${apiName} with 15-minute timeout...`)
              setCurrentFile(`กำลังประมวลผล ${apiName}: ${fileState.originalName}...`)
              
              // Reset progress for new file (100% = 1 file)
              setProgress(0)
              setProgressMessage("กำลังเริ่มต้น...")
              
              // Progress tracking for Vision mode
              let progressInterval = null
              const totalPages = fileState.pageCount || 1
              let progressStep = 0
              
              progressInterval = setInterval(() => {
                progressStep += 1.2
                if (progressStep <= 20) {
                  setProgress(Math.min(20, progressStep))
                  setProgressMessage(`กำลังแปลง PDF เป็นภาพ หน้าที่ 1/${totalPages}...`)
                } else if (progressStep <= 95) {
                  const extractionProgress = progressStep - 20
                  const extractionRange = 95 - 20
                  const pageProgress = (extractionProgress / extractionRange) * totalPages
                  const currentPage = Math.min(totalPages, Math.max(1, Math.ceil(pageProgress)))
                  setProgress(Math.min(95, progressStep))
                  setProgressMessage(`กำลังส่งภาพเข้า Gemini หน้าที่ ${currentPage}/${totalPages}...`)
                } else {
                  setProgress(Math.min(100, progressStep))
                  setProgressMessage("กำลังประมวลผลข้อมูล...")
                }
              }, 1500)
              
              smartOcrResult = await smartOcrVisionPdf(fileState.file).then((result) => {
                if (progressInterval) {
                  clearInterval(progressInterval)
                  progressInterval = null
                }
                if (result.metadata?.progressHistory && Array.isArray(result.metadata.progressHistory)) {
                  const lastProgress = result.metadata.progressHistory[result.metadata.progressHistory.length - 1]
                  if (lastProgress) {
                    setProgress(lastProgress.percentage || 100)
                    setProgressMessage(lastProgress.message || "ประมวลผลเสร็จสิ้น")
                  }
                } else if (result.metadata?.progress) {
                  setProgress(result.metadata.progress.percentage || 100)
                  setProgressMessage(result.metadata.progress.message || "ประมวลผลเสร็จสิ้น")
                } else {
                  setProgress(100)
                  setProgressMessage("ประมวลผลเสร็จสิ้น")
                }
                return result
              })
              
              if (progressInterval) {
                clearInterval(progressInterval)
                progressInterval = null
              }
              
              console.log(`✅ [BatchScan] Smart OCR API call completed`)
              setProgress(90)
              setProgressMessage("กำลังเตรียมข้อมูลสำหรับส่งออก...")
            }
            
            console.log(`📊 [BatchScan] Smart OCR result:`, {
              hasRecords: !!(smartOcrResult?.records),
              recordsCount: smartOcrResult?.records?.length || 0,
              confidence: smartOcrResult?.metadata?.confidence,
              source: smartOcrResult?.metadata?.source,
            })
            
            if (smartOcrResult && smartOcrResult.records && smartOcrResult.records.length > 0) {
                  console.log(`✅ [BatchScan] Smart OCR Vision completed: ${smartOcrResult.records.length} records`)
                  
                  // Send raw records to Excel export (will be mapped to Excel format in excel.service.js)
                  // 1 record = 1 row in Excel
                  
                  // Export immediately if mode is "separate"
                  if (mode === "separate") {
                    console.log(`💾 [BatchScan] Exporting file immediately: ${fileState.originalName}`)
                    setCurrentFile(`กำลังดาวน์โหลดไฟล์: ${fileState.originalName}...`)
                    setProgress(Math.min(90, 10 + (processedCount / currentQueue.length) * 80))
                    
                    // Export single file immediately and wait for download to complete
                    // Pass raw records, not mapped rows
                    // Use Vision Excel export (Vision mode only)
                    setProgress(95)
                    setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                    await exportSingleFile(fileState.originalName, smartOcrResult.records, "vision")
                    
                    // Clear preview after export
                    setPreviewData(null)
                    
                    console.log(`✅ [BatchScan] File exported and download completed: ${fileState.originalName}`)
                    setProgress(100)
                    setProgressMessage("เสร็จสิ้น")
                    
                    // Small delay to ensure download dialog is processed
                    await new Promise((resolve) => setTimeout(resolve, 200))
                  } else {
                    // For combine mode, collect data for later export
                    fileData.push({
                      filename: fileState.originalName,
                      data: smartOcrResult.records, // Send raw records
                    })
                    combinedData.push(...smartOcrResult.records)
                    console.log(`✅ [BatchScan] Added ${smartOcrResult.records.length} records to combined data for ${fileState.originalName}`)
                  }
                } else {
                  // Safety guard: Check if response.success === false
                  if (smartOcrResult && smartOcrResult.success === false) {
                    const errorMsg = smartOcrResult.error || "Unknown error"
                    console.error(`❌ [BatchScan] Smart OCR Vision failed for: ${fileState.originalName}`)
                    console.error(`❌ [BatchScan] Error:`, errorMsg)
                    setError(`Smart OCR Vision ไม่สามารถแยกข้อมูลได้สำหรับ ${fileState.originalName}. ${errorMsg}`)
                  } else if (!smartOcrResult || !smartOcrResult.records || smartOcrResult.records.length === 0) {
                    // Safety guard: Check if records.length === 0
                    const errorMsg = smartOcrResult?.metadata?.errorMessage || "ไม่พบข้อมูล"
                    console.error(`❌ [BatchScan] Smart OCR Vision returned no records for: ${fileState.originalName}`)
                    console.error(`❌ [BatchScan] Error message:`, errorMsg)
                    setError(`Smart OCR Vision ไม่พบข้อมูลสำหรับ ${fileState.originalName}. ${errorMsg}`)
                  } else {
                    const errorMsg = smartOcrResult?.metadata?.errorMessage || "Unknown error"
                    const validationErrors = smartOcrResult?.metadata?.validationErrors || []
                    console.error(`❌ [BatchScan] Smart OCR Vision returned no records for: ${fileState.originalName}`)
                    console.error(`❌ [BatchScan] Error message:`, errorMsg)
                    console.error(`❌ [BatchScan] Validation errors:`, validationErrors)
                    console.error(`❌ [BatchScan] Full result:`, smartOcrResult)
                    setError(`Smart OCR Vision ไม่สามารถแยกข้อมูลได้สำหรับ ${fileState.originalName}. ${errorMsg}`)
                  }
                }
              } catch (smartOcrError) {
                console.error(`❌ [BatchScan] Smart OCR failed for ${fileState.originalName}:`, smartOcrError)
                console.error(`❌ [BatchScan] Error details:`, {
                  message: smartOcrError.message,
                  stack: smartOcrError.stack,
                  name: smartOcrError.name,
                })
                
                // Try to export existing data if available
                let hasExported = false
                if (previewData && previewData.allRecords && previewData.allRecords.length > 0) {
                  console.log(`⚠️ [BatchScan] Error occurred but found preview data, attempting to export...`)
                  try {
                    if (mode === "separate") {
                      console.log(`💾 [BatchScan] Exporting partial data: ${previewData.allRecords.length} records`)
                      setCurrentFile(`กำลังดาวน์โหลดไฟล์ (ข้อมูลบางส่วน): ${fileState.originalName}...`)
                      setProgress(95)
                      setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                      await exportSingleFile(fileState.originalName, previewData.allRecords, "vision")
                      setPreviewData(null)
                      hasExported = true
                      console.log(`✅ [BatchScan] Exported partial data successfully`)
                    } else {
                      // For combine mode, add to combined data
                      fileData.push({
                        filename: fileState.originalName,
                        data: previewData.allRecords,
                      })
                      combinedData.push(...previewData.allRecords)
                      hasExported = true
                      console.log(`✅ [BatchScan] Added partial data to combined export`)
                    }
                  } catch (exportError) {
                    console.error(`❌ [BatchScan] Failed to export partial data:`, exportError)
                  }
                } else if (fileState.visionRecords && Object.keys(fileState.visionRecords).length > 0) {
                  console.log(`⚠️ [BatchScan] Error occurred but found visionRecords, attempting to export...`)
                  try {
                    // Convert visionRecords object to flat array
                    let allVisionRecords = []
                    if (typeof fileState.visionRecords === 'object' && !Array.isArray(fileState.visionRecords)) {
                      const sortedPageNumbers = Object.keys(fileState.visionRecords)
                        .map(Number)
                        .sort((a, b) => a - b)
                      for (const pageNum of sortedPageNumbers) {
                        const pageRecords = fileState.visionRecords[pageNum]
                        if (Array.isArray(pageRecords)) {
                          allVisionRecords.push(...pageRecords)
                        }
                      }
                    } else if (Array.isArray(fileState.visionRecords)) {
                      allVisionRecords = fileState.visionRecords
                    }
                    
                    if (allVisionRecords.length > 0) {
                      if (mode === "separate") {
                        console.log(`💾 [BatchScan] Exporting partial data: ${allVisionRecords.length} records`)
                        setCurrentFile(`กำลังดาวน์โหลดไฟล์ (ข้อมูลบางส่วน): ${fileState.originalName}...`)
                        setProgress(95)
                        setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                        await exportSingleFile(fileState.originalName, allVisionRecords, "vision")
                        setPreviewData(null)
                        hasExported = true
                        console.log(`✅ [BatchScan] Exported partial data successfully`)
                      } else {
                        // For combine mode, add to combined data
                        fileData.push({
                          filename: fileState.originalName,
                          data: allVisionRecords,
                        })
                        combinedData.push(...allVisionRecords)
                        hasExported = true
                        console.log(`✅ [BatchScan] Added partial data to combined export`)
                      }
                    }
                  } catch (exportError) {
                    console.error(`❌ [BatchScan] Failed to export partial data:`, exportError)
                  }
                }
                
                // Update UI to show error
                if (hasExported) {
                  setError(`Smart OCR failed for ${fileState.originalName} แต่ได้ export ข้อมูลบางส่วนแล้ว: ${smartOcrError.message}`)
                  setProgress(100)
                  setProgressMessage("export ข้อมูลบางส่วนเสร็จสิ้น")
                } else {
                  setError(`Smart OCR failed for ${fileState.originalName}: ${smartOcrError.message}`)
                  setProgress(95)
                  setCurrentFile(`เกิดข้อผิดพลาด: ${fileState.originalName}`)
                }
                
                // Continue without blocking the scan process
                console.log(`⚠️ [BatchScan] Continuing scan process despite Smart OCR error`)
              }
            }
            
            // Old template-based extraction (disabled)
            if (false && combinedResult.words && combinedResult.page) {
              console.log(`📝 [BatchScan] Extracting data using buildRows for ${fileState.originalName} (${allWords.length} words from ${pages.length} pages)...`)
              const rows = buildRows(combinedResult, selectedTemplate)
              console.log(`✅ [BatchScan] Extracted ${rows.length} rows from ${fileState.originalName}`)
              
              // Convert rows to fileData format
              const configToUse = columnConfig || []
              const data = rows.map((row, rowIdx) => {
                const newRow = {}
                
                selectedTemplate.columns.forEach((templateCol) => {
                  const columnKey = templateCol.columnKey
                  const colConfig = configToUse?.find(c => c.key === columnKey)
                  
                  if (templateCol.defaultValue) {
                    newRow[columnKey] = templateCol.defaultValue
                    return
                  }
                  
                  if (colConfig && colConfig.mode === "manual") {
                    newRow[columnKey] = colConfig.manualValue || ""
                    return
                  }
                  
                  newRow[columnKey] = row[columnKey] || ""
                })
                
                const filenameCol = configToUse?.find(
                  (col) => (col.label && (col.label.includes("ชื่อไฟล์") || col.label.includes("filename"))) ||
                           (col.key && (col.key.includes("filename") || col.key.includes("file")))
                )
                if (filenameCol && rowIdx === 0) {
                  newRow[filenameCol.key] = fileState.originalName
                }
                
                return newRow
              })
              
              // Export immediately if mode is "separate"
              if (mode === "separate") {
                console.log(`💾 [BatchScan] Exporting file immediately: ${fileState.originalName}`)
                setCurrentFile(`กำลังดาวน์โหลดไฟล์: ${fileState.originalName}...`)
                setProgress(Math.min(90, 10 + (processedCount / currentQueue.length) * 80))
                
                // Export single file immediately and wait for download to complete
                await exportSingleFile(fileState.originalName, data)
                
                console.log(`✅ [BatchScan] File exported and download completed: ${fileState.originalName}`)
                
                // Small delay to ensure download dialog is processed
                await new Promise((resolve) => setTimeout(resolve, 200))
              } else {
                // For combine mode, collect data for later export
                fileData.push({
                  filename: fileState.originalName,
                  data,
                })
                combinedData.push(...data)
                console.log(`✅ [BatchScan] Added ${data.length} rows to combined data for ${fileState.originalName}`)
              }
            }
          }
          
          // Mark this file as processed and move to next
          processedIndices.add(currentIndex)
          currentIndex++
          
          // Check if cancel was requested after finishing current file
          // If cancelled, export existing data, refund remaining credits, and stop
          // IMPORTANT: Check BEFORE removing file from list, so we can export data from fileState
          if (cancelRequestedRef.current) {
            console.log(`⚠️ [BatchScan] Cancel requested - checking for data to export and refunding credits`)
            
            // Export existing data if available (from current fileState first, then previewData)
            let hasExported = false
            let dataToExport = null
            
            // First, try to get data from current fileState (just completed)
            if (fileState.visionRecords) {
              if (Array.isArray(fileState.visionRecords)) {
                dataToExport = fileState.visionRecords
                console.log(`📊 [BatchScan] Found data in current fileState.visionRecords (array): ${dataToExport.length} records`)
              } else if (typeof fileState.visionRecords === 'object') {
                // Convert object to array
                const sortedPageNumbers = Object.keys(fileState.visionRecords).map(Number).sort((a, b) => a - b)
                dataToExport = []
                for (const pageNum of sortedPageNumbers) {
                  const pageRecords = fileState.visionRecords[pageNum]
                  if (Array.isArray(pageRecords)) {
                    dataToExport.push(...pageRecords)
                  }
                }
                console.log(`📊 [BatchScan] Found data in current fileState.visionRecords (object): ${dataToExport.length} records from ${sortedPageNumbers.length} pages`)
              }
            } else if (fileState.pageResults && Object.keys(fileState.pageResults).length > 0) {
              // Fallback: try to get data from pageResults
              console.log(`📊 [BatchScan] Found data in fileState.pageResults: ${Object.keys(fileState.pageResults).length} pages`)
              // Convert pageResults to records format (if needed)
              // This depends on your data structure
            }
            
            // If no data from current fileState, try previewData
            if ((!dataToExport || dataToExport.length === 0) && previewData && previewData.allRecords && previewData.allRecords.length > 0) {
              dataToExport = previewData.allRecords
              console.log(`📊 [BatchScan] Found data in previewData: ${dataToExport.length} records`)
            }
            
            // Only export if we have data
            if (dataToExport && dataToExport.length > 0) {
              try {
                if (mode === "separate") {
                  console.log(`💾 [BatchScan] Exporting data before cancel: ${dataToExport.length} records`)
                  setCurrentFile(`กำลังดาวน์โหลดไฟล์ (ข้อมูลที่มีอยู่): ${fileState.originalName}...`)
                  setProgress(95)
                  setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                  await exportSingleFile(fileState.originalName, dataToExport, "vision")
                  setPreviewData(null)
                  hasExported = true
                } else {
                  // For combine mode, add to combined data
                  fileData.push({
                    filename: fileState.originalName,
                    data: dataToExport,
                  })
                  combinedData.push(...dataToExport)
                  hasExported = true
                }
              } catch (exportError) {
                console.error(`❌ [BatchScan] Failed to export data before cancel:`, exportError)
              }
            } else {
              console.log(`ℹ️ [BatchScan] No data to export (0 records found)`)
            }
            
            // Calculate and refund remaining credits
            // Credits were deducted for all pages, so refund pages that were not processed
            try {
              const pagesToScan = fileState.pagesToScan || Array.from({ length: fileState.totalPages }, (_, i) => i + 1)
              const totalPages = pagesToScan.length
              // Count processed pages from visionRecords or receivedPages
              let processedPages = 0
              if (fileState.visionRecords && typeof fileState.visionRecords === 'object') {
                if (Array.isArray(fileState.visionRecords)) {
                  processedPages = fileState.visionRecords.length
                } else {
                  processedPages = Object.keys(fileState.visionRecords).length
                }
              } else if (fileState.receivedPages) {
                processedPages = fileState.receivedPages.size
              }
              const remainingPages = totalPages - processedPages
              
              if (remainingPages > 0) {
                const user = auth.currentUser
                if (user) {
                  console.log(`💰 [BatchScan] Refunding remaining credits: ${remainingPages} pages (${processedPages}/${totalPages} processed)`)
                  const refundResult = await refundCreditsToFirebase(user.uid, remainingPages)
                  console.log(`✅ [BatchScan] Credits refunded: ${refundResult.previousCredits} -> ${refundResult.newCredits} (${refundResult.refunded} pages)`)
                  
                  if (onCreditUpdate) {
                    onCreditUpdate(-refundResult.refunded, refundResult.newCredits)
                  }
                }
              } else {
                console.log(`ℹ️ [BatchScan] No remaining credits to refund (${processedPages}/${totalPages} pages processed)`)
              }
            } catch (refundError) {
              console.error(`❌ [BatchScan] Failed to refund remaining credits:`, refundError)
            }
            
            // Show warning message
            setError(`การสแกนถูกยกเลิก - ${hasExported ? 'ได้ export ข้อมูลที่มีอยู่แล้ว' : 'ไม่มีข้อมูลให้ export'} - เครดิตหน้าที่เหลือได้คืนแล้ว`)
            setCurrentFile(`ยกเลิกการสแกน - ไฟล์ ${fileState.originalName} เสร็จแล้ว`)
            setCancelRequested(true) // Update state for UI
            setStatus("idle")
            setIsScanning(false)
            scanStartTimeRef.current = null // Stop timer
            setElapsedTime(0) // Reset timer
            stopProgressListener() // Stop progress listener
            // Stop scanning, but remaining files (not scanned) are still in the list (don't remove them)
            break
          }
        } catch (fileError) {
          console.error(`❌ [BatchScan] Error processing file ${fileState.originalName}:`, fileError)
          fileState.status = "error"
          fileState.error = fileError.message
          
          // Try to export existing data if available (before checking credit error)
          let hasExported = false
          if (previewData && previewData.allRecords && previewData.allRecords.length > 0) {
            console.log(`⚠️ [BatchScan] Error occurred but found preview data, attempting to export...`)
            try {
              if (mode === "separate") {
                console.log(`💾 [BatchScan] Exporting partial data: ${previewData.allRecords.length} records`)
                setCurrentFile(`กำลังดาวน์โหลดไฟล์ (ข้อมูลบางส่วน): ${fileState.originalName}...`)
                setProgress(95)
                setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                await exportSingleFile(fileState.originalName, previewData.allRecords, "vision")
                setPreviewData(null)
                hasExported = true
                console.log(`✅ [BatchScan] Exported partial data successfully`)
              } else {
                // For combine mode, add to combined data
                fileData.push({
                  filename: fileState.originalName,
                  data: previewData.allRecords,
                })
                combinedData.push(...previewData.allRecords)
                hasExported = true
                console.log(`✅ [BatchScan] Added partial data to combined export`)
              }
            } catch (exportError) {
              console.error(`❌ [BatchScan] Failed to export partial data:`, exportError)
            }
          } else if (fileState.visionRecords && Object.keys(fileState.visionRecords).length > 0) {
            console.log(`⚠️ [BatchScan] Error occurred but found visionRecords, attempting to export...`)
            try {
              // Convert visionRecords object to flat array
              let allVisionRecords = []
              if (typeof fileState.visionRecords === 'object' && !Array.isArray(fileState.visionRecords)) {
                const sortedPageNumbers = Object.keys(fileState.visionRecords)
                  .map(Number)
                  .sort((a, b) => a - b)
                for (const pageNum of sortedPageNumbers) {
                  const pageRecords = fileState.visionRecords[pageNum]
                  if (Array.isArray(pageRecords)) {
                    allVisionRecords.push(...pageRecords)
                  }
                }
              } else if (Array.isArray(fileState.visionRecords)) {
                allVisionRecords = fileState.visionRecords
              }
              
              if (allVisionRecords.length > 0) {
                if (mode === "separate") {
                  console.log(`💾 [BatchScan] Exporting partial data: ${allVisionRecords.length} records`)
                  setCurrentFile(`กำลังดาวน์โหลดไฟล์ (ข้อมูลบางส่วน): ${fileState.originalName}...`)
                  setProgress(95)
                  setProgressMessage("กำลังดาวน์โหลดไฟล์...")
                  await exportSingleFile(fileState.originalName, allVisionRecords, "vision")
                  setPreviewData(null)
                  hasExported = true
                  console.log(`✅ [BatchScan] Exported partial data successfully`)
                } else {
                  // For combine mode, add to combined data
                  fileData.push({
                    filename: fileState.originalName,
                    data: allVisionRecords,
                  })
                  combinedData.push(...allVisionRecords)
                  hasExported = true
                  console.log(`✅ [BatchScan] Added partial data to combined export`)
                }
              }
            } catch (exportError) {
              console.error(`❌ [BatchScan] Failed to export partial data:`, exportError)
            }
          }
          
          if (hasExported) {
            setError(`เกิดข้อผิดพลาดสำหรับ ${fileState.originalName} แต่ได้ export ข้อมูลบางส่วนแล้ว: ${fileError.message}`)
            setProgress(100)
            setProgressMessage("export ข้อมูลบางส่วนเสร็จสิ้น")
          }
          
          // Check if this is a credit deduction error
          const isCreditError = fileError.isCreditError || fileError.name === 'CreditDeductionError' || fileError.message?.includes('หักเครดิต')
          
          if (isCreditError) {
            // For credit errors, stop scanning and show dialog to let user choose
            console.log(`💳 [BatchScan] Credit deduction failed for ${fileState.originalName} - stopping scan and showing dialog`)
            setError(`ไม่สามารถหักเครดิตได้สำหรับ ${fileState.originalName}: ${fileError.message}`)
            
            // Store error info for dialog
            setCreditErrorInfo({
              fileState,
              error: fileError,
              queue,
              currentCredits,
              onCreditUpdate,
              fileIndex: i,
              processedCount
            })
            
            // Show dialog and wait for user decision
            const userDecision = await new Promise((resolve) => {
              creditErrorResolveRef.current = resolve
              setShowCreditErrorDialog(true)
            })
            
            // User decision: 'retry' or 'cancel'
            if (userDecision === 'cancel') {
              // User chose to exit - stop scanning
              console.log(`⚠️ [BatchScan] User chose to exit after credit error`)
              setCancelRequested(true)
              cancelRequestedRef.current = true
              break
            } else if (userDecision === 'retry') {
              // User chose to retry - try deducting credits again
              console.log(`🔄 [BatchScan] User chose to retry credit deduction for ${fileState.originalName}`)
              try {
                // Reset file state
                fileState.status = "pending"
                fileState.error = null
                
                // Try to deduct credits again
                const pagesToScan = fileState.pagesToScan || Array.from({ length: fileState.totalPages }, (_, i) => i + 1)
                const pagesToDeduct = pagesToScan.length
                
                const user = auth.currentUser
                if (!user) {
                  throw new Error("User not authenticated")
                }
                
                const creditResult = await deductCreditsFromFirebase(user.uid, pagesToDeduct)
                console.log(`✅ [BatchScan] Credits deducted successfully on retry: ${creditResult.previousCredits} -> ${creditResult.newCredits}`)
                
                // Update credits
                if (creditResult.newCredits !== undefined) {
                  currentCredits = creditResult.newCredits
                }
                if (onCreditUpdate) {
                  onCreditUpdate(creditResult.deducted, creditResult.newCredits)
                }
                
                // Continue with scanning this file - go back one iteration to retry this file
                // Decrement processedCount because we're retrying this file
                processedCount--
                i-- // Go back one iteration to retry this file
                continue
              } catch (retryError) {
                // Retry also failed - show dialog again
                console.error(`❌ [BatchScan] Retry credit deduction also failed:`, retryError)
                setError(`ไม่สามารถหักเครดิตได้อีกครั้ง: ${retryError.message}`)
                
                // Check if it's still a credit error
                const isStillCreditError = retryError.isCreditError || retryError.name === 'CreditDeductionError' || retryError.message?.includes('หักเครดิต')
                
                if (isStillCreditError) {
                  // Show dialog again
                  const retryDecision = await new Promise((resolve) => {
                    creditErrorResolveRef.current = resolve
                    setShowCreditErrorDialog(true)
                  })
                  
                  if (retryDecision === 'cancel') {
                    setCancelRequested(true)
                    cancelRequestedRef.current = true
                    break
                  } else {
                    // User chose to retry again - recursively retry
                    i-- // Go back one iteration to retry this file again
                    continue
                  }
                } else {
                  // Different error - treat as scanning error
                  throw retryError
                }
              }
            }
          } else {
            // For scanning errors, refund credits if error occurred after deduction (but not if user cancelled)
            if (!cancelRequestedRef.current) {
              try {
                // Calculate pages that were deducted for this file
                const pagesToScan = fileState.pagesToScan || Array.from({ length: fileState.totalPages }, (_, i) => i + 1)
                const pagesToDeduct = pagesToScan.length
                
                const user = auth.currentUser
                if (user && pagesToDeduct > 0) {
                  console.log(`💰 [BatchScan] Refunding credits for ${fileState.originalName}: ${pagesToDeduct} pages`)
                  const refundResult = await refundCreditsToFirebase(user.uid, pagesToDeduct)
                  console.log(`✅ [BatchScan] Credits refunded successfully: ${refundResult.previousCredits} -> ${refundResult.newCredits} (${refundResult.refunded} pages)`)
                  
                  // Update credits in parent component
                  if (onCreditUpdate) {
                    onCreditUpdate(-refundResult.refunded, refundResult.newCredits) // Negative to indicate refund
                  }
                }
              } catch (refundError) {
                console.error(`❌ [BatchScan] Failed to refund credits:`, refundError)
                // Don't throw - we've already logged the error
              }
            } else {
              console.log(`⚠️ [BatchScan] User cancelled - not refunding credits for ${fileState.originalName}`)
            }
            
            // For scanning errors, remove the file (scanning already started or failed)
            // But if cancelled, don't remove remaining files
            if (!cancelRequestedRef.current) {
              console.log(`❌ [BatchScan] Scanning error for ${fileState.originalName} - removing file from list`)
              setError(`เกิดข้อผิดพลาดในการประมวลผล ${fileState.originalName}: ${fileError.message}`)
              setFiles((prev) => prev.filter((fileItem) => fileItem.file !== fileState.file))
              // Continue with next file
              continue
            } else {
              console.log(`⚠️ [BatchScan] Scanning error for ${fileState.originalName} but cancelled - stopping scan`)
              // Stop scanning if cancelled
              break
            }
          }
        }
      }
      
      // Export combined file (only for combine mode, after all files are processed)
      // Only export if not cancelled
      if (!cancelRequestedRef.current && mode === "combine" && combinedData.length > 0) {
        const totalRows = combinedData.length
        console.log(`💾 [BatchScan] All files processed. Downloading combined file with ${totalRows} total rows...`)
        setCurrentFile("กำลังดาวน์โหลดไฟล์รวม...")
        setProgress(95)
        
        const configToUse = columnConfig || []
        
        if (fileType === "xlsx") {
          createCombinedExcelFile(fileData, configToUse, "combined.xlsx")
        } else {
      setError("ไฟล์ Word ต้องใช้ Backend API เท่านั้น กรุณาเปลี่ยนเป็น Excel")
      setStatus("idle")
      setIsScanning(false)
      setScanStartTime(null) // Stop timer
      setElapsedTime(0) // Reset timer
      return
        }
      }
      
      // Update status based on whether cancelled or completed
      if (cancelRequestedRef.current) {
        setStatus("idle")
        setProgress(0)
        setCurrentFile("ยกเลิกการสแกนแล้ว")
        setError("")
        setIsScanning(false)
        setCancelRequested(true) // Update state for UI
        cancelRequestedRef.current = false // Reset ref
        scanStartTimeRef.current = null // Stop timer
        
        // Keep remaining files in the queue (don't remove them)
        // Only clear scan queue and progress, but keep files list
        setTimeout(() => {
          setCurrentFile("")
        setCancelRequested(false) // Reset state after timeout
        setElapsedTime(0) // Reset timer
        stopProgressListener() // Stop progress listener
        // Don't clear files - keep remaining files for user to scan again
        // Only clear scan queue and progress
        setScanQueue([])
        setCurrentFileIndex(0)
        setCurrentBatch({ start: 0, end: 0 })
        setBatchProgress({ current: 0, total: 0 })
        }, 2000)
      } else {
        setStatus("success")
        // Clear preview after all files are exported
        setPreviewData(null)
        setProgress(100)
        setIsScanning(false) // Mark scanning as complete
        scanStartTimeRef.current = null // Stop timer
        stopProgressListener() // Stop progress listener
        
        setTimeout(() => {
          setStatus("idle")
          setProgress(0)
          setCurrentFile("")
          setElapsedTime(0) // Reset timer
          // Only clear files if queue is empty (all files processed)
          if (scanQueue.length === 0) {
            setFiles([])
          }
          setScanQueue([])
          setCurrentFileIndex(0)
          setCurrentBatch({ start: 0, end: 0 })
          setBatchProgress({ current: 0, total: 0 })
        }, 2000)
      }
    } catch (err) {
      console.error("❌ [BatchScan] Export Error:", err)
      setError(`เกิดข้อผิดพลาด: ${err.message}`)
      setStatus("idle")
      setProgress(0)
      setCurrentFile("")
      setScanStartTime(null) // Stop timer
      setElapsedTime(0) // Reset timer
      stopStatusPolling() // Stop polling status
    }
  }

  const handleRun = async () => {
    if (!creditEnough || safeFiles.length === 0) return

    const user = auth.currentUser
    if (!user) return

    // Calculate pages to scan for each file
    // For now, only support page range for single PDF file
    const queue = safeFiles.map((fileItem, index) => {
      let pagesToScan = null // null = all pages
      
      // Only apply page range to single PDF file
      if (safeFiles.length === 1 && isPdfFile(fileItem.file)) {
        try {
          console.log(`🔍 [Scan] Calculating pages to scan for ${fileItem.originalName}:`)
          console.log(`   - pageRange: "${pageRange}" (type: ${typeof pageRange})`)
          console.log(`   - startPage: "${startPage}" (type: ${typeof startPage})`)
          console.log(`   - endPage: "${endPage}" (type: ${typeof endPage})`)
          console.log(`   - totalPages: ${fileItem.pageCount}`)
          
          pagesToScan = calculatePagesToScan(pageRange, startPage, endPage, fileItem.pageCount)
          
          if (pagesToScan) {
            console.log(`✅ [Scan] File ${fileItem.originalName}: Will scan ${pagesToScan.length} pages (${pagesToScan.join(', ')}) out of ${fileItem.pageCount} total pages`)
          } else {
            console.log(`📄 [Scan] File ${fileItem.originalName}: Will scan all ${fileItem.pageCount} pages (pagesToScan is null)`)
          }
        } catch (err) {
          console.error(`❌ [Scan] Error calculating pages to scan for ${fileItem.originalName}:`, err)
          setError(`เกิดข้อผิดพลาดในการคำนวณช่วงหน้า: ${err.message}`)
          throw err
        }
      } else {
        // For multiple files or non-PDF, scan all pages
        pagesToScan = null
        console.log(`📄 [Scan] File ${fileItem.originalName}: Will scan all ${fileItem.pageCount} pages (multiple files or non-PDF)`)
      }
      
      return {
        file: fileItem.file,
        originalName: fileItem.originalName,
        totalPages: fileItem.pageCount,
        pagesToScan: pagesToScan, // Array of page numbers to scan, or null for all pages
        receivedPages: new Set(),
        pageResults: {},
        status: "pending",
      }
    })
    
    // Calculate total pages to scan (for credit calculation)
    const totalPagesToScan = queue.reduce((sum, fileState) => {
      if (fileState.pagesToScan) {
        return sum + fileState.pagesToScan.length
      } else {
        return sum + fileState.totalPages
      }
    }, 0)
    
    setScanQueue(queue)
    setOcrResults([])

    try {
      console.log(`🚀 Starting batch scan process...`)
      console.log(`📊 Total files: ${queue.length}, Total pages in files: ${totalPages}, Pages to scan: ${totalPagesToScan}`)
      console.log(`💳 Current credits: ${credits}`)
      
      setProgress(5)
      
      // Use batch scan controller (handles all files, batches, and Excel export)
      // Credits will be deducted per file inside scanSingleFile
      // Pass queue directly to avoid React state async update issue
      await runScanQueue(queue, credits, onConsume)
    } catch (err) {
      console.error("❌ Export Error:", err)
      setError(`เกิดข้อผิดพลาด: ${err.message}`)
      setStatus("idle")
      setIsScanning(false)
      setProgress(0)
      setCurrentFile("")
      setScanStartTime(null) // Stop timer
      setElapsedTime(0) // Reset timer
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)" }}>
      {/* Navbar */}
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", py: 1.5 }}>
          <Typography 
            variant="h5" 
            fontWeight={700} 
            sx={{ 
              color: "#ffffff",
              background: "linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            สแกนเอกสาร
          </Typography>
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            อัปโหลดไฟล์เอกสารเพื่อเริ่มกระบวนการสแกน
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ width: "100%", p: 2.5 }}>
        <Grid container spacing={2}>
          {/* Left Column: Upload & File List */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={2}>
              {/* Summary Card */}
              <Card sx={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)", borderRadius: 2 }}>
                <CardContent sx={{ p: 0 }}>
                  <Box sx={{ 
                    background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                    p: 2,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}>
                    <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                      สรุปข้อมูล
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      {/* Page Range Selection (only for single PDF file) */}
                      {safeFiles.length === 1 && safeFiles.some(f => isPdfFile(f.file)) && (
                        <Box>
                          <TextField
                            fullWidth
                            size="small"
                            label="ระบุหน้าเพื่อ scan"
                            placeholder="เช่น: 1,2-6,20-22"
                            value={pageRange}
                            onChange={(e) => {
                              setPageRange(e.target.value)
                              setStartPage("") // Clear startPage/endPage when using pageRange
                              setEndPage("")
                            }}
                            helperText="ระบุหน้าเฉพาะ: 1,3,5 หรือช่วง: 1-10 หรือรวมกัน: 1,2-6,20-22"
                            sx={{
                              bgcolor: "#ffffff",
                            }}
                          />
                          {pageRange && (
                            <Typography variant="caption" sx={{ color: "#10b981", mt: 1, display: "block" }}>
                              ✓ จะสแกนเฉพาะหน้าที่ระบุ (ไม่ระบุ = ทั้งหมด)
                            </Typography>
                          )}
                        </Box>
                      )}
                      
                      {/* Summary Chips */}
                      <Stack direction="row" spacing={2} flexWrap="wrap">
                        <Chip 
                          label={`ไฟล์ ${files.length}`} 
                          sx={{ 
                            bgcolor: "#f0f9ff",
                            color: "#0369a1",
                            fontWeight: 500,
                          }}
                        />
                        <Chip 
                          label={`ประมาณ ${totalPages} หน้า`}
                          sx={{ 
                            bgcolor: "#fef3c7",
                            color: "#92400e",
                            fontWeight: 500,
                          }}
                        />
                        <Chip
                          label={`เครดิตคงเหลือ ${credits} หน้า`}
                          color={creditEnough ? "success" : "error"}
                          sx={{ fontWeight: 500 }}
                        />
                      </Stack>
                    </Stack>
                  </Box>
                </CardContent>
              </Card>

              {/* Upload & File List Card */}
              <Card 
                sx={{ 
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)", 
                  borderRadius: 2,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <CardContent sx={{ p: 0 }}>
                  <Box sx={{ 
                    background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                    p: 2,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}>
                    <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                      อัปโหลดไฟล์ ({safeFiles.length})
                    </Typography>
                  </Box>
                  
                  {/* Drop Zone */}
                  {safeFiles.length === 0 ? (
                    <Box 
                      sx={{ 
                        textAlign: "center", 
                        py: 6, 
                        px: 2,
                        border: "2px dashed #cbd5e1",
                        m: 2,
                        borderRadius: 2,
                        bgcolor: "#f8fafc",
                        transition: "all 0.3s ease",
                        "&:hover": {
                          borderColor: "#3b82f6",
                          bgcolor: "#f0f9ff",
                        },
                      }}
                    >
                      <CloudUploadIcon sx={{ fontSize: 64, color: "#3b82f6", mb: 2 }} />
                      <Typography variant="h6" sx={{ mb: 1, color: "#1e293b", fontWeight: 600 }}>
                        ลากไฟล์มาวางที่นี่
                      </Typography>
                      <Typography color="text.secondary" sx={{ mb: 3, fontSize: "0.9rem" }}>
                        รองรับ PDF / JPG / PNG
                      </Typography>

                      <input
                        hidden
                        multiple
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        id="scan-file-input"
                        onChange={(e) => handleSelect(e.target.files)}
                      />

                      <Button
                        variant="contained"
                        startIcon={<CloudUploadIcon />}
                        onClick={() =>
                          document.getElementById("scan-file-input").click()
                        }
                        sx={{
                          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                          boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                          "&:hover": {
                            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                            boxShadow: "0 6px 16px rgba(59, 130, 246, 0.4)",
                          },
                          px: 4,
                          py: 1.5,
                        }}
                      >
                        เลือกไฟล์
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ p: 2 }}>
                      {/* Upload Button */}
                      <Box sx={{ mb: 2 }}>
                        <input
                          hidden
                          multiple
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          id="scan-file-input"
                          onChange={(e) => handleSelect(e.target.files)}
                        />
                        <Button
                          variant="outlined"
                          startIcon={<CloudUploadIcon />}
                          onClick={() =>
                            document.getElementById("scan-file-input").click()
                          }
                          fullWidth
                          sx={{
                            borderColor: "#cbd5e1",
                            color: "#475569",
                            "&:hover": {
                              borderColor: "#94a3b8",
                              bgcolor: "#f8fafc",
                            },
                            py: 1.5,
                          }}
                        >
                          เพิ่มไฟล์
                        </Button>
                      </Box>

                      {/* File Grid */}
                      <Box sx={{ 
                        display: "grid", 
                        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                        gap: 1.5,
                        overflowY: "auto",
                        maxHeight: 400,
                        p: 0.5,
                      }}>
                        {safeFiles.map((f, i) => {
                          const isPdf = isPdfFile(f.file)
                          return (
                            <Box
                              key={i}
                              sx={{
                                position: "relative",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                p: 1.5,
                                borderRadius: 1.5,
                                bgcolor: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                transition: "all 0.2s ease",
                                "&:hover": {
                                  bgcolor: "#f1f5f9",
                                  borderColor: "#cbd5e1",
                                  transform: "translateY(-2px)",
                                  boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                                },
                              }}
                            >
                              {/* Icon กลมๆ */}
                              <Box
                                sx={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: "50%",
                                  background: isPdf 
                                    ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                                    : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  mb: 0.75,
                                  boxShadow: isPdf
                                    ? "0 2px 8px rgba(239, 68, 68, 0.3)"
                                    : "0 2px 8px rgba(59, 130, 246, 0.3)",
                                }}
                              >
                                {isPdf ? (
                                  <PictureAsPdfIcon sx={{ fontSize: 24, color: "#ffffff" }} />
                                ) : (
                                  <ImageIcon sx={{ fontSize: 24, color: "#ffffff" }} />
                                )}
                              </Box>
                              
                              {/* ชื่อไฟล์ */}
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: "#1e293b", 
                                  fontWeight: 500,
                                  textAlign: "center",
                                  fontSize: "0.7rem",
                                  lineHeight: 1.3,
                                  mb: 0.25,
                                  wordBreak: "break-word",
                                  maxWidth: "100%",
                                }}
                              >
                                {f.originalName.length > 15 
                                  ? f.originalName.substring(0, 15) + "..." 
                                  : f.originalName}
                              </Typography>
                              
                              {/* จำนวนหน้า */}
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: "#64748b", 
                                  fontSize: "0.6rem",
                                }}
                              >
                                {loadingFiles.has(f.originalName) ? (
                                  <CircularProgress size={8} />
                                ) : (
                                  `${f.pageCount} หน้า`
                                )}
                              </Typography>

                              {/* ปุ่มลบ */}
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeFile(i)
                                }}
                                disabled={loadingFiles.has(f.originalName)}
                                sx={{
                                  position: "absolute",
                                  top: 2,
                                  right: 2,
                                  width: 20,
                                  height: 20,
                                  bgcolor: "#fee2e2",
                                  color: "#dc2626",
                                  "&:hover": {
                                    bgcolor: "#fecaca",
                                    transform: "scale(1.1)",
                                  },
                                  transition: "all 0.2s ease",
                                }}
                              >
                                <CloseIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            </Box>
                          )
                        })}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* Credit Warning */}
              {safeFiles.length > 0 && !creditEnough && (
                <Alert 
                  severity="warning"
                  sx={{ 
                    borderRadius: 2,
                    "& .MuiAlert-icon": {
                      fontSize: 24,
                    },
                  }}
                >
                  เอกสารชุดนี้ใช้เครดิต {totalPages} หน้า แต่คุณมีเครดิตเหลือ {credits} หน้า
                </Alert>
              )}
            </Stack>
          </Grid>

          {/* Right Column: Action */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <Stack spacing={2} sx={{ position: "sticky", top: 20 }}>
              {/* Action Card - แสดงเฉพาะเมื่อมีไฟล์ */}
              {safeFiles.length > 0 && (
                <Card sx={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)", borderRadius: 2 }}>
                  <CardContent sx={{ p: 0 }}>
                    <Box sx={{ 
                      background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                      p: 2,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}>
                      <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                        เริ่มสแกน
                      </Typography>
                    </Box>
                    <Box sx={{ p: 3 }}>
                      {/* Progress */}
                      {status === "running" && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {currentFile ? `กำลังสแกนไฟล์: ${currentFile}` : "กำลังเริ่มต้น..."}
                          </Typography>
                          {currentBatch.start > 0 && currentBatch.end > 0 && batchProgress.current < batchProgress.total && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: "0.75rem", fontStyle: "italic" }}>
                              กำลังประมวลผล: หน้า {currentBatch.start}–{currentBatch.end}
                            </Typography>
                          )}
                          {/* Display scan status from Firestore */}
                          <LinearProgress 
                            variant="determinate" 
                            value={progress} 
                            sx={{ height: 6, borderRadius: 3, mb: 1 }}
                          />
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              {Math.round(progress)}% เสร็จสมบูรณ์
                            </Typography>
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                color: "#3b82f6",
                                fontWeight: 600,
                                fontFamily: "monospace",
                                fontSize: "0.875rem"
                              }}
                            >
                              ⏱️ {formatTime(elapsedTime)}
                            </Typography>
                          </Box>
                          {progressMessage && (
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                color: "#475569",
                                fontSize: "0.875rem",
                                mb: 1,
                                textAlign: "center",
                                fontStyle: "italic"
                              }}
                            >
                              {progressMessage}
                            </Typography>
                          )}
                        </Box>
                      )}

                      {/* Preview Data */}
                      {previewData && previewData.allRecords && previewData.allRecords.length > 0 && status === "running" && (
                        <Box sx={{ mb: 2, mt: 2 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: "#334155" }}>
                            📋 ตัวอย่างข้อมูลที่ประมวลผลได้ ({previewData.allRecords.length} รายการ)
                          </Typography>
                          <Box
                            sx={{
                              border: "1px solid #e2e8f0",
                              borderRadius: 1,
                              overflowX: "auto",
                              maxHeight: "300px",
                              overflowY: "auto",
                            }}
                          >
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                              <thead>
                                <tr style={{ backgroundColor: "#f8fafc", position: "sticky", top: 0 }}>
                                  <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>หน้า</th>
                                  <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>ชื่อ-สกุล</th>
                                  <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>บ้านเลขที่</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  // Flatten records with page numbers
                                  const recordsWithPages = []
                                  previewData.pageResults.forEach(pageResult => {
                                    if (pageResult.records && Array.isArray(pageResult.records)) {
                                      pageResult.records.forEach(record => {
                                        recordsWithPages.push({
                                          page: pageResult.page,
                                          record: record,
                                        })
                                      })
                                    }
                                  })
                                  
                                  return recordsWithPages.map((item, index) => {
                                    const nameLabel = "ชื่อ-สกุล"
                                    const addressLabel = "บ้านเลขที่"
                                    const name = item.record[nameLabel] || item.record.name || ""
                                    const address = item.record[addressLabel] || item.record.houseNumber || ""
                                    
                                    return (
                                      <tr key={index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "6px 8px", color: "#64748b" }}>{item.page}</td>
                                        <td style={{ padding: "6px 8px" }}>{name || "-"}</td>
                                        <td style={{ padding: "6px 8px", color: "#64748b" }}>{address || "-"}</td>
                                      </tr>
                                    )
                                  })
                                })()}
                              </tbody>
                            </table>
                          </Box>
                          <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "#64748b", fontStyle: "italic" }}>
                            หน้า {previewData.currentPage}/{previewData.totalPages} ({previewData.pageResults.length} หน้าสำเร็จ)
                          </Typography>
                        </Box>
                      )}

                      {/* Status Messages */}
                      {status === "success" && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                          สแกนและดาวน์โหลดไฟล์เรียบร้อยแล้ว
                        </Alert>
                      )}

                      {error && (
                        <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>
                          {error}
                        </Alert>
                      )}

                      {/* Action Buttons */}
                      <Stack spacing={2}>
                        <Button
                          variant="contained"
                          fullWidth
                          size="large"
                          startIcon={status === "running" ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                          disabled={!creditEnough || status === "running"}
                          onClick={handleRun}
                          sx={{
                            background: creditEnough && status !== "running"
                              ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                              : "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)",
                            boxShadow: creditEnough && status !== "running"
                              ? "0 4px 12px rgba(59, 130, 246, 0.3)"
                              : "none",
                            "&:hover": {
                              background: creditEnough && status !== "running"
                                ? "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
                                : "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)",
                              boxShadow: creditEnough && status !== "running"
                                ? "0 6px 16px rgba(59, 130, 246, 0.4)"
                                : "none",
                            },
                            py: 1.5,
                            fontSize: "1rem",
                            fontWeight: 600,
                          }}
                        >
                          {status === "running" 
                            ? "กำลังประมวลผล..." 
                            : "สแกนและบันทึกไฟล์"}
                        </Button>
                        
                        {/* Cancel Button - Only show when scanning */}
                        {status === "running" && (
                          <Button
                            variant="outlined"
                            fullWidth
                            size="large"
                            startIcon={<CancelIcon />}
                            onClick={handleCancelScan}
                            sx={{
                              borderColor: "#ef4444",
                              color: "#ef4444",
                              "&:hover": {
                                borderColor: "#dc2626",
                                backgroundColor: "#fef2f2",
                              },
                              py: 1.5,
                              fontSize: "1rem",
                              fontWeight: 600,
                            }}
                          >
                            {cancelRequested ? "กรุณารอสักครู่ กำลังยกเลิก" : "ยกเลิกการสแกน"}
                          </Button>
                        )}
                      </Stack>
                      {!creditEnough && (
                        <Typography variant="body2" sx={{ mt: 2, color: "#ef4444", textAlign: "center" }}>
                          เครดิตไม่เพียงพอ
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {/* Cancel Scan Confirmation Dialog */}
      <Dialog
        open={showCancelDialog}
        onClose={handleCancelCancel}
        TransitionComponent={Slide}
        TransitionProps={{ direction: "down", timeout: 300 }}
        disableEnforceFocus={true}
        disableRestoreFocus={true}
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
            minWidth: 400,
            maxWidth: 500,
          },
        }}
      >
        <Slide direction="down" in={showCancelDialog} timeout={300}>
          <Box>
            <DialogTitle
              sx={{
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 2.5,
                px: 3,
                position: "relative",
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <WarningIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  ยืนยันการยกเลิกการสแกน
                </Typography>
              </Box>
              <IconButton
                onClick={handleCancelCancel}
                sx={{
                  color: "#fff",
                  "&:hover": {
                    backgroundColor: "rgba(255,255,255,0.1)",
                  },
                }}
                size="small"
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 3, pt: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                  mb: 1,
                }}
              >
                <WarningIcon
                  sx={{
                    fontSize: 32,
                    color: "#f59e0b",
                    mt: 0.5,
                  }}
                />
                <Box>
                  <Typography variant="body1" fontWeight={600} sx={{ mb: 1, color: "#1e293b" }}>
                    ยกเลิกการสแกน
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#64748b", lineHeight: 1.7, mb: 1 }}>
                    ระบบจะรอให้หน้าปัจจุบันเสร็จก่อน แล้วจึงจะหยุดการสแกน ข้อมูลที่ได้จะถูก export และเครดิตหน้าที่ยังไม่ได้สแกนจะถูกคืนให้อัตโนมัติ
                  </Typography>
                  <Alert severity="info" sx={{ mt: 1, fontSize: "0.875rem" }}>
                    <Typography variant="body2" sx={{ fontSize: "0.875rem" }}>
                      ไฟล์ที่เลือกไว้จะไม่ถูกลบ สามารถสแกนใหม่ได้ทันที
                    </Typography>
                  </Alert>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions
              sx={{
                p: 2.5,
                px: 3,
                gap: 1.5,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <Button
                onClick={handleCancelCancel}
                variant="outlined"
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  borderColor: "#cbd5e1",
                  color: "#475569",
                  "&:hover": {
                    borderColor: "#94a3b8",
                    backgroundColor: "#f1f5f9",
                  },
                }}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleConfirmCancel}
                variant="contained"
                startIcon={<CancelIcon />}
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                  boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                    boxShadow: "0 6px 16px rgba(245, 158, 11, 0.4)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 0.2s ease",
                }}
              >
                ตกลง
              </Button>
            </DialogActions>
          </Box>
        </Slide>
      </Dialog>

      {/* Credit Error Dialog */}
      <Dialog
        open={showCreditErrorDialog}
        onClose={() => {}} // Prevent closing by clicking outside
        TransitionComponent={Slide}
        TransitionProps={{ direction: "down", timeout: 300 }}
        disableEnforceFocus={true}
        disableRestoreFocus={true}
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
            minWidth: 400,
            maxWidth: 500,
          },
        }}
      >
        <Slide direction="down" in={showCreditErrorDialog} timeout={300}>
          <Box>
            <DialogTitle
              sx={{
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 2.5,
                px: 3,
                position: "relative",
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <WarningIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  ไม่สามารถหักเครดิตได้
                </Typography>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ p: 3, pt: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                  mb: 1,
                }}
              >
                <WarningIcon
                  sx={{
                    fontSize: 32,
                    color: "#ef4444",
                    mt: 0.5,
                  }}
                />
                <Box>
                  <Typography variant="body1" fontWeight={600} sx={{ mb: 1, color: "#1e293b" }}>
                    {creditErrorInfo?.fileState?.originalName || "ไฟล์"} - ไม่สามารถหักเครดิตได้
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#64748b", lineHeight: 1.7, mb: 1 }}>
                    {creditErrorInfo?.error?.message || "เกิดข้อผิดพลาดในการหักเครดิต"}
                  </Typography>
                  <Alert severity="warning" sx={{ mt: 1, fontSize: "0.875rem" }}>
                    <Typography variant="body2" sx={{ fontSize: "0.875rem" }}>
                      กรุณาเลือกว่าจะรอและลองใหม่อีกครั้ง หรือออกจากการสแกน
                    </Typography>
                  </Alert>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions
              sx={{
                p: 2.5,
                px: 3,
                gap: 1.5,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <Button
                onClick={handleCreditErrorExit}
                variant="outlined"
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  borderColor: "#cbd5e1",
                  color: "#475569",
                  "&:hover": {
                    borderColor: "#94a3b8",
                    backgroundColor: "#f1f5f9",
                  },
                }}
              >
                ออกจากสแกน
              </Button>
              <Button
                onClick={handleCreditErrorRetry}
                variant="contained"
                startIcon={<PlayArrowIcon />}
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                    boxShadow: "0 6px 16px rgba(16, 185, 129, 0.4)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 0.2s ease",
                }}
              >
                รอและลองใหม่
              </Button>
            </DialogActions>
          </Box>
        </Slide>
      </Dialog>
    </Box>
  )
}
