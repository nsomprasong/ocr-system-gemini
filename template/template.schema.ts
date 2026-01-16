/**
 * Zone coordinates are percentage-based (0–1)
 * Zones are relative to page width/height
 */
export interface Zone {
  x: number  // 0-1 percentage
  y: number  // 0-1 percentage
  w: number  // 0-1 percentage
  h: number  // 0-1 percentage
}

/**
 * Template column definition
 * 1 zone = 1 Excel column
 */
export interface TemplateColumn {
  columnKey: string
  label: string
  zone: Zone
  defaultValue?: string // Optional default value for the column
  fieldType?: string // Field type (PERSON_NAME, NORMAL_TEXT, etc.)
  columnName?: string // Column display name (can be different from label)
  text?: string // Saved text content (to preserve exact formatting when loading)
}

/**
 * Template structure
 * Templates are saved per user
 * One user can have multiple templates
 */
export interface Template {
  templateId: string
  userId: string
  templateName: string
  columns: TemplateColumn[]
  rotation?: number // Rotation angle in degrees (0, 90, 180, 270) - manual rotation set by user
}
