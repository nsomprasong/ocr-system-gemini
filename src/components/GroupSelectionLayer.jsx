import { Box } from "@mui/material"

/**
 * GroupSelectionLayer - Displays groups with color coding by column
 * 
 * Visual only layer - does not handle mouse events
 */
const COLUMN_COLORS = [
  "#3b82f6", // A - Blue
  "#22c55e", // B - Green
  "#f59e0b", // C - Orange
  "#ef4444", // D - Red
  "#8b5cf6", // E - Purple
  "#ec4899", // F - Pink
  "#06b6d4", // G - Cyan
  "#84cc16", // H - Lime
]

function getColumnColor(excelColumn) {
  if (!excelColumn) return "#94a3b8" // Gray if no column assigned
  
  const index = excelColumn.charCodeAt(0) - 65 // A=0, B=1, C=2...
  return COLUMN_COLORS[index % COLUMN_COLORS.length] || "#94a3b8"
}

export default function GroupSelectionLayer({
  groups = [],
  scaleX = 1,
  scaleY = 1,
  isSelecting = false,
  selectionBox = null,
  selectedGroupId = null,
  onGroupClick = null,
  onGroupDragStart = null,
  onGroupResizeStart = null,
  onGroupDelete = null,
}) {
  return (
    <Box
      component="svg"
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none", // Don't block events - only groups themselves will capture
        zIndex: 3, // Higher than InteractionLayer (zIndex: 0) to show groups on top
      }}
    >
      {/* Render existing groups with color coding */}
      {/* Only show groups that have words/lines (from OCR selection), not manually added columns */}
      {groups
        .filter((group) => {
          // Only show groups that have words or lines (from OCR selection)
          // Manually added columns (no words/lines) should not appear in step 2
          return (group.words && group.words.length > 0) || (group.lines && group.lines.length > 0)
        })
        .map((group, groupIndex) => {
        const scaledX = group.x * scaleX
        const scaledY = group.y * scaleY
        const scaledW = group.w * scaleX
        const scaledH = group.h * scaleY
        const color = getColumnColor(group.excelColumn)
        const isSelected = selectedGroupId === group.id
        const handleSize = 8 // Size of resize handles

        return (
          <g key={`group-${group.id || groupIndex}`}>
            {/* Group bounding box */}
            <rect
              x={scaledX}
              y={scaledY}
              width={scaledW}
              height={scaledH}
              fill={`${color}20`} // 20 = ~12% opacity
              stroke={isSelected ? color : color}
              strokeWidth={isSelected ? 3 : 2}
              strokeDasharray={isSelected ? "none" : "5,5"}
              style={{ cursor: isSelected ? "move" : "pointer", pointerEvents: "auto" }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log(`🖱️ [GroupSelectionLayer] Clicked on group: ${group.id}`)
                if (onGroupClick) {
                  onGroupClick(group.id)
                }
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                // Only start drag if already selected and not clicking on resize handle
                if (isSelected && onGroupDragStart) {
                  // Check if clicking near edges (resize handles area)
                  const rect = e.currentTarget
                  const clickX = e.clientX - rect.getBoundingClientRect().left
                  const clickY = e.clientY - rect.getBoundingClientRect().top
                  const handleSize = 8
                  const isNearEdge = 
                    clickX < handleSize || clickX > scaledW - handleSize ||
                    clickY < handleSize || clickY > scaledH - handleSize
                  
                  if (!isNearEdge) {
                    // Not near edge - start drag
                    e.preventDefault()
                    console.log(`🖱️ [GroupSelectionLayer] Starting drag for group: ${group.id}`)
                    onGroupDragStart(group.id, e)
                  }
                }
              }}
            />
            
            {/* Group label */}
            <text
              x={scaledX + 5}
              y={scaledY - 5}
              fontSize="12"
              fill={color}
              fontWeight="bold"
              style={{ pointerEvents: "none" }}
            >
              {group.label} {group.excelColumn ? `(${group.excelColumn})` : ""}
            </text>

            {/* Resize handles and delete button (only show when selected) */}
            {isSelected && (
              <>
                {/* Delete button - Top-right corner */}
                <g>
                  <circle
                    cx={scaledX + scaledW - 12}
                    cy={scaledY + 12}
                    r={12}
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth={2}
                    style={{ cursor: "pointer", pointerEvents: "auto" }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (onGroupDelete) {
                        onGroupDelete(group.id)
                      }
                    }}
                  />
                  <text
                    x={scaledX + scaledW - 12}
                    y={scaledY + 12}
                    fontSize="14"
                    fill="#fff"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ pointerEvents: "none" }}
                  >
                    ×
                  </text>
                </g>

                {/* Top-left */}
                <rect
                  x={scaledX - handleSize / 2}
                  y={scaledY - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: "nw-resize", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onGroupResizeStart && onGroupResizeStart(group.id, "nw", e)
                  }}
                />
                {/* Top-right */}
                <rect
                  x={scaledX + scaledW - handleSize / 2}
                  y={scaledY - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: "ne-resize", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onGroupResizeStart && onGroupResizeStart(group.id, "ne", e)
                  }}
                />
                {/* Bottom-left */}
                <rect
                  x={scaledX - handleSize / 2}
                  y={scaledY + scaledH - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: "sw-resize", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onGroupResizeStart && onGroupResizeStart(group.id, "sw", e)
                  }}
                />
                {/* Bottom-right */}
                <rect
                  x={scaledX + scaledW - handleSize / 2}
                  y={scaledY + scaledH - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: "se-resize", pointerEvents: "auto" }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onGroupResizeStart && onGroupResizeStart(group.id, "se", e)
                  }}
                />
              </>
            )}
          </g>
        )
      })}
    </Box>
  )
}
