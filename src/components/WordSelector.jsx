import { useState, useCallback, useRef, useEffect } from "react"
import { Box, Chip, Stack, Button, TextField } from "@mui/material"
import DeleteIcon from "@mui/icons-material/Delete"

/**
 * WordSelector component allows users to click/select OCR words
 * and group them into fields for template building.
 * 
 * Features:
 * - Click words to select/deselect
 * - Group selected words into named fields
 * - Map fields to Excel columns (A, B, C, ...)
 * - Real-time visual feedback
 */
export default function WordSelector({
  imageSource,
  ocrResult,
  onFieldsChange,
  initialFields = [],
}) {
  const [selectedWordIndices, setSelectedWordIndices] = useState(new Set())
  const [fields, setFields] = useState(initialFields)
  const [isCreatingField, setIsCreatingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState("")
  const [editingFieldId, setEditingFieldId] = useState(null)
  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const [imageUrl, setImageUrl] = useState("")
  const [displaySize, setDisplaySize] = useState(null)

  // Convert image source to URL
  useEffect(() => {
    let url = ""
    if (imageSource instanceof File) {
      url = URL.createObjectURL(imageSource)
      setImageUrl(url)
      return () => {
        if (url) URL.revokeObjectURL(url)
      }
    } else if (typeof imageSource === "string") {
      setImageUrl(imageSource)
    }
  }, [imageSource])

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

  // Sync fields with parent
  useEffect(() => {
    onFieldsChange(fields)
  }, [fields, onFieldsChange])

  // Calculate scale factor for word coordinates
  const getScaleFactor = () => {
    if (!ocrResult || !displaySize) {
      return { scaleX: 1, scaleY: 1 }
    }

    const ocrWidth = ocrResult.page.width
    const ocrHeight = ocrResult.page.height

    const scaleX = ocrWidth > 0 ? displaySize.width / ocrWidth : 1
    const scaleY = ocrHeight > 0 ? displaySize.height / ocrHeight : 1

    return { scaleX, scaleY }
  }

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

  // Create new field from selected words
  const handleCreateField = useCallback(() => {
    if (!ocrResult || selectedWordIndices.size === 0 || !newFieldName.trim()) {
      return
    }

    const selectedWords = Array.from(selectedWordIndices).map(
      (index) => ocrResult.words[index]
    )

    const newField = {
      id: `field_${Date.now()}`,
      name: newFieldName.trim(),
      words: selectedWords,
      excelColumn: null,
    }

    setFields((prev) => [...prev, newField])
    setSelectedWordIndices(new Set())
    setNewFieldName("")
    setIsCreatingField(false)
  }, [ocrResult, selectedWordIndices, newFieldName])

  // Delete field
  const handleDeleteField = useCallback((fieldId) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId))
  }, [])

  // Update field Excel column mapping
  const handleUpdateExcelColumn = useCallback(
    (fieldId, column) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, excelColumn: column } : f
        )
      )
    },
    []
  )

  // Get Excel column letter from index (A, B, C, ..., Z, AA, AB, ...)
  const getExcelColumnLetter = (index) => {
    let result = ""
    let num = index
    while (num >= 0) {
      result = String.fromCharCode(65 + (num % 26)) + result
      num = Math.floor(num / 26) - 1
    }
    return result
  }

  const { scaleX, scaleY } = getScaleFactor()

  return (
    <Stack spacing={2}>
      {/* Document with selectable words */}
      <Box
        ref={containerRef}
        sx={{
          position: "relative",
          border: "1px solid #e2e8f0",
          borderRadius: 1,
          overflow: "hidden",
          display: "inline-block",
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

        {/* OCR Words Overlay - Selectable */}
        {ocrResult && displaySize && (
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

              // Check if word is in any field
              const fieldForWord = fields.find((f) =>
                f.words.some((w) => w === word)
              )

              return (
                <g key={`selectable-word-${index}`}>
                  {/* Clickable word area */}
                  <rect
                    x={scaledX}
                    y={scaledY}
                    width={scaledW}
                    height={scaledH}
                    fill={
                      isSelected
                        ? "rgba(59, 130, 246, 0.3)"
                        : fieldForWord
                        ? "rgba(34, 197, 94, 0.2)"
                        : "transparent"
                    }
                    stroke={
                      isSelected
                        ? "#3b82f6"
                        : fieldForWord
                        ? "#22c55e"
                        : "transparent"
                    }
                    strokeWidth={isSelected ? 2 : 1}
                    style={{
                      cursor: "pointer",
                    }}
                    onClick={(e) => handleWordClick(index, e)}
                  />
                  {/* Selection indicator */}
                  {isSelected && (
                    <circle
                      cx={scaledX + scaledW - 4}
                      cy={scaledY + 4}
                      r={6}
                      fill="#3b82f6"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  )}
                </g>
              )
            })}
          </Box>
        )}
      </Box>

      {/* Selected words info */}
      {selectedWordIndices.size > 0 && (
        <Box
          sx={{
            p: 2,
            bgcolor: "#f8fafc",
            borderRadius: 1,
            border: "1px solid #e2e8f0",
          }}
        >
          <Stack spacing={2}>
            <Box>
              <strong>{selectedWordIndices.size} words selected</strong>
              {ocrResult && (
                <Box sx={{ mt: 1, fontSize: "0.875rem", color: "#64748b" }}>
                  {Array.from(selectedWordIndices)
                    .map((idx) => ocrResult.words[idx].text)
                    .join(" ")}
                </Box>
              )}
            </Box>

            {!isCreatingField ? (
              <Button
                variant="contained"
                onClick={() => setIsCreatingField(true)}
              >
                Create Field from Selection
              </Button>
            ) : (
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  placeholder="Field name (e.g., Full Name)"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newFieldName.trim()) {
                      handleCreateField()
                    }
                  }}
                  autoFocus
                />
                <Button
                  variant="contained"
                  onClick={handleCreateField}
                  disabled={!newFieldName.trim()}
                >
                  Create
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setIsCreatingField(false)
                    setNewFieldName("")
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            )}
          </Stack>
        </Box>
      )}

      {/* Fields list */}
      {fields.length > 0 && (
        <Box>
          <Box sx={{ mb: 2, fontWeight: 600 }}>Fields ({fields.length})</Box>
          <Stack spacing={1}>
            {fields.map((field, index) => (
              <Box
                key={field.id}
                sx={{
                  p: 2,
                  border: "1px solid #e2e8f0",
                  borderRadius: 1,
                  bgcolor: "#ffffff",
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ fontWeight: 500, mb: 0.5 }}>{field.name}</Box>
                    <Box sx={{ fontSize: "0.875rem", color: "#64748b" }}>
                      {field.words.map((w) => w.text).join(" ")}
                    </Box>
                  </Box>
                  <Chip
                    label={
                      field.excelColumn ||
                      getExcelColumnLetter(index) ||
                      "Not mapped"
                    }
                    size="small"
                    color={field.excelColumn ? "primary" : "default"}
                    onClick={() => {
                      if (editingFieldId === field.id) {
                        setEditingFieldId(null)
                      } else {
                        setEditingFieldId(field.id)
                      }
                    }}
                  />
                  {editingFieldId === field.id && (
                    <TextField
                      size="small"
                      placeholder="Column (A, B, C...)"
                      value={field.excelColumn || ""}
                      onChange={(e) =>
                        handleUpdateExcelColumn(field.id, e.target.value.toUpperCase())
                      }
                      onBlur={() => setEditingFieldId(null)}
                      sx={{ width: 100 }}
                    />
                  )}
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleDeleteField(field.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  )
}
