import { useEffect, useState } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { Box } from "@mui/material"

import { auth } from "./firebase"
import {
  getUserProfile,
  createUserProfile,
} from "./services/user.service"

import AppLayoutV2 from "./components/AppLayoutV2"
import LoginV2 from "./pages/LoginV2"
import Settings from "./pages/Settings"
import DocumentTemplateSettings from "./pages/DocumentTemplateSettings"
import Scan from "./pages/Scan"

export default function App() {
  const [page, setPage] = useState("home")

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [credits, setCredits] = useState(0)
  const [scanFiles, setScanFiles] = useState([])

  const [columnConfig, setColumnConfig] = useState([
    {
      key: "name",
      label: "รายชื่อ",
      mode: "auto",
      manualValue: "",
      width: 30,
    },
    {
      key: "houseNumber",
      label: "บ้านเลขที่",
      mode: "auto",
      manualValue: "",
      width: 15,
    },
    {
      key: "moo",
      label: "หมู่",
      mode: "auto",
      manualValue: "",
      width: 12,
    },
    {
      key: "tambon",
      label: "ตำบล",
      mode: "auto",
      manualValue: "",
      width: 20,
    },
    {
      key: "filename",
      label: "ชื่อไฟล์ภาพ",
      mode: "auto",
      manualValue: "",
      width: 35,
    },
  ])

  // 🔐 Auth + Firestore bootstrap
  useEffect(() => {
    console.log("🔧 Setting up auth listener...")
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      console.log("🔐 Auth state changed:", u ? u.email : "null")
      
      if (!u) {
        console.log("❌ No user - showing login")
        setUser(null)
        setLoading(false)
        return
      }

      console.log("✅ User found:", u.email)
      console.log("📧 Email verified:", u.emailVerified)
      
      // ตรวจสอบ email verification
      if (!u.emailVerified) {
        console.log("❌ Email not verified - signing out")
        setUser(null)
        setLoading(false)
        // Sign out เพื่อบังคับให้กลับไปหน้า login
        signOut(auth).catch((err) => {
          console.error("Error signing out:", err)
        })
        return
      }
      
      setUser(u)

      // ตั้งค่า default values ก่อน
      setCredits(100)
      
      // แสดง app ทันที (ไม่รอ profile)
      setLoading(false)
      console.log("✅ App visible - loading profile in background")
      
      // โหลด profile แบบ background (ไม่ block UI)
      try {
        let profile = null
        try {
          // ใช้ timeout เพื่อไม่ให้ค้างนาน
          profile = await Promise.race([
            getUserProfile(u.uid),
            new Promise((resolve) => setTimeout(() => resolve(null), 3000))
          ])
          console.log("📄 Profile:", profile ? "found" : "not found")
        } catch (getError) {
          console.warn("⚠️ Could not get profile (may be offline):", getError.message)
          profile = null
        }
        
        if (!profile) {
          console.log("🆕 No profile found - checking if profile exists before creating...")
          
          // ลอง get อีกครั้งเพื่อยืนยันว่าจริงๆ ไม่มี profile (ไม่ใช่ internal assertion error)
          // รอสักครู่เพื่อให้ Firestore sync
          setTimeout(async () => {
            try {
              const retryProfile = await Promise.race([
                getUserProfile(u.uid),
                new Promise((resolve) => setTimeout(() => resolve(null), 3000))
              ])
              
              if (retryProfile) {
                console.log("✅ Profile found on retry - using existing profile")
                setCredits(retryProfile.credits || 100)
                if (retryProfile.columnConfig?.length) {
                  setColumnConfig(retryProfile.columnConfig)
                }
              } else {
                console.log("🆕 Creating new profile in background...")
                // สร้าง profile แบบ background (ไม่ block)
                createUserProfile(u).then(() => {
                  console.log("✅ Profile created in background")
                  // ลอง get อีกครั้ง
                  getUserProfile(u.uid).then((newProfile) => {
                    if (newProfile) {
                      setCredits(newProfile.credits || 100)
                      if (newProfile.columnConfig?.length) {
                        setColumnConfig(newProfile.columnConfig)
                      }
                      console.log("✅ Profile loaded from Firestore")
                    }
                  }).catch(() => {
                    // ไม่เป็นไร - ยังใช้ default values
                  })
                }).catch((createError) => {
                  console.error("❌ Error creating profile:", createError)
                  // ไม่เป็นไร - ใช้ default values
                })
              }
            } catch (retryError) {
              console.warn("⚠️ Retry failed, will create new profile:", retryError.message)
              // ถ้า retry ล้มเหลว ให้สร้างใหม่
              createUserProfile(u).catch((createError) => {
                console.error("❌ Error creating profile:", createError)
              })
            }
          }, 1000) // รอ 1 วินาทีเพื่อให้ Firestore sync
        } else {
          // ถ้าได้ profile แล้ว ให้อัปเดต state
          console.log("✅ Profile loaded successfully, credits:", profile.credits)
          setCredits(profile.credits || 100)
          if (profile.columnConfig?.length) {
            setColumnConfig(profile.columnConfig)
          }
        }
      } catch (error) {
        console.error("❌ Error loading profile:", error)
        // ไม่เป็นไร - ใช้ default values
      }
    })

    return () => unsubscribe()
  }, [])

  // อัปเดตยอดเครดิตจาก Firebase ทุก 5 วินาที
  useEffect(() => {
    if (!user) {
      return
    }

    const updateCredits = async () => {
      try {
        const profile = await Promise.race([
          getUserProfile(user.uid),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000))
        ])
        
        if (profile && profile.credits !== undefined) {
          setCredits(profile.credits)
          console.log(`✅ [Credits Update] Updated from Firebase: ${profile.credits} pages`)
        }
      } catch (error) {
        console.warn("⚠️ Could not update credits from Firebase:", error.message)
        // ไม่เป็นไร - ใช้ค่าปัจจุบันต่อไป
      }
    }

    // อัปเดตทันทีครั้งแรก
    updateCredits()

    // อัปเดตทุก 5 วินาที
    const interval = setInterval(() => {
      updateCredits()
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [user])

  // ⏳ Loading
  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>
  }

  // 🔑 ยังไม่ login → หน้า Login V2
  if (!user) {
    return <LoginV2 />
  }

  // 📄 Page router - V2 ONLY
  let content = null

  // Default to Home page with logo
  if (page === "home" || !page) {
    content = (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%)",
        }}
      >
        <Box
          component="img"
          src="/Logo.png"
          alt="GOLDEN SOFT Logo"
          onError={(e) => {
            console.error("❌ Logo failed to load:", e.target.src)
            if (e.target.src.includes("Logo.png")) {
              e.target.src = "/logo.png"
            } else if (e.target.src.includes("logo.png")) {
              e.target.src = "/Logo.PNG"
            }
          }}
          sx={{
            height: { xs: 300, sm: 400, md: 500 },
            width: "auto",
            maxWidth: { xs: "80%", sm: "70%", md: "60%" },
            objectFit: "contain",
          }}
        />
      </Box>
    )
  }

  if (page === "template-settings") {
    content = (
      <DocumentTemplateSettings
        credits={credits}
        onConsume={(used) => setCredits((c) => c - used)}
      />
    )
  }

  if (page === "settings") {
    content = (
      <Settings
        onDone={() => setPage("template-settings")}
      />
    )
  }

  if (page === "scan") {
    content = (
      <Scan
        credits={credits}
        files={scanFiles}
        setFiles={setScanFiles}
        onNext={() => setPage("template-settings")}
        columnConfig={columnConfig}
        onConsume={(used, newCreditsFromFirebase) => {
          // If newCreditsFromFirebase is provided, use it directly (from Firebase)
          // Otherwise, deduct from current credits (fallback)
          if (newCreditsFromFirebase !== undefined) {
            setCredits(newCreditsFromFirebase)
          } else {
            setCredits((c) => c - used)
          }
        }}
      />
    )
  }

  // ✅ Login แล้ว → เข้า Layout V2
  return (
    <AppLayoutV2
      page={page}
      onNavigate={setPage}
      credits={credits}
      onLogout={async () => {
        await signOut(auth)
        setUser(null)
      }}
    >
      {content}
    </AppLayoutV2>
  )
}
