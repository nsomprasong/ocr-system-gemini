import { useState, useEffect } from "react"
import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  Card,
  CardContent,
  Alert,
  CircularProgress,
} from "@mui/material"
import SaveIcon from "@mui/icons-material/Save"
import { auth } from "../firebase"
import { ocrImageGemini } from "../services/ocr.service.gemini"
import { saveTemplate } from "../../template/saveTemplate"
import { loadTemplates } from "../../template/loadTemplate"
import { fieldsToTemplate } from "../../template/fieldToTemplate"
import WordSelector from "../components/WordSelector"

/**
 * Template Builder page for OCR v2.
 * Allows users to:
 * - Upload a sample document
 * - Run OCR v2 to get word positions
 * - Select words and group into fields
 * - Map fields to Excel columns
 * - Save template for reuse
 */
export default function TemplateBuilder() {
  const [imageFile, setImageFile] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [fields, setFields] = useState([])
  const [templateName, setTemplateName] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [templates, setTemplates] = useState([])

  const user = auth.currentUser

  // Load existing templates
  useEffect(() => {
    if (user) {
      loadTemplates(user.uid)
        .then(setTemplates)
        .catch((err) => console.error("Failed to load templates:", err))
    }
  }, [user])

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      setImageFile(file)
      setOcrResult(null)
      setFields([])
      setError(null)
    } else {
      setError("Please select an image file (JPG, PNG)")
    }
  }

  // Run OCR v2 on selected image
  const handleRunOCR = async () => {
    if (!imageFile || !user) return

    setLoading(true)
    setError(null)

    try {
      // Use OCR v2 directly (this is v2-only page)
      const result = await ocrImageGemini(imageFile)
      setOcrResult(result)
      console.log(`✅ OCR completed: ${result.words.length} words found`)
    } catch (err) {
      console.error("OCR error:", err)
      setError(`OCR failed: ${err.message}`)
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
      // Convert fields to template format
      const template = fieldsToTemplate(
        fields,
        ocrResult.page.width,
        ocrResult.page.height,
        templateName.trim(),
        user.uid
      )

      // Save to Firestore
      await saveTemplate(template)
      setSaved(true)
      setTemplateName("")

      // Reload templates
      const updatedTemplates = await loadTemplates(user.uid)
      setTemplates(updatedTemplates)

      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error("Save error:", err)
      setError(`Failed to save template: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack spacing={3}>
        {/* Header */}
        <Box>
          <Typography variant="h5" fontWeight={600}>
            OCR Template Builder (v2)
          </Typography>
          <Typography color="text.secondary">
            Create reusable templates by selecting words from sample documents
          </Typography>
        </Box>

        {/* File Upload */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={500}>
                Step 1: Upload Sample Document
              </Typography>
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileSelect}
                style={{ display: "none" }}
                id="template-builder-file-input"
              />
              <label htmlFor="template-builder-file-input">
                <Button variant="outlined" component="span" fullWidth>
                  {imageFile ? imageFile.name : "Select Image File"}
                </Button>
              </label>

              {imageFile && (
                <Button
                  variant="contained"
                  onClick={handleRunOCR}
                  disabled={loading}
                  fullWidth
                >
                  {loading ? (
                    <>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Running OCR...
                    </>
                  ) : (
                    "Run OCR v2"
                  )}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Success Alert */}
        {saved && (
          <Alert severity="success">Template saved successfully!</Alert>
        )}

        {/* OCR Result & Word Selection */}
        {ocrResult && imageFile && (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="subtitle1" fontWeight={500}>
                  Step 2: Select Words & Create Fields
                </Typography>
                <WordSelector
                  imageSource={imageFile}
                  ocrResult={ocrResult}
                  onFieldsChange={setFields}
                />
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Save Template */}
        {fields.length > 0 && (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="subtitle1" fontWeight={500}>
                  Step 3: Save Template
                </Typography>
                <TextField
                  label="Template Name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., ID Card, Invoice, Form"
                  fullWidth
                />
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveTemplate}
                  disabled={saving || !templateName.trim()}
                  fullWidth
                >
                  {saving ? "Saving..." : "Save Template"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Saved Templates List */}
        {templates.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={500} mb={2}>
                Your Templates ({templates.length})
              </Typography>
              <Stack spacing={1}>
                {templates.map((template) => (
                  <Box
                    key={template.templateId}
                    sx={{
                      p: 2,
                      border: "1px solid #e2e8f0",
                      borderRadius: 1,
                      bgcolor: "#f8fafc",
                    }}
                  >
                    <Typography fontWeight={500}>{template.templateName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {template.columns.length} fields
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  )
}
