import { useMemo } from "react"
import { Box, Typography, Paper } from "@mui/material"
import { buildRows } from "../../excel/buildRow"
import { removeEmptyLines } from "../utils/textUtils"

/**
 * ExcelPreview component displays a real-time table preview.
 * 
 * Updates instantly when:
 * - OCR data changes
 * - Template zones change
 * - New files are scanned
 * 
 * One scanned file = one Excel row
 */
export default function ExcelPreview({
  ocrResults,
  template,
  showEmptyMessage = true,
}) {
  // Build table rows from OCR results and template
  // Recalculates automatically when ocrResults or template changes
  // One OCR result may produce multiple rows (based on primary column alignment)
  const tableRows = useMemo(() => {
    if (!template || !ocrResults.length) {
      return []
    }

    // Build rows from all OCR results
    const allRows: Array<Record<string, string>> = []
    for (const ocrResult of ocrResults) {
      const rowsFromFile = buildRows(ocrResult, template)
      allRows.push(...rowsFromFile)
    }
    return allRows
  }, [ocrResults, template])

  // Get column headers from template
  const columnHeaders = useMemo(() => {
    if (!template) return []
    return template.columns.map((col) => ({
      key: col.columnKey,
      label: col.label || col.columnKey,
    }))
  }, [template])

  // Empty state
  if (!template || !ocrResults.length) {
    if (!showEmptyMessage) return null

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
          {!template
            ? "กรุณาเลือก Template เพื่อแสดงตัวอย่าง"
            : "ยังไม่มีข้อมูล OCR เพื่อแสดงตัวอย่าง"}
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
        borderRadius: 1,
        bgcolor: "#ffffff",
      }}
    >
      <Box
        component="table"
        sx={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: "600px",
        }}
      >
        {/* Table Header */}
        <Box component="thead" sx={{ bgcolor: "#f8fafc" }}>
          <Box component="tr">
            {/* Row number column */}
            <Box
              component="th"
              sx={{
                borderBottom: "2px solid #e5e7eb",
                borderRight: "1px solid #e5e7eb",
                padding: "12px 8px",
                textAlign: "center",
                fontWeight: 600,
                fontSize: "13px",
                color: "#64748b",
                width: "50px",
                position: "sticky",
                left: 0,
                bgcolor: "#f8fafc",
                zIndex: 1,
              }}
            >
              #
            </Box>
            {/* Column headers */}
            {columnHeaders.map((col) => (
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
                  whiteSpace: "nowrap",
                  minWidth: "120px",
                }}
              >
                {col.label}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Table Body */}
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
              {/* Row number */}
              <Box
                component="td"
                sx={{
                  borderBottom: "1px solid #f1f5f9",
                  borderRight: "1px solid #e5e7eb",
                  padding: "10px 8px",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "#64748b",
                  position: "sticky",
                  left: 0,
                  bgcolor: "#ffffff",
                  zIndex: 1,
                }}
              >
                {rowIndex + 1}
              </Box>
              {/* Row data */}
              {columnHeaders.map((col) => (
                <Box
                  key={col.key}
                  component="td"
                  sx={{
                    borderBottom: "1px solid #f1f5f9",
                    borderRight: "1px solid #e5e7eb",
                    padding: "10px 16px",
                    fontSize: "13px",
                    color: "#475569",
                    wordBreak: "break-word",
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
              ))}
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
          รวม {tableRows.length} แถว • {columnHeaders.length} คอลัมน์
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {ocrResults.length === 1
            ? `ไฟล์: ${ocrResults[0].fileName}`
            : `${ocrResults.length} ไฟล์`}
        </Typography>
      </Box>
    </Box>
  )
}
