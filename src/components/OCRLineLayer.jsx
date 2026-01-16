import { Box } from "@mui/material"

/**
 * OCRLineLayer - Displays OCR lines as overlay on document
 * Shows lines instead of individual words
 */
export default function OCRLineLayer({
  lines = [],
  scaleX = 1,
  scaleY = 1,
  selectedLineIndices = new Set(),
}) {
  if (!lines || lines.length === 0) return null

  return (
    <Box
      component="svg"
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: 2,
      }}
    >
      {lines.map((line, index) => {
        const scaledX = line.x * scaleX
        const scaledY = line.y * scaleY
        const scaledW = line.w * scaleX
        const scaledH = line.h * scaleY
        const isSelected = selectedLineIndices.has(index)

        return (
          <g key={`line-${index}`}>
            <rect
              x={scaledX}
              y={scaledY}
              width={scaledW}
              height={scaledH}
              fill={isSelected ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.1)"}
              stroke={isSelected ? "#3b82f6" : "#60a5fa"}
              strokeWidth={isSelected ? 2 : 1}
              style={{ cursor: "pointer" }}
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
