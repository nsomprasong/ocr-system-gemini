// Excel Service - สร้างไฟล์ Excel จากข้อมูล OCR
import * as XLSX from "xlsx"

/**
 * Map Smart OCR records to Excel format with fixed column mapping
 * 
 * Excel Column Mapping:
 * - Name = record.name
 * - Age = "" (empty)
 * - Address = record.houseNumber
 * - Zone, Province, District, SubDistrict, Village = "" (empty)
 * 
 * @param {Array} records - Smart OCR records array
 * @returns {Array} Mapped data for Excel export
 */
function mapRecordsToExcelFormat(records) {
  // Fixed Excel column order
  const excelColumns = [
    "Name",
    "Age",
    "Address",
    "Zone",
    "Province",
    "District",
    "SubDistrict",
    "Village"
  ];
  
  // Map each record to Excel row format
  const mappedData = records.map((record) => {
    const excelRow = {
      Name: record.name || "",
      Age: "", // Always empty
      Address: record.houseNumber || "",
      Zone: "", // Always empty
      Province: "", // Always empty
      District: "", // Always empty
      SubDistrict: "", // Always empty
      Village: "", // Always empty
    };
    
    return excelRow;
  });
  
  return {
    data: mappedData,
    columns: excelColumns,
  };
}

/**
 * สร้างไฟล์ Excel จากข้อมูล (Smart OCR records)
 * 
 * Uses fixed Excel column mapping:
 * - Name = record.name
 * - Age = "" (empty)
 * - Address = record.houseNumber
 * - Zone, Province, District, SubDistrict, Village = "" (empty)
 * 
 * @param {Array} data - Smart OCR records array (raw records from Gemini)
 * @param {Array} columnConfig - Deprecated (not used, kept for backward compatibility)
 * @param {string} filename - ชื่อไฟล์
 */
export function createExcelFile(data, columnConfig, filename = "output.xlsx") {
  try {
    console.log(`📊 [Excel] Creating file: ${filename}`)
    console.log(`📊 [Excel] Input records: ${data.length}`)
    
    if (!data || data.length === 0) {
      console.warn(`⚠️ [Excel] No data to export for ${filename}`)
      throw new Error(`ไม่มีข้อมูลที่จะส่งออกในไฟล์ ${filename}`)
    }
    
    // Map records to Excel format (fixed column mapping)
    const mapped = mapRecordsToExcelFormat(data);
    const excelData = mapped.data;
    const excelColumns = mapped.columns;
    
    console.log(`📊 [Excel] Mapped ${excelData.length} records to Excel format`);
    console.log(`📊 [Excel] Excel columns:`, excelColumns);
    
    // สร้าง workbook ใหม่
    const wb = XLSX.utils.book_new()
    
    // สร้าง worksheet
    const ws = XLSX.utils.aoa_to_sheet([])
    
    // เพิ่ม header row (fixed order)
    const headers = excelColumns;
    console.log(`📊 [Excel] Headers:`, headers)
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" })
    
    // เพิ่มข้อมูล (mapped to Excel format)
    const rows = excelData.map((row) => {
      return excelColumns.map((col) => {
        return row[col] || ""
      })
    })
    
    console.log(`📊 [Excel] Rows to add: ${rows.length}`)
    if (rows.length > 0) {
      XLSX.utils.sheet_add_aoa(ws, rows, { origin: "A2" })
    }
    
    // ตั้งค่าความกว้างคอลัมน์ (fixed widths)
    const colWidths = excelColumns.map((col) => {
      // Set appropriate widths for each column
      const widths = {
        Name: 30,
        Age: 10,
        Address: 20,
        Zone: 15,
        Province: 20,
        District: 20,
        SubDistrict: 20,
        Village: 20,
      };
      return { wch: widths[col] || 20 };
    });
    ws["!cols"] = colWidths
    
    // เพิ่ม worksheet เข้า workbook
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อ")
    
    // สร้างไฟล์ Excel
    console.log(`💾 [Excel] Writing file: ${filename}`)
    XLSX.writeFile(wb, filename)
    console.log(`✅ [Excel] File created successfully: ${filename}`)
  } catch (error) {
    console.error(`❌ [Excel] Error creating file ${filename}:`, error)
    throw error
  }
}

/**
 * สร้างไฟล์ Excel แบบแยกไฟล์ (separate mode)
 */
export function createSeparateExcelFiles(fileData, columnConfig) {
  fileData.forEach(({ filename, data }) => {
    const baseName = filename.replace(/\.[^/.]+$/, "")
    createExcelFile(data, columnConfig, `${baseName}.xlsx`)
  })
}

/**
 * สร้างไฟล์ Excel แบบรวมไฟล์เดียว (combine mode)
 */
export function createCombinedExcelFile(allData, columnConfig, filename = "combined.xlsx") {
  // รวมข้อมูลทั้งหมด
  const combinedData = []
  allData.forEach(({ data }) => {
    combinedData.push(...data)
  })
  
  createExcelFile(combinedData, columnConfig, filename)
}
