import { useState, useEffect, useRef, useCallback } from "react"
import {
  Box,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material"
import UploadIcon from "@mui/icons-material/Upload"
import { auth } from "../../firebase"
import { ocrImageGemini } from "../../services/ocr.service.gemini"

/**
 * Template Builder V2 - Dedicated v2 UI with word selection overlay.
 * 
 * Features:
 * - Uses OCR Gemini ONLY (ocrImageGemini)
 * - Shows uploaded image with OCR word bounding boxes overlay
 * - Interactive word selection (click to select/highlight)
 * - Visual feedback for selected words
 * - Clearly different from v1/v2 UI
 */
export default function TemplateBuilderV2() {
  const [imageFile, setImageFile] = useState(null)
  const [imageUrl, setImageUrl] = useState("")
  const [ocrResult, setOcrResult] = useState(null)
  const [selectedWordIndices, setSelectedWordIndices] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [displaySize, setDisplaySize] = useState(null)
  const imageRef = useRef(null)
  const containerRef = useRef(null)

  const user = auth.currentUser

  // Convert file to URL
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile)
      setImageUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setImageUrl("")
    }
  }, [imageFile])

  // Get image display size
  useEffect(() => {
    const image = imageRef.current
    if (!image) return

    const updateSize = () => {
      if (image.complete) {
        setDisplaySize({
          width: image.clientWidth,
          height: image.clientHeight,
        })
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
      image.removeEventListener("load", updateSize)
      window.removeEventListener("resize", handleResize)
    }
  }, [imageUrl])

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setImageFile(file)
      setOcrResult(null)
      setSelectedWordIndices(new Set())
      setError(null)
    } else {
      setError("Please select an image file (JPG, PNG)")
    }
  }

  // Run OCR Gemini - ONLY uses ocrImageGemini
  const handleRunOCR = async () => {
    if (!imageFile || !user) return

    setLoading(true)
    setError(null)

    try {
      // Use OCR Gemini ONLY
      console.log("🔍 [Gemini UI] Running OCR Gemini...")
      const result = await ocrImageGemini(imageFile)
      setOcrResult(result)
      setSelectedWordIndices(new Set())
      console.log(`✅ [Gemini UI] OCR Gemini completed: ${result.words.length} words found`)
    } catch (err) {
      console.error("❌ [Gemini UI] OCR Gemini error:", err)
      setError(`OCR Gemini failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Calculate scale factor for word coordinates
  const getScaleFactor = useCallback(() => {
    if (!ocrResult || !displaySize) {
      return { scaleX: 1, scaleY: 1 }
    }

    const ocrWidth = ocrResult.page.width
    const ocrHeight = ocrResult.page.height

    const scaleX = ocrWidth > 0 ? displaySize.width / ocrWidth : 1
    const scaleY = ocrHeight > 0 ? displaySize.height / ocrHeight : 1

    return { scaleX, scaleY }
  }, [ocrResult, displaySize])

  // Handle word click - toggle selection
  const handleWordClick = useCallback(
    (wordIndex, event) => {
      event.stopPropagation()
      setSelectedWordIndices((prev) => {
        const next = new Set(prev)
        if (next.has(wordIndex)) {
          next.delete(wordIndex)
        } else {
          next.add(wordIndex)
        }
        return next
      })
    },
    []
  )

  const { scaleX, scaleY } = getScaleFactor()
  const selectedCount = selectedWordIndices.size

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0f172a", p: 4 }}>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        {/* V2 Header - Clearly different styling */}
        <Box sx={{ mb: 4, textAlign: "center" }}>
          <Chip
            label="V2"
            color="primary"
            sx={{ mb: 2, fontWeight: 700, fontSize: "0.75rem" }}
          />
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{ color: "#ffffff", mb: 1 }}
          >
            OCR Template Builder (v2)
          </Typography>
          <Typography variant="body1" sx={{ color: "#94a3b8" }}>
            Interactive word selection with real-time OCR overlay
          </Typography>
        </Box>

        <Stack spacing={3}>
          {/* File Upload Section */}
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ color: "#ffffff" }}>
                  Step 1: Upload Document
                </Typography>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                  id="v2-ui-file-input"
                />
                <label htmlFor="v2-ui-file-input">
                  <Button
                    variant="outlined"
                    component="span"
                    fullWidth
                    startIcon={<UploadIcon />}
                    sx={{
                      py: 2,
                      borderColor: "#475569",
                      color: "#e2e8f0",
                      "&:hover": {
                        borderColor: "#64748b",
                        bgcolor: "#334155",
                      },
                    }}
                  >
                    {imageFile ? imageFile.name : "Select Image File"}
                  </Button>
                </label>

                {imageFile && (
                  <Button
                    variant="contained"
                    onClick={handleRunOCR}
                    disabled={loading}
                    fullWidth
                    sx={{ py: 1.5, bgcolor: "#3b82f6" }}
                  >
                    {loading ? (
                      <>
                        <CircularProgress size={20} sx={{ mr: 1, color: "#ffffff" }} />
                        Running OCR v2...
                      </>
                    ) : (
                      "Run OCR v2"
                    )}
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* OCR Preview with Word Selection Overlay */}
          {ocrResult && imageFile && (
            <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
              <CardContent>
                <Stack spacing={2}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="h6" sx={{ color: "#ffffff" }}>
                      Step 2: Select Words
                    </Typography>
                    {selectedCount > 0 && (
                      <Chip
                        label={`${selectedCount} word${selectedCount !== 1 ? "s" : ""} selected`}
                        color="primary"
                        size="small"
                      />
                    )}
                  </Box>

                  {/* Document with Interactive Word Overlay */}
                  <Box
                    ref={containerRef}
                    sx={{
                      position: "relative",
                      border: "2px solid #475569",
                      borderRadius: 2,
                      overflow: "hidden",
                      bgcolor: "#0f172a",
                      display: "inline-block",
                      width: "100%",
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

                    {/* Interactive Word Overlay - V2 Feature */}
                    {displaySize && (
                      <Box
                        component="svg"
                        sx={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: displaySize.width,
                          height: displaySize.height,
                          pointerEvents: "auto",
                          zIndex: 2,
                        }}
                      >
                        {ocrResult.words.map((word, index) => {
                          const scaledX = word.x * scaleX
                          const scaledY = word.y * scaleY
                          const scaledW = word.w * scaleX
                          const scaledH = word.h * scaleY
                          const isSelected = selectedWordIndices.has(index)

                          return (
                            <g key={`word-${index}`}>
                              {/* Word bounding box - clickable */}
                              <rect
                                x={scaledX}
                                y={scaledY}
                                width={scaledW}
                                height={scaledH}
                                fill={
                                  isSelected
                                    ? "rgba(59, 130, 246, 0.4)"
                                    : "rgba(59, 130, 246, 0.1)"
                                }
                                stroke={isSelected ? "#3b82f6" : "#60a5fa"}
                                strokeWidth={isSelected ? 3 : 1.5}
                                style={{
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                }}
                                onClick={(e) => handleWordClick(index, e)}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.setAttribute("fill", "rgba(59, 130, 246, 0.2)")
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.setAttribute("fill", "rgba(59, 130, 246, 0.1)")
                                  }
                                }}
                              />
                              {/* Selection indicator */}
                              {isSelected && (
                                <circle
                                  cx={scaledX + scaledW - 6}
                                  cy={scaledY + 6}
                                  r={8}
                                  fill="#3b82f6"
                                  stroke="#ffffff"
                                  strokeWidth="2"
                                />
                              )}
                              {/* Word text label */}
                              <text
                                x={scaledX}
                                y={scaledY - 4}
                                fontSize="11"
                                fill={isSelected ? "#3b82f6" : "#94a3b8"}
                                fontWeight={isSelected ? "bold" : "normal"}
                                style={{ pointerEvents: "none" }}
                              >
                                {word.text}
                              </text>
                            </g>
                          )
                        })}
                      </Box>
                    )}
                  </Box>

                  {/* Selected Words Info */}
                  {selectedCount > 0 && (
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: "#0f172a",
                        borderRadius: 1,
                        border: "1px solid #334155",
                      }}
                    >
                      <Typography variant="body2" sx={{ color: "#94a3b8", mb: 1 }}>
                        Selected words:
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {Array.from(selectedWordIndices).map((index) => {
                          const word = ocrResult.words[index]
                          return (
                            <Chip
                              key={index}
                              label={word.text}
                              size="small"
                              sx={{
                                bgcolor: "#1e40af",
                                color: "#ffffff",
                                fontWeight: 500,
                              }}
                            />
                          )
                        })}
                      </Box>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                <strong style={{ color: "#ffffff" }}>V2 Features:</strong> Click on any word to
                select it. Selected words are highlighted in blue. This is the foundation for
                template building.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </Box>
  )
}
