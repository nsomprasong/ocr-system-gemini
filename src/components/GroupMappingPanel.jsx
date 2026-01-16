import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Stack,
  TextField,
  Button,
  Slider,
} from "@mui/material"
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import { FIELD_TYPES } from "../utils/groupMerger"

/**
 * GroupMappingPanel - Full group management with field types and editing
 */
export default function GroupMappingPanel({
  groups = [],
  onGroupUpdate,
  onGroupDelete,
  onGroupReorder,
  onGroupAdd,
  ocrResult,
}) {
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
    <Box sx={{ 
      height: "100%", 
      display: "flex", 
      flexDirection: "column",
      minHeight: 0, // Important for flex children to allow scrolling
    }}>
      <Typography variant="h6" sx={{ mb: 1.5, color: "#1e293b", flexShrink: 0, fontSize: "1.1rem" }}>
        กลุ่มและคอลัมน์
      </Typography>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0, // Important for flex children to allow scrolling
          pr: 1,
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-track": {
            bgcolor: "#f1f5f9",
            borderRadius: "4px",
          },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "#cbd5e1",
            borderRadius: "4px",
            "&:hover": {
              bgcolor: "#94a3b8",
            },
          },
        }}
      >
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
            <Stack spacing={2}>
              {/* Group Header */}
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography fontWeight={600} sx={{ fontSize: "0.95rem" }}>
                  กลุ่ม {index + 1} คอลัมน์ {getExcelColumnLetter(index)}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <IconButton
                    size="small"
                    disabled={index === 0}
                    onClick={() => onGroupReorder(group.id, "up")}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={index === groups.length - 1}
                    onClick={() => onGroupReorder(group.id, "down")}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onGroupDelete(group.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>

              {/* Column Name */}
              <TextField
                label="ชื่อคอลัมน์"
                value={group.columnName || group.label || ""}
                onChange={(e) =>
                  onGroupUpdate(group.id, { columnName: e.target.value })
                }
                size="small"
                fullWidth
              />

              {/* Field Type */}
              <FormControl fullWidth size="small">
                <InputLabel>ประเภทข้อมูล</InputLabel>
                <Select
                  value={group.fieldType || FIELD_TYPES.NORMAL_TEXT}
                  label="ประเภทข้อมูล"
                  onChange={(e) =>
                    onGroupUpdate(group.id, { fieldType: e.target.value })
                  }
                >
                  <MenuItem value={FIELD_TYPES.PERSON_NAME}>ชื่อบุคคล</MenuItem>
                  <MenuItem value={FIELD_TYPES.NORMAL_TEXT}>ข้อความทั่วไป</MenuItem>
                </Select>
              </FormControl>

              {/* Default Value - Only show for groups without words (manually added columns) */}
              {(!group.words || group.words.length === 0) && (!group.lines || group.lines.length === 0) && (
                <TextField
                  label="ค่าตั้งต้น (ไม่บังคับ)"
                  value={group.defaultValue || ""}
                  onChange={(e) =>
                    onGroupUpdate(group.id, { defaultValue: e.target.value })
                  }
                  placeholder="กรอกค่าตั้งต้นสำหรับคอลัมน์นี้"
                  size="small"
                  fullWidth
                />
              )}

              {/* Column Width Resize */}
              {ocrResult && (
                <Box>
                  <Typography variant="caption" sx={{ mb: 1, display: "block" }}>
                    ความกว้างคอลัมน์: {Math.round((group.w / ocrResult.page.width) * 100)}%
                  </Typography>
                  <Slider
                    value={(group.w / ocrResult.page.width) * 100}
                    onChange={(e, newValue) => {
                      const newWidth = (newValue / 100) * ocrResult.page.width
                      onGroupUpdate(group.id, { w: newWidth })
                    }}
                    min={5}
                    max={100}
                    step={1}
                    size="small"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value}%`}
                  />
                </Box>
              )}

              {/* Editable Text */}
              <TextField
                label="ข้อความในกลุ่ม"
                value={group.text || ""}
                onChange={(e) =>
                  onGroupUpdate(group.id, { text: e.target.value })
                }
                multiline
                rows={Math.min(Math.max((group.text || "").split("\n").length, 3), 10)}
                size="small"
                fullWidth
                sx={{
                  "& .MuiInputBase-input": {
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap", // Preserve spaces and line breaks from OCR, allow wrapping
                  },
                }}
              />

              <Typography variant="caption" sx={{ color: "#64748b" }}>
                {group.lineCount || 0} บรรทัด
              </Typography>
            </Stack>
          </Box>
        ))}
        {groups.length === 0 && (
          <Typography variant="body2" sx={{ color: "#94a3b8", textAlign: "center", py: 3 }}>
            ยังไม่มีกลุ่มที่สร้าง ลากเพื่อเลือกข้อความบนเอกสาร
          </Typography>
        )}

        {/* Add Column Button */}
        {onGroupAdd && ocrResult && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onGroupAdd}
            fullWidth
            sx={{ mt: 2 }}
          >
            เพิ่มคอลัมน์
          </Button>
        )}
        </Stack>
      </Box>
    </Box>
  )
}
