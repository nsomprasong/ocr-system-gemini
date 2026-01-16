import { initializeApp } from "firebase/app"
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth"
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyCQXBDJRPKPu9wbAwMVIYx4pKWgTEKhD_E",
  authDomain: "ocr-system-c3bea.firebaseapp.com",
  projectId: "ocr-system-c3bea",
  storageBucket: "ocr-system-c3bea.firebasestorage.app",
  messagingSenderId: "282838463362",
  appId: "1:282838463362:web:7fa9685913fdeda8d5559b",
  measurementId: "G-WTEWW8DWJE"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// ตั้งค่า session persistence เป็น browserSessionPersistence
// เพื่อความปลอดภัย: เมื่อปิดเบราว์เซอร์/แท็บทั้งหมด จะต้อง login ใหม่
// ค้างเฉพาะ session ปัจจุบัน (ไม่ค้างเมื่อปิดเบราว์เซอร์)
setPersistence(auth, browserSessionPersistence)
  .then(() => {
    console.log("✅ Auth persistence set to browserSessionPersistence (session only)")
  })
  .catch((error) => {
    console.error("❌ Failed to set auth persistence:", error)
  })

export const db = getFirestore(app)

// Debug: Log Firestore initialization
console.log("🔥 Firestore initialized:", {
  db: db,
  app: app,
  projectId: firebaseConfig.projectId,
  dbApp: db?.app,
  dbType: typeof db,
})

// ตรวจสอบว่า Firestore ทำงานหรือไม่
if (db) {
  console.log("✅ Firestore db object exists")
} else {
  console.error("❌ Firestore db object is null or undefined!")
}