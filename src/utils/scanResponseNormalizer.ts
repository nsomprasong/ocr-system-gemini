/**
 * Normalize scan response from OCR or Vision mode
 * Maps different response formats to a unified frontend format
 */

export interface NormalizedRecord {
  rowIndex: number
  page?: number
  name: string | null
  houseNumber: string | null
  // OCR mode fields (optional)
  Name?: string | null
  Address?: string | null
  Age?: string | null
  Zone?: string | null
  Province?: string | null
  District?: string | null
  SubDistrict?: string | null
  Village?: string | null
}

export interface NormalizedResponse {
  success: boolean
  mode: "ocr" | "vision"
  records: NormalizedRecord[]
  totalPages: number
  totalRecords: number
  error?: string
}

/**
 * Normalize scan response based on mode
 * 
 * @param response - Raw API response
 * @param mode - "ocr" or "vision"
 * @returns Normalized response with unified record format
 */
export function normalizeScanResponse(
  response: any,
  mode: "ocr" | "vision"
): NormalizedResponse {
  // Safety guard: Check if response is successful
  if (!response || response.success === false) {
    return {
      success: false,
      mode,
      records: [],
      totalPages: 0,
      totalRecords: 0,
      error: response?.error || "Unknown error",
    }
  }

  // Safety guard: Check if records exist
  if (!response.records || !Array.isArray(response.records) || response.records.length === 0) {
    return {
      success: true,
      mode,
      records: [],
      totalPages: response.totalPages || response.meta?.totalPages || 0,
      totalRecords: 0,
    }
  }

  if (mode === "vision") {
    // Vision mode: { page, name, houseNumber }
    const normalizedRecords: NormalizedRecord[] = response.records.map(
      (record: any, index: number) => ({
        rowIndex: index + 1,
        page: record.page || null,
        name: record.name || null,
        houseNumber: record.houseNumber || null,
      })
    )

    return {
      success: true,
      mode: "vision",
      records: normalizedRecords,
      totalPages: response.totalPages || 0,
      totalRecords: normalizedRecords.length,
    }
  } else {
    // OCR mode: Use existing format (DO NOT TOUCH)
    // Records already have Name, Address, etc. fields
    const normalizedRecords: NormalizedRecord[] = response.records.map(
      (record: any, index: number) => ({
        rowIndex: index + 1,
        // Preserve all OCR mode fields
        Name: record.Name || null,
        Address: record.Address || null,
        Age: record.Age || null,
        Zone: record.Zone || null,
        Province: record.Province || null,
        District: record.District || null,
        SubDistrict: record.SubDistrict || null,
        Village: record.Village || null,
        // Also map to name/houseNumber for compatibility
        name: record.Name || record.name || null,
        houseNumber: record.Address || record.houseNumber || null,
      })
    )

    return {
      success: true,
      mode: "ocr",
      records: normalizedRecords,
      totalPages: response.meta?.totalPages || response.totalPages || 0,
      totalRecords: normalizedRecords.length,
    }
  }
}
