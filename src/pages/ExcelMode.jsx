// src/pages/ExcelMode.jsx
import { auth } from "../firebase"
import { updateColumnConfig } from "../services/user.service"
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Divider,
  Checkbox,
  FormControlLabel,
  Card,
  CardContent,
  Slider,
  Stack,
  Snackbar,
  Alert,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import DeleteIcon from "@mui/icons-material/Delete"
import SaveIcon from "@mui/icons-material/Save"
import { useState } from "react"

export default function ExcelMode({ columnConfig, setColumnConfig }) {
  const [saved, setSaved] = useState(false)

  const addColumn = () => {
    setColumnConfig([
      ...columnConfig,
      {
        key: `col_${Date.now()}`,
        label: "",
        mode: "auto",
        manualValue: "",
        width: 20,
      },
    ])
  }

  const updateColumn = (index, field, value) => {
    const next = [...columnConfig]
    next[index][field] = value
    setColumnConfig(next)
  }

  const removeColumn = (index) => {
    const next = [...columnConfig]
    next.splice(index, 1)
    setColumnConfig(next)
  }

  const handleSave = async () => {
    const user = auth.currentUser
    if (!user) return

    // 🔥 บันทึกลง Firestore
    await updateColumnConfig(user.uid, columnConfig)

    setSaved(true)
  }

  return (
    <Box sx={{ height: "calc(100vh - 160px)" }}>
      {/* Header */}
      <Box
        mb={2}
        display="flex"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h5" fontWeight={600}>
            ตั้งค่าคอลัมน์ Excel
          </Typography>
          <Typography color="text.secondary">
            กำหนดโครงสร้างไฟล์สำหรับการส่งออก
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          บันทึกการตั้งค่า
        </Button>
      </Box>

      <Divider />

      {/* Main Layout */}
      <Box
        sx={{
          display: "flex",
          height: "100%",
          mt: 2,
          gap: 2,
        }}
      >
        {/* LEFT : Column Settings */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            overflowY: "auto",
            pr: 1,
          }}
        >
          <Card variant="outlined" sx={{ boxShadow: "none" }}>
            <CardContent>
              <Typography fontWeight={600} mb={1}>
                คอลัมน์
              </Typography>

              <Stack spacing={1}>
                {columnConfig.map((col, index) => (
                  <Box
                    key={col.key}
                    sx={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 1,
                      p: 1,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <TextField
                        size="small"
                        label="ชื่อคอลัมน์"
                        fullWidth
                        value={col.label}
                        onChange={(e) =>
                          updateColumn(index, "label", e.target.value)
                        }
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeColumn(index)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={col.mode === "auto"}
                          onChange={(e) =>
                            updateColumn(
                              index,
                              "mode",
                              e.target.checked ? "auto" : "manual"
                            )
                          }
                        />
                      }
                      label="ดึงจาก OCR"
                    />

                    {col.mode === "manual" && (
                      <TextField
                        size="small"
                        fullWidth
                        label="ค่าคงที่"
                        value={col.manualValue}
                        onChange={(e) =>
                          updateColumn(index, "manualValue", e.target.value)
                        }
                        sx={{ mt: 1 }}
                      />
                    )}

                    <Box mt={1}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        ความกว้างคอลัมน์
                      </Typography>
                      <Slider
                        size="small"
                        min={10}
                        max={60}
                        value={col.width}
                        onChange={(_, v) =>
                          updateColumn(index, "width", v)
                        }
                      />
                    </Box>
                  </Box>
                ))}
              </Stack>

              <Button
                startIcon={<AddIcon />}
                fullWidth
                variant="outlined"
                sx={{ mt: 2 }}
                onClick={addColumn}
              >
                เพิ่มคอลัมน์
              </Button>
            </CardContent>
          </Card>
        </Box>

        {/* RIGHT : Preview */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 1,
            bgcolor: "#ffffff",
          }}
        >
          <Box p={2}>
            <Typography fontWeight={600} mb={1}>
              ตัวอย่างข้อมูล (Preview)
            </Typography>

            <Box
              sx={{
                overflowX: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 1,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "900px",
                }}
              >
                <thead>
                  <tr>
                    {columnConfig.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          borderBottom: "1px solid #e5e7eb",
                          padding: "8px",
                          textAlign: "left",
                          fontWeight: 600,
                          background: "#f8fafc",
                          width: `${col.width * 8}px`,
                        }}
                      >
                        {col.label || "—"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((row) => (
                    <tr key={row}>
                      {columnConfig.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            padding: "8px",
                            fontSize: 13,
                            color: "#475569",
                          }}
                        >
                          {col.mode === "manual"
                            ? col.manualValue || "—"
                            : "ข้อมูลจาก OCR"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Save Feedback */}
      <Snackbar
        open={saved}
        autoHideDuration={2000}
        onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled">
          บันทึกการตั้งค่าเรียบร้อยแล้ว
        </Alert>
      </Snackbar>
    </Box>
  )
}
