import {
  Container,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Divider,
  Link,
  Box,
  Alert,
  CircularProgress,
} from "@mui/material"
import { useState, useEffect, useRef } from "react"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth"
import { auth } from "../firebase"
import { createUserProfile } from "../services/user.service"

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

/**
 * Login V2 - Uses v1 login logic exactly, with v2 UI design
 */
export default function LoginV2() {
  const [mode, setMode] = useState("login")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const timeoutRef = useRef(null)

  const resetMsg = () => {
    setError("")
    setSuccess("")
    setLoading(false)
    setNeedsVerification(false)
  }

  // ส่งอีเมลยืนยันอีกครั้ง
  const handleResendVerification = async () => {
    if (!email || !isValidEmail(email)) {
      setError("กรุณากรอก Email ที่ถูกต้อง")
      return
    }

    setResendLoading(true)
    setError("")
    setSuccess("")

    try {
      // ใช้ currentUser ถ้ามี (หลังจาก login แล้ว)
      let user = auth.currentUser
      
      // ถ้ายังไม่มี currentUser ให้ login ก่อน
      if (!user) {
        const result = await signInWithEmailAndPassword(auth, email, password)
        user = result.user
      }

      // ตรวจสอบว่ายืนยันแล้วหรือยัง
      if (user.emailVerified) {
        setSuccess("อีเมลของคุณได้รับการยืนยันแล้ว คุณสามารถเข้าสู่ระบบได้")
        setNeedsVerification(false)
        setResendLoading(false)
        // Reload หลังจาก 1 วินาที
        setTimeout(() => {
          window.location.reload()
        }, 1000)
        return
      }

      await sendEmailVerification(user)
      setSuccess("ส่งอีเมลยืนยันไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบอีเมล")
      setResendLoading(false)
    } catch (err) {
      console.error("❌ Resend verification error:", err)
      setResendLoading(false)
      if (err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        setError("Email หรือ Password ไม่ถูกต้อง")
      } else if (err.code === "auth/too-many-requests") {
        setError("ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง")
      } else {
        setError("ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง")
      }
    }
  }

  // Reset loading เมื่อเปลี่ยน mode
  const handleModeChange = (newMode) => {
    // Clear timeout ถ้ามี
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    resetMsg()
    setMode(newMode)
  }

  // Cleanup timeout เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      // Reset loading เมื่อ component unmount (เช่น เมื่อ login สำเร็จ)
      setLoading(false)
    }
  }, [])

  // Debug: ตรวจสอบว่า header bar render หรือไม่
  useEffect(() => {
    console.log("🔍 LoginV2 component mounted")
    const header = document.querySelector('header')
    if (header) {
      console.log("✅ Header bar found:", header)
    } else {
      console.warn("⚠️ Header bar not found")
    }
  }, [])

  // ===== LOGIN =====
  const handleLogin = async () => {
    resetMsg()
    if (!email || !isValidEmail(email))
      return setError("Email ไม่ถูกต้อง")
    if (!password || password.length < 6)
      return setError("Password ต้องอย่างน้อย 6 ตัว")

    setLoading(true)
    try {
      console.log("🔐 Attempting login...")
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log("✅ Login successful:", result.user.email)
      console.log("👤 Current user:", auth.currentUser?.email)
      console.log("📧 Email verified:", result.user.emailVerified)
      
      // ตรวจสอบ email verification
      if (!result.user.emailVerified) {
        setLoading(false)
        setNeedsVerification(true)
        setError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ ตรวจสอบอีเมลของคุณและคลิกลิงก์ยืนยัน")
        return
      }
      
      // ถ้ายืนยันแล้ว ให้ reset state
      setNeedsVerification(false)
      
      // Reset loading ทันที
      setLoading(false)
      
      // Reload หน้าทันทีเพื่อให้ App.jsx ตรวจสอบ auth state ใหม่
      console.log("🔄 Reloading page to update auth state...")
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (err) {
      console.error("❌ Login error:", err)
      setError("Email หรือ Password ไม่ถูกต้อง")
      setLoading(false)
    }
  }

  // ===== REGISTER =====
  const handleRegister = async () => {
    resetMsg()
    if (!email || !isValidEmail(email)) {
      setError("Email ไม่ถูกต้อง")
      return
    }
    if (!password || password.length < 6) {
      setError("Password ต้องอย่างน้อย 6 ตัว")
      return
    }
    if (password !== confirm) {
      setError("รหัสผ่านไม่ตรงกัน")
      return
    }

    setLoading(true)
    try {
      console.log("🧾 Attempting to create user...")
      const res = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      )
      const user = res.user

      console.log("✅ User created successfully:", {
        uid: user?.uid,
        email: user?.email,
      })

      // ส่ง email verification
      try {
        await sendEmailVerification(user)
        console.log("✅ Email verification sent")
        setSuccess("สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชีของคุณ")
      } catch (verifyError) {
        console.error("❌ Failed to send email verification:", verifyError)
        // ไม่เป็นไร - ยังให้สมัครสำเร็จ แต่แจ้งเตือน
        setSuccess("สมัครสมาชิกสำเร็จ! แต่ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง")
      }
      
      setLoading(false)
      
      // 🔥 สร้าง Firestore profile แบบ async (ไม่ block UI)
      // Profile จะถูกสร้างใน App.jsx เมื่อ login ครั้งแรกด้วย แต่สร้างไว้ก่อนก็ดี
      createUserProfile({
        ...res.user,
        activated: false,
      }).then(() => {
        console.log("✅ Profile created successfully")
      }).catch((profileError) => {
        console.error("❌ Profile creation error:", profileError)
        // ไม่เป็นไร - profile จะถูกสร้างใน App.jsx เมื่อ login ครั้งแรก
      })
      
      // Clear timeout เก่าก่อน (ถ้ามี)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      // เปลี่ยนไปหน้า login หลังจาก 2 วินาที
      timeoutRef.current = setTimeout(() => {
        // Reset ทุกอย่างก่อนเปลี่ยนหน้า
        setLoading(false)
        setSuccess("")
        setEmail("")
        setPassword("")
        setConfirm("")
        // เปลี่ยนหน้าเป็นอันสุดท้าย
        setMode("login")
        timeoutRef.current = null
      }, 2000)

    } catch (err) {
      console.error("❌ Register error:", err)
      console.error("Error Code:", err.code)
      console.error("Error Message:", err.message)
      setLoading(false)
      // แปลง error message เป็นภาษาไทย
      let errorMsg = "Email นี้ถูกใช้งานแล้ว"
      if (err.code === "auth/email-already-in-use") {
        errorMsg = "Email นี้ถูกใช้งานแล้ว"
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "รูปแบบ Email ไม่ถูกต้อง"
      } else if (err.code === "auth/weak-password") {
        errorMsg = "รหัสผ่านอ่อนแอเกินไป"
      } else if (err.message) {
        errorMsg = err.message
      }
      setError(errorMsg)
    }
  }

  // ===== FORGOT =====
  const handleForgot = async () => {
    resetMsg()
    if (!email || !isValidEmail(email)) {
      setError("Email ไม่ถูกต้อง")
      return
    }

    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setLoading(false)
      setSuccess("ส่งลิงก์เปลี่ยนรหัสผ่านไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบอีเมล")
      setTimeout(() => {
        handleModeChange("login")
        setSuccess("")
        setEmail("")
      }, 3000)
    } catch (err) {
      console.error("Forgot password error:", err)
      setLoading(false)
      let errorMsg = "ไม่พบ Email นี้ในระบบ"
      if (err.code === "auth/user-not-found") {
        errorMsg = "ไม่พบ Email นี้ในระบบ"
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "รูปแบบ Email ไม่ถูกต้อง"
      } else if (err.message) {
        errorMsg = err.message
      }
      setError(errorMsg)
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #2d2d2d 0%, #3d3d3d 50%, #2f2f2f 100%)",
        position: "relative",
        overflow: "visible",
        p: 3,
        pt: { xs: 8, sm: 10, md: 14 },
      }}
    >
      {/* Header bar - ภาษาไทยแบบหรู */}
      <Box
        component="header"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          width: "100%",
          minHeight: { xs: 60, sm: 70, md: 80 },
          background: "linear-gradient(135deg, #d3d3d3 0%, #c0c0c0 20%, #4d4d4d 50%, #3d3d3d 100%)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.3)",
          borderBottomLeftRadius: { xs: 0, sm: 16, md: 20 },
          borderBottomRightRadius: { xs: 0, sm: 16, md: 20 },
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          zIndex: 9999,
          py: { xs: 1, sm: 1.5, md: 2 },
          px: { xs: 2, sm: 3, md: 4 },
          display: "flex",
          alignItems: "center",
          visibility: "visible",
          opacity: 1,
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: "1200px",
            margin: "0 auto",
            px: { xs: 0.5, sm: 1, md: 2 },
            pl: { xs: 1, sm: 1.5, md: 2 },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              width: "100%",
            }}
          >
            {/* Logo */}
            <Box
              component="img"
              src="/Logo.png"
              alt="GOLDEN SOFT Logo"
              onError={(e) => {
                console.error("❌ Logo failed to load:", e.target.src)
                // ลอง path อื่น
                if (e.target.src.includes("Logo.png")) {
                  e.target.src = "/logo.png"
                } else if (e.target.src.includes("logo.png")) {
                  e.target.src = "/Logo.PNG"
                }
              }}
              onLoad={(e) => {
                console.log("✅ Logo loaded successfully")
                console.log("Logo dimensions:", e.target.naturalWidth, "x", e.target.naturalHeight)
              }}
              sx={{
                height: { xs: 65, sm: 85, md: 110 },
                width: "auto",
                maxWidth: { xs: 200, sm: 300, md: 380 },
                objectFit: "contain",
                flexShrink: 0,
                display: "block",
                backgroundColor: "transparent",
                visibility: "visible",
                opacity: 1,
                margin: 0,
                marginTop: 0,
                marginBottom: 0,
                marginLeft: { xs: -0.5, sm: -0.75, md: -1 },
                padding: 0,
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: 0,
                paddingRight: 0,
              }}
            />
            
            {/* Text Content */}
            <Box sx={{ flex: 1, minWidth: 0, marginTop: { xs: -1, sm: -1.25, md: -1.5 } }}>
              <Typography
                sx={{
                  fontSize: { xs: "22px", sm: "28px", md: "36px" },
                  fontWeight: 800,
                  color: "#FFD700",
                  lineHeight: 1.2,
                  mb: { xs: 0.25, sm: 0.5 },
                  letterSpacing: "0.03em",
                  textShadow: "0 2px 10px rgba(0,0,0,0.5), 0 0 20px rgba(255, 215, 0, 0.3)",
                }}
              >
                ระบบ OCR อัจฉริยะ
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: "10px", sm: "12px", md: "14px" },
                  fontWeight: 500,
                  color: "rgba(255, 215, 0, 0.9)",
                  lineHeight: 1.4,
                  letterSpacing: "0.02em",
                  textShadow: "0 1px 5px rgba(0,0,0,0.5), 0 0 10px rgba(255, 215, 0, 0.2)",
                }}
              >
                แปลงเอกสารเป็นข้อมูลดิจิทัล ด้วยเทคโนโลยี AI ที่ทันสมัย
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Container 
        maxWidth="sm"
        sx={{ position: "relative", zIndex: 2 }}
      >
        <Card
          sx={{
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            borderRadius: 3,
            background: "linear-gradient(135deg, #3d3d3d 0%, #4d4d4d 50%, #c0c0c0 80%, #d3d3d3 100%)",
            backdropFilter: "blur(10px)",
            position: "relative",
            zIndex: 2,
            border: "1px solid rgba(255, 215, 0, 0.2)",
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" fontWeight={700} sx={{ color: "#FFD700", mb: 2.5, mt: -1, textShadow: "0 2px 4px rgba(255, 255, 255, 0.5), 0 1px 2px rgba(255, 255, 255, 0.3)" }}>
              ระบบ OCR อัจฉริยะ
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(255, 215, 0, 0.8)", mb: 3, textShadow: "0 1px 3px rgba(255, 255, 255, 0.5), 0 1px 1px rgba(255, 255, 255, 0.3)" }}>
              {mode === "login" && "เข้าสู่ระบบ"}
              {mode === "register" && "สมัครสมาชิก"}
              {mode === "forgot" && "ลืมรหัสผ่าน"}
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            {/* LOGIN */}
            {mode === "login" && (
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  size="small"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFD700",
                      "& fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.5)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFD700",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255, 215, 0, 0.7)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "#FFD700",
                    },
                  }}
                />
                <TextField
                  label="Password"
                  type="password"
                  size="small"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading && !resendLoading) {
                      handleLogin()
                    }
                  }}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFD700",
                      "& fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.5)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFD700",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255, 215, 0, 0.7)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "#FFD700",
                    },
                  }}
                />
                <Button 
                  variant="contained" 
                  onClick={handleLogin}
                  disabled={loading || resendLoading}
                  fullWidth
                  size="large"
                  sx={{
                    py: 1.5,
                    background: "linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #DAA520 100%)",
                    textTransform: "none",
                    boxShadow: "0 4px 15px rgba(255, 215, 0, 0.4)",
                    color: "#1a1a1a",
                    fontWeight: 700,
                    "&:hover": {
                      background: "linear-gradient(135deg, #FFC700 0%, #FF9500 50%, #C89520 100%)",
                      boxShadow: "0 6px 20px rgba(255, 215, 0, 0.5)",
                    },
                  }}
                  startIcon={loading && <CircularProgress size={16} color="inherit" />}
                >
                  {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                </Button>

                {needsVerification && (
                  <Box>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      <Typography variant="body2" fontWeight={600} mb={0.5}>
                        ยังไม่ได้ยืนยันอีเมล
                      </Typography>
                      <Typography variant="body2">
                        กรุณาตรวจสอบอีเมลของคุณและคลิกลิงก์ยืนยัน หากไม่พบอีเมล สามารถส่งอีกครั้งได้
                      </Typography>
                    </Alert>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={handleResendVerification}
                      disabled={resendLoading || loading}
                      startIcon={resendLoading && <CircularProgress size={16} color="inherit" />}
                    >
                      {resendLoading ? "กำลังส่ง..." : "ส่งอีเมลยืนยันอีกครั้ง"}
                    </Button>
                  </Box>
                )}

                <Divider />

                <Box display="flex" justifyContent="space-between">
                  <Link 
                    component="button" 
                    onClick={() => handleModeChange("register")}
                    sx={{ color: "#FFD700", textDecoration: "none", cursor: "pointer", fontWeight: 500, "&:hover": { color: "#FFC700" } }}
                  >
                    สมัครสมาชิก
                  </Link>
                  <Link 
                    component="button" 
                    onClick={() => handleModeChange("forgot")}
                    sx={{ 
                      color: "#FFD700", 
                      textDecoration: "none", 
                      cursor: "pointer", 
                      fontWeight: 500,
                      textShadow: "0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3)",
                      "&:hover": { 
                        color: "#FFC700",
                        textShadow: "0 2px 6px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.4)",
                      } 
                    }}
                  >
                    ลืมรหัสผ่าน
                  </Link>
                </Box>
              </Stack>
            )}

            {/* REGISTER */}
            {mode === "register" && (
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  size="small"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      e.target.blur() // Move focus to next field
                    }
                  }}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFD700",
                      "& fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.5)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFD700",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255, 215, 0, 0.7)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "#FFD700",
                    },
                  }}
                />
                <TextField
                  label="Password"
                  type="password"
                  size="small"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      e.target.blur() // Move focus to next field
                    }
                  }}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFD700",
                      "& fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.5)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFD700",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255, 215, 0, 0.7)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "#FFD700",
                    },
                  }}
                />
                <TextField
                  label="ยืนยัน Password"
                  type="password"
                  size="small"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      handleRegister()
                    }
                  }}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFD700",
                      "& fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.5)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFD700",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255, 215, 0, 0.7)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "#FFD700",
                    },
                  }}
                />
                <Button 
                  variant="contained" 
                  onClick={handleRegister}
                  disabled={loading}
                  fullWidth
                  size="large"
                  sx={{
                    py: 1.5,
                    background: "linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #DAA520 100%)",
                    textTransform: "none",
                    boxShadow: "0 4px 15px rgba(255, 215, 0, 0.4)",
                    color: "#1a1a1a",
                    fontWeight: 700,
                    "&:hover": {
                      background: "linear-gradient(135deg, #FFC700 0%, #FF9500 50%, #C89520 100%)",
                      boxShadow: "0 6px 20px rgba(255, 215, 0, 0.5)",
                    },
                  }}
                  startIcon={loading && <CircularProgress size={16} color="inherit" />}
                >
                  {loading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
                </Button>
                <Divider />
                <Link 
                  component="button" 
                  onClick={() => handleModeChange("login")}
                  sx={{ color: "#FFD700", textDecoration: "none", cursor: "pointer", textAlign: "center", fontWeight: 500, "&:hover": { color: "#FFC700" } }}
                >
                  กลับไปหน้า Login
                </Link>
              </Stack>
            )}

            {/* FORGOT */}
            {mode === "forgot" && (
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  size="small"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      handleForgot()
                    }
                  }}
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFD700",
                      "& fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(255, 215, 0, 0.5)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#FFD700",
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "rgba(255, 215, 0, 0.7)",
                    },
                    "& .MuiInputLabel-root.Mui-focused": {
                      color: "#FFD700",
                    },
                  }}
                />
                <Button 
                  variant="contained" 
                  onClick={handleForgot}
                  disabled={loading}
                  fullWidth
                  size="large"
                  sx={{
                    py: 1.5,
                    background: "linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #DAA520 100%)",
                    textTransform: "none",
                    boxShadow: "0 4px 15px rgba(255, 215, 0, 0.4)",
                    color: "#1a1a1a",
                    fontWeight: 700,
                    "&:hover": {
                      background: "linear-gradient(135deg, #FFC700 0%, #FF9500 50%, #C89520 100%)",
                      boxShadow: "0 6px 20px rgba(255, 215, 0, 0.5)",
                    },
                  }}
                  startIcon={loading && <CircularProgress size={16} color="inherit" />}
                >
                  {loading ? "กำลังส่ง..." : "ส่งลิงก์เปลี่ยนรหัสผ่าน"}
                </Button>
                <Divider />
                <Link 
                  component="button" 
                  onClick={() => handleModeChange("login")}
                  sx={{ color: "#FFD700", textDecoration: "none", cursor: "pointer", textAlign: "center", fontWeight: 500, "&:hover": { color: "#FFC700" } }}
                >
                  กลับไปหน้า Login
                </Link>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}
