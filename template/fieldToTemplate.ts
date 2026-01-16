import type { OCRWord } from "../../core/types"
import type { Template, TemplateColumn, Zone } from "./template.schema"

interface SelectedField {
  id: string
  name: string
  words: OCRWord[]
  excelColumn: string | null
  defaultValue?: string // Optional default value
  columnName?: string // Optional column name (display name)
  fieldType?: string // Field type (PERSON_NAME, NORMAL_TEXT, etc.)
  zone?: Zone // Optional: zone coordinates (x, y, w, h in pixels) - if provided, use this instead of calculating from words
  text?: string // Saved text content (to preserve exact formatting when loading)
}

/**
 * Converts selected words to a zone (percentage-based coordinates).
 * The zone encompasses all selected words.
 */
function wordsToZone(
  words: OCRWord[],
  pageWidth: number,
  pageHeight: number
): Zone {
  if (words.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }

  // Find bounding box that encompasses all words
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const word of words) {
    minX = Math.min(minX, word.x)
    minY = Math.min(minY, word.y)
    maxX = Math.max(maxX, word.x + word.w)
    maxY = Math.max(maxY, word.y + word.h)
  }

  // Convert to percentage (0-1)
  return {
    x: pageWidth > 0 ? minX / pageWidth : 0,
    y: pageHeight > 0 ? minY / pageHeight : 0,
    w: pageWidth > 0 ? (maxX - minX) / pageWidth : 0,
    h: pageHeight > 0 ? (maxY - minY) / pageHeight : 0,
  }
}

/**
 * Converts WordSelector fields to Template format.
 * 
 * @param fields - Selected fields from WordSelector
 * @param pageWidth - OCR page width in pixels
 * @param pageHeight - OCR page height in pixels
 * @param templateName - Name for the template
 * @param userId - User ID
 * @param templateId - Template ID (optional, will generate if not provided)
 * @returns Template object ready to save
 */
export function fieldsToTemplate(
  fields: SelectedField[],
  pageWidth: number,
  pageHeight: number,
  templateName: string,
  userId: string,
  templateId?: string,
  rotation?: number // Manual rotation angle set by user (0, 90, 180, 270)
): Template {
  const columns: TemplateColumn[] = fields.map((field, index) => {
    // Use provided zone if available, otherwise calculate from words
    // This ensures saved zone coordinates are preserved exactly as user set them
    let zone: Zone
    if (field.zone) {
      // Use provided zone (convert from pixels to percentage)
      zone = {
        x: pageWidth > 0 ? field.zone.x / pageWidth : 0,
        y: pageHeight > 0 ? field.zone.y / pageHeight : 0,
        w: pageWidth > 0 ? field.zone.w / pageWidth : 0,
        h: pageHeight > 0 ? field.zone.h / pageHeight : 0,
      }
    } else {
      // Calculate zone from words (fallback for backward compatibility)
      zone = wordsToZone(field.words, pageWidth, pageHeight)
    }

    // Use Excel column if provided, otherwise use field name as key
    const columnKey = field.excelColumn || field.name.toLowerCase().replace(/\s+/g, "_")

    // Build column object, only including optional fields if they exist
    const column: any = {
      columnKey,
      label: field.columnName || field.name, // Use columnName if provided
      zone,
    }
    
    // Only include defaultValue if it's not empty (Firestore doesn't support undefined)
    if (field.defaultValue && field.defaultValue.trim() !== "") {
      column.defaultValue = field.defaultValue
    }
    
    // Include fieldType if provided
    if (field.fieldType) {
      column.fieldType = field.fieldType
    }
    
    // Include columnName if provided (can be different from label)
    if (field.columnName && field.columnName.trim() !== "") {
      column.columnName = field.columnName
    }
    
    // Include text if provided (to preserve exact formatting when loading)
    // This is critical to prevent text from being re-processed incorrectly
    if (field.text && field.text.trim() !== "") {
      column.text = field.text
    }
    
    return column
  })

  const template: Template = {
    templateId: templateId || `tpl_${Date.now()}`,
    userId,
    templateName,
    columns,
  }
  
  // Include rotation if provided
  if (rotation !== undefined && rotation !== null) {
    template.rotation = rotation
  }
  
  return template
}

/**
 * Converts Template back to WordSelector fields format.
 * Note: This loses individual word information, only preserves zones.
 * 
 * @param template - Template to convert
 * @param ocrWords - OCR words to map zones to (optional, for preview)
 * @returns SelectedField array (approximate, based on zones)
 */
export function templateToFields(
  template: Template,
  ocrWords?: OCRWord[]
): SelectedField[] {
  return template.columns.map((column, index) => {
    // If we have OCR words, try to find words in the zone
    let wordsInZone: OCRWord[] = []
    
    if (ocrWords && template.columns.length > 0) {
      // This is a simplified conversion - in practice, you'd use parseByZone
      // For now, we'll return empty words array as zones don't preserve individual words
      wordsInZone = []
    }

    return {
      id: `field_${column.columnKey}_${index}`,
      name: column.label,
      words: wordsInZone,
      excelColumn: column.columnKey,
    }
  })
}
