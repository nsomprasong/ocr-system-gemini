// File Export Service - บันทึกไฟล์ไปที่ server ผ่าน API
import { API_URL, checkApiHealth } from "../config/api.config"
import {
  createSeparateExcelFiles,
  createCombinedExcelFile,
} from "./excel.service"

/**
 * บันทึกไฟล์ Excel ไปที่ server
 */
export async function saveExcelToServer(data, columnConfig, filename, mode = "separate") {
  const headers = columnConfig.map((col) => col.label || col.key || "")
  const columnWidths = columnConfig.map((col) => col.width || 20)
  
  // ตรวจสอบว่า data เป็น array of objects หรือ array of arrays
  const rows = data.map((row) => {
    if (Array.isArray(row)) {
      // ถ้าเป็น array อยู่แล้ว (combine mode)
      return row.map((cell) => cell ?? "")
    } else {
      // ถ้าเป็น object (separate mode)
      return columnConfig.map((col) => {
        const value = row[col.key]
        return value !== undefined && value !== null ? String(value) : ""
      })
    }
  })
  
  try {
    // ตรวจสอบว่า data เป็น array of files (separate mode) หรือ rows (combine mode)
    if (mode === "separate" && Array.isArray(data) && data.length > 0 && data[0].filename) {
      // หลายไฟล์ (separate mode) - data เป็น array of {filename, data}
      console.log(`📦 Processing ${data.length} files in separate mode`)
      
      const files = data.map((fileData, idx) => {
        const filename = fileData.filename || `file_${idx + 1}`
        const fileDataRows = fileData.data || []
        
        // แปลง data objects เป็น rows
        const fileRows = fileDataRows.map((row) => {
          return columnConfig.map((col) => {
            const value = row[col.key]
            return value !== undefined && value !== null ? String(value) : ""
          })
        })
        
        console.log(`📄 File ${idx + 1}: ${filename}, ${fileRows.length} rows`)
        
        return {
          filename: filename,
          data: fileDataRows, // ส่ง data objects ไปให้ backend แปลง
          headers,
          columnWidths,
        }
      })
      
      const response = await fetch(`${API_URL}/save-files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files,
          fileType: "xlsx",
          columnConfig,
        }),
      })
      
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || "Failed to save files")
      }
      
      return result
    } else {
      // ไฟล์เดียว
      const response = await fetch(`${API_URL}/save-file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileType: "xlsx",
          filename,
          headers,
          rows,
          columnWidths,
          mode,
        }),
      })
      
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || "Failed to save file")
      }
      
      return result
    }
  } catch (error) {
    console.error("Error saving Excel to server:", error)
    // Fallback: ดาวน์โหลดไฟล์แทน
    console.warn("⚠️ Cannot save to server, falling back to download...")
    if (mode === "separate" && Array.isArray(data) && data.length > 0 && data[0].filename) {
      // แยกไฟล์
      const fileData = data.map((fileData) => ({
        filename: fileData.filename.replace(/\.[^/.]+$/, ""),
        data: fileData.data || fileData.rows || [],
      }))
      createSeparateExcelFiles(fileData, columnConfig)
      return { success: true, message: "ดาวน์โหลดไฟล์ Excel เรียบร้อยแล้ว (fallback mode)" }
    } else {
      // รวมไฟล์เดียว
      const allData = Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && !data[0].filename
        ? data.map((row) => {
            const obj = {}
            columnConfig.forEach((col) => {
              obj[col.key] = row[col.key] || ""
            })
            return obj
          })
        : []
      createCombinedExcelFile([{ data: allData }], columnConfig, filename || "combined.xlsx")
      return { success: true, message: "ดาวน์โหลดไฟล์ Excel เรียบร้อยแล้ว (fallback mode)" }
    }
  }
}

/**
 * บันทึกไฟล์ Word ไปที่ server
 */
export async function saveWordToServer(data, columnConfig, filename = "", mode = "separate") {
  const headers = columnConfig.map((col) => col.label || col.key)
  
  try {
    // ตรวจสอบว่าเป็น array of files (separate mode) หรือ rows (combine mode)
    if (mode === "separate" && Array.isArray(data) && data.length > 0 && data[0].filename) {
      // หลายไฟล์ (separate mode)
      const files = data.map((fileData) => ({
        filename: fileData.filename.replace(/\.[^/.]+$/, ""),
        headers,
        rows: fileData.rows || fileData.data.map((row) =>
          columnConfig.map((col) => row[col.key] || "")
        ),
      }))
      
      const response = await fetch(`${API_URL}/save-files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files,
          fileType: "doc",
          columnConfig,
        }),
      })
      
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || "Failed to save files")
      }
      
      return result
    } else {
      // ไฟล์เดียว (combine mode) - data เป็น array of rows
      const rows = Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && !data[0].filename
        ? data.map((row) => columnConfig.map((col) => row[col.key] || ""))
        : data // ถ้าเป็น array of arrays อยู่แล้ว
      
      const response = await fetch(`${API_URL}/save-file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileType: "doc",
          filename: filename || "combined",
          headers,
          rows,
          mode,
        }),
      })
      
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || "Failed to save file")
      }
      
      return result
    }
  } catch (error) {
    console.error("Error saving Word to server:", error)
    // Fallback: แสดง error เพราะไม่สามารถสร้าง Word ใน browser ได้
    throw new Error(
      `ไม่สามารถบันทึกไฟล์ Word ไปที่ server ได้: ${error.message}. ` +
      `กรุณาตรวจสอบว่า backend API ทำงานอยู่ หรือเปลี่ยนเป็น Excel แทน`
    )
  }
}
