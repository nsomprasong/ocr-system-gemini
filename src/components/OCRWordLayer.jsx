import { Box } from "@mui/material"

/**
 * OCRWordLayer - Displays OCR words as overlay on document
 */
export default function OCRWordLayer({
  words = [],
  scaleX = 1,
  scaleY = 1,
  onWordClick,
  selectedWordIndices = new Set(),
}) {
  if (!words || words.length === 0) return null

  return (
    <Box
      component="svg"
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none", // Visual only, InteractionLayer handles mouse events
        zIndex: 2,
      }}
    >
      {words.map((word, index) => {
        const scaledX = word.x * scaleX
        const scaledY = word.y * scaleY
        const scaledW = word.w * scaleX
        const scaledH = word.h * scaleY
        const isSelected = selectedWordIndices.has(index)

        return (
          <g key={`word-${index}`}>
            <rect
              x={scaledX}
              y={scaledY}
              width={scaledW}
              height={scaledH}
              fill={isSelected ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.1)"}
              stroke={isSelected ? "#3b82f6" : "#60a5fa"}
              strokeWidth={isSelected ? 2 : 1}
              style={{ cursor: "pointer" }}
              onClick={() => onWordClick && onWordClick(index)}
            />
            {isSelected && (
              <circle
                cx={scaledX + scaledW - 6}
                cy={scaledY + 6}
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
  )
}
