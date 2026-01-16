import { useMemo } from "react"
import { Box, Typography, Paper } from "@mui/material"
import { extractTableData } from "../utils/extractTableData"
import { removeEmptyLines } from "../utils/textUtils"

/**
 * PreviewTable - Real-time preview of extracted data using primary column alignment
 * 
 * Uses the column with the most rows (by Y-axis) as the PRIMARY COLUMN.
 * PRIMARY COLUMN defines ALL rows in the table.
 * Other columns fill data ONLY when token.y matches an existing primary row.y.
 */
export default function PreviewTable({ ocrResult, groups = [] }) {
  // Use unified extractTableData function
  const tableRows = useMemo(() => {
    if (!ocrResult || !groups || groups.length === 0) {
      console.log("🔍 [PreviewTable] No table rows:", {
        hasOcrResult: !!ocrResult,
        groupsCount: groups?.length || 0,
      })
      return []
    }

    console.log("🔍 [PreviewTable] Building table from groups:", {
      groupsCount: groups.length,
      mappedGroupsCount: groups.filter(g => g.excelColumn).length,
    })

    // Use unified extraction function with preview mode
    let rows = []
    try {
      rows = extractTableData(
        ocrResult,
        groups,
        {
          mode: "preview",
          yTolerance: 30, // Increased tolerance for preview
        }
      )
    } catch (error) {
      console.error("❌ [PreviewTable] Error in extractTableData:", error)
      console.error("❌ [PreviewTable] Stack:", error?.stack)
      return []
    }

    console.log("✅ [PreviewTable] Built table rows:", {
      rowsCount: rows.length,
      sampleRow: rows[0],
    })

    return rows
  }, [ocrResult, groups])

  // Get column headers from groups (use columnName if available)
  // Only include groups that have data (same filter as mappedGroups)
  const columns = useMemo(() => {
    return groups
      .filter((g) => {
        if (!g.excelColumn) return false
        
        // Check if group has data
        const hasText = g.text && g.text.trim().length > 0
        const hasWords = (g.words && g.words.length > 0) || (g.lines && g.lines.length > 0)
        const hasDefaultValue = g.defaultValue && g.defaultValue.trim().length > 0
        
        return hasText || hasWords || hasDefaultValue
      })
      .sort((a, b) => a.excelColumn.localeCompare(b.excelColumn))
      .map((g) => ({
        key: g.excelColumn,
        label: g.columnName || `Column ${g.excelColumn}`, // Use columnName if available
      }))
  }, [groups])

  // Empty states
  if (!ocrResult || groups.length === 0) {
    return (
      <Paper
        sx={{
          p: 3,
          textAlign: "center",
          bgcolor: "#f8fafc",
          border: "1px dashed #cbd5e1",
        }}
      >
        <Typography color="text.secondary">
          Create groups and map columns to see preview
        </Typography>
      </Paper>
    )
  }

  if (columns.length === 0) {
    const unmappedGroups = groups.filter((g) => !g.excelColumn)
    return (
      <Paper
        sx={{
          p: 3,
          textAlign: "center",
          bgcolor: "#f8fafc",
          border: "1px dashed #cbd5e1",
        }}
      >
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          Map groups to Excel columns to see preview
        </Typography>
        {unmappedGroups.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {unmappedGroups.length} group{unmappedGroups.length !== 1 ? "s" : ""} need{unmappedGroups.length === 1 ? "s" : ""} column mapping
          </Typography>
        )}
      </Paper>
    )
  }

  if (tableRows.length === 0) {
    return (
      <Paper
        sx={{
          p: 3,
          textAlign: "center",
          bgcolor: "#f8fafc",
          border: "1px dashed #cbd5e1",
        }}
      >
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          No data found in mapped groups
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Please check that groups contain OCR words and zones are correctly positioned
        </Typography>
      </Paper>
    )
  }

  return (
    <Box
      sx={{
        width: "100%",
        overflow: "auto",
        border: "1px solid #e5e7eb",
        borderRadius: 2,
        bgcolor: "#ffffff",
      }}
    >
      <Box
        component="table"
        sx={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: "400px",
        }}
      >
        {/* Header */}
        <Box component="thead" sx={{ bgcolor: "#f8fafc" }}>
          <Box component="tr">
            {columns.map((col) => {
              // Find group to get width
              const group = groups.find(g => g.excelColumn === col.key)
              const widthPercent = group && ocrResult ? (group.w / ocrResult.page.width) * 100 : undefined
              
              return (
                <Box
                  key={col.key}
                  component="th"
                  sx={{
                    borderBottom: "2px solid #e5e7eb",
                    borderRight: "1px solid #e5e7eb",
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "#1e293b",
                    width: widthPercent ? `${widthPercent}%` : "auto",
                    minWidth: widthPercent ? `${widthPercent}%` : "100px",
                  }}
                >
                  {col.label}
                </Box>
              )
            })}
          </Box>
        </Box>

        {/* Body */}
        <Box component="tbody">
          {tableRows.map((row, rowIndex) => (
            <Box
              key={rowIndex}
              component="tr"
              sx={{
                "&:hover": {
                  bgcolor: "#f8fafc",
                },
                "&:last-child td": {
                  borderBottom: "none",
                },
              }}
            >
              {columns.map((col) => {
                // Find group to get width
                const group = groups.find(g => g.excelColumn === col.key)
                const widthPercent = group && ocrResult ? (group.w / ocrResult.page.width) * 100 : undefined
                
                return (
                  <Box
                    key={col.key}
                    component="td"
                    sx={{
                      borderBottom: "1px solid #f1f5f9",
                      borderRight: "1px solid #e5e7eb",
                      padding: "12px 16px",
                      fontSize: "13px",
                      color: "#475569",
                      width: widthPercent ? `${widthPercent}%` : "auto",
                      minWidth: widthPercent ? `${widthPercent}%` : "100px",
                      whiteSpace: "pre-wrap", // Preserve spaces and line breaks from OCR
                    }}
                  >
                    {row[col.key] ? removeEmptyLines(row[col.key]) : (
                      <Typography
                        component="span"
                        sx={{ color: "#cbd5e1", fontStyle: "italic" }}
                      >
                        —
                      </Typography>
                    )}
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Footer info */}
      <Box
        sx={{
          p: 1.5,
          borderTop: "1px solid #e5e7eb",
          bgcolor: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          รวม {tableRows.length} แถว • {columns.length} คอลัมน์
        </Typography>
      </Box>
    </Box>
  )
}
