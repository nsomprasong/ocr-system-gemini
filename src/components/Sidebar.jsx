// src/components/Sidebar.jsx
import { useState, useEffect } from "react"
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Button,
} from "@mui/material"
import HomeIcon from "@mui/icons-material/Home"
import SettingsIcon from "@mui/icons-material/Settings"
import ScannerIcon from "@mui/icons-material/Scanner"
import LogoutIcon from "@mui/icons-material/Logout"
import { auth } from "../firebase"
import { getUserProfile } from "../services/user.service"

export default function Sidebar({ page, onNavigate, onLogout, credits: creditsFromProps }) {
  const user = auth.currentUser
  const [credits, setCredits] = useState(creditsFromProps || 0)
  const [loadingCredits, setLoadingCredits] = useState(false)

  // Update credits when props change (from parent App.jsx)
  useEffect(() => {
    if (creditsFromProps !== undefined) {
      setCredits(creditsFromProps)
    }
  }, [creditsFromProps])

  // โหลด credits จาก Firebase เป็น fallback (ถ้าไม่มี props)
  useEffect(() => {
    let isMounted = true
    
    if (!user) {
      setCredits(0)
      setLoadingCredits(false)
      return
    }

    // ถ้ามี credits จาก props แล้ว ไม่ต้องโหลดจาก Firebase
    if (creditsFromProps !== undefined) {
      return
    }

    const loadCredits = async () => {
      try {
        setLoadingCredits(true)
        // getUserProfile มี timeout อยู่แล้ว ไม่ต้องใช้ Promise.race อีก
        const profile = await getUserProfile(user.uid)
        
        if (isMounted) {
          if (profile && profile.credits !== undefined) {
            setCredits(profile.credits)
          } else {
            setCredits(0)
          }
          setLoadingCredits(false)
        }
      } catch (error) {
        // getUserProfile จะ return null แทน throw สำหรับ internal assertion errors
        // แต่ถ้ายังมี error อื่นๆ ให้ handle ไว้
        console.error("Error loading credits:", error)
        if (isMounted) {
          setCredits(0)
          setLoadingCredits(false)
        }
      }
    }

    loadCredits()

    // Refresh credits ทุก 10 วินาที (ถ้าไม่มี props)
    const interval = setInterval(() => {
      if (isMounted && user && creditsFromProps === undefined) {
        loadCredits()
      }
    }, 10000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [user, creditsFromProps])

  const menu = [
    { key: "home", label: "หน้าแรก", icon: <HomeIcon /> },
    { key: "scan", label: "สแกนเอกสาร", icon: <ScannerIcon /> },
    { key: "settings", label: "ตั้งค่า", icon: <SettingsIcon /> },
  ]

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 240,
        height: "100vh",
        bgcolor: "#1e293b",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #334155",
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <Box sx={{ p: 1, pt: 0.5, borderBottom: "1px solid #334155", display: "flex", flexDirection: "column" }}>
        <Box
          component="img"
          src="/imageOcrSystem.png"
          alt="OCR System v2"
          sx={{
            width: "100%",
            maxWidth: "200px",
            height: "auto",
            mb: 0, // No margin bottom
            objectFit: "contain",
            alignSelf: "flex-start", // Align to top
          }}
        />
        {user && (
          <Box sx={{ mt: -3 }}>
            <Typography
              fontSize={12}
              sx={{ opacity: 0.8, wordBreak: "break-all", color: "#94a3b8" }}
            >
              {user.email}
            </Typography>
            <Typography fontSize={12} sx={{ mt: 0.5, opacity: 0.8, color: "#94a3b8" }}>
              {loadingCredits ? "กำลังโหลด..." : `Credits: ${credits || 0} pages`}
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: "#334155" }} />

      {/* Menu */}
      <List sx={{ flex: 1, p: 1.5 }}>
        {menu.map((m, index) => (
          <Box key={m.key}>
            <ListItem disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => onNavigate(m.key)}
                selected={page === m.key}
                sx={{
                  borderRadius: 2,
                  transition: "all 0.2s ease",
                  "&.Mui-selected": {
                    bgcolor: "#3b82f6",
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    "&:hover": {
                      bgcolor: "#2563eb",
                      background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    },
                  },
                  "&:hover": {
                    bgcolor: "#334155",
                    transform: "translateX(4px)",
                  },
                }}
              >
                <ListItemIcon sx={{ color: "#fff", minWidth: 40 }}>
                  {m.icon}
                </ListItemIcon>
                <ListItemText primary={m.label} />
              </ListItemButton>
            </ListItem>
            {index < menu.length - 1 && (
              <Divider sx={{ borderColor: "#334155", my: 0.5 }} />
            )}
          </Box>
        ))}
      </List>

      <Divider sx={{ borderColor: "#334155" }} />

      {/* Logout */}
      {onLogout && (
        <Box sx={{ p: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<LogoutIcon />}
            onClick={onLogout}
            sx={{
              color: "#fca5a5",
              borderColor: "#fca5a5",
              "&:hover": {
                borderColor: "#f87171",
                bgcolor: "rgba(252, 165, 165, 0.1)",
              },
            }}
          >
            ออกจากระบบ
          </Button>
        </Box>
      )}
    </Box>
  )
}
