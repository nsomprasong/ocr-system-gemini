import { useState, useEffect, useRef } from "react"
import { Box } from "@mui/material"

/**
 * DocumentCanvas component displays a document image with OCR bounding boxes overlaid.
 * 
 * Features:
 * - Displays document image (from File, URL, or base64)
 * - Overlays OCR word bounding boxes
 * - Scales bounding boxes to match displayed image size
 */
export default function DocumentCanvas({
  imageSource,
  ocrResult,
  width = "100%",
  height = "auto",
  showText = false,
}) {
  const [imageUrl, setImageUrl] = useState("")
  const [imageSize, setImageSize] = useState(null)
  const imageRef = useRef(null)
  const containerRef = useRef(null)

  // Convert image source to URL
  useEffect(() => {
    let url = ""

    if (imageSource instanceof File) {
      // File object: create object URL
      url = URL.createObjectURL(imageSource)
      setImageUrl(url)

      // Cleanup object URL when component unmounts or file changes
      return () => {
        if (url) {
          URL.revokeObjectURL(url)
        }
      }
    } else if (typeof imageSource === "string") {
      // String: could be URL or base64
      setImageUrl(imageSource)
    }
  }, [imageSource])

  // Get actual displayed image size and update on resize
  useEffect(() => {
    const image = imageRef.current
    if (!image) return

    const updateSize = () => {
      if (image.complete) {
        setImageSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
      }
    }

    const handleLoad = () => {
      updateSize()
    }

    // Initial size
    if (image.complete) {
      updateSize()
    } else {
      image.addEventListener("load", handleLoad)
    }

    // Update on window resize for responsive scaling
    const handleResize = () => {
      updateSize()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      image.removeEventListener("load", handleLoad)
      window.removeEventListener("resize", handleResize)
    }
  }, [imageUrl, ocrResult])

  // Calculate scale factor between OCR page dimensions and displayed image
  const getScaleFactor = () => {
    if (!ocrResult || !imageSize || !imageRef.current) {
      return { scaleX: 1, scaleY: 1 }
    }

    const displayedWidth = imageRef.current.clientWidth
    const displayedHeight = imageRef.current.clientHeight
    const ocrWidth = ocrResult.page.width
    const ocrHeight = ocrResult.page.height

    const scaleX = ocrWidth > 0 ? displayedWidth / ocrWidth : 1
    const scaleY = ocrHeight > 0 ? displayedHeight / ocrHeight : 1

    return { scaleX, scaleY }
  }

  const { scaleX, scaleY } = getScaleFactor()

  return (
    <Box
      ref={containerRef}
      sx={{
        position: "relative",
        width,
        height,
        display: "inline-block",
        maxWidth: "100%",
      }}
    >
      {/* Document Image */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt={ocrResult?.fileName || "Document"}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          maxWidth: "100%",
        }}
      />

      {/* OCR Bounding Boxes Overlay - Real-time rendering */}
      {ocrResult && imageSize && imageRef.current && ocrResult.words.length > 0 && (
        <Box
          component="svg"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: imageRef.current.clientWidth,
            height: imageRef.current.clientHeight,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {ocrResult.words.map((word, index) => {
            // Scale coordinates from OCR page dimensions to displayed image size
            const scaledX = word.x * scaleX
            const scaledY = word.y * scaleY
            const scaledW = word.w * scaleX
            const scaledH = word.h * scaleY

            // Skip words with invalid dimensions
            if (scaledW <= 0 || scaledH <= 0) return null

            return (
              <g key={`word-${index}-${word.x}-${word.y}`}>
                {/* Bounding box rectangle - shows word position */}
                <rect
                  x={scaledX}
                  y={scaledY}
                  width={scaledW}
                  height={scaledH}
                  fill="rgba(59, 130, 246, 0.1)"
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  opacity="0.8"
                />
                {/* Word text label (optional) */}
                {showText && word.text && (
                  <text
                    x={scaledX}
                    y={scaledY - 2}
                    fontSize="11"
                    fill="#1e40af"
                    fontWeight="500"
                    style={{ pointerEvents: "none" }}
                  >
                    {word.text}
                  </text>
                )}
              </g>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
