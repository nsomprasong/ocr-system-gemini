import { useState, useEffect, useRef, useCallback } from "react"
import {
  Box,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  TextField,
} from "@mui/material"
import UploadIcon from "@mui/icons-material/Upload"
import SaveIcon from "@mui/icons-material/Save"
import DownloadIcon from "@mui/icons-material/Download"
import { auth } from "../firebase"
import { ocrFileGemini } from "../services/ocr.service.gemini"
import { saveTemplate } from "../../template/saveTemplate"
import { loadTemplates } from "../../template/loadTemplate"
import { fieldsToTemplate } from "../../template/fieldToTemplate"
import { exportSingleExcel, exportBatchExcel } from "../../excel/exportExcel"
import WordSelector from "../components/WordSelector"

/**
 * Home V2 - Main OCR workflow page
 * 
 * Complete v2 workflow:
 * 1. Upload image/PDF
 * 2. Run OCR v2
 * 3. Select words and create fields
 * 4. Map fields to Excel columns
 * 5. Export Excel with original filename
 */
export default function HomeV2({ credits, onConsume }) {
  const [imageFile, setImageFile] = useState(null)
  const [imageUrl, setImageUrl] = useState("")
  const [ocrResult, setOcrResult] = useState(null)
  const [fields, setFields] = useState([])
  const [templateName, setTemplateName] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [templates, setTemplates] = useState([])
  const [ocrResults, setOcrResults] = useState([]) // For batch processing

  const user = auth.currentUser

  // Load existing templates
  useEffect(() => {
    if (user) {
      loadTemplates(user.uid)
        .then(setTemplates)
        .catch((err) => console.error("Failed to load templates:", err))
    }
  }, [user])

  // Convert file to URL
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile)
      setImageUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setImageUrl("")
    }
  }, [imageFile])

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      setImageFile(file)
      setOcrResult(null)
      setFields([])
      setError(null)
      setSuccess(null)
    } else {
      setError("Please select an image file (JPG, PNG) or PDF")
    }
  }

  // Run OCR Gemini - Uses ocrFileGemini (supports both image and PDF)
  const handleRunOCR = async () => {
    if (!imageFile || !user) return

    setLoading(true)
    setError(null)

    try {
      console.log("🔍 [Gemini] Running OCR Gemini...")
      const result = await ocrFileGemini(imageFile)
      setOcrResult(result)
      setFields([])
      
      // Consume credits (1 page per file)
      if (onConsume) {
        onConsume(1)
      }
      
      console.log(`✅ [Gemini] OCR Gemini completed: ${result.words.length} words found`)
    } catch (err) {
      console.error("❌ [Gemini] OCR Gemini error:", err)
      setError(`OCR Gemini failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Save template
  const handleSaveTemplate = async () => {
    if (!user || !ocrResult || fields.length === 0 || !templateName.trim()) {
      setError("Please provide template name and create at least one field")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const template = fieldsToTemplate(
        fields,
        ocrResult.page.width,
        ocrResult.page.height,
        templateName.trim(),
        user.uid
      )

      await saveTemplate(template)
      setSuccess("Template saved successfully!")
      setTemplateName("")
      
      // Reload templates
      const updatedTemplates = await loadTemplates(user.uid)
      setTemplates(updatedTemplates)
      
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error("Save error:", err)
      setError(`Failed to save template: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Load template
  const handleLoadTemplate = async (templateId) => {
    const template = templates.find((t) => t.templateId === templateId)
    if (template) {
      setSelectedTemplate(template)
      setSuccess(`Template "${template.templateName}" loaded`)
      setTimeout(() => setSuccess(null), 2000)
    }
  }

  // Export Excel
  const handleExportExcel = () => {
    if (!ocrResult || !selectedTemplate) {
      setError("Please run OCR and select a template first")
      return
    }

    try {
      if (ocrResults.length > 0) {
        // Batch export
        exportBatchExcel(ocrResults, selectedTemplate)
      } else {
        // Single file export
        exportSingleExcel(ocrResult, selectedTemplate)
      }
      setSuccess("Excel file exported successfully!")
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      console.error("Export error:", err)
      setError(`Failed to export Excel: ${err.message}`)
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0f172a", p: 4 }}>
      <Box sx={{ maxWidth: 1400, mx: "auto" }}>
        {/* V2 Header */}
        <Box sx={{ mb: 4, textAlign: "center" }}>
          <Chip
            label="V2"
            color="primary"
            sx={{ mb: 2, fontWeight: 700, fontSize: "0.75rem" }}
          />
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{ color: "#ffffff", mb: 1 }}
          >
            OCR System v2
          </Typography>
          <Typography variant="body1" sx={{ color: "#94a3b8" }}>
            Template-based OCR with word-level precision
          </Typography>
          {credits !== undefined && (
            <Typography variant="body2" sx={{ color: "#64748b", mt: 1 }}>
              Credits: {credits} pages
            </Typography>
          )}
        </Box>

        <Grid container spacing={3}>
          {/* Left Column: Document & OCR */}
          <Grid item xs={12} md={7}>
            <Stack spacing={3}>
              {/* Step 1: Upload */}
              <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6" sx={{ color: "#ffffff" }}>
                      Step 1: Upload Document
                    </Typography>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                      onChange={handleFileSelect}
                      style={{ display: "none" }}
                      id="v2-home-file-input"
                    />
                    <label htmlFor="v2-home-file-input">
                      <Button
                        variant="outlined"
                        component="span"
                        fullWidth
                        startIcon={<UploadIcon />}
                        sx={{
                          py: 2,
                          borderColor: "#475569",
                          color: "#e2e8f0",
                          "&:hover": {
                            borderColor: "#64748b",
                            bgcolor: "#334155",
                          },
                        }}
                      >
                        {imageFile ? imageFile.name : "Select Image or PDF"}
                      </Button>
                    </label>

                    {imageFile && (
                      <Button
                        variant="contained"
                        onClick={handleRunOCR}
                        disabled={loading}
                        fullWidth
                        sx={{ py: 1.5, bgcolor: "#3b82f6" }}
                      >
                        {loading ? (
                          <>
                            <CircularProgress size={20} sx={{ mr: 1, color: "#ffffff" }} />
                            Running OCR v2...
                          </>
                        ) : (
                          "Run OCR v2"
                        )}
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              {/* Alerts */}
              {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert severity="success" onClose={() => setSuccess(null)}>
                  {success}
                </Alert>
              )}

              {/* Step 2: Word Selection */}
              {ocrResult && imageFile && (
                <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
                      Step 2: Select Words & Create Fields
                    </Typography>
                    <Box
                      sx={{
                        border: "2px dashed #475569",
                        borderRadius: 2,
                        p: 2,
                        bgcolor: "#0f172a",
                      }}
                    >
                      <WordSelector
                        imageSource={imageFile}
                        ocrResult={ocrResult}
                        initialFields={fields}
                        onFieldsChange={setFields}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Stack>
          </Grid>

          {/* Right Column: Template & Export */}
          <Grid item xs={12} md={5}>
            <Stack spacing={3}>
              {/* Step 3: Save Template */}
              {fields.length > 0 && (
                <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
                      Step 3: Save Template
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Template Name"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="e.g., ID Card, Invoice"
                        fullWidth
                        size="small"
                        sx={{
                          "& .MuiInputBase-input": { color: "#ffffff" },
                          "& .MuiInputLabel-root": { color: "#94a3b8" },
                        }}
                      />
                      <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSaveTemplate}
                        disabled={saving || !templateName.trim()}
                        fullWidth
                        sx={{ bgcolor: "#3b82f6" }}
                      >
                        {saving ? "Saving..." : "Save Template"}
                      </Button>
                      <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                        {fields.length} field{fields.length !== 1 ? "s" : ""} configured
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              )}

              {/* Step 4: Select Template & Export */}
              {ocrResult && templates.length > 0 && (
                <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
                      Step 4: Export Excel
                    </Typography>
                    <Stack spacing={2}>
                      <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                        Select a template:
                      </Typography>
                      <Stack spacing={1}>
                        {templates.map((template) => (
                          <Button
                            key={template.templateId}
                            variant={selectedTemplate?.templateId === template.templateId ? "contained" : "outlined"}
                            onClick={() => handleLoadTemplate(template.templateId)}
                            fullWidth
                            sx={{
                              justifyContent: "flex-start",
                              bgcolor: selectedTemplate?.templateId === template.templateId ? "#3b82f6" : "transparent",
                              borderColor: "#475569",
                              color: selectedTemplate?.templateId === template.templateId ? "#ffffff" : "#e2e8f0",
                            }}
                          >
                            {template.templateName} ({template.columns.length} fields)
                          </Button>
                        ))}
                      </Stack>
                      {selectedTemplate && (
                        <Button
                          variant="contained"
                          startIcon={<DownloadIcon />}
                          onClick={handleExportExcel}
                          fullWidth
                          sx={{ bgcolor: "#22c55e", mt: 2 }}
                        >
                          Export Excel
                        </Button>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              )}

              {/* Saved Templates List */}
              {templates.length > 0 && (
                <Card sx={{ bgcolor: "#1e293b", border: "1px solid #334155" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
                      Your Templates ({templates.length})
                    </Typography>
                    <Stack spacing={1}>
                      {templates.map((template) => (
                        <Box
                          key={template.templateId}
                          sx={{
                            p: 2,
                            border: "1px solid #334155",
                            borderRadius: 1,
                            bgcolor: "#0f172a",
                            "&:hover": {
                              bgcolor: "#1e293b",
                            },
                          }}
                        >
                          <Typography fontWeight={500} sx={{ color: "#ffffff" }}>
                            {template.templateName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "#64748b" }}>
                            {template.columns.length} field{template.columns.length !== 1 ? "s" : ""}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}
