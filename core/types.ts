export interface OCRWord {
  text: string
  x: number
  y: number
  w: number
  h: number
  pageNumber?: number // Optional: page number for multi-page documents (1-based)
}

export interface OCRResult {
  fileName: string
  page: {
    width: number
    height: number
  }
  words: OCRWord[]
  pages?: Array<{ // Optional: per-page data for multi-page documents
    pageNumber: number
    width: number
    height: number
    words: OCRWord[]
  }>
  // Optional: Smart OCR result (from Gemini)
  smartOcrResult?: {
    records: Array<Record<string, string>>
    metadata: {
      source: string // "textlayer+gemini" or "vision+gemini"
      pages: number
      confidence: "low" | "medium" | "high"
      textLength: number
      structureAnalysis?: any
    }
    rawText?: string
  }
}
