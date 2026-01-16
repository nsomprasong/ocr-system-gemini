// API Configuration
// สามารถตั้งค่า API URL ได้ที่นี่ หรือใช้ environment variable

// ตรวจสอบ environment variable ก่อน
const getApiUrl = () => {
  // ถ้ามี environment variable ใช้ค่านั้น
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // ถ้ามีการตั้งค่าใน localStorage ใช้ค่านั้น
  const savedUrl = localStorage.getItem("api_url")
  if (savedUrl) {
    return savedUrl
  }
  
  // Default: ใช้ localhost (สำหรับ development)
  // สำหรับ production ควรตั้งค่าเป็น server IP หรือ domain
  return "http://127.0.0.1:3001/api"
}

export const API_URL = getApiUrl()

// ฟังก์ชันสำหรับอัปเดต API URL
export function setApiUrl(url) {
  localStorage.setItem("api_url", url)
  // Reload page เพื่อให้ใช้ URL ใหม่
  window.location.reload()
}

// ฟังก์ชันสำหรับตรวจสอบว่า API พร้อมใช้งานหรือไม่
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_URL.replace("/api", "")}/health`, {
      method: "GET",
      timeout: 3000,
    })
    return response.ok
  } catch (error) {
    return false
  }
}
