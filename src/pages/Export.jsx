import { auth } from "../firebase"
import { updateUserCredits, getUserProfile } from "../services/user.service"
import { useState, useEffect } from "react"
import {
  Box,
  Card,
  CardContent,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  IconButton,
  TextField,
  LinearProgress,
} from "@mui/material"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import CloseIcon from "@mui/icons-material/Close"
import { smartOcrVisionPdf } from "../services/smartOcr.service"
import {
  createSeparateExcelFiles,
  createCombinedExcelFile,
  createExcelFile,
} from "../services/excel.service"
import DownloadIcon from "@mui/icons-material/Download"
import {
  saveExcelToServer,
  saveWordToServer,
} from "../services/fileExport.service"

export default function Export({
  scanFiles,
  credits,
  columnConfig,
  onConsume,
  onDone,
}) {
  const [mode, setMode] = useState("separate")
  const [fileType, setFileType] = useState("xlsx") // xlsx หรือ doc
  const [status, setStatus] = useState("idle")
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState("")
  const [error, setError] = useState("")
  const [ocrResults, setOcrResults] = useState([])
  const [previewFileIndex, setPreviewFileIndex] = useState(null)

  const totalPages = scanFiles.reduce((s, f) => s + f.pageCount, 0)
  const creditEnough = credits >= totalPages

  const handleRun = async () => {
    if (!creditEnough) return

    const user = auth.currentUser
    if (!user) return

    setStatus("running")
    setProgress(0)
    setError("")
    setCurrentFile("กำลังเริ่มต้น...")
    setOcrResults([]) // Clear previous OCR results

    try {
          console.log(`🚀 Starting export process (Smart OCR only)...`)
          console.log(`📊 Total files: ${scanFiles.length}, Total pages: ${totalPages}`)
      
      // 🔥 อัปเดตเครดิต Firestore ก่อน (พร้อม timeout)
      console.log(`💳 Updating credits: ${credits} -> ${credits - totalPages}`)
      setCurrentFile("กำลังอัปเดตเครดิต...")
      setProgress(5) // เริ่มต้นที่ 5%
      
      const newCredits = credits - totalPages
      try {
        await updateUserCredits(user.uid, newCredits)
        console.log(`✅ Credits updated successfully`)
        // อัปเดต state ใน local ด้วย
        onConsume(totalPages) // อัปเดต credits ใน App.jsx
      } catch (creditError) {
        console.error(`❌ Failed to update credits:`, creditError)
        setError(`ไม่สามารถอัปเดตเครดิตได้: ${creditError.message}. กรุณาลองใหม่อีกครั้ง`)
        setStatus("idle")
        setProgress(0)
        setCurrentFile("")
        return // หยุดการทำงานถ้าอัปเดตเครดิตไม่สำเร็จ
      }
      
      setProgress(10) // อัปเดต progress หลังจากอัปเดตเครดิต

          // ประมวลผลไฟล์ทีละไฟล์ (Smart OCR เท่านั้น)
      const fileData = []

      for (let i = 0; i < scanFiles.length; i++) {
        const fileItem = scanFiles[i]
        setCurrentFile(fileItem.originalName)
        
        // อัปเดต progress เริ่มต้น
        const baseProgress = (i / scanFiles.length) * 100
        setProgress(baseProgress)
        
          console.log(`📄 Processing file ${i + 1}/${scanFiles.length}: ${fileItem.originalName}`)

        try {
          // เรียก OCR - ใช้ router เพื่อเลือก v1 หรือ v2 ตาม template mode
          console.log(`🔍 [Smart OCR] Starting Smart OCR for: ${fileItem.originalName}`)

          // Smart OCR รองรับเฉพาะ PDF ตาม requirement
          const isPdf =
            fileItem.file.type === "application/pdf" ||
            fileItem.file.name.toLowerCase().endsWith(".pdf")

          if (!isPdf) {
            console.warn(`⚠️ [Smart OCR] Skipping non-PDF file: ${fileItem.originalName}`)
            setError(
              `ไฟล์ ${fileItem.originalName} ไม่ใช่ PDF. Smart OCR รองรับเฉพาะไฟล์ PDF เท่านั้น`
            )
            const fileProgress = ((i + 1) / scanFiles.length) * 100
            setProgress(fileProgress)
            continue
          }

          if (!columnConfig || columnConfig.length === 0) {
            console.warn(`⚠️ [Smart OCR] No columnConfig available for ${fileItem.originalName}`)
            setError(
              `ไม่พบการตั้งค่า columnConfig สำหรับไฟล์ ${fileItem.originalName} ไม่สามารถแปลงข้อมูลได้`
            )
            const fileProgress = ((i + 1) / scanFiles.length) * 100
            setProgress(fileProgress)
            continue
          }

          try {
            // Use smartOcrVisionPdf (Vision mode only)
            const smartOcrResult = await Promise.race([
              smartOcrVisionPdf(fileItem.file, { scanMode: "direct" }),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("Smart OCR Vision timeout: เกิน 15 นาที")),
                  15 * 60 * 1000 // 15 minutes (900 seconds) to match backend timeout
                )
              ),
            ])

            // Validate Smart OCR result
            if (!smartOcrResult || !smartOcrResult.records) {
              throw new Error("Smart OCR returned invalid result: missing records")
            }

            console.log(
              `✅ [Smart OCR] Completed: ${smartOcrResult.records.length} records, confidence: ${
                smartOcrResult.metadata?.confidence || "unknown"
              }`
            )

            // เก็บ Smart OCR result เพื่อ preview
            setOcrResults((prev) => [...prev, smartOcrResult])

            // ส่ง records ดิบไปยัง createExcelFile (จะ map เป็น Excel format ใน excel.service.js)
            // 1 record = 1 row ใน Excel
            fileData.push({
              filename: fileItem.originalName,
              data: smartOcrResult.records, // Send raw records, not mapped rows
            })
            
            // อัปเดต progress หลังจากประมวลผลเสร็จ
            const fileProgress = ((i + 1) / scanFiles.length) * 100
            setProgress(fileProgress)
            console.log(`✅ File ${i + 1}/${scanFiles.length} completed: ${fileItem.originalName}`)
          } catch (err) {
            console.error(`❌ Error processing ${fileItem.originalName}:`, err)
            setError(`เกิดข้อผิดพลาดในการประมวลผล ${fileItem.originalName}: ${err.message}`)
            // ยังคงดำเนินการต่อกับไฟล์อื่นๆ แต่ต้องอัปเดต progress
            const fileProgress = ((i + 1) / scanFiles.length) * 100
            setProgress(fileProgress)
          }
      }

      // ดาวน์โหลดไฟล์
      console.log(`💾 Downloading ${fileData.length} files...`)
      console.log(`📊 FileData details:`, fileData.map(f => ({
        filename: f.filename,
        dataLength: f.data?.length || 0
      })))
      console.log(`📋 ColumnConfig:`, columnConfig?.length || 0, "columns")
      
      setCurrentFile("กำลังดาวน์โหลดไฟล์...")
      setProgress(95) // เกือบเสร็จแล้ว
      
      if (fileData.length === 0) {
        console.error("❌ No file data to download!")
        setError("ไม่พบข้อมูลที่จะดาวน์โหลด กรุณาตรวจสอบว่าไฟล์ถูกประมวลผลสำเร็จ")
        setStatus("idle")
        return
      }
      
      if (!columnConfig || columnConfig.length === 0) {
        console.error("❌ No columnConfig available!")
        setError("ไม่พบการตั้งค่าคอลัมน์ กรุณาตรวจสอบการตั้งค่า")
        setStatus("idle")
        return
      }
      
      try {
        if (fileType === "xlsx") {
          // ดาวน์โหลดไฟล์ Excel
          console.log(`📥 Creating Excel files... mode: ${mode}`)
          if (mode === "separate") {
            console.log(`📥 Creating ${fileData.length} separate Excel files...`)
            createSeparateExcelFiles(fileData, columnConfig)
            console.log(`✅ Excel files created successfully`)
          } else {
            console.log(`📥 Creating combined Excel file...`)
            createCombinedExcelFile(fileData, columnConfig, "combined.xlsx")
            console.log(`✅ Combined Excel file created successfully`)
          }
        } else {
          // Word files ต้องใช้ backend API
          setError("ไฟล์ Word ต้องใช้ Backend API เท่านั้น กรุณาเปลี่ยนเป็น Excel")
          setStatus("idle")
          return
        }
      } catch (downloadError) {
        console.error("❌ Error downloading:", downloadError)
        console.error("❌ Error stack:", downloadError.stack)
        setError(`เกิดข้อผิดพลาดในการดาวน์โหลด: ${downloadError.message}`)
        setStatus("idle")
        return
      }

      // onConsume ถูกเรียกแล้วตอนอัปเดตเครดิตสำเร็จ (บรรทัด 77)
      setStatus("success")

      setTimeout(() => {
        setStatus("idle")
        setProgress(0)
        setCurrentFile("")
        onDone()
      }, 2000)
    } catch (err) {
      console.error("❌ Export Error:", err)
      setError(`เกิดข้อผิดพลาด: ${err.message}. กรุณาตรวจสอบ console สำหรับรายละเอียดเพิ่มเติม`)
      setStatus("idle")
      setProgress(0)
      setCurrentFile("")
    }
  }

  return (
    <Box sx={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ flexShrink: 0, mb: 2 }}>
        <Typography variant="h5">สแกนและบันทึกไฟล์</Typography>
        <Typography color="text.secondary" variant="body2">
          ขั้นตอนที่ 2 จาก 2 • ตรวจสอบและสั่งงาน
        </Typography>
      </Box>

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
        <Stack spacing={1.5}>
          {/* Summary */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap">
                <Chip label={`ไฟล์ ${scanFiles.length}`} size="small" />
                <Chip label={`รวม ${totalPages} หน้า`} size="small" />
                <Chip
                  label={`เครดิตคงเหลือ ${credits} หน้า`}
                  color={creditEnough ? "success" : "error"}
                  size="small"
                />
              </Stack>
            </CardContent>
          </Card>

          {/* Export Mode & File Type - รวมกัน */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="body2" fontWeight={500} gutterBottom>
                    รูปแบบการบันทึกไฟล์
                  </Typography>
                  <RadioGroup
                    row
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    sx={{ mt: 0.5 }}
                  >
                    <FormControlLabel
                      value="separate"
                      control={<Radio size="small" />}
                      label="แยกไฟล์"
                    />
                    <FormControlLabel
                      value="combine"
                      control={<Radio size="small" />}
                      label="รวมเป็นไฟล์เดียว"
                    />
                  </RadioGroup>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="body2" fontWeight={500} gutterBottom>
                    ประเภทไฟล์
                  </Typography>
                  <RadioGroup
                    row
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value)}
                    sx={{ mt: 0.5 }}
                  >
                    <FormControlLabel
                      value="xlsx"
                      control={<Radio size="small" />}
                      label="Excel (.xlsx)"
                    />
                    <FormControlLabel
                      value="doc"
                      control={<Radio size="small" />}
                      label="Word (.docx)"
                    />
                  </RadioGroup>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Destination */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="body2" fontWeight={500} gutterBottom>
                ปลายทางจัดเก็บไฟล์
              </Typography>
              <TextField
                fullWidth
                size="small"
                disabled
                value="โฟลเดอร์ Downloads ของเบราว์เซอร์"
                sx={{ mt: 0.5 }}
              />
            </CardContent>
          </Card>

          {/* Smart OCR Preview: 1 row = 1 record (no x/y, no bounding boxes) */}
          {ocrResults.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={500} gutterBottom>
                      Smart OCR Preview (1 แถว = 1 record)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      แสดงตัวอย่างข้อมูลตาม records ที่ได้จาก Smart OCR (ช่องว่างจะถูกไฮไลต์)
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={() => {
                      // Export all records from all files
                      const allRecords = []
                      scanFiles.forEach((fileItem, index) => {
                        const smartOcrResult = ocrResults[index]
                        if (smartOcrResult && smartOcrResult.records) {
                          allRecords.push(...smartOcrResult.records)
                        }
                      })
                      
                      if (allRecords.length === 0) {
                        setError("ไม่มีข้อมูลที่จะส่งออก")
                        return
                      }
                      
                      // Generate filename: OCR_<originalFileName>_<timestamp>.xlsx
                      const firstFileName = scanFiles[0]?.originalName || "document"
                      const baseName = firstFileName.replace(/\.[^/.]+$/, "")
                      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)
                      const filename = `OCR_${baseName}_${timestamp}.xlsx`
                      
                      try {
                        createExcelFile(allRecords, columnConfig, filename)
                        console.log(`✅ [Export] Exported ${allRecords.length} records to ${filename}`)
                      } catch (exportError) {
                        console.error("❌ [Export] Error:", exportError)
                        setError(`เกิดข้อผิดพลาดในการส่งออก: ${exportError.message}`)
                      }
                    }}
                  >
                    Export Excel
                  </Button>
                </Box>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  {scanFiles.map((fileItem, index) => {
                    const smartOcrResult = ocrResults[index]
                    if (!smartOcrResult || !smartOcrResult.records) return null

                    const records = smartOcrResult.records
                    const previewRows = records.slice(0, 5) // แสดงสูงสุด 5 แถวต่อไฟล์

                    return (
                      <Box key={index} sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          {fileItem.originalName} ({records.length} records, ความมั่นใจ:{" "}
                          {smartOcrResult.metadata?.confidence || "unknown"})
                        </Typography>
                        <Box
                          sx={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 1,
                            overflowX: "auto",
                          }}
                        >
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: 12,
                            }}
                          >
                            <thead>
                              <tr>
                                {columnConfig.map((col) => (
                                  <th
                                    key={col.key}
                                    style={{
                                      borderBottom: "1px solid #e5e7eb",
                                      padding: "4px 8px",
                                      textAlign: "left",
                                      background: "#f9fafb",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {col.label || col.key}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((record, rowIndex) => (
                                <tr key={rowIndex}>
                                  {columnConfig.map((col) => {
                                    const value = record[col.key]
                                    const isEmpty =
                                      value === undefined ||
                                      value === null ||
                                      String(value).trim().length === 0

                                    return (
                                      <td
                                        key={col.key}
                                        style={{
                                          borderBottom: "1px solid #f3f4f6",
                                          padding: "3px 8px",
                                          background: isEmpty ? "#fef2f2" : "transparent",
                                          color: isEmpty ? "#b91c1c" : "inherit",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {isEmpty ? '""' : String(value)}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Box>
                      </Box>
                    )
                  })}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* File Preview (Compact) */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="body2" fontWeight={500} gutterBottom>
                ไฟล์ที่จะถูกสร้าง ({scanFiles.length} ไฟล์)
              </Typography>
              <Box
                sx={{
                  maxHeight: 150,
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: 1,
                  mt: 1,
                }}
              >
                <Stack spacing={0}>
                  {scanFiles.map((f, i) => (
                    <Box key={i}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          px: 1.5,
                          py: 0.75,
                        }}
                      >
                        <Typography
                          fontSize={13}
                          lineHeight={1.2}
                          noWrap
                          sx={{ flex: 1, mr: 1 }}
                        >
                          {f.originalName}
                        </Typography>
                        <Chip
                          label={`${f.pageCount} หน้า`}
                          size="small"
                          sx={{ height: 20, fontSize: 11 }}
                        />
                      </Box>
                      {i < scanFiles.length - 1 && <Divider />}
                    </Box>
                  ))}
                </Stack>
              </Box>
            </CardContent>
          </Card>

          {/* Progress */}
          {status === "running" && (
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    {currentFile ? `กำลังประมวลผล: ${currentFile}` : "กำลังเริ่มต้น..."}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={progress} 
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {Math.round(progress)}% เสร็จสมบูรณ์
                  </Typography>
                  {progress === 0 && (
                    <Alert severity="info" sx={{ mt: 0.5 }} size="small">
                      ⏳ กำลังรอการตอบกลับจาก OCR API... กรุณารอสักครู่
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Status Messages */}
          {status === "success" && (
            <Alert severity="success" sx={{ mt: 0.5 }}>
              สแกนและดาวน์โหลดไฟล์เรียบร้อยแล้ว ไฟล์{fileType === "xlsx" ? " Excel" : " Word"} ถูกดาวน์โหลดไปที่โฟลเดอร์ Downloads
            </Alert>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError("")} sx={{ mt: 0.5 }}>
              {error}
            </Alert>
          )}

          {!creditEnough && (
            <Alert severity="error" sx={{ mt: 0.5 }}>
              เครดิตไม่เพียงพอสำหรับเอกสารชุดนี้
            </Alert>
          )}
        </Stack>
      </Box>

      {/* Fixed Action Button */}
      <Box sx={{ flexShrink: 0, pt: 2, pb: 1, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={status === "running" ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          disabled={!creditEnough || status === "running"}
          onClick={handleRun}
        >
          {status === "running" ? "กำลังประมวลผล..." : "สแกนและบันทึกไฟล์"}
        </Button>
      </Box>
    </Box>
  )
}
