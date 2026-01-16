 import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import {
  Box,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  TextField,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Fade,
  Slide,
  Paper,
  AppBar,
  Toolbar,
  Divider,
} from "@mui/material"
import UploadIcon from "@mui/icons-material/Upload"
import SaveIcon from "@mui/icons-material/Save"
import RotateRightIcon from "@mui/icons-material/RotateRight"
import RotateLeftIcon from "@mui/icons-material/RotateLeft"
import DeleteIcon from "@mui/icons-material/Delete"
import WarningIcon from "@mui/icons-material/Warning"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import CloseIcon from "@mui/icons-material/Close"
import DescriptionIcon from "@mui/icons-material/Description"
import AddIcon from "@mui/icons-material/Add"
import RemoveIcon from "@mui/icons-material/Remove"
import { auth } from "../firebase"
import { runOCR } from "../utils/runOCR"
import { saveTemplate } from "../../template/saveTemplate"
import { loadTemplates, loadTemplate } from "../../template/loadTemplate"
import { deleteTemplate } from "../../template/deleteTemplate"
import { fieldsToTemplate, templateToFields } from "../../template/fieldToTemplate"
import { mergeWordsIntoLines } from "../utils/ocrLineMerger"
import { mergeGroupLines, FIELD_TYPES } from "../utils/groupMerger"
import { mergeConnectedWords } from "../utils/wordMerger"
import { removeEmptyLines } from "../utils/textUtils"
import OCRLineLayer from "../components/OCRLineLayer"
import OCRWordLayer from "../components/OCRWordLayer"
import GroupSelectionLayer from "../components/GroupSelectionLayer"
import InteractionLayer from "../components/InteractionLayer"
import GroupMappingPanel from "../components/GroupMappingPanel"
import PreviewTable from "../components/PreviewTable"

/**
 * Document Template Settings - Core v2 feature with line-based grouping
 * 
 * Complete workflow:
 * 1. Upload document
 * 2. Run OCR v2
 * 3. Merge words into lines
 * 4. Drag to select lines (grouping)
 * 5. Set field type for each group
 * 6. Map groups to Excel columns
 * 7. Preview extracted data
 * 8. Save as template
 */
export default function DocumentTemplateSettings({ credits, onConsume }) {
  const [imageFile, setImageFile] = useState(null)
  const [imageUrl, setImageUrl] = useState("")
  const [imageRotation, setImageRotation] = useState(0) // Rotation angle in degrees (0, 90, 180, 270)
  const rotationRef = useRef(null) // Ref to track rotation value to prevent reset during re-render
  const rotationPendingRef = useRef(false) // Flag to track if rotation is pending
  const [extractingPdf, setExtractingPdf] = useState(false) // Loading state for PDF extraction
  const [previewPage, setPreviewPage] = useState("") // Page number (1-based) for preview (single page only)
  const [totalPages, setTotalPages] = useState(null) // Total pages in PDF (for max validation)
  const [showPageErrorDialog, setShowPageErrorDialog] = useState(false) // Show page error dialog
  const [pageError, setPageError] = useState(null) // Page error message
  const [ocrResult, setOcrResult] = useState(null)
  const [lines, setLines] = useState([]) // Merged lines from words
  const [mergedWords, setMergedWords] = useState([]) // Merged words (connected words as single units)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Group selection state
  const [groups, setGroups] = useState([])
  const [selectedLineIndices, setSelectedLineIndices] = useState(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionBox, setSelectionBox] = useState(null)
  
  // Group editing state (drag and resize)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [isDraggingGroup, setIsDraggingGroup] = useState(false)
  const [isResizingGroup, setIsResizingGroup] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [resizeHandle, setResizeHandle] = useState(null) // 'nw', 'ne', 'sw', 'se'

  // Template state
  const [templateName, setTemplateName] = useState("")
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // Store action to execute after save/discard
  const [isExecutingAction, setIsExecutingAction] = useState(false) // Prevent infinite loop
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTemplateId, setDeleteTemplateId] = useState(null)
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false)
  const [deleteGroupId, setDeleteGroupId] = useState(null)

  // Display size for scaling
  const [displaySize, setDisplaySize] = useState(null)
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 }) // Offset for centered image
  const [zoomLevel, setZoomLevel] = useState(1.0) // Initial zoom at 100%
  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const step2Ref = useRef(null) // Ref for Step 2 scrolling
  const cardRef = useRef(null) // Ref for Card element to get card width

  const user = auth.currentUser

  // Get total pages when PDF is loaded
  useEffect(() => {
    if (!imageFile) {
      setTotalPages(null)
      return
    }

    const isPdf = imageFile.type === "application/pdf" || imageFile.name.toLowerCase().endsWith(".pdf")
    
    if (isPdf) {
      // Get total pages for max validation
      getPdfTotalPages(imageFile)
        .then((pages) => {
          if (pages !== null) {
            setTotalPages(pages)
            console.log(`📊 PDF has ${pages} page(s)`)
          }
        })
        .catch((err) => {
          console.error("❌ Failed to get PDF total pages:", err)
        })
    } else {
      setTotalPages(null)
    }
  }, [imageFile])

  // Convert file to URL or extract page from PDF (with debounce for previewPage)
  useEffect(() => {
    if (!imageFile) {
      setImageUrl("")
      setExtractingPdf(false)
      return
    }

    let urlToRevoke = null

    const isPdf = imageFile.type === "application/pdf" || imageFile.name.toLowerCase().endsWith(".pdf")
    
    if (isPdf) {
      // Use debounce to wait for user to finish typing
      const timeoutId = setTimeout(() => {
        // Extract page from PDF (use previewPage if specified, otherwise first page)
        const pageToExtract = previewPage ? parseInt(previewPage, 10) : 1
        if (isNaN(pageToExtract) || pageToExtract < 1) {
          // Invalid page number, use first page
          setExtractingPdf(true)
          setImageUrl("") // Clear previous image
          extractFirstPageFromPdf(imageFile)
            .then((imageUrl) => {
              urlToRevoke = imageUrl
              setImageUrl(imageUrl)
              setExtractingPdf(false)
            })
            .catch((err) => {
              console.error("❌ Failed to extract first page from PDF:", err)
              setError(`Failed to extract first page from PDF: ${err.message}`)
              setExtractingPdf(false)
            })
        } else {
          // Extract specified page
          setExtractingPdf(true)
          setImageUrl("") // Clear previous image
          extractPageFromPdf(imageFile, pageToExtract)
            .then((imageUrl) => {
              urlToRevoke = imageUrl
              setImageUrl(imageUrl)
              setExtractingPdf(false)
            })
            .catch((err) => {
              console.error(`❌ Failed to extract page ${pageToExtract} from PDF:`, err)
              setExtractingPdf(false)
              
              // Check if error is page out of range
              if (err.message && err.message.includes("out of range")) {
                // Show error dialog and reset to page 1
                setPageError({
                  requestedPage: pageToExtract,
                  totalPages: totalPages || "ไม่ทราบ",
                  message: err.message
                })
                setShowPageErrorDialog(true)
                setPreviewPage("") // Reset to empty (will show first page)
              } else {
                setError(`Failed to extract page ${pageToExtract} from PDF: ${err.message}`)
              }
            })
        }
      }, 800) // Wait 800ms after user stops typing

      // Cleanup timeout on unmount or when dependencies change
      return () => {
        clearTimeout(timeoutId)
        if (urlToRevoke) {
          URL.revokeObjectURL(urlToRevoke)
        }
      }
    } else {
      // Regular image file
      setExtractingPdf(false)
      const url = URL.createObjectURL(imageFile)
      urlToRevoke = url
      setImageUrl(url)

      return () => {
        if (urlToRevoke) {
          URL.revokeObjectURL(urlToRevoke)
        }
      }
    }
  }, [imageFile, previewPage])

  // Rotate image by 90 degrees clockwise and update rotation state
  // STANDARD ROTATION: 0, 90, 180, 270 (clockwise from original)
  // IMPORTANT: We DON'T rotate the image blob itself - we just update the rotation state
  // The image will be displayed with CSS transform to match the rotation value
  // This ensures the displayed image matches the rotation value exactly
  // 0° = upright, 90° = tilted right, 180° = upside down, 270° = tilted left
  const rotateImage = async (imageUrl, currentRotation) => {
    return new Promise((resolve) => {
      // STANDARD: Rotate 90° clockwise each time (0 → 90 → 180 → 270 → 0)
      // This ensures rotation values match Firebase Function exactly
      const newRotation = (currentRotation + 90) % 360
      
      // Normalize to standard values (0, 90, 180, 270)
      const normalizedRotation = newRotation % 360
      const standardRotation = normalizedRotation === 0 ? 0 : 
                               normalizedRotation === 90 ? 90 :
                               normalizedRotation === 180 ? 180 :
                               normalizedRotation === 270 ? 270 : 0
      
      
      // Return the same image URL (no rotation in blob) and the new rotation value
      // The image will be displayed with CSS transform to match the rotation value
      resolve({ url: imageUrl, rotation: standardRotation })
    })
  }

  // Handle rotate button click
  const handleRotate = async () => {
    if (!imageUrl) return
    
    try {
      // Calculate new rotation (no need to load image - we use CSS transform)
      const { rotation } = await rotateImage(imageUrl, imageRotation)
      
      // Update state with new rotation value
      // Image URL stays the same - rotation is applied via CSS transform
      setImageRotation(rotation)
      
      // Reset OCR result since image rotation has changed
      setOcrResult(null)
      setLines([])
      setGroups([])
      
    } catch (error) {
      console.error("❌ Failed to rotate image:", error)
      setError(`Failed to rotate image: ${error.message}`)
    }
  }

  // Get total pages from PDF (without extracting)
  const getPdfTotalPages = async (pdfFile) => {
    try {
      const pdfjsLib = await import("pdfjs-dist")
      
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      }

      const arrayBuffer = await pdfFile.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        verbosity: 0,
      })
      const pdf = await loadingTask.promise

      return pdf.numPages
    } catch (error) {
      console.error("❌ Failed to get PDF total pages:", error)
      return null
    }
  }

  // Extract specific page from PDF and convert to image URL
  const extractPageFromPdf = async (pdfFile, pageNumber = 1) => {
    console.log(`📄 Extracting page ${pageNumber} from PDF:`, pdfFile.name)
    
    try {
      // Dynamic import pdfjs-dist
      const pdfjsLib = await import("pdfjs-dist")
      
      // Set worker source
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      }

      // Read PDF file as array buffer
      const arrayBuffer = await pdfFile.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Load PDF
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        verbosity: 0,
      })
      const pdf = await loadingTask.promise

      // Validate page number
      if (pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new Error(`Page ${pageNumber} is out of range. PDF has ${pdf.numPages} page(s).`)
      }

      console.log(`📊 PDF has ${pdf.numPages} page(s), extracting page ${pageNumber}`)

      // Get specified page
      const page = await pdf.getPage(pageNumber)
      
      // Get page rotation from PDF metadata (0, 90, 180, or 270 degrees)
      const rotation = page.rotate || 0
      console.log(`📐 PDF page rotation: ${rotation}°`)
      
      // Get viewport with rotation - pdfjs-dist will handle rotation automatically
      // If rotation is 90 or 270, viewport will swap width/height automatically
      // Use scale 1.0 to match PDF's actual page size (not scaled up)
      // This ensures template zones match PDF's actual dimensions when scanning
      const viewport = page.getViewport({ scale: 1.0, rotation: rotation })
      
      console.log(`📐 PDF page viewport: ${viewport.width}x${viewport.height} (scale: 1.0, rotation: ${rotation}°)`)
      console.log(`📐 PDF actual page size: ${viewport.width}x${viewport.height} (matches PDF dimensions)`)
      
      // Check if landscape (width > height)
      const isLandscape = viewport.width > viewport.height
      console.log(`📐 PDF orientation: ${isLandscape ? "Landscape" : "Portrait"} (${viewport.width} x ${viewport.height})`)

      // Create canvas with correct dimensions (viewport already accounts for rotation)
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext("2d")

      // Render page to canvas (pdfjs-dist handles rotation automatically via viewport)
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }

      await page.render(renderContext).promise
      
      console.log(`✅ Rendered page ${pageNumber} with rotation ${rotation}° - text should be correctly oriented`)

      // Convert canvas to blob URL
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob)
              console.log(`✅ Page ${pageNumber} extracted as image: ${blob.size} bytes, ${canvas.width}x${canvas.height}`)
              console.log(`📐 Extracted image orientation: ${canvas.width > canvas.height ? "Landscape" : "Portrait"}`)
              resolve(url)
            } else {
              reject(new Error("Failed to convert canvas to blob"))
            }
          },
          "image/png"
        )
      })
    } catch (error) {
      console.error(`❌ Failed to extract page ${pageNumber}:`, error)
      throw new Error(`Failed to extract page ${pageNumber} from PDF: ${error.message}`)
    }
  }

  // Extract first page from PDF (for backward compatibility)
  const extractFirstPageFromPdf = async (pdfFile) => {
    return extractPageFromPdf(pdfFile, 1)
  }

  // Get image display size from OCR result or preview image
  // CRITICAL: Calculate displaySize immediately from OCR dimensions to prevent large image display
  useEffect(() => {
    // If we have OCR result, calculate displaySize immediately (don't wait for image load)
    // NOTE: zoomLevel changes are handled by useLayoutEffect below to prevent race conditions
    if (ocrResult && ocrResult.page) {
      const ocrWidth = ocrResult.page.width
      const ocrHeight = ocrResult.page.height
      
      if (ocrWidth > 0 && ocrHeight > 0) {
        // Calculate displaySize to fit card (both width and height, not exceeding)
        // This only runs when ocrResult or imageUrl changes, NOT when zoomLevel changes
        const updateSize = () => {
          const image = imageRef.current
          const container = containerRef.current
          const card = cardRef.current
          if (!image || !container || !card) return

          const naturalWidth = image.naturalWidth || 0
          const naturalHeight = image.naturalHeight || 0
          
          if (naturalWidth > 0 && naturalHeight > 0) {
            // Get available space from card and container
            const cardWidth = card.clientWidth
            const containerHeight = container.clientHeight
            
            // Calculate available space (subtract padding)
            const padding = 32 // Approximate padding from Stack (p: 2 = 16px * 2)
            const availableWidth = cardWidth - padding
            const availableHeight = containerHeight - 20 // Leave some margin
            
            // Calculate scale to fit both width and height
            const scaleForWidth = availableWidth / naturalWidth
            const scaleForHeight = availableHeight / naturalHeight
            
            // Use the smaller scale to ensure image fits both width and height (no overflow)
            const baseScale = Math.min(scaleForWidth, scaleForHeight)
            
            // NOTE: Don't use zoomLevel here - useLayoutEffect below will handle it
            // This useEffect only triggers useLayoutEffect to recalculate when ocrResult/imageUrl changes
            // The useLayoutEffect will apply zoomLevel and update both displaySize and transform
            
            // DON'T calculate displaySize here - let useLayoutEffect handle it
            // This prevents using stale zoomLevel value from closure
            // The useLayoutEffect will calculate displaySize and apply transform with current zoomLevel
          } else {
            // Fallback: use OCR dimensions with same scale calculation
            const cardWidth = cardRef.current?.clientWidth || 0
            const containerHeight = containerRef.current?.clientHeight || 0
            
            if (cardWidth > 0 && containerHeight > 0) {
              const padding = 32
              const availableWidth = cardWidth - padding
              const availableHeight = containerHeight - 20
              
              const scaleForWidth = availableWidth / ocrWidth
              const scaleForHeight = availableHeight / ocrHeight
              const baseScale = Math.min(scaleForWidth, scaleForHeight)
              
              // NOTE: Don't use zoomLevel here - useLayoutEffect below will handle it
              // This useEffect only triggers useLayoutEffect to recalculate when ocrResult/imageUrl changes
              // The useLayoutEffect will apply zoomLevel and update both displaySize and transform
              
              // DON'T calculate displaySize here - let useLayoutEffect handle it
              // This prevents using stale zoomLevel value from closure
            }
          }
        }

        // Wait for image to load
        const image = imageRef.current
        if (image) {
          if (image.complete) {
            updateSize()
          } else {
            image.addEventListener("load", updateSize)
          }
        }

        // Update on resize (but not on zoomLevel change - that's handled by useLayoutEffect)
        const handleResize = () => {
          setTimeout(updateSize, 100)
        }
        
        window.addEventListener("resize", handleResize)
        return () => {
          if (image) {
            image.removeEventListener("load", updateSize)
          }
          window.removeEventListener("resize", handleResize)
        }
      }
    }
  }, [ocrResult, imageUrl, imageRotation]) // Recalculate when OCR result or image changes (NOT zoomLevel - handled by useLayoutEffect below)

  // Update image transform when zoomLevel, ocrResult, or imageUrl changes
  // Use useLayoutEffect to update synchronously before browser paint
  // This ensures image, tokens, and groups scale together perfectly
  // CRITICAL: This is the ONLY place that handles zoomLevel, ocrResult, and imageUrl changes to prevent race conditions
  useLayoutEffect(() => {
    const image = imageRef.current
    if (!image || !ocrResult?.page) return

    const naturalWidth = image.naturalWidth || 0
    const naturalHeight = image.naturalHeight || 0
    
    // Wait for image to load before calculating
    if (naturalWidth > 0 && naturalHeight > 0 && image.complete) {
      const container = containerRef.current
      const card = cardRef.current
      
      if (!container || !card) return
      
      // CRITICAL: Re-read layout values every time to ensure we have the latest measurements
      // This is especially important when zoomLevel changes (especially at 100%)
      // because the layout may have shifted from previous zoom levels
      // Use getBoundingClientRect() for more accurate measurements
      const cardRect = card.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const cardWidth = cardRect.width
      const containerHeight = containerRect.height
      const padding = 32
      const availableWidth = Math.max(0, cardWidth - padding)
      const availableHeight = Math.max(0, containerHeight - 20)
      
      // Ensure we have valid dimensions
      if (availableWidth <= 0 || availableHeight <= 0) return
      
      // Calculate base scale to fit card
      const scaleForWidth = availableWidth / naturalWidth
      const scaleForHeight = availableHeight / naturalHeight
      const baseScale = Math.min(scaleForWidth, scaleForHeight)
      
      // Apply zoomLevel to base scale
      const finalScale = baseScale * zoomLevel
      
      // Calculate displayed size with zoom
      const displayedWidth = naturalWidth * finalScale
      const displayedHeight = naturalHeight * finalScale
      
      // Update displaySize immediately (synchronously)
      setDisplaySize({
        width: displayedWidth,
        height: displayedHeight,
      })
      
      // CRITICAL: Calculate scaleX and scaleY from displayedWidth/Height (same formula as getScaleFactor)
      // This ensures the image uses the exact same scale as tokens and groups
      // getScaleFactor() uses: scaleX = displaySize.width / naturalWidth
      // We use: scaleX = displayedWidth / naturalWidth (which equals displaySize.width / naturalWidth)
      const scaleX = naturalWidth > 0 ? displayedWidth / naturalWidth : 1
      const scaleY = naturalHeight > 0 ? displayedHeight / naturalHeight : 1
      
      // Apply CSS transform scale using scaleX and scaleY (same as tokens/groups)
      // CRITICAL: Use exact same scale calculation as getScaleFactor() to ensure perfect alignment
      // This ensures image, tokens, and groups all use the same scale factor
      if (ocrResult?.normalizedImageBase64) {
        image.style.transform = `scale(${scaleX}, ${scaleY})`
      } else {
        image.style.transform = `scale(${scaleX}, ${scaleY}) rotate(${imageRotation}deg)`
      }
      image.style.transformOrigin = "top left" // Match tokens/groups positioning
      
      // Recalculate offset for centered image
      // CRITICAL: Re-read container width using getBoundingClientRect() for accuracy
      const containerRectForOffset = container.getBoundingClientRect()
      const containerWidthForOffset = containerRectForOffset.width
      const offsetXForOffset = (containerWidthForOffset - displayedWidth) / 2
      setImageOffset({ x: Math.max(0, offsetXForOffset), y: 0 })
    } else if (image && ocrResult?.page) {
      // Image is not loaded yet, wait for it to load
      const handleImageLoad = () => {
        // Re-run the calculation when image loads
        const currentImage = imageRef.current
        if (currentImage && currentImage.complete) {
          const currentNaturalWidth = currentImage.naturalWidth || 0
          const currentNaturalHeight = currentImage.naturalHeight || 0
          
          if (currentNaturalWidth > 0 && currentNaturalHeight > 0) {
            const container = containerRef.current
            const card = cardRef.current
            
            if (container && card) {
              const cardRect = card.getBoundingClientRect()
              const containerRect = container.getBoundingClientRect()
              const cardWidth = cardRect.width
              const containerHeight = containerRect.height
              const padding = 32
              const availableWidth = Math.max(0, cardWidth - padding)
              const availableHeight = Math.max(0, containerHeight - 20)
              
              if (availableWidth > 0 && availableHeight > 0) {
                const scaleForWidth = availableWidth / currentNaturalWidth
                const scaleForHeight = availableHeight / currentNaturalHeight
                const baseScale = Math.min(scaleForWidth, scaleForHeight)
                const finalScale = baseScale * zoomLevel
                const displayedWidth = currentNaturalWidth * finalScale
                const displayedHeight = currentNaturalHeight * finalScale
                
                setDisplaySize({
                  width: displayedWidth,
                  height: displayedHeight,
                })
                
                const scaleX = currentNaturalWidth > 0 ? displayedWidth / currentNaturalWidth : 1
                const scaleY = currentNaturalHeight > 0 ? displayedHeight / currentNaturalHeight : 1
                
                if (ocrResult?.normalizedImageBase64) {
                  currentImage.style.transform = `scale(${scaleX}, ${scaleY})`
                } else {
                  currentImage.style.transform = `scale(${scaleX}, ${scaleY}) rotate(${imageRotation}deg)`
                }
                currentImage.style.transformOrigin = "top left"
                
                const containerRectForOffset = container.getBoundingClientRect()
                const containerWidthForOffset = containerRectForOffset.width
                const offsetXForOffset = (containerWidthForOffset - displayedWidth) / 2
                setImageOffset({ x: Math.max(0, offsetXForOffset), y: 0 })
              }
            }
          }
        }
      }
      
      image.addEventListener("load", handleImageLoad, { once: true })
      
      return () => {
        image.removeEventListener("load", handleImageLoad)
      }
    }
  }, [zoomLevel, ocrResult, imageUrl, imageRotation]) // Update transform when zoomLevel, ocrResult, or imageUrl changes

  // Fallback: calculate size from preview image in step 1 (when no OCR result yet)
  useEffect(() => {
    if (!ocrResult) {
      const image = imageRef.current
      if (!image) return

      const updateSize = () => {
        if (image.complete) {
          setDisplaySize({
            width: image.clientWidth,
            height: image.clientHeight,
          })
          setImageOffset({ x: 0, y: 0 })
        }
      }

      if (image.complete) {
        updateSize()
      } else {
        image.addEventListener("load", updateSize)
      }

      const handleResize = () => updateSize()
      window.addEventListener("resize", handleResize)

      return () => {
        if (image) {
          image.removeEventListener("load", updateSize)
        }
        window.removeEventListener("resize", handleResize)
      }
    }
  }, [ocrResult, imageUrl, imageRotation])

  // Merge words into lines when OCR result changes
  useEffect(() => {
    if (ocrResult) {
      if (ocrResult.words && ocrResult.words.length > 0) {
        // Use only first page (if multi-page, take first page words)
        const firstPageWords = ocrResult.words
        
        // Merge connected words into single words
        const connectedWords = mergeConnectedWords(firstPageWords)
        setMergedWords(connectedWords)
        
        // Also merge into lines for compatibility
        const mergedLines = mergeWordsIntoLines(firstPageWords)
        setLines(mergedLines)
        
        if (mergedLines.length === 0) {
          console.warn(`⚠️ [Lines] No lines created from ${firstPageWords.length} words`)
        }
      } else {
        console.warn(`⚠️ [Lines] OCR result has no words`)
        setLines([])
        setMergedWords([])
      }
    } else {
      setLines([])
    }
  }, [ocrResult])

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      setImageFile(file)
      setOcrResult(null)
      setLines([])
      setMergedWords([])
      setGroups([])
      setSelectedLineIndices(new Set())
      setImageRotation(0) // Reset rotation when new file is selected
      setPreviewPage("") // Reset preview page when changing files
      setTotalPages(null) // Reset total pages when changing files
      setError(null)
      setSuccess(null)
    } else {
      setError("Please select an image file (JPG, PNG) or PDF")
    }
  }

  // Convert blob URL to File
  const blobUrlToFile = async (blobUrl, fileName, forceImageType = false) => {
    const response = await fetch(blobUrl)
    const blob = await response.blob()
    
    // If forceImageType is true, ensure it's treated as image (PNG)
    if (forceImageType) {
      const imageFileName = fileName.replace(/\.pdf$/i, ".png").replace(/\.[^.]+$/i, ".png")
      return new File([blob], imageFileName, { type: "image/png" })
    }
    
    return new File([blob], fileName, { type: blob.type })
  }

  // Run OCR Gemini - Uses ocrFileGemini with Normalization Pipeline
  // NEW: Normalization pipeline handles:
  // 1. PDF → Image (DPI 300)
  // 2. Detect orientation from text (OCR OSD)
  // 3. Rotate image until upright
  // 4. OCR
  // This ensures Template and Scan use the same normalized images
  const handleRunOCR = async () => {
    if (!imageFile || !user) return

    setLoading(true)
    setError(null)

    try {
      // IMPORTANT: Send original file directly - normalization pipeline will handle everything
      const fileToScan = imageFile
      const isOriginalPdf = imageFile.type === "application/pdf" || imageFile.name.toLowerCase().endsWith(".pdf")
      
      // Use runOCR which calls ocrFileGemini (Firebase function with normalization pipeline)
      // STANDARD: Send exact rotation value from imageRotation state (0, 90, 180, 270)
      // scanMode = false for template setup (first page only, with normalized image)
      const rotationToSend = imageRotation !== 0 ? imageRotation : undefined
      const scanMode = false // Template mode: first page only, return normalized image
      
      // Build options for page range (if specified)
      const ocrOptions = {};
      if (isOriginalPdf && previewPage) {
        const parsedPage = parseInt(previewPage, 10);
        if (!isNaN(parsedPage) && parsedPage >= 1) {
          ocrOptions.startPage = parsedPage;
          ocrOptions.endPage = parsedPage; // Single page only
        } else {
          console.warn(`⚠️ [OCR] Invalid previewPage: ${previewPage}`);
        }
      }
      
      // Use unified runOCR function
      const { ocrResult, normalizedImageUrl } = await runOCR(fileToScan, {
        rotation: rotationToSend,
        scanMode: false, // Template mode: first page only, return normalized image
        startPage: ocrOptions.startPage,
        endPage: ocrOptions.endPage,
      })
      
      const result = ocrResult
      
      // Result already has normalized page dimensions and coordinates
      const finalPageWidth = result.page?.width || 0
      const finalPageHeight = result.page?.height || 0
      const ocrIsLandscape = finalPageWidth > finalPageHeight
      
      
      // IMPORTANT: When using manual rotation, the preview image should already be rotated
      // via CSS transform (transform: rotate(${imageRotation}deg))
      // The OCR result from Firebase Function is already normalized with the rotation applied
      // So we don't need to auto-rotate the preview image - it should already match
      console.log(`📐 [V2] OCR result (normalized): ${finalPageWidth}x${finalPageHeight} (${ocrIsLandscape ? "Landscape" : "Portrait"})`)
      console.log(`📐 [V2] Current imageRotation: ${imageRotation}°`)
      console.log(`📐 [V2] Rotation sent to Firebase: ${rotationToSend !== undefined ? rotationToSend + "°" : "auto-detect"}`)
      console.log(`📐 [V2] Preview image will be displayed with CSS transform: rotate(${imageRotation}deg)`)
      console.log(`✅ [V2] Preview image rotation matches OCR result (rotation applied via CSS transform)`)
      
      // IMPORTANT: Use normalized image from runOCR if available
      // This ensures the preview image matches the OCR result exactly
      if (normalizedImageUrl && normalizedImageUrl.startsWith("blob:")) {
        // Revoke old image URL to prevent memory leak
        if (imageUrl && imageUrl.startsWith("blob:")) {
          URL.revokeObjectURL(imageUrl)
        }
        
        // Update preview image to use normalized image from runOCR
        setImageUrl(normalizedImageUrl)
      } else if (result.normalizedImageBase64 && result.normalizedImageBase64.length > 100) {
        // Fallback: Create blob URL from normalizedImageBase64 if normalizedImageUrl is not available
        try {
          // Revoke old image URL to prevent memory leak
          if (imageUrl && imageUrl.startsWith("blob:")) {
            URL.revokeObjectURL(imageUrl)
          }
          
          const normalizedImageBlob = await fetch(
            `data:image/png;base64,${result.normalizedImageBase64}`
          ).then((r) => r.blob())
          const blobUrl = URL.createObjectURL(normalizedImageBlob)
          setImageUrl(blobUrl)
        } catch (err) {
          console.error(`❌ [V2] Failed to create blob URL from normalizedImageBase64:`, err)
        }
      } else {
        console.warn(`⚠️ [V2] No normalized image in OCR result`)
      }
      
      // IMPORTANT: Keep imageRotation state - don't reset it (unless we got normalized image)
      // The preview image will be displayed with CSS transform based on imageRotation
      setOcrResult(result)
      // Reset zoom to 100% when new OCR result is loaded
      setZoomLevel(1.0)
      
      // Zoom removed - displaySize will be calculated to fit card automatically
      
      // Log after state update to verify imageRotation is preserved
      setTimeout(() => {
      }, 100)

      // Consume credits
      if (onConsume) {
        onConsume(1)
      }

      
      if (!result.words || result.words.length === 0) {
        setError("⚠️ No words detected in the document. Please try a different image or check if the document is readable.")
      }

      // Scroll to Step 2 after OCR completes
      setTimeout(() => {
        if (step2Ref.current) {
          step2Ref.current.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 300) // Small delay to ensure DOM is updated
    } catch (err) {
      console.error("❌ [V2] OCR v2 error:", err)
      setError(`OCR v2 failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Calculate scale factor to map OCR coordinates to display coordinates
  // CRITICAL: Use displaySize directly to ensure perfect alignment with rendered image
  // Calculate scale factor from natural image dimensions and displaySize
  // Use natural image dimensions as the base (not OCR dimensions)
  // scale = displaySize / natural dimensions (calculated to fit card)
  const getScaleFactor = useCallback(() => {
    const image = imageRef.current
    if (!image || !displaySize) {
      return { scaleX: 1, scaleY: 1 }
    }
    
    const naturalWidth = image.naturalWidth || 0
    const naturalHeight = image.naturalHeight || 0
    
    if (naturalWidth > 0 && naturalHeight > 0) {
      // Scale based on natural image dimensions
      // displaySize is calculated to fit card, so scale = displaySize / natural dimensions
      const scaleX = naturalWidth > 0 ? displaySize.width / naturalWidth : 1
      const scaleY = naturalHeight > 0 ? displaySize.height / naturalHeight : 1
      return { scaleX, scaleY }
    }
    
    // Fallback: no scale
    return { scaleX: 1, scaleY: 1 }
  }, [displaySize])
  
  const { scaleX, scaleY } = getScaleFactor()

  // Handle drag selection start - Now selects WORDS instead of LINES
  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      
      // Check for merged words instead of raw words
      if (!mergedWords || mergedWords.length === 0 || !displaySize) {
        console.log("⚠️ [Selection] Cannot start:", {
          hasMergedWords: !!mergedWords,
          mergedWordsCount: mergedWords?.length || 0,
          hasDisplaySize: !!displaySize,
        })
        return
      }
      
      console.log(`🖱️ [Selection] Starting new selection. Current groups: ${groups.length}, selectedGroupId: ${selectedGroupId}`)
      
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        console.log("⚠️ [Selection] Cannot start: no container rect")
        return
      }

      // Deselect any selected group when starting new selection (allows unlimited groups)
      if (selectedGroupId) {
        console.log(`🖱️ [Group] Starting new selection - deselecting group ${selectedGroupId}`)
        setSelectedGroupId(null)
      }

      // Calculate position relative to container, accounting for image offset (in OCR coordinates)
      // Convert screen coordinates to OCR coordinates using scale
      const screenX = e.clientX - rect.left - imageOffset.x
      const screenY = e.clientY - rect.top - imageOffset.y
      const x = screenX / scaleX
      const y = screenY / scaleY

      console.log("🖱️ [Selection] Mouse down:", { x, y, mergedWordsCount: mergedWords.length })

      setIsSelecting(true)
      setSelectionStart({ x, y })
      // Selection box in screen coordinates (relative to container, accounting for offset)
      setSelectionBox({ 
        x: screenX, 
        y: screenY, 
        w: 0, 
        h: 0 
      })
    },
    [mergedWords, displaySize, scaleX, scaleY, selectedGroupId, imageOffset, groups.length]
  )

  // Handle drag selection move
  const handleMouseMove = useCallback(
    (e) => {
      if (!isSelecting || !selectionStart || !displaySize) return
      
      e.preventDefault()
      e.stopPropagation()
      
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      // Convert screen coordinates to OCR coordinates using scale
      // OCR coordinates = screen coordinates / scale
      const currentScreenX = e.clientX - rect.left - imageOffset.x
      const currentScreenY = e.clientY - rect.top - imageOffset.y
      
      // Start position in screen coordinates (from OCR coordinates * scale)
      const startScreenX = selectionStart.x * scaleX
      const startScreenY = selectionStart.y * scaleY

      const x = Math.min(startScreenX, currentScreenX)
      const y = Math.min(startScreenY, currentScreenY)
      const w = Math.abs(currentScreenX - startScreenX)
      const h = Math.abs(currentScreenY - startScreenY)

      setSelectionBox({ x, y, w, h })
    },
    [isSelecting, selectionStart, displaySize, scaleX, scaleY, imageOffset]
  )

  // Handle drag selection end - create group from selected WORDS (not lines)
  const handleMouseUp = useCallback((e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    // Check for merged words instead of raw words
    // This is normal when user clicks without dragging (not an error)
    if (!isSelecting || !selectionBox || !mergedWords || mergedWords.length === 0) {
      // Silently reset selection state - this is normal behavior when clicking without dragging
      setIsSelecting(false)
      setSelectionStart(null)
      setSelectionBox(null)
      return
    }

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      setIsSelecting(false)
      setSelectionStart(null)
      setSelectionBox(null)
      return
    }

    // Convert selection box from screen coordinates to OCR coordinates
    const selectionX = selectionBox.x / scaleX
    const selectionY = selectionBox.y / scaleY
    const selectionW = selectionBox.w / scaleX
    const selectionH = selectionBox.h / scaleY

    console.log("🖱️ [Selection] Mouse up:", {
      screenBox: selectionBox,
      ocrBox: { x: selectionX, y: selectionY, w: selectionW, h: selectionH },
    })

    // Find MERGED WORDS that intersect with selection box (connected words as single units)
    const selectedWords = mergedWords.filter((word) => {
      // Check if word bounding box intersects with selection box
      const wordRight = word.x + word.w
      const wordBottom = word.y + word.h
      const selectionRight = selectionX + selectionW
      const selectionBottom = selectionY + selectionH

      const intersects =
        word.x < selectionRight &&
        wordRight > selectionX &&
        word.y < selectionBottom &&
        wordBottom > selectionY

      return intersects
    })

      console.log(`✅ [Selection] Selected ${selectedWords.length} merged words out of ${mergedWords.length}`)
      console.log(`📊 [Selection] Current groups before adding: ${groups.length}`)

    if (selectedWords.length > 0) {
      // Sort words by Y (top → bottom), then X (left → right)
      const sortedWords = [...selectedWords].sort((a, b) => {
        if (Math.abs(a.y - b.y) > 5) {
          return a.y - b.y
        }
        return a.x - b.x
      })

      // Use selection box as group bounding box (don't auto-adjust to words)
      // This allows user to manually adjust the group size/position later
      const groupX = selectionX
      const groupY = selectionY
      const groupW = selectionW
      const groupH = selectionH

      // Convert merged words to lines format for compatibility with existing group structure
      // Each merged word becomes a "line" (may contain multiple original words)
      const wordsAsLines = sortedWords.map((word) => ({
        text: word.text,
        x: word.x,
        y: word.y,
        w: word.w,
        h: word.h,
        words: word.words || [word], // Keep original words for reference
      }))

      // Merge lines into final text using mergeGroupLines (respects field type formatting)
      // Default to PERSON_NAME for name-like groups (can be changed later)
      const defaultFieldType = FIELD_TYPES.PERSON_NAME
      const mergedText = mergeGroupLines(wordsAsLines, defaultFieldType)

      // If no template selected, automatically create new template
      if (!selectedTemplateId) {
        setSelectedTemplateId("") // Ensure it's empty for new template
      }

      const newGroup = {
        id: `group_${Date.now()}`,
        label: `Group ${groups.length + 1}`,
        x: groupX, // Use selection box position, not auto-calculated from words
        y: groupY,
        w: groupW, // Use selection box size, not auto-calculated from words
        h: groupH,
        lines: wordsAsLines, // Store as lines format for compatibility
        words: sortedWords, // Also store words directly
        text: mergedText, // Properly merged text using mergeGroupLines
        fieldType: FIELD_TYPES.PERSON_NAME, // Default to PERSON_NAME for name extraction
        excelColumn: (() => {
          // Auto-assign Excel column based on group index (A, B, C, ...)
          const getExcelColumnLetter = (index) => {
            let result = ""
            let num = index
            while (num >= 0) {
              result = String.fromCharCode(65 + (num % 26)) + result
              num = Math.floor(num / 26) - 1
            }
            return result
          }
          return getExcelColumnLetter(groups.length)
        })(),
        columnName: `Group ${groups.length + 1}`, // Default column name
        defaultValue: "", // Default value
      }

      setGroups((prev) => {
        const updated = [...prev, newGroup]
        console.log(`✅ [Group] Adding new group. Previous: ${prev.length}, New total: ${updated.length}`)
        console.log(`✅ [Group] New group ID: ${newGroup.id}, Label: ${newGroup.label}`)
        return updated
      })
      setHasUnsavedChanges(true) // Mark as unsaved when creating new group
      console.log(`✅ [Group] Created group: ${newGroup.label} with ${sortedWords.length} words, using selection box: ${groupX}, ${groupY}, ${groupW}x${groupH}`)
      console.log(`📝 [Group] Group text: "${mergedText}"`)
      console.log(`📝 [Group] Words as lines:`, wordsAsLines.map(l => l.text))
      
      // Debug: Prepare token data for testing
      const testTokens = sortedWords.map(w => ({
        text: w.text || "",
        x: w.x || 0,
        y: w.y || 0,
        w: w.w || 0,
        h: w.h || 0,
      }))
      
      // Calculate statistics for debugging
      const avgHeight = sortedWords.length > 0 
        ? sortedWords.reduce((sum, w) => sum + (w.h || 0), 0) / sortedWords.length 
        : 0
      
      // Calculate distances between consecutive tokens
      const distances = []
      for (let i = 1; i < sortedWords.length; i++) {
        const prev = sortedWords[i - 1]
        const curr = sortedWords[i]
        const prevRight = prev.x + (prev.w || 0)
        const currLeft = curr.x
        const distanceX = currLeft - prevRight
        
        const prevYCenter = prev.y + (prev.h || 0) / 2
        const currYCenter = curr.y + (curr.h || 0) / 2
        const distanceY = Math.abs(currYCenter - prevYCenter)
        
        // Calculate overlap
        const prevTop = prev.y
        const prevBottom = prev.y + (prev.h || 0)
        const currTop = curr.y
        const currBottom = curr.y + (curr.h || 0)
        const overlapTop = Math.max(prevTop, currTop)
        const overlapBottom = Math.min(prevBottom, currBottom)
        const overlapHeight = Math.max(0, overlapBottom - overlapTop)
        const minHeight = Math.min(prev.h || 0, curr.h || 0)
        const overlapRatio = minHeight > 0 ? overlapHeight / minHeight : 0
        
        distances.push({
          from: prev.text?.substring(0, 20) || "",
          to: curr.text?.substring(0, 20) || "",
          distanceX: Math.round(distanceX),
          distanceY: Math.round(distanceY),
          overlapRatio: (overlapRatio * 100).toFixed(0) + "%",
          isHorizontal: currLeft > prevRight,
        })
      }
      
      console.log(`🔍 [Group Debug] Group "${newGroup.label}" (${newGroup.excelColumn}) - ${sortedWords.length} tokens:`)
      console.log(`📊 [Group Debug] Token data (copy this to test):`, JSON.stringify(testTokens, null, 2))
      console.log(`🧪 [Group Debug] To test: testTokenMerge(${JSON.stringify(testTokens)})`)
      console.log(`📏 [Group Debug] Distances:`, distances)
      console.log(`📈 [Group Debug] Statistics:`, {
        avgHeight: Math.round(avgHeight),
        yThreshold: Math.round(avgHeight / 2),
        tokens: sortedWords.map((w, idx) => ({
          idx: idx + 1,
          text: w.text?.substring(0, 20) || "",
          x: Math.round(w.x),
          y: Math.round(w.y),
          w: Math.round(w.w),
          h: Math.round(w.h),
        })),
      })
      
      console.log(`📊 [Group] Total groups now: ${groups.length + 1}`)
    } else {
      console.log(`⚠️ [Selection] No words selected - not creating group`)
    }

    // Always reset selection state after mouse up (whether group was created or not)
    setIsSelecting(false)
    setSelectionStart(null)
    setSelectionBox(null)
    // Deselect any selected group to allow creating new groups
    if (selectedGroupId) {
      setSelectedGroupId(null)
    }
  }, [isSelecting, selectionBox, mergedWords, groups.length, scaleX, scaleY, selectedGroupId])

  // Update group
  const handleGroupUpdate = useCallback((groupId, updates) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          const updated = { ...g, ...updates }
          // Re-merge lines ONLY if field type changed (not for position/size/text updates)
          if (updates.fieldType && updated.lines && updated.lines.length > 0) {
            // Field type changed - re-merge with new field type
            updated.text = mergeGroupLines(updated.lines, updated.fieldType || FIELD_TYPES.PERSON_NAME)
            console.log(`🔄 [Group] Re-merged text for ${g.label} with field type ${updated.fieldType}: "${updated.text}"`)
          } else if (!updates.text && !updates.x && !updates.y && !updates.w && !updates.h && updated.lines && updated.lines.length > 0 && !updated.text) {
            // Text is missing but lines exist - merge them (only if not updating position/size)
            updated.text = mergeGroupLines(updated.lines, updated.fieldType || FIELD_TYPES.PERSON_NAME)
            console.log(`🔄 [Group] Generated missing text for ${g.label}: "${updated.text}"`)
          }
          setHasUnsavedChanges(true) // Mark as unsaved when updating group
          return updated
        }
        return g
      })
    )
  }, [])

  // Add new group (column)
  // Handle adding a new empty group (manually added column, not from OCR selection)
  const handleGroupAdd = () => {
    if (!ocrResult) {
      setError("Please upload a document and run OCR first")
      return
    }

    // Create a new empty group at a default position
    const defaultX = ocrResult.page.width * 0.1
    const defaultY = ocrResult.page.height * 0.1
    const defaultW = ocrResult.page.width * 0.3
    const defaultH = ocrResult.page.height * 0.1

      // Auto-assign Excel column based on group index (A, B, C, ...)
      const getExcelColumnLetter = (index) => {
        let result = ""
        let num = index
        while (num >= 0) {
          result = String.fromCharCode(65 + (num % 26)) + result
          num = Math.floor(num / 26) - 1
        }
        return result
      }
      
      const newGroup = {
        id: `group_${Date.now()}`,
        label: `Group ${groups.length + 1}`,
        // Set position to 0,0 with 0 size - this group won't appear in step 2
        // Only groups created by mouse drag (with words/lines) will appear in step 2
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        lines: [], // Empty - manually added column (not from OCR selection)
        words: [], // Empty - manually added column (not from OCR selection)
        text: "", // Empty - will use defaultValue
        fieldType: FIELD_TYPES.NORMAL_TEXT,
        excelColumn: getExcelColumnLetter(groups.length), // Auto-assign: A, B, C, ...
        columnName: `Group ${groups.length + 1}`,
        defaultValue: "",
      }

    setGroups((prev) => [...prev, newGroup])
    setHasUnsavedChanges(true)
    setSuccess(`New column "${newGroup.columnName}" added. Please adjust its position and size on the document.`)
    setTimeout(() => setSuccess(null), 3000)
  }

  // Delete group - show confirmation dialog
  const handleGroupDelete = (groupId) => {
    setDeleteGroupId(groupId)
    setShowDeleteGroupDialog(true)
  }

  // Confirm delete group
  const handleConfirmDeleteGroup = () => {
    if (!deleteGroupId) return
    
    const groupToDelete = groups.find(g => g.id === deleteGroupId)
    const groupLabel = groupToDelete?.label || "กรุ๊ป"
    
    console.log(`🗑️ [Group] Deleting group: ${deleteGroupId}`)
    setGroups((prev) => {
      const filtered = prev.filter((g) => g.id !== deleteGroupId)
      console.log(`🗑️ [Group] Remaining groups: ${filtered.length}`)
      // Renumber groups
      const renumbered = filtered.map((g, index) => ({
        ...g,
        label: `Group ${index + 1}`,
      }))
      setHasUnsavedChanges(true) // Mark as unsaved when deleting group
      return renumbered
    })
    // Deselect if deleted group was selected
    if (selectedGroupId === deleteGroupId) {
      setSelectedGroupId(null)
      console.log(`🗑️ [Group] Deselected deleted group`)
    }
    
    setShowDeleteGroupDialog(false)
    setDeleteGroupId(null)
    setSuccess(`ลบ${groupLabel}เรียบร้อยแล้ว`)
    setTimeout(() => setSuccess(null), 3000)
  }

  // Cancel delete group
  const handleCancelDeleteGroup = () => {
    setShowDeleteGroupDialog(false)
    setDeleteGroupId(null)
  }

  // Reorder group and update excelColumn based on new order
  const handleGroupReorder = (groupId, direction) => {
    setGroups((prev) => {
      const index = prev.findIndex((g) => g.id === groupId)
      if (index === -1) return prev

      const newGroups = [...prev]
      if (direction === "up" && index > 0) {
        ;[newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]]
      } else if (direction === "down" && index < newGroups.length - 1) {
        ;[newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]]
      } else {
        return prev // No change
      }

      // Helper function to get Excel column letter
      const getExcelColumnLetter = (index) => {
        let result = ""
        let num = index
        while (num >= 0) {
          result = String.fromCharCode(65 + (num % 26)) + result
          num = Math.floor(num / 26) - 1
        }
        return result
      }

      // Renumber groups and update excelColumn based on new order
      const renumbered = newGroups.map((g, i) => ({
        ...g,
        label: `Group ${i + 1}`,
        excelColumn: getExcelColumnLetter(i), // Update excelColumn based on new position
      }))
      
      setHasUnsavedChanges(true) // Mark as unsaved when reordering
      return renumbered
    })
  }

  // Handle group click (select group)
  const handleGroupClick = (groupId) => {
    console.log(`🖱️ [Group] handleGroupClick called with groupId: ${groupId}, current selected: ${selectedGroupId}`)
    const newSelectedId = groupId === selectedGroupId ? null : groupId
    setSelectedGroupId(newSelectedId)
    console.log(`🖱️ [Group] ${newSelectedId ? "Selected" : "Deselected"} group: ${groupId}`)
  }

  // Handle group drag start
  const handleGroupDragStart = (groupId, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // STEP 1: Screen coordinates = OCR coordinates (1:1 mapping, no scale)
    const startX = e.clientX - rect.left - imageOffset.x
    const startY = e.clientY - rect.top - imageOffset.y

    setIsDraggingGroup(true)
    setDragStart({ groupId, startX, startY, groupX: group.x, groupY: group.y })
    console.log(`🖱️ [Group] Started dragging group: ${groupId}`)
  }

  // Handle group resize start
  const handleGroupResizeStart = (groupId, handle, e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // STEP 1: Screen coordinates = OCR coordinates (1:1 mapping, no scale)
    const startX = e.clientX - rect.left - imageOffset.x
    const startY = e.clientY - rect.top - imageOffset.y

    setIsResizingGroup(true)
    setResizeHandle(handle)
    setDragStart({ groupId, startX, startY, groupX: group.x, groupY: group.y, groupW: group.w, groupH: group.h })
    console.log(`🖱️ [Group] Started resizing group: ${groupId}, handle: ${handle}`)
  }

  // Helper function to find words that intersect with a bounding box
  const findWordsInBoundingBox = useCallback((boxX, boxY, boxW, boxH) => {
    if (!mergedWords || mergedWords.length === 0) return []
    
    const boxRight = boxX + boxW
    const boxBottom = boxY + boxH
    
    return mergedWords.filter((word) => {
      const wordRight = word.x + word.w
      const wordBottom = word.y + word.h
      
      return (
        word.x < boxRight &&
        wordRight > boxX &&
        word.y < boxBottom &&
        wordBottom > boxY
      )
    })
  }, [mergedWords])

  // Handle mouse move for dragging/resizing groups
  const handleGroupMouseMove = useCallback((e) => {
    if (!dragStart || (!isDraggingGroup && !isResizingGroup)) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Convert screen coordinates to OCR coordinates using scale
    const currentX = (e.clientX - rect.left - imageOffset.x) / scaleX
    const currentY = (e.clientY - rect.top - imageOffset.y) / scaleY

    if (isDraggingGroup) {
      // Calculate new position
      const deltaX = currentX - dragStart.startX
      const deltaY = currentY - dragStart.startY
      const newX = dragStart.groupX + deltaX
      const newY = dragStart.groupY + deltaY

      // Find current group to get its size
      const currentGroup = groups.find((g) => g.id === dragStart.groupId)
      if (!currentGroup) return

      // Find words in the new position
      const wordsInNewPosition = findWordsInBoundingBox(newX, newY, currentGroup.w, currentGroup.h)
      
      // Sort words by Y (top → bottom), then X (left → right)
      const sortedWords = [...wordsInNewPosition].sort((a, b) => {
        if (Math.abs(a.y - b.y) > 5) {
          return a.y - b.y
        }
        return a.x - b.x
      })

      // Convert to lines format
      const wordsAsLines = sortedWords.map((word) => ({
        text: word.text,
        x: word.x,
        y: word.y,
        w: word.w,
        h: word.h,
        words: word.words || [word],
      }))

      // Merge lines into text
      const mergedText = mergeGroupLines(wordsAsLines, currentGroup.fieldType || FIELD_TYPES.PERSON_NAME)

      // Debug: Log Y positions and text of tokens in updated group
      console.log(`🔍 [Group Debug] Updated group "${currentGroup.label}" (${currentGroup.excelColumn}) tokens:`, {
        groupId: currentGroup.id,
        groupPosition: { x: newX, y: newY, w: currentGroup.w, h: currentGroup.h },
        tokensCount: sortedWords.length,
        tokens: sortedWords.map((w, idx) => ({
          index: idx,
          text: w.text?.substring(0, 30) || "",
          y: w.y,
          h: w.h,
          x: w.x,
          w: w.w,
          yCenter: w.y + (w.h || 0) / 2,
          yBottom: w.y + (w.h || 0),
        })),
        yPositions: sortedWords.map(w => w.y).sort((a, b) => a - b),
        uniqueYPositions: [...new Set(sortedWords.map(w => Math.round(w.y)))].sort((a, b) => a - b),
        mergedText: mergedText,
      })

      // Update group position and text in real-time
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id === dragStart.groupId) {
            return { 
              ...g, 
              x: newX, 
              y: newY,
              words: sortedWords,
              lines: wordsAsLines,
              text: mergedText,
            }
          }
          return g
        })
      )
    } else if (isResizingGroup && resizeHandle) {
      // Calculate new size based on handle
      const deltaX = currentX - dragStart.startX
      const deltaY = currentY - dragStart.startY
      
      let newX = dragStart.groupX
      let newY = dragStart.groupY
      let newW = dragStart.groupW
      let newH = dragStart.groupH

      if (resizeHandle.includes("w")) {
        // Left side
        newX = dragStart.groupX + deltaX
        newW = dragStart.groupW - deltaX
      }
      if (resizeHandle.includes("e")) {
        // Right side
        newW = dragStart.groupW + deltaX
      }
      if (resizeHandle.includes("n")) {
        // Top side
        newY = dragStart.groupY + deltaY
        newH = dragStart.groupH - deltaY
      }
      if (resizeHandle.includes("s")) {
        // Bottom side
        newH = dragStart.groupH + deltaY
      }

      // Ensure minimum size
      if (newW < 10) newW = 10
      if (newH < 10) newH = 10

      // Find current group to get its field type
      const currentGroup = groups.find((g) => g.id === dragStart.groupId)
      if (!currentGroup) return

      // Find words in the new bounding box
      const wordsInNewBox = findWordsInBoundingBox(newX, newY, newW, newH)
      
      // Sort words by Y (top → bottom), then X (left → right)
      const sortedWords = [...wordsInNewBox].sort((a, b) => {
        if (Math.abs(a.y - b.y) > 5) {
          return a.y - b.y
        }
        return a.x - b.x
      })

      // Convert to lines format
      const wordsAsLines = sortedWords.map((word) => ({
        text: word.text,
        x: word.x,
        y: word.y,
        w: word.w,
        h: word.h,
        words: word.words || [word],
      }))

      // Merge lines into text
      const mergedText = mergeGroupLines(wordsAsLines, currentGroup.fieldType || FIELD_TYPES.PERSON_NAME)
      
      // Debug: Log Y positions and text of tokens in resized group
      console.log(`🔍 [Group Debug] Resized group "${currentGroup.label}" (${currentGroup.excelColumn}) tokens:`, {
        groupId: currentGroup.id,
        groupPosition: { x: newX, y: newY, w: newW, h: newH },
        tokensCount: sortedWords.length,
        tokens: sortedWords.map((w, idx) => ({
          index: idx,
          text: w.text?.substring(0, 30) || "",
          y: w.y,
          h: w.h,
          x: w.x,
          w: w.w,
          yCenter: w.y + (w.h || 0) / 2,
          yBottom: w.y + (w.h || 0),
        })),
        yPositions: sortedWords.map(w => w.y).sort((a, b) => a - b),
        uniqueYPositions: [...new Set(sortedWords.map(w => Math.round(w.y)))].sort((a, b) => a - b),
        mergedText: mergedText,
      })

      // Update group size, position, and text in real-time
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id === dragStart.groupId) {
            return { 
              ...g, 
              x: newX, 
              y: newY,
              w: newW,
              h: newH,
              words: sortedWords,
              lines: wordsAsLines,
              text: mergedText,
            }
          }
          return g
        })
      )
    }
  }, [dragStart, isDraggingGroup, isResizingGroup, resizeHandle, scaleX, scaleY, imageOffset, groups, findWordsInBoundingBox])

  // Handle mouse up for dragging/resizing groups
  const handleGroupMouseUp = useCallback(() => {
    if (isDraggingGroup || isResizingGroup) {
      console.log(`🖱️ [Group] Finished ${isDraggingGroup ? "dragging" : "resizing"} group`)
      setHasUnsavedChanges(true) // Mark as unsaved when dragging or resizing group
      setIsDraggingGroup(false)
      setIsResizingGroup(false)
      setDragStart(null)
      setResizeHandle(null)
    }
  }, [isDraggingGroup, isResizingGroup])

  // Global mouse up listener to reset drag/resize state when clicking outside
  useEffect(() => {
    if (!isDraggingGroup && !isResizingGroup) {
      return // No cleanup needed if not dragging/resizing
    }

    const handleGlobalMouseUp = (e) => {
      // Always end drag/resize on any mouse up (even outside document area)
      console.log(`🖱️ [Group] Global mouse up detected - ending drag/resize`)
      if (isDraggingGroup || isResizingGroup) {
        setHasUnsavedChanges(true) // Mark as unsaved when dragging or resizing group
        console.log(`💾 [Group] Set hasUnsavedChanges = true after ${isDraggingGroup ? "dragging" : "resizing"}`)
      }
      setIsDraggingGroup(false)
      setIsResizingGroup(false)
      setDragStart(null)
      setResizeHandle(null)
    }

    const handleGlobalMouseMove = (e) => {
      // Handle mouse move globally during drag/resize
      if (dragStart && (isDraggingGroup || isResizingGroup)) {
        handleGroupMouseMove(e)
      }
    }

    // Add global listeners with capture phase to catch events early
    document.addEventListener('mouseup', handleGlobalMouseUp, true)
    document.addEventListener('mousemove', handleGlobalMouseMove, true)

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp, true)
      document.removeEventListener('mousemove', handleGlobalMouseMove, true)
    }
  }, [isDraggingGroup, isResizingGroup, dragStart, handleGroupMouseMove])

  // Save template
  const handleSaveTemplate = async () => {
    if (!user || !ocrResult || groups.length === 0 || !templateName.trim()) {
      setError("Please provide template name and create at least one group")
      return
    }

    // Check for duplicate template name
    const duplicateTemplate = templates.find(
      t => t.templateName.toLowerCase() === templateName.trim().toLowerCase() && 
           t.templateId !== selectedTemplateId
    )
    if (duplicateTemplate) {
      setError(`Template name "${templateName.trim()}" already exists. Please use a different name.`)
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Auto-assign Excel columns if not set
      const getExcelColumnLetter = (index) => {
        let result = ""
        let num = index
        while (num >= 0) {
          result = String.fromCharCode(65 + (num % 26)) + result
          num = Math.floor(num / 26) - 1
        }
        return result
      }
      
      // Debug: Log all groups with their tokens Y positions and text before saving
      console.log(`📊 [All Groups Debug] Total groups before save: ${groups.length}`)
      groups.forEach((group, idx) => {
        const groupWords = group.words || group.lines || []
        console.log(`🔍 [All Groups Debug] Group ${idx + 1}: "${group.label}" (${group.excelColumn})`, {
          groupId: group.id,
          groupPosition: { x: group.x, y: group.y, w: group.w, h: group.h },
          tokensCount: groupWords.length,
          tokens: groupWords.slice(0, 10).map((w, tokenIdx) => ({
            index: tokenIdx,
            text: (typeof w === "string" ? w : w.text)?.substring(0, 30) || "",
            y: typeof w === "string" ? 0 : (w.y || 0),
            h: typeof w === "string" ? 0 : (w.h || 0),
            x: typeof w === "string" ? 0 : (w.x || 0),
            w: typeof w === "string" ? 0 : (w.w || 0),
            yCenter: typeof w === "string" ? 0 : ((w.y || 0) + (w.h || 0) / 2),
          })),
          allYPositions: groupWords.map(w => typeof w === "string" ? 0 : (w.y || 0)).filter(y => y > 0).sort((a, b) => a - b),
          uniqueYPositions: [...new Set(groupWords.map(w => Math.round(typeof w === "string" ? 0 : (w.y || 0))).filter(y => y > 0))].sort((a, b) => a - b),
          groupText: group.text || "",
        })
      })
      
      // Convert groups to fields format
      // Excel columns are automatically assigned based on group order (A, B, C, ...)
      const fields = groups.map((group, index) => {
          // Auto-assign Excel column based on current index
          const excelColumn = getExcelColumnLetter(index)
          // For groups with words/lines, get formatted text
          // For manually added groups (no words), use empty text or defaultValue
          const hasWords = (group.words && group.words.length > 0) || (group.lines && group.lines.length > 0)
          const finalText = hasWords 
            ? (group.text || mergeGroupLines(group.lines || [], group.fieldType || FIELD_TYPES.NORMAL_TEXT))
            : "" // Manually added columns have no text

          // Build field object, only including defaultValue if it exists
          // IMPORTANT: Include zone coordinates from group to preserve exact user-set dimensions
          const field = {
            id: group.id,
            name: group.columnName || group.label, // Use columnName if set
            words: group.lines?.flatMap((l) => l.words || []) || group.words || [],
            excelColumn: excelColumn, // Use auto-assigned or existing column
            fieldType: group.fieldType || FIELD_TYPES.NORMAL_TEXT,
            text: finalText,
            columnName: group.columnName || group.label, // Store columnName
            zone: {
              x: group.x, // Use group coordinates directly (in pixels)
              y: group.y,
              w: group.w,
              h: group.h,
            },
          }
          
          // Only include defaultValue if it's not empty (Firestore doesn't support undefined)
          if (group.defaultValue && group.defaultValue.trim() !== "") {
            field.defaultValue = group.defaultValue
          }
          
          return field
        })

      // STANDARD: Save exact rotation value (0, 90, 180, 270) to template
      // This value will be used when scanning with this template
      const rotationToSave = imageRotation // Already standardized (0, 90, 180, 270)
      console.log(`💾 [Save Template] Saving rotation: ${rotationToSave}°`)
      
      const template = fieldsToTemplate(
        fields,
        ocrResult.page.width,
        ocrResult.page.height,
        templateName.trim(),
        user.uid,
        selectedTemplateId || undefined, // Use existing templateId if editing
        rotationToSave // Include manual rotation set by user (standardized)
      )

      await saveTemplate(template)
      setSuccess("Template saved successfully!")
      // DO NOT clear templateName - keep it for editing
      // setTemplateName("")
      setHasUnsavedChanges(false) // Clear unsaved changes flag
      
      // Reload templates
      const updatedTemplates = await loadTemplates(user.uid)
      setTemplates(updatedTemplates)
      
      // If saving selected template, update selectedTemplateId
      // If saving new template, set selectedTemplateId to the saved one
      const savedTemplate = updatedTemplates.find(t => t.templateName === templateName.trim())
      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate.templateId)
      }

      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error("Save error:", err)
      setError(`Failed to save template: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Load templates
  useEffect(() => {
    let isMounted = true
    
    if (user) {
      console.log("📋 Loading templates for user:", user.uid)
      
      // Use Promise.race with timeout to prevent hanging
      Promise.race([
        loadTemplates(user.uid),
        new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      ])
        .then((templates) => {
          if (isMounted) {
            console.log("✅ Templates loaded:", templates.length, "templates")
            console.log("📋 Templates:", templates)
            setTemplates(templates || [])
          }
        })
        .catch((err) => {
          console.error("❌ Failed to load templates:", err)
          // Ignore Firestore internal assertion errors
          if (err.message && err.message.includes("INTERNAL ASSERTION")) {
            console.warn("⚠️ Firestore internal assertion error - ignoring")
            if (isMounted) {
              setTemplates([])
            }
          } else if (isMounted) {
            setTemplates([])
          }
        })
    } else {
      setTemplates([])
    }
    
    return () => {
      isMounted = false
    }
  }, [user])

  // Check for unsaved changes before changing template
  // Consider unsaved if:
  // 1. hasUnsavedChanges flag is true, OR
  // 2. There are groups but no template is selected (new template not saved), OR
  // 3. There are groups and templateName is set but not saved yet
  const checkUnsavedChanges = (action) => {
    try {
      // If already executing an action or dialog is showing, don't check again (prevent infinite loop)
      if (isExecutingAction || showUnsavedDialog) {
        console.log("⏸️ [checkUnsavedChanges] Already executing or dialog showing, skipping check")
        return true
      }

      const hasUnsavedWork = hasUnsavedChanges || 
                            (groups.length > 0 && (!selectedTemplateId || selectedTemplateId === "")) ||
                            (groups.length > 0 && templateName.trim() !== "" && !selectedTemplateId)
      
      console.log("🔍 [checkUnsavedChanges]", {
        hasUnsavedChanges,
        groupsLength: groups.length,
        selectedTemplateId,
        templateName: templateName.trim(),
        hasUnsavedWork,
        isExecutingAction,
        showUnsavedDialog,
      })
      
      if (hasUnsavedWork) {
        console.log("⚠️ [checkUnsavedChanges] Showing unsaved dialog")
        setPendingAction(action)
        setShowUnsavedDialog(true)
        return false
      }
      return true
    } catch (err) {
      console.error("❌ [checkUnsavedChanges] Error:", err)
      // If error, allow action to proceed to prevent blocking
      return true
    }
  }

  // Handle template selection
  const handleTemplateSelect = async (templateId) => {
    console.log("🔄 [handleTemplateSelect] Called with templateId:", templateId, "isExecutingAction:", isExecutingAction)
    
    // Prevent recursive calls
    if (isExecutingAction) {
      console.log("⏸️ [handleTemplateSelect] Already executing, skipping")
      return
    }

    try {
      // Check for unsaved changes (only if not already executing)
      // Create a wrapper function that will be called after user confirms
      const canProceed = checkUnsavedChanges(async () => {
        console.log("🔄 [handleTemplateSelect] Executing pending action")
        // Call the actual template selection logic directly without recursion
        await executeTemplateSelect(templateId)
      })
      
      if (!canProceed) {
        console.log("⏸️ [handleTemplateSelect] Blocked by unsaved changes dialog")
        return
      }
      
      // If no unsaved changes, proceed directly
      await executeTemplateSelect(templateId)
    } catch (err) {
      console.error("❌ [handleTemplateSelect] Error:", err)
      setError(`Failed to select template: ${err.message}`)
      setIsExecutingAction(false)
    }
  }

  // Actual template selection logic (separated to avoid recursion)
  const executeTemplateSelect = async (templateId) => {
    // Mark as executing to prevent recursive calls
    setIsExecutingAction(true)
    console.log("✅ [executeTemplateSelect] Proceeding with template selection", { templateId, hasOcrResult: !!ocrResult, hasMergedWords: !!mergedWords && mergedWords.length > 0 })

    try {
      // Clear any previous errors
      setError(null)
      setSuccess(null)

      if (!templateId || templateId === "") {
        // Creating new template
        setSelectedTemplateId("")
        setGroups([])
        setTemplateName("")
        setHasUnsavedChanges(false)
        setIsExecutingAction(false)
        return
      }

      if (!user || !ocrResult) {
        setError("Please upload a document and run OCR first")
        setIsExecutingAction(false)
        return
      }

      // Show loading state
      setLoading(true)
      
      let template
      try {
        template = await loadTemplate(user.uid, templateId)
      } catch (loadErr) {
        console.error("Error loading template:", loadErr)
        setError(`Failed to load template: ${loadErr.message}`)
        setLoading(false)
        setIsExecutingAction(false)
        return
      }
      
      if (!template) {
        setError("Template not found")
        setLoading(false)
        setIsExecutingAction(false)
        return
      }

      // Validate template structure
      if (!template.columns || !Array.isArray(template.columns) || template.columns.length === 0) {
        console.error("❌ [Load Template] Template has no columns or invalid structure:", template)
        setError("Template structure is invalid. No columns found.")
        setLoading(false)
        setIsExecutingAction(false)
        return
      }

      // Validate ocrResult structure
      if (!ocrResult || !ocrResult.page) {
        console.error("❌ [Load Template] ocrResult or ocrResult.page is missing:", ocrResult)
        setError("OCR result is missing. Please run OCR first.")
        setLoading(false)
        setIsExecutingAction(false)
        return
      }

      // Convert template columns to groups format
      // IMPORTANT: Use zone coordinates directly from template - DO NOT adjust size to fit words
      // This ensures groups maintain their saved dimensions even if current document has different text
      const newGroups = template.columns.map((column, index) => {
        try {
        const zone = column.zone
        if (!zone) {
          console.warn(`⚠️ [Load Template] Column ${index} has no zone, skipping`)
          return null
        }

        // Validate ocrResult.page exists
        if (!ocrResult.page || !ocrResult.page.width || !ocrResult.page.height) {
          console.error(`❌ [Load Template] Column ${index} - ocrResult.page is missing or invalid:`, ocrResult.page)
          return null
        }

        // Use zone coordinates directly (already in percentage, convert to absolute)
        // DO NOT recalculate or adjust these values - use exactly what was saved
        const zoneX = zone.x * ocrResult.page.width
        const zoneY = zone.y * ocrResult.page.height
        const zoneW = zone.w * ocrResult.page.width
        const zoneH = zone.h * ocrResult.page.height

        // Validate zone coordinates
        if (isNaN(zoneX) || isNaN(zoneY) || isNaN(zoneW) || isNaN(zoneH)) {
          console.error(`❌ [Load Template] Column ${index} - Invalid zone coordinates:`, { zoneX, zoneY, zoneW, zoneH, zone, page: ocrResult.page })
          return null
        }

        // CRITICAL: Use mergedWords (same as creating new group) instead of ocrResult.words
        // This ensures consistent word merging logic between creating and loading
        // mergedWords are words that have been merged by wordMerger (connected words as single units)
        // This is the same words used when creating a new group via mouse drag
        
        // Use mergedWords state (already merged by wordMerger) - same as used in selection
        // If mergedWords is not available, merge on the fly (shouldn't happen, but fallback)
        let currentMergedWords
        try {
          currentMergedWords = mergedWords && mergedWords.length > 0 
            ? mergedWords 
            : (ocrResult.words && ocrResult.words.length > 0 
                ? mergeConnectedWords(ocrResult.words)
                : [])
          
          if (!currentMergedWords || currentMergedWords.length === 0) {
            console.warn(`⚠️ [Load Template] Column ${index} - No merged words available`)
            // Still create group but with empty text
          }
        } catch (mergeErr) {
          console.error(`❌ [Load Template] Column ${index} - Error merging words:`, mergeErr)
          // Fallback to empty words
          currentMergedWords = []
        }
        
        // Find merged words that fall within this zone (for text extraction only)
        // This is ONLY for displaying text, NOT for adjusting group size
        const wordsInZone = currentMergedWords.filter((word) => {
          const wordCenterX = word.x + word.w / 2
          const wordCenterY = word.y + word.h / 2
          return (
            wordCenterX >= zoneX &&
            wordCenterX <= zoneX + zoneW &&
            wordCenterY >= zoneY &&
            wordCenterY <= zoneY + zoneH
          )
        })

        // Sort words by Y, then X (for text extraction only)
        const sortedWords = [...wordsInZone].sort((a, b) => {
          if (Math.abs(a.y - b.y) > 5) {
            return a.y - b.y
          }
          return a.x - b.x
        })

        // Convert to lines format (for text extraction only)
        // Use merged words (same format as when creating new group)
        const wordsAsLines = sortedWords.map((word) => ({
          text: word.text, // This is already merged text from wordMerger
          x: word.x,
          y: word.y,
          w: word.w,
          h: word.h,
          words: word.words || [word], // Keep original words for reference
        }))

        // Get saved fieldType or default
        const savedFieldType = column.fieldType || FIELD_TYPES.NORMAL_TEXT
        
        // CRITICAL: Always use mergeGroupLines (same logic as creating new group)
        // This ensures consistent formatting whether loading or creating new
        // Don't use saved text - it may have been formatted incorrectly in old templates
        // Always re-process from words using current mergeGroupLines logic
        let mergedText = ""
        try {
          mergedText = mergeGroupLines(wordsAsLines, savedFieldType)
          console.log(`✅ [Load Template] Merged text for column ${index} using mergeGroupLines:`, mergedText.substring(0, 50))
        } catch (mergeErr) {
          console.error(`❌ [Load Template] Column ${index} - Error merging group lines:`, mergeErr)
          // Fallback to empty text or use saved text if available
          mergedText = column.text || ""
        }

        // Auto-assign Excel column based on index (A, B, C, ...)
        const getExcelColumnLetter = (index) => {
          let result = ""
          let num = index
          while (num >= 0) {
            result = String.fromCharCode(65 + (num % 26)) + result
            num = Math.floor(num / 26) - 1
          }
          return result
        }

        return {
          id: `group_${Date.now()}_${index}`,
          label: column.label || `Group ${index + 1}`,
          // CRITICAL: Use zone coordinates EXACTLY as saved - DO NOT adjust
          x: zoneX,
          y: zoneY,
          w: zoneW,
          h: zoneH,
          lines: wordsAsLines,
          words: sortedWords,
          text: mergedText,
          fieldType: savedFieldType, // Load saved fieldType or default
          excelColumn: getExcelColumnLetter(index), // Auto-assign based on order, not from columnKey
          columnName: column.columnName || column.label || `Group ${index + 1}`, // Load saved columnName or use label
          defaultValue: column.defaultValue || "", // Store default value if exists
        }
        } catch (colErr) {
          console.error(`Error processing column ${index}:`, colErr)
          return null
        }
      }).filter(Boolean)

      // Validate that we have at least some groups loaded
      if (!newGroups || newGroups.length === 0) {
        console.warn("⚠️ [Load Template] No groups were loaded from template")
        setError("Template loaded but no groups found. Template may be empty or invalid.")
        setLoading(false)
        setIsExecutingAction(false)
        return
      }

      console.log(`✅ [Load Template] Successfully processed ${newGroups.length} groups`)
      
      // IMPORTANT: DO NOT load rotation from template
      // Rotation is set per document, not per template
      // Keep current rotation value (set by user for current document)
      // Template rotation is only used during actual scanning (in Scan.jsx)
      console.log(`🔄 [Load Template] Keeping current rotation: ${imageRotation}° (not loading from template)`)
      console.log(`ℹ️ [Load Template] Template has rotation: ${template.rotation}° (will be used during scanning)`)
      
      // Clear rotation refs since we're not changing rotation
      rotationRef.current = null
      rotationPendingRef.current = false
      
      // Set groups and other state (rotation stays unchanged)
      setGroups(newGroups)
      setSelectedTemplateId(templateId)
      setTemplateName(template.templateName)
      
      setHasUnsavedChanges(false)
      setSuccess(`Template "${template.templateName}" loaded successfully`)
      setTimeout(() => setSuccess(null), 3000)
      
      console.log("✅ [Load Template] State updated successfully")
    } catch (err) {
      console.error("❌ [executeTemplateSelect] Load template error:", err)
      console.error("❌ [executeTemplateSelect] Error stack:", err.stack)
      setError(`Failed to load template: ${err.message}`)
      // Reset state on error to prevent white screen
      setSelectedTemplateId("")
      setGroups([])
      setTemplateName("")
      setHasUnsavedChanges(false)
    } finally {
      setLoading(false)
      setIsExecutingAction(false)
      console.log("🏁 [executeTemplateSelect] Finished - isExecutingAction reset to false")
    }
  }

  // Handle new template creation
  const handleNewTemplate = () => {
    // Create a wrapper function to avoid recursion
    const executeNewTemplate = () => {
      setSelectedTemplateId("")
      setGroups([])
      setTemplateName("")
      setHasUnsavedChanges(false)
    }
    
    if (!checkUnsavedChanges(executeNewTemplate)) {
      return
    }
    
    // If no unsaved changes, execute directly
    executeNewTemplate()
  }

  // Handle unsaved changes dialog - Save first
  const handleUnsavedDialogSave = async () => {
    const action = pendingAction
    
    // Save template first
    if (groups.length > 0 && templateName.trim()) {
      try {
        // Close dialog first to show saving state
        setShowUnsavedDialog(false)
        setPendingAction(null)
        
        // Mark as executing to prevent recursive checks
        setIsExecutingAction(true)
        
        // Save template
        await handleSaveTemplate()
        
        // After saving successfully, execute the pending action
        if (action) {
          if (typeof action === "function") {
            const result = action()
            if (result && typeof result.then === "function") {
              await result
            }
          }
        }
      } catch (err) {
        console.error("❌ [handleUnsavedDialogSave] Error saving template:", err)
        setError(`Failed to save template: ${err.message}`)
        // Reopen dialog if save failed
        setPendingAction(action)
        setShowUnsavedDialog(true)
      } finally {
        setIsExecutingAction(false)
      }
    } else {
      // No template name - can't save, show error and keep dialog open
      setError("กรุณาตั้งชื่อ template ก่อนบันทึก")
      // Don't close dialog, let user enter template name first
    }
  }

  // Handle unsaved changes dialog - Continue without saving
  const handleUnsavedDialogConfirm = async () => {
    const action = pendingAction
    
    // Close dialog and clear pending action first
    setShowUnsavedDialog(false)
    setPendingAction(null)
    
    // Clear unsaved changes flag before executing action
    setHasUnsavedChanges(false)
    
    if (action) {
      try {
        // Mark as executing to prevent recursive checks
        setIsExecutingAction(true)
        
        // Execute the pending action (may be async)
        if (typeof action === "function") {
          const result = action()
          // If action returns a promise, wait for it
          if (result && typeof result.then === "function") {
            await result
          }
        }
      } catch (err) {
        console.error("❌ [handleUnsavedDialogConfirm] Error executing pending action:", err)
        setError(`Failed to execute action: ${err.message}`)
      } finally {
        setIsExecutingAction(false)
      }
    }
  }

  const handleUnsavedDialogCancel = () => {
    setShowUnsavedDialog(false)
    setPendingAction(null)
  }

  // Delete template - show confirmation dialog
  const handleDeleteTemplate = (templateId) => {
    setDeleteTemplateId(templateId)
    setShowDeleteDialog(true)
  }

  // Confirm delete template
  const handleConfirmDelete = async () => {
    if (!user || !deleteTemplateId) return
    
    setShowDeleteDialog(false)
    
    try {
      await deleteTemplate(user.uid, deleteTemplateId)
      setSuccess("Template deleted successfully!")
      
      // Reload templates
      const updatedTemplates = await loadTemplates(user.uid)
      setTemplates(updatedTemplates)
      
      // If deleted template was selected, clear selection
      if (selectedTemplateId === deleteTemplateId) {
        setSelectedTemplateId("")
        setGroups([])
        setTemplateName("")
        setHasUnsavedChanges(false)
      }
      
      setDeleteTemplateId(null)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error("Delete template error:", err)
      setError(`Failed to delete template: ${err.message}`)
      setDeleteTemplateId(null)
    }
  }

  // Cancel delete
  const handleCancelDelete = () => {
    setShowDeleteDialog(false)
    setDeleteTemplateId(null)
  }

  // Handle page error dialog - Close and reset
  const handlePageErrorDialogClose = () => {
    setShowPageErrorDialog(false)
    setPageError(null)
    setPreviewPage("") // Reset to empty (will show first page)
  }

  // Warn before leaving page if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?"
        return e.returnValue
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

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
            ตั้งค่าเทมเพลตเอกสาร
          </Typography>
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            สร้างเทมเพลตที่ใช้งานซ้ำได้โดยเลือกข้อความจากเอกสาร
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ width: "100%", p: 2.5 }}>
        {/* Step 1: Upload - Full Width with 2 Columns */}
        <Box sx={{ mb: 2 }}>
            <Card sx={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)", borderRadius: 2 }}>
              <CardContent sx={{ p: 0 }}>
                <Box sx={{ 
                  background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                  p: 2,
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                }}>
                  <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                    ขั้นตอนที่ 1: อัปโหลดเอกสาร
                  </Typography>
                </Box>
                <Box sx={{ p: 2 }}>
                  <Grid container spacing={2}>
                    {/* Left Column: Upload & Controls */}
                    <Grid size={{ xs: 12, md: 5 }}>
                      <Stack spacing={1.5}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/jpg,application/pdf"
                          onChange={handleFileSelect}
                          style={{ display: "none" }}
                          id="template-settings-file-input"
                        />
                        <label htmlFor="template-settings-file-input">
                          <Button
                            variant="outlined"
                            component="span"
                            fullWidth
                            startIcon={<UploadIcon />}
                            sx={{ py: 1.5 }}
                          >
                            {imageFile ? imageFile.name : "เลือกไฟล์รูปภาพหรือ PDF"}
                          </Button>
                        </label>

                        {imageFile && (
                          <>
                            {extractingPdf && (
                              <Alert severity="info" sx={{ borderRadius: 1.5 }}>
                                📄 กำลังดึงหน้าแรกจาก PDF... กรุณารอสักครู่
                              </Alert>
                            )}
                            {imageUrl && !extractingPdf && (
                              <>
                                <Alert severity="success" sx={{ borderRadius: 1.5 }}>
                                  ✅ พร้อมแสดงตัวอย่าง ปรับการหมุนหากจำเป็น แล้วรัน OCR
                                </Alert>
                                
                                {/* Page Selection - only for PDF files */}
                                {(imageFile?.type === "application/pdf" || imageFile?.name?.toLowerCase().endsWith(".pdf")) && (
                                  <Box sx={{ 
                                    p: 2, 
                                    bgcolor: "#f8fafc", 
                                    borderRadius: 1.5, 
                                    border: "1px solid #e2e8f0" 
                                  }}>
                                    <Typography variant="caption" sx={{ color: "#64748b", mb: 1, display: "block", fontWeight: 500 }}>
                                      เลือกหน้า:
                                    </Typography>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      label="หน้า"
                                      placeholder={totalPages ? `เช่น: 2` : "เช่น: 2 (ไม่ระบุ = หน้าแรก)"}
                                      value={previewPage}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        // Only allow numbers
                                        if (value === "" || /^\d+$/.test(value)) {
                                          setPreviewPage(value);
                                        }
                                      }}
                                      onBlur={(e) => {
                                        // Validate on blur (when user finishes typing)
                                        const value = e.target.value;
                                        if (value) {
                                          const pageNum = parseInt(value, 10);
                                          if (isNaN(pageNum) || pageNum < 1) {
                                            setPreviewPage("");
                                            setError("หมายเลขหน้าต้องเป็นตัวเลขที่มากกว่า 0");
                                          } else if (totalPages && pageNum > totalPages) {
                                            setPreviewPage(totalPages.toString());
                                            setError(`เอกสารมี ${totalPages} หน้า`);
                                          } else {
                                            setError(null);
                                          }
                                        }
                                      }}
                                      type="number"
                                      inputProps={{ 
                                        min: 1,
                                        max: totalPages || undefined
                                      }}
                                      sx={{
                                        bgcolor: "#ffffff",
                                      }}
                                    />
                                    {previewPage && (
                                      <Typography variant="caption" sx={{ color: "#10b981", mt: 1, display: "block" }}>
                                        ✓ หน้า {previewPage}
                                      </Typography>
                                    )}
                                  </Box>
                                )}

                                {/* Rotate Button */}
                                <Button
                                  variant="outlined"
                                  onClick={handleRotate}
                                  disabled={!imageUrl}
                                  startIcon={<RotateRightIcon />}
                                  fullWidth
                                >
                                  หมุน ({imageRotation}°)
                                </Button>

                                {/* Run OCR Button */}
                                <Button
                                  variant="contained"
                                  onClick={handleRunOCR}
                                  disabled={loading || extractingPdf || !imageUrl}
                                  fullWidth
                                  sx={{ py: 1.5 }}
                                >
                                  {loading ? (
                                    <>
                                      <CircularProgress size={20} sx={{ mr: 1 }} />
                                      กำลังรัน OCR v2...
                                    </>
                                  ) : (
                                    "รัน OCR v2"
                                  )}
                                </Button>
                              </>
                            )}
                            {!imageUrl && !extractingPdf && (
                              <Button
                                variant="contained"
                                onClick={handleRunOCR}
                                disabled={loading || extractingPdf || !imageUrl}
                                fullWidth
                                sx={{ py: 1.5 }}
                              >
                                {loading ? (
                                  <>
                                    <CircularProgress size={20} sx={{ mr: 1 }} />
                                    กำลังรัน OCR v2...
                                  </>
                                ) : (
                                  "รัน OCR v2"
                                )}
                              </Button>
                            )}
                          </>
                        )}
                      </Stack>
                    </Grid>

                    {/* Right Column: Preview Image (Small) */}
                    <Grid size={{ xs: 12, md: 7 }}>
                      {imageUrl && !extractingPdf && (
                        <Box sx={{ 
                          border: "2px solid #e2e8f0",
                          borderRadius: 1.5,
                          overflow: "hidden",
                          bgcolor: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 325,
                          maxHeight: 400,
                          height: "100%",
                        }}>
                          <img
                            ref={imageRef}
                            src={imageUrl}
                            alt={imageFile?.name || "Document Preview"}
                            draggable={false}
                            style={{
                              maxWidth: "100%",
                              maxHeight: "100%",
                              objectFit: "contain",
                              display: "block",
                              pointerEvents: "none",
                              userSelect: "none",
                              ...(ocrResult?.normalizedImageBase64 ? {} : {
                                transform: `rotate(${imageRotation}deg)`,
                                transformOrigin: "center center",
                              }),
                            }}
                          />
                        </Box>
                      )}
                      {extractingPdf && (
                        <Box sx={{ 
                          border: "2px solid #e2e8f0",
                          borderRadius: 1.5,
                          bgcolor: "#f8fafc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 250,
                          maxHeight: 300,
                          height: "100%",
                        }}>
                          <Stack spacing={2} alignItems="center">
                            <CircularProgress />
                            <Typography variant="body2" color="text.secondary">
                              กำลังดึงหน้าแรกจาก PDF...
                            </Typography>
                          </Stack>
                        </Box>
                      )}
                      {!imageUrl && !extractingPdf && (
                        <Box sx={{ 
                          border: "2px solid #e2e8f0",
                          borderRadius: 1.5,
                          bgcolor: "#f8fafc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 250,
                          maxHeight: 300,
                          height: "100%",
                        }}>
                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                            เลือกไฟล์เพื่อแสดงตัวอย่าง
                          </Typography>
                        </Box>
                      )}
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
        </Box>

        {/* Alerts */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {/* Step 2: Document with OCR Line Overlay - แสดงเต็มหน้าจอ */}
        {ocrResult && imageFile && (
          <Box ref={step2Ref}>
            <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12 }}>
              <Card 
                ref={cardRef}
                sx={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)", borderRadius: 2, display: "flex", flexDirection: "column" }}
              >
                  <CardContent sx={{ p: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                    <Box sx={{ 
                      background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                      p: 2,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                          ขั้นตอนที่ 2: เลือกข้อความ (ลากเพื่อสร้างกลุ่ม)
                        </Typography>
                        {/* Zoom Controls */}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => setZoomLevel(prev => Math.max(0.1, prev - 0.1))}
                            sx={{ 
                              color: "#ffffff",
                              bgcolor: "rgba(255, 255, 255, 0.1)",
                              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.2)" }
                            }}
                            disabled={zoomLevel <= 0.1}
                          >
                            <RemoveIcon />
                          </IconButton>
                          <Typography variant="body2" sx={{ color: "#ffffff", minWidth: 50, textAlign: "center" }}>
                            {Math.round(zoomLevel * 100)}%
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => setZoomLevel(prev => Math.min(2.0, prev + 0.1))}
                            sx={{ 
                              color: "#ffffff",
                              bgcolor: "rgba(255, 255, 255, 0.1)",
                              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.2)" }
                            }}
                            disabled={zoomLevel >= 2.0}
                          >
                            <AddIcon />
                          </IconButton>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, justifyContent: "flex-end" }}>
                          {lines.length > 0 ? (
                            <>
                              <Chip label={`${lines.length} lines`} size="small" />
                              {groups.length > 0 && (
                                <Chip label={`${groups.length} group${groups.length !== 1 ? "s" : ""}`} color="primary" />
                              )}
                            </>
                          ) : ocrResult ? (
                            <Chip 
                              label={`${ocrResult.words?.length || 0} words found`} 
                              size="small" 
                              color={ocrResult.words?.length > 0 ? "default" : "warning"} 
                            />
                          ) : (
                            <Chip 
                              label="Preview ready" 
                              size="small" 
                              color="info" 
                            />
                          )}
                        </Box>
                      </Box>
                    </Box>
                    <Stack spacing={1.5} sx={{ p: 2, flex: 1, display: "flex", flexDirection: "column" }}>
                      {ocrResult && (!ocrResult.words || ocrResult.words.length === 0) && (
                        <Alert severity="warning">
                          No words detected in this document. Please try a different image or check if the document is readable.
                        </Alert>
                      )}

                      {ocrResult && ocrResult.words && ocrResult.words.length > 0 && lines.length === 0 && (
                        <Alert severity="info">
                          Words detected but could not be merged into lines. Please check the OCR result.
                        </Alert>
                      )}

                      {!ocrResult && imageUrl && (
                        <Alert severity="info">
                          First page preview displayed. Click "Run OCR v2" to scan the document.
                        </Alert>
                      )}

                      <Box
                        ref={containerRef}
                        sx={{
                          position: "relative",
                          border: "2px solid #e2e8f0",
                          borderRadius: 2,
                          overflow: "auto", // Allow scrolling if content is too large
                          bgcolor: "#ffffff",
                          width: "100%",
                          height: "calc(100vh - 200px)", // Full screen height
                          minHeight: "calc(100vh - 200px)", // Match height to fill screen
                          userSelect: "none", // Prevent text selection
                        }}
                      >
                        {/* Layer 1: Document Image - Show when OCR result exists */}
                        {ocrResult && imageUrl ? (
                          <Box sx={{ 
                            position: "absolute", // Position relative to container
                            top: 0,
                            left: 0,
                            width: displaySize ? `${displaySize.width + imageOffset.x * 2}px` : "100%",
                            height: displaySize ? `${displaySize.height}px` : "100%",
                            minHeight: displaySize ? `${displaySize.height}px` : "auto",
                            overflow: "visible", // Allow image to be visible even with offset
                          }}>
                            <img
                              ref={imageRef}
                              src={imageUrl}
                              alt={ocrResult?.fileName || imageFile?.name || "Document"}
                              draggable={false}
                              style={{
                                // CRITICAL: Use natural size and CSS transform scale to control size precisely
                                // This method gives us full control over image size from Firebase
                                width: (imageRef.current?.naturalWidth || ocrResult?.page?.width || 0) + "px",
                                height: (imageRef.current?.naturalHeight || ocrResult?.page?.height || 0) + "px",
                                display: "block",
                                objectFit: "none", // Prevent browser scaling
                                objectPosition: "top left", // Position from top-left (same as tokens/groups)
                                pointerEvents: "none",
                                userSelect: "none",
                                boxSizing: "border-box",
                                transformOrigin: "top left", // Scale from top-left (same as tokens/groups)
                                // CRITICAL: Use imageOffset to position image (same as tokens/groups)
                                position: "absolute",
                                top: `${imageOffset.y}px`,
                                left: `${imageOffset.x}px`,
                              }}
                              onLoad={(e) => {
                                const img = e.currentTarget
                                const naturalWidth = img.naturalWidth
                                const naturalHeight = img.naturalHeight
                                
                                // Force update displaySize and apply transform when image loads
                                if (ocrResult?.page && naturalWidth > 0 && naturalHeight > 0) {
                                  const container = containerRef.current
                                  const card = cardRef.current
                                  
                                  if (container && card) {
                                    const cardWidth = card.clientWidth
                                    const containerHeight = container.clientHeight
                                    const padding = 32
                                    const availableWidth = cardWidth - padding
                                    const availableHeight = containerHeight - 20
                                    
                                    // Calculate base scale to fit card
                                    const scaleForWidth = availableWidth / naturalWidth
                                    const scaleForHeight = availableHeight / naturalHeight
                                    const baseScale = Math.min(scaleForWidth, scaleForHeight)
                                    
                                    // Apply zoomLevel to base scale
                                    const finalScale = baseScale * zoomLevel
                                    
                                    // Calculate displayed size with zoom
                                    const displayedWidth = naturalWidth * finalScale
                                    const displayedHeight = naturalHeight * finalScale
                                    
                                    setDisplaySize({
                                      width: displayedWidth,
                                      height: displayedHeight,
                                    })
                                    
                                    // CRITICAL: Calculate scaleX and scaleY from displayedWidth/Height (same formula as useLayoutEffect)
                                    // This ensures the image uses the exact same scale as tokens and groups
                                    const scaleX = naturalWidth > 0 ? displayedWidth / naturalWidth : 1
                                    const scaleY = naturalHeight > 0 ? displayedHeight / naturalHeight : 1
                                    
                                    // CRITICAL: Use CSS transform scale to control image size precisely
                                    // Set image to natural size first
                                    img.style.width = `${naturalWidth}px`
                                    img.style.height = `${naturalHeight}px`
                                    
                                    // Then apply CSS transform scale using scaleX and scaleY (same as useLayoutEffect)
                                    if (ocrResult?.normalizedImageBase64) {
                                      img.style.transform = `scale(${scaleX}, ${scaleY})`
                                    } else {
                                      img.style.transform = `scale(${scaleX}, ${scaleY}) rotate(${imageRotation}deg)`
                                    }
                                    img.style.transformOrigin = "top left" // Match tokens/groups positioning
                                    
                                    // Calculate offset for centered image (same as useLayoutEffect)
                                    const containerRectForOffset = container.getBoundingClientRect()
                                    const containerWidthForOffset = containerRectForOffset.width
                                    const offsetXForOffset = (containerWidthForOffset - displayedWidth) / 2
                                    setImageOffset({ x: Math.max(0, offsetXForOffset), y: 0 })
                                  }
                                }
                              }}
                            />
                          </Box>
                        ) : extractingPdf ? (
                          <Box
                            sx={{
                              width: "100%",
                              minHeight: 300,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              bgcolor: "#f8fafc",
                            }}
                          >
                            <Stack spacing={2} alignItems="center">
                              <CircularProgress />
                              <Typography variant="body2" color="text.secondary">
                                Extracting first page from PDF...
                              </Typography>
                            </Stack>
                          </Box>
                        ) : (
                          <Box
                            sx={{
                              width: "100%",
                              minHeight: 300,
                              bgcolor: "#f8fafc",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              รัน OCR เพื่อเริ่มเลือกข้อความ
                            </Typography>
                          </Box>
                        )}

                        {/* Layer 2: OCR Word Overlay - Visual only, pointer-events: none */}
                        {/* Show merged words (connected words as single units) */}
                        {displaySize && mergedWords && mergedWords.length > 0 && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: imageOffset.y,
                              left: imageOffset.x,
                              width: displaySize.width,
                              height: displaySize.height,
                              pointerEvents: "none",
                              zIndex: 1,
                            }}
                          >
                            <OCRWordLayer
                              words={mergedWords}
                              scaleX={scaleX}
                              scaleY={scaleY}
                              selectedWordIndices={new Set()} // Words are selected via drag, not click
                            />
                          </Box>
                        )}

                        {/* Layer 2b: Group Display - Interactive layer for group selection/drag/resize */}
                        {displaySize && groups.length > 0 && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: imageOffset.y,
                              left: imageOffset.x,
                              width: displaySize.width,
                              height: displaySize.height,
                              pointerEvents: "none", // Don't block events - only groups themselves will capture
                              zIndex: 2,
                            }}
                          >
                            <GroupSelectionLayer
                              groups={groups}
                              scaleX={scaleX}
                              scaleY={scaleY}
                              isSelecting={isSelecting}
                              selectionBox={selectionBox}
                              selectedGroupId={selectedGroupId}
                              onGroupClick={handleGroupClick}
                              onGroupDragStart={handleGroupDragStart}
                              onGroupResizeStart={handleGroupResizeStart}
                              onGroupDelete={handleGroupDelete}
                            />
                          </Box>
                        )}

                        {/* Layer 3: Interaction Layer - Handles selection box (always available, but lower z-index than groups) */}
                        {displaySize && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: imageOffset.y,
                              left: imageOffset.x,
                              width: displaySize.width,
                              height: displaySize.height,
                              pointerEvents: "auto",
                              zIndex: 1,
                            }}
                          >
                            <InteractionLayer
                            onMouseDown={(e) => {
                              // Don't start selection if dragging or resizing a group
                              if (isDraggingGroup || isResizingGroup) {
                                console.log("⚠️ [InteractionLayer] Ignoring mousedown - dragging/resizing group")
                                return
                              }

                              // Check if clicking on a group - if yes, let GroupSelectionLayer handle it
                              const rect = containerRef.current?.getBoundingClientRect()
                              if (rect) {
                                // Convert screen coordinates to OCR coordinates using scale
                                const x = (e.clientX - rect.left - imageOffset.x) / scaleX
                                const y = (e.clientY - rect.top - imageOffset.y) / scaleY
                                const clickedGroup = groups.find((g) => {
                                  return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h
                                })
                                if (clickedGroup) {
                                  // Clicked on a group - let GroupSelectionLayer handle it via its own onClick
                                  // Don't prevent default - let the event bubble to GroupSelectionLayer
                                  console.log(`🖱️ [InteractionLayer] Clicked on group ${clickedGroup.id} - letting GroupSelectionLayer handle`)
                                  return // Don't start selection
                                } else {
                                  // Clicked outside groups - deselect and start new selection
                                  // This allows creating unlimited groups
                                  console.log(`🖱️ [InteractionLayer] Clicked outside groups - starting new selection`)
                                  if (selectedGroupId) {
                                    console.log(`🖱️ [Group] Deselecting group ${selectedGroupId} to allow new selection`)
                                    setSelectedGroupId(null)
                                  }
                                  // Reset any drag/resize state to ensure clean start for new selection
                                  if (isDraggingGroup || isResizingGroup) {
                                    setIsDraggingGroup(false)
                                    setIsResizingGroup(false)
                                    setDragStart(null)
                                    setResizeHandle(null)
                                  }
                                  handleMouseDown(e)
                                }
                              } else {
                                // No rect - deselect and start selection
                                if (selectedGroupId) {
                                  setSelectedGroupId(null)
                                }
                                handleMouseDown(e)
                              }
                            }}
                            onMouseMove={(e) => {
                              // Only handle mouse move if not dragging/resizing group
                              if (!isDraggingGroup && !isResizingGroup) {
                                handleMouseMove(e)
                              }
                            }}
                            onMouseUp={(e) => {
                              // Only handle mouse up if not dragging/resizing group
                              if (!isDraggingGroup && !isResizingGroup) {
                                handleMouseUp(e)
                              }
                            }}
                            onMouseLeave={(e) => {
                              // Only handle mouse leave if not dragging/resizing group
                              if (!isDraggingGroup && !isResizingGroup) {
                                handleMouseUp(e)
                              }
                            }}
                            isSelecting={isSelecting}
                            selectionBox={selectionBox}
                            scaleX={scaleX}
                            scaleY={scaleY}
                          />
                          </Box>
                        )}
                        
                        {/* Layer 4: Global mouse move/up for group drag/resize (when group is selected) */}
                        {/* This layer captures mouse events during drag/resize, but allows clicks on UI elements */}
                        {displaySize && (isDraggingGroup || isResizingGroup) && (
                          <Box
                            sx={{
                              position: "fixed", // Use fixed to capture events outside container
                              top: 0,
                              left: 0,
                              width: "100vw",
                              height: "100vh",
                              pointerEvents: "auto", // Must be auto to receive events
                              zIndex: 9999, // Very high to capture all events
                              bgcolor: "transparent",
                            }}
                            onMouseMove={(e) => {
                              // Don't prevent default - allow other handlers to work
                              // Only handle if still dragging/resizing
                              if (isDraggingGroup || isResizingGroup) {
                                handleGroupMouseMove(e)
                              }
                            }}
                            onMouseUp={(e) => {
                              // Check if clicking on a button or UI element - if yes, don't prevent
                              const target = e.target
                              const isUIElement = target.closest('button') || 
                                                  target.closest('[role="button"]') ||
                                                  target.closest('.MuiButton-root') ||
                                                  target.closest('.MuiIconButton-root')
                              
                              if (!isUIElement) {
                                // Only prevent if not clicking on UI element
                                e.preventDefault()
                                e.stopPropagation()
                              }
                              
                              // Always handle mouse up to end drag/resize
                              if (isDraggingGroup || isResizingGroup) {
                                handleGroupMouseUp()
                              }
                            }}
                            onMouseLeave={(e) => {
                              // Only handle if still dragging/resizing
                              if (isDraggingGroup || isResizingGroup) {
                                handleGroupMouseUp()
                              }
                            }}
                            onClick={(e) => {
                              // Allow clicks on UI elements to pass through
                              const target = e.target
                              const isUIElement = target.closest('button') || 
                                                  target.closest('[role="button"]') ||
                                                  target.closest('.MuiButton-root') ||
                                                  target.closest('.MuiIconButton-root')
                              
                              if (isUIElement) {
                                // Don't prevent clicks on UI elements
                                return
                              }
                              
                              // For other clicks, prevent to avoid triggering unwanted actions
                              e.preventDefault()
                              e.stopPropagation()
                            }}
                          >
                          </Box>
                        )}
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
            </Grid>
          </Grid>
          
          {/* Step 3: Templates */}
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {/* Templates Column */}
            <Grid size={{ xs: 12 }}>
              <Stack spacing={2} sx={{ height: "100%" }}>
                <Card sx={{ 
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)", 
                  borderRadius: 2,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}>
                  <CardContent sx={{ p: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                    <Box sx={{ 
                      background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                      p: 2,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}>
                      <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                        ขั้นตอนที่ 3: เทมเพลต
                      </Typography>
                      {/* ปุ่มบันทึก - แสดงเฉพาะเมื่อมีการแก้ไข */}
                      {(() => {
                        const shouldShow = hasUnsavedChanges && groups.length > 0
                        // Debug: log state every render to see what's happening
                        console.log("💾 [Save Button] State check:", {
                          hasUnsavedChanges,
                          groupsLength: groups.length,
                          shouldShow,
                          templateName: templateName.trim(),
                          saving
                        })
                        return shouldShow ? (
                          <Button
                            variant="contained"
                            startIcon={<SaveIcon />}
                            onClick={handleSaveTemplate}
                            disabled={saving || !templateName.trim()}
                            fullWidth
                            size="small"
                            sx={{
                              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
                              "&:hover": {
                                background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                                boxShadow: "0 6px 16px rgba(245, 158, 11, 0.4)",
                              },
                              "&:disabled": {
                                background: "rgba(255, 255, 255, 0.1)",
                                color: "rgba(255, 255, 255, 0.5)",
                              },
                              py: 0.75,
                              mt: 1,
                            }}
                          >
                            {saving ? "กำลังบันทึก..." : "💾 บันทึกการเปลี่ยนแปลง"}
                          </Button>
                        ) : null
                      })()}
                    </Box>
                    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                      {/* TextField สำหรับชื่อเทมเพลต - แสดงเมื่อสร้างใหม่หรือแก้ไข */}
                      {groups.length > 0 && (
                        <TextField
                          label="ชื่อเทมเพลต"
                          value={templateName}
                          onChange={(e) => {
                            setTemplateName(e.target.value)
                            setHasUnsavedChanges(true)
                          }}
                          placeholder="เช่น บัตรประชาชน, ใบแจ้งหนี้"
                          size="small"
                          fullWidth
                          error={templates.some(
                            t => t.templateName.toLowerCase() === templateName.trim().toLowerCase() && 
                                 t.templateId !== selectedTemplateId && templateName.trim() !== ""
                          )}
                          helperText={
                            templates.some(
                              t => t.templateName.toLowerCase() === templateName.trim().toLowerCase() && 
                                   t.templateId !== selectedTemplateId && templateName.trim() !== ""
                            ) ? "ชื่อเทมเพลตนี้มีอยู่แล้ว" : ""
                          }
                        />
                      )}

                      {/* รายการเทมเพลต */}
                      {templates.length > 0 ? (
                        <Box sx={{ 
                          display: "grid", 
                          gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
                          gap: 1.5,
                          overflowY: "auto",
                          p: 0.5,
                          maxHeight: 400,
                        }}>
                          {templates.map((template) => (
                            <Box
                              key={template.templateId}
                              sx={{
                                position: "relative",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                p: 1.5,
                                borderRadius: 1.5,
                                bgcolor: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                "&:hover": {
                                  bgcolor: "#f1f5f9",
                                  borderColor: "#cbd5e1",
                                  transform: "translateY(-2px)",
                                  boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                                },
                              }}
                              onClick={() => handleTemplateSelect(template.templateId)}
                            >
                              {/* Icon กลมๆ */}
                              <Box
                                sx={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: "50%",
                                  bgcolor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  mb: 0.75,
                                  boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
                                }}
                              >
                                <DescriptionIcon sx={{ fontSize: 24, color: "#ffffff" }} />
                              </Box>
                              
                              {/* ชื่อเทมเพลต */}
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
                                {template.templateName}
                              </Typography>
                              
                              {/* จำนวนคอลัมน์ */}
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: "#64748b", 
                                  fontSize: "0.6rem",
                                }}
                              >
                                {template.columns.length} คอลัมน์
                              </Typography>

                              {/* ปุ่มลบ น่ารักๆ */}
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTemplate(template.templateId)
                                }}
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
                                <DeleteIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ color: "#94a3b8", textAlign: "center", py: 3 }}>
                          ยังไม่มีเทมเพลตที่บันทึก
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>

          {/* Step 4: Groups & Preview Table */}
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {/* Groups Column */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ 
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)", 
                borderRadius: 2,
              }}>
                <CardContent sx={{ p: 0 }}>
                  <Box sx={{ 
                    background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                    p: 2,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}>
                    <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                      ขั้นตอนที่ 4: กลุ่มและคอลัมน์
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <GroupMappingPanel
                      groups={groups}
                      ocrResult={ocrResult}
                      onGroupUpdate={handleGroupUpdate}
                      onGroupDelete={handleGroupDelete}
                      onGroupReorder={handleGroupReorder}
                      onGroupAdd={handleGroupAdd}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Preview Column */}
            <Grid size={{ xs: 12, md: 8 }}>
              {groups.length > 0 && (
                <Card sx={{ 
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)", 
                  borderRadius: 2,
                }}>
                  <CardContent sx={{ p: 0 }}>
                    <Box sx={{ 
                      background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                      p: 2,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}>
                      <Typography variant="h6" fontWeight={600} sx={{ color: "#ffffff", fontSize: "1.1rem" }}>
                        ตัวอย่างข้อมูล
                      </Typography>
                    </Box>
                    <Box sx={{ p: 2 }}>
                      <PreviewTable ocrResult={ocrResult} groups={groups} />
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Grid>
          </Grid>
          </Box>
        )}
      </Box>

      {/* Unsaved Changes Dialog - Beautiful with animations */}
      <Dialog
        open={showUnsavedDialog}
        onClose={handleUnsavedDialogCancel}
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 300 }}
        disableEnforceFocus={true}
        disableAutoFocus={false}
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
        <Fade in={showUnsavedDialog} timeout={300}>
          <Box>
            <DialogTitle
              sx={{
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 2.5,
                px: 3,
              }}
            >
              <WarningIcon sx={{ fontSize: 28 }} />
              <Typography variant="h6" fontWeight={600}>
                มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
              </Typography>
            </DialogTitle>
            <DialogContent sx={{ p: 3, pt: 3 }}>
              <Typography variant="body1" sx={{ color: "#64748b", lineHeight: 1.7, mb: 1 }}>
                คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก คุณต้องการบันทึกก่อนดำเนินการต่อหรือไม่?
              </Typography>
              {groups.length > 0 && !templateName.trim() && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  กรุณาตั้งชื่อ template ก่อนบันทึก
                </Alert>
              )}
            </DialogContent>
            <DialogActions
              sx={{
                p: 2.5,
                px: 3,
                gap: 1.5,
                borderTop: "1px solid #e2e8f0",
                flexDirection: "row",
                justifyContent: "flex-end",
              }}
            >
              <Button
                onClick={handleUnsavedDialogCancel}
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
              {groups.length > 0 && templateName.trim() && (
                <Button
                  onClick={handleUnsavedDialogSave}
                  variant="contained"
                  startIcon={<SaveIcon />}
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
                    },
                  }}
                >
                  บันทึกก่อน
                </Button>
              )}
              <Button
                onClick={handleUnsavedDialogConfirm}
                variant="contained"
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                    boxShadow: "0 6px 16px rgba(239, 68, 68, 0.4)",
                  },
                }}
              >
                ดำเนินการต่อโดยไม่บันทึก
              </Button>
            </DialogActions>
          </Box>
        </Fade>
      </Dialog>

      {/* Page Error Dialog - Show when page is out of range */}
      <Dialog
        open={showPageErrorDialog}
        onClose={handlePageErrorDialogClose}
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 300 }}
        disableEnforceFocus={true}
        disableAutoFocus={false}
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
        <Fade in={showPageErrorDialog} timeout={300}>
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
              }}
            >
              <WarningIcon sx={{ fontSize: 28 }} />
              <Typography variant="h6" fontWeight={600}>
                หน้าไม่ถูกต้อง
              </Typography>
            </DialogTitle>
            <DialogContent sx={{ p: 3, pt: 3 }}>
              <Typography variant="body1" sx={{ color: "#64748b", lineHeight: 1.7, mb: 2 }}>
                {pageError && (
                  <>
                    ไม่สามารถดึงหน้า <strong>{pageError.requestedPage}</strong> ได้
                    <br />
                    เอกสารมีทั้งหมด <strong>{pageError.totalPages}</strong> หน้า
                  </>
                )}
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                ระบบจะแสดงหน้าแรกให้อัตโนมัติ
              </Alert>
            </DialogContent>
            <DialogActions
              sx={{
                p: 2.5,
                pt: 1.5,
                gap: 1.5,
                justifyContent: "flex-end",
              }}
            >
              <Button
                onClick={handlePageErrorDialogClose}
                variant="contained"
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    boxShadow: "0 6px 16px rgba(59, 130, 246, 0.4)",
                  },
                }}
              >
                ตกลง
              </Button>
            </DialogActions>
          </Box>
        </Fade>
      </Dialog>

      {/* Delete Group Confirmation Dialog - Beautiful with animations */}
      <Dialog
        open={showDeleteGroupDialog}
        onClose={handleCancelDeleteGroup}
        TransitionComponent={Slide}
        TransitionProps={{ direction: "down", timeout: 300 }}
        disableEnforceFocus={true}
        disableRestoreFocus={true}
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
            minWidth: 480,
            maxWidth: 520,
          },
        }}
      >
        <Slide direction="down" in={showDeleteGroupDialog} timeout={300}>
          <Box>
            <DialogTitle
              sx={{
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 2,
                py: 3,
                px: 3.5,
                position: "relative",
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <WarningIcon sx={{ fontSize: 22 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" fontWeight={600} sx={{ fontSize: "1.1rem" }}>
                  ยืนยันการลบกรุ๊ป
                </Typography>
              </Box>
              <IconButton
                onClick={handleCancelDeleteGroup}
                sx={{
                  color: "#fff",
                  width: 32,
                  height: 32,
                  "&:hover": {
                    backgroundColor: "rgba(255,255,255,0.15)",
                  },
                }}
                size="small"
              >
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ p: 3.5, pt: 3.5 }}>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    mb: 3, 
                    lineHeight: 1.7, 
                    color: "#1e293b",
                    fontSize: "0.95rem",
                    textAlign: "center",
                  }}
                >
                  คุณแน่ใจหรือไม่ว่าต้องการลบกรุ๊ปนี้?
                </Typography>
                {deleteGroupId && (() => {
                  const group = groups.find(g => g.id === deleteGroupId)
                  return group ? (
                    <Box
                      sx={{
                        bgcolor: "#fffbeb",
                        border: "2px solid #fde68a",
                        borderRadius: 2.5,
                        p: 2.5,
                        mb: 2.5,
                        position: "relative",
                        overflow: "hidden",
                        "&::before": {
                          content: '""',
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 3,
                          background: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
                        },
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            bgcolor: "#fef3c7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <DescriptionIcon sx={{ fontSize: 18, color: "#d97706" }} />
                        </Box>
                        <Typography 
                          variant="body1" 
                          sx={{ 
                            fontWeight: 600, 
                            color: "#92400e",
                            fontSize: "0.95rem",
                          }}
                        >
                          {group.label}
                        </Typography>
                      </Box>
                      {group.text && (() => {
                        const textLines = removeEmptyLines(group.text || "").split("\n").filter(l => l.trim())
                        const maxLines = 5 // Show only first 5 lines
                        const displayLines = textLines.slice(0, maxLines)
                        const remainingCount = textLines.length - maxLines
                        
                        return (
                          <Box
                            sx={{
                              pl: 4.5,
                              borderLeft: "2px solid #fde68a",
                            }}
                          >
                            <Box
                              sx={{
                                maxHeight: 200, // Limit height
                                overflowY: "auto", // Add scroll
                                pr: 1,
                                "&::-webkit-scrollbar": {
                                  width: "6px",
                                },
                                "&::-webkit-scrollbar-track": {
                                  backgroundColor: "#fef3c7",
                                  borderRadius: "3px",
                                },
                                "&::-webkit-scrollbar-thumb": {
                                  backgroundColor: "#f59e0b",
                                  borderRadius: "3px",
                                  "&:hover": {
                                    backgroundColor: "#d97706",
                                  },
                                },
                              }}
                            >
                              <Typography 
                                variant="body2" 
                                component="span"
                                sx={{ 
                                  color: "#78350f",
                                  lineHeight: 1.6,
                                  wordBreak: "break-word",
                                  whiteSpace: "pre-wrap",
                                  display: "block",
                                }}
                              >
                                {displayLines.join("\n")}
                              </Typography>
                              {remainingCount > 0 && (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: "#92400e",
                                    mt: 1,
                                    fontStyle: "italic",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  ... และอีก {remainingCount} รายการ
                                </Typography>
                              )}
                            </Box>
                            {textLines.length > 0 && (
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: "#a16207",
                                  mt: 1,
                                  display: "block",
                                  fontSize: "0.75rem",
                                }}
                              >
                                รวมทั้งหมด {textLines.length} รายการ
                              </Typography>
                            )}
                          </Box>
                        )
                      })()}
                    </Box>
                  ) : null
                })()}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    bgcolor: "#f8fafc",
                    borderRadius: 2,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <WarningIcon sx={{ color: "#f59e0b", fontSize: 20, flexShrink: 0 }} />
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: "#64748b", 
                      lineHeight: 1.6,
                      fontSize: "0.85rem",
                    }}
                  >
                    การกระทำนี้ไม่สามารถยกเลิกได้ กรุ๊ปจะถูกลบออกจากเทมเพลตทันที
                  </Typography>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions
              sx={{
                p: 3,
                pt: 2,
                gap: 1.5,
                justifyContent: "center",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <Button
                onClick={handleCancelDeleteGroup}
                variant="outlined"
                sx={{
                  textTransform: "none",
                  px: 4,
                  py: 1.25,
                  borderRadius: 2,
                  borderColor: "#cbd5e1",
                  color: "#475569",
                  fontWeight: 500,
                  minWidth: 120,
                  "&:hover": {
                    borderColor: "#94a3b8",
                    bgcolor: "#f1f5f9",
                  },
                }}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleConfirmDeleteGroup}
                variant="contained"
                startIcon={<DeleteIcon sx={{ fontSize: 18 }} />}
                sx={{
                  textTransform: "none",
                  px: 4,
                  py: 1.25,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
                  fontWeight: 500,
                  minWidth: 140,
                  "&:hover": {
                    background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                    boxShadow: "0 6px 16px rgba(239, 68, 68, 0.4)",
                  },
                }}
              >
                ลบกรุ๊ป
              </Button>
            </DialogActions>
          </Box>
        </Slide>
      </Dialog>

      {/* Delete Template Confirmation Dialog - Beautiful with animations */}
      <Dialog
        open={showDeleteDialog}
        onClose={handleCancelDelete}
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
        <Slide direction="down" in={showDeleteDialog} timeout={300}>
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
                <DeleteIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  ยืนยันการลบเทมเพลต
                </Typography>
              </Box>
              <IconButton
                onClick={handleCancelDelete}
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
                    คุณแน่ใจหรือไม่ว่าต้องการลบเทมเพลตนี้?
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#64748b", lineHeight: 1.7 }}>
                    การกระทำนี้ไม่สามารถยกเลิกได้ เทมเพลตและข้อมูลทั้งหมดจะถูกลบอย่างถาวร
                  </Typography>
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
                onClick={handleCancelDelete}
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
                onClick={handleConfirmDelete}
                variant="contained"
                startIcon={<DeleteIcon />}
                sx={{
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                    boxShadow: "0 6px 16px rgba(239, 68, 68, 0.4)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 0.2s ease",
                }}
              >
                ลบเทมเพลต
              </Button>
            </DialogActions>
          </Box>
        </Slide>
      </Dialog>
    </Box>
  )
}
