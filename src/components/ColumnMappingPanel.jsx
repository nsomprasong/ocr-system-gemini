import { Box, Typography, Select, MenuItem, FormControl, InputLabel, IconButton, Stack, Chip } from "@mui/material"
import DeleteIcon from "@mui/icons-material/Delete"

/**
 * ColumnMappingPanel - Maps groups to Excel columns
 */
export default function ColumnMappingPanel({ groups = [], onGroupUpdate, onGroupDelete }) {
  const getExcelColumnLetter = (index) => {
    let result = ""
    let num = index
    while (num >= 0) {
      result = String.fromCharCode(65 + (num % 26)) + result
      num = Math.floor(num / 26) - 1
    }
    return result
  }

  const availableColumns = Array.from({ length: 26 }, (_, i) => getExcelColumnLetter(i))

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, color: "#1e293b" }}>
        Column Mapping
      </Typography>
      <Stack spacing={2}>
        {groups.map((group, index) => (
          <Box
            key={group.id}
            sx={{
              p: 2,
              border: "1px solid #e2e8f0",
              borderRadius: 2,
              bgcolor: "#ffffff",
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ flex: 1 }}>
                <Typography fontWeight={600} sx={{ mb: 0.5 }}>
                  {group.label}
                </Typography>
                <Typography variant="caption" sx={{ color: "#64748b" }}>
                  {group.wordCount} word{group.wordCount !== 1 ? "s" : ""}
                </Typography>
              </Box>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Column</InputLabel>
                <Select
                  value={group.excelColumn || ""}
                  label="Column"
                  onChange={(e) =>
                    onGroupUpdate(group.id, { excelColumn: e.target.value })
                  }
                >
                  {availableColumns.map((col) => (
                    <MenuItem key={col} value={col}>
                      Column {col}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <IconButton
                size="small"
                color="error"
                onClick={() => onGroupDelete(group.id)}
              >
                <DeleteIcon />
              </IconButton>
            </Stack>
          </Box>
        ))}
        {groups.length === 0 && (
          <Typography variant="body2" sx={{ color: "#94a3b8", textAlign: "center", py: 3 }}>
            No groups created yet. Drag to select words on the document.
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
