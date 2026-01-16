import type { OCRWord } from "../types"

interface Zone {
  x: number  // 0-1 percentage
  y: number  // 0-1 percentage
  w: number  // 0-1 percentage
  h: number  // 0-1 percentage
}

interface TemplateZone {
  key: string
  zone: Zone
}

/**
 * Converts a percentage-based zone to absolute pixel coordinates
 */
function zoneToAbsolute(
  zone: Zone,
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: zone.x * pageWidth,
    y: zone.y * pageHeight,
    w: zone.w * pageWidth,
    h: zone.h * pageHeight,
  }
}

/**
 * Checks if a word's bounding box intersects or is inside a zone
 */
function wordInZone(word: OCRWord, zoneAbs: { x: number; y: number; w: number; h: number }): boolean {
  // Word bounding box
  const wordLeft = word.x
  const wordTop = word.y
  const wordRight = word.x + word.w
  const wordBottom = word.y + word.h

  // Zone bounding box
  const zoneLeft = zoneAbs.x
  const zoneTop = zoneAbs.y
  const zoneRight = zoneAbs.x + zoneAbs.w
  const zoneBottom = zoneAbs.y + zoneAbs.h

  // Check if word overlaps with zone (any intersection counts)
  return !(
    wordRight < zoneLeft ||
    wordLeft > zoneRight ||
    wordBottom < zoneTop ||
    wordTop > zoneBottom
  )
}

/**
 * Filters OCR words that fall inside each template zone.
 * 
 * @param words - Array of OCR words with absolute pixel coordinates
 * @param pageWidth - Page width in pixels
 * @param pageHeight - Page height in pixels
 * @param zones - Array of template zones with percentage-based coordinates (0-1)
 * @returns Record mapping zone keys to arrays of words that fall inside each zone
 */
export function parseByZone(
  words: OCRWord[],
  pageWidth: number,
  pageHeight: number,
  zones: TemplateZone[]
): Record<string, OCRWord[]> {
  const result: Record<string, OCRWord[]> = {}

  for (const templateZone of zones) {
    // Convert percentage zone to absolute coordinates
    const zoneAbs = zoneToAbsolute(templateZone.zone, pageWidth, pageHeight)

    // Filter words that fall inside this zone
    const wordsInZone = words.filter((word) => wordInZone(word, zoneAbs))

    result[templateZone.key] = wordsInZone
  }

  return result
}
