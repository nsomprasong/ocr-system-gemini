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

export default function Login() {
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
  }, []) // Empty dependency array - ไม่มี dependencies


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
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h5" fontWeight={600} mb={1}>
            OCR SYSTEM
          </Typography>
          <Typography color="text.secondary" mb={2}>
            {mode === "login" && "เข้าสู่ระบบ"}
            {mode === "register" && "สมัครสมาชิก"}
            {mode === "forgot" && "ลืมรหัสผ่าน"}
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}

          {/* LOGIN */}
          {mode === "login" && (
            <Stack spacing={2} mt={2}>
              <TextField
                label="Email"
                size="small"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              />
              <Button 
                variant="contained" 
                onClick={handleLogin}
                disabled={loading || resendLoading}
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
                <Link component="button" onClick={() => handleModeChange("register")}>
                  สมัครสมาชิก
                </Link>
                <Link component="button" onClick={() => handleModeChange("forgot")}>
                  ลืมรหัสผ่าน
                </Link>
              </Box>
            </Stack>
          )}

          {/* REGISTER */}
          {mode === "register" && (
            <Stack spacing={2} mt={2}>
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
              />
              <Button 
                variant="contained" 
                onClick={handleRegister}
                disabled={loading}
                startIcon={loading && <CircularProgress size={16} color="inherit" />}
              >
                {loading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
              </Button>
              <Divider />
              <Link component="button" onClick={() => handleModeChange("login")}>
                กลับไปหน้า Login
              </Link>
            </Stack>
          )}

          {/* FORGOT */}
          {mode === "forgot" && (
            <Stack spacing={2} mt={2}>
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
              />
              <Button 
                variant="contained" 
                onClick={handleForgot}
                disabled={loading}
                startIcon={loading && <CircularProgress size={16} color="inherit" />}
              >
                {loading ? "กำลังส่ง..." : "ส่งลิงก์เปลี่ยนรหัสผ่าน"}
              </Button>
              <Divider />
              <Link component="button" onClick={() => handleModeChange("login")}>
                กลับไปหน้า Login
              </Link>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}
