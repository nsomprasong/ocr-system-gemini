// src/pages/Settings.jsx
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
} from "@mui/material"
import { useState, useEffect } from "react"
import { onAuthStateChanged } from "firebase/auth"
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
} from "firebase/auth"
import { auth } from "../firebase"
import { getUserProfile } from "../services/user.service"

export default function Settings({ onDone }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState("")
  const [isEmailVerified, setIsEmailVerified] = useState(false)

  // Track email verification status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsEmailVerified(user?.emailVerified || false)
    })
    return () => unsubscribe()
  }, [])

  const handleChangePassword = async () => {
    setError("")
    setSuccess("")

    if (newPassword.length < 6)
      return setError("รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัว")

    if (newPassword !== confirmPassword)
      return setError("รหัสผ่านใหม่ไม่ตรงกัน")

    try {
      const user = auth.currentUser
      if (!user) throw new Error("no-user")

      // re-authenticate
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      )

      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)

      setSuccess("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว")

      setTimeout(() => {
        onDone() // 👈 กลับหน้า Scan
      }, 1000)
    } catch (e) {
      setError("รหัสผ่านปัจจุบันไม่ถูกต้อง")
    }
  }

  const handleResendVerification = async () => {
    setVerificationMessage("")
    setVerificationLoading(true)
    
    try {
      const user = auth.currentUser
      if (!user) {
        setVerificationMessage("ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่")
        setVerificationLoading(false)
        return
      }

      if (user.emailVerified) {
        setVerificationMessage("อีเมลของคุณได้รับการยืนยันแล้ว")
        setVerificationLoading(false)
        return
      }

      await sendEmailVerification(user)
      setVerificationMessage("ส่งอีเมลยืนยันไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบอีเมล")
      setVerificationLoading(false)
    } catch (err) {
      console.error("❌ Failed to send verification email:", err)
      setVerificationMessage("ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง")
      setVerificationLoading(false)
    }
  }

  const user = auth.currentUser

  return (
    <Box maxWidth={480}>
      <Typography variant="h5" fontWeight={600} mb={2}>
        ตั้งค่าระบบ
      </Typography>

      {/* Email Verification Section */}
      <Card variant="outlined" sx={{ boxShadow: "none", mb: 2 }}>
        <CardContent>
          <Typography fontWeight={600} mb={1}>
            ยืนยันอีเมล
          </Typography>
          
          <Stack spacing={2}>
            {!isEmailVerified && (
              <Alert severity="warning">
                อีเมลของคุณยังไม่ได้รับการยืนยัน กรุณาตรวจสอบอีเมลและคลิกลิงก์ยืนยัน
              </Alert>
            )}
            
            {isEmailVerified && (
              <Alert severity="success">
                อีเมลของคุณได้รับการยืนยันแล้ว
              </Alert>
            )}

            <Button
              variant="outlined"
              onClick={handleResendVerification}
              disabled={verificationLoading || isEmailVerified}
              startIcon={verificationLoading && <CircularProgress size={16} color="inherit" />}
            >
              {verificationLoading ? "กำลังส่ง..." : "ส่งอีเมลยืนยันอีกครั้ง"}
            </Button>

            {verificationMessage && (
              <Alert severity={isEmailVerified ? "success" : "info"}>
                {verificationMessage}
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ boxShadow: "none" }}>
        <CardContent>
          <Typography fontWeight={600} mb={1}>
            เปลี่ยนรหัสผ่าน
          </Typography>

          <Stack spacing={2}>
            <TextField
              label="รหัสผ่านปัจจุบัน"
              type="password"
              size="small"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <TextField
              label="รหัสผ่านใหม่"
              type="password"
              size="small"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <TextField
              label="ยืนยันรหัสผ่านใหม่"
              type="password"
              size="small"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button
              variant="contained"
              onClick={handleChangePassword}
            >
              บันทึกรหัสผ่านใหม่
            </Button>

            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
