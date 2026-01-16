// OCR Service - เรียก Firebase Cloud Function สำหรับ OCR
const FIREBASE_OCR_URL =
  "https://ocrimage-3vghmazr7q-uc.a.run.app"
  // ไม่ใช้ backend proxy แล้ว ให้เรียก Firebase Cloud Function ตรง ๆ
const USE_PROXY = false

/**
 * แปลงไฟล์เป็น base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(",")[1] // ลบ data:image/png;base64, prefix
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * เรียก OCR สำหรับไฟล์ภาพ (JPG, PNG)
 */
export async function ocrImage(imageFile) {
  try {
    console.log(`📸 Converting image to base64: ${imageFile.name}`)
    const imageBase64 = await fileToBase64(imageFile)
    console.log(`✅ Image converted, base64 length: ${imageBase64.length}`)
    
    // ใช้ proxy ถ้าเปิดใช้งาน
    const ocrUrl = USE_PROXY 
      ? `${API_URL.replace("/api", "")}/api/ocr-proxy`
      : FIREBASE_OCR_URL
    
    console.log(`🌐 Calling OCR API${USE_PROXY ? " (via proxy)" : ""}...`)
    const response = await fetch(ocrUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_base64: imageBase64,
      }),
    })

    console.log(`📡 OCR API response status: ${response.status}`)
    console.log(`📡 OCR API response headers:`, Object.fromEntries(response.headers.entries()))

    // อ่าน response text ครั้งเดียว (response body อ่านได้ครั้งเดียวเท่านั้น)
    const responseText = await response.text()
    console.log(`📄 OCR API response text length: ${responseText.length}`)
    
    if (!response.ok) {
      console.error(`❌ OCR API error response:`, responseText)
      throw new Error(`HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`)
    }

    // ตรวจสอบ content-type
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ OCR API response is not JSON. Content-Type: ${contentType}`)
      console.error(`❌ Response text (first 500 chars):`, responseText.substring(0, 500))
      throw new Error(`Invalid response format. Expected JSON but got ${contentType}. Response: ${responseText.substring(0, 200)}`)
    }

    // Parse JSON พร้อม error handling
    let data
    try {
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response body")
      }
      
      console.log(`📄 OCR API response text preview (first 500 chars):`, responseText.substring(0, 500))
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error(`❌ Failed to parse JSON response:`, parseError)
      console.error(`❌ Response text (first 1000 chars):`, responseText.substring(0, 1000))
      throw new Error(`Failed to parse JSON response: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`)
    }

    console.log(`📄 OCR API response:`, { 
      success: data.success, 
      textLength: data.text?.length || 0
    })

    if (!data.success) {
      throw new Error(data.error || "OCR failed")
    }

    // Return แค่ text เหมือน Python script
    return data.text || ""
  } catch (error) {
    console.error("❌ OCR Image Error:", error)
    throw error
  }
}

/**
 * เรียก OCR สำหรับไฟล์ PDF
 */
export async function ocrPdf(pdfFile) {
  try {
    console.log(`📄 Converting PDF to base64: ${pdfFile.name}`)
    const pdfBase64 = await fileToBase64(pdfFile)
    console.log(`✅ PDF converted, base64 length: ${pdfBase64.length}`)
    
    // ใช้ proxy ถ้าเปิดใช้งาน
    const ocrUrl = USE_PROXY 
      ? `${API_URL.replace("/api", "")}/api/ocr-proxy`
      : FIREBASE_OCR_URL
    
    console.log(`🌐 Calling OCR API for PDF${USE_PROXY ? " (via proxy)" : ""}...`)
    const response = await fetch(ocrUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pdf_base64: pdfBase64,
        filename: pdfFile.name,
      }),
    })

    console.log(`📡 OCR API response status: ${response.status}`)
    console.log(`📡 OCR API response headers:`, Object.fromEntries(response.headers.entries()))

    // อ่าน response text ครั้งเดียว (response body อ่านได้ครั้งเดียวเท่านั้น)
    const responseText = await response.text()
    console.log(`📄 OCR API response text length: ${responseText.length}`)
    
    if (!response.ok) {
      console.error(`❌ OCR API error response:`, responseText)
      throw new Error(`HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`)
    }

    // ตรวจสอบ content-type
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ OCR API response is not JSON. Content-Type: ${contentType}`)
      console.error(`❌ Response text (first 500 chars):`, responseText.substring(0, 500))
      throw new Error(`Invalid response format. Expected JSON but got ${contentType}. Response: ${responseText.substring(0, 200)}`)
    }

    // Parse JSON พร้อม error handling
    let data
    try {
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response body")
      }
      
      console.log(`📄 OCR API response text preview (first 500 chars):`, responseText.substring(0, 500))
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error(`❌ Failed to parse JSON response:`, parseError)
      console.error(`❌ Response text (first 1000 chars):`, responseText.substring(0, 1000))
      throw new Error(`Failed to parse JSON response: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`)
    }

    console.log(`📄 OCR API response:`, { 
      success: data.success, 
      textLength: data.text?.length || 0
    })

    if (!data.success) {
      throw new Error(data.error || "OCR PDF failed")
    }

    // Return แค่ text เหมือน Python script
    return data.text || ""
  } catch (error) {
    console.error("❌ OCR PDF Error:", error)
    throw error
  }
}

/**
 * เรียก OCR ตามประเภทไฟล์
 */
export async function ocrFile(file) {
  const ext = file.name.toLowerCase().split(".").pop()
  
  if (ext === "pdf") {
    return await ocrPdf(file)
  } else if (["jpg", "jpeg", "png"].includes(ext)) {
    return await ocrImage(file)
  } else {
    throw new Error(`Unsupported file type: ${ext}`)
  }
}
