import { Box } from "@mui/material"

/**
 * InteractionLayer - Transparent overlay that handles all mouse events
 * 
 * This layer sits on top of everything and prevents image dragging
 * while enabling custom selection logic
 */
export default function InteractionLayer({
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  isSelecting = false,
  selectionBox = null,
  scaleX = 1,
  scaleY = 1,
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: 0, // Lower than GroupSelectionLayer (zIndex: 3) to allow group clicks
        cursor: isSelecting ? "crosshair" : "default",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {/* Visual selection box while dragging */}
      {isSelecting && selectionBox && (
        <Box
          component="svg"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <rect
            x={selectionBox.x}
            y={selectionBox.y}
            width={selectionBox.w}
            height={selectionBox.h}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        </Box>
      )}
    </Box>
  )
}
