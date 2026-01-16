// src/components/AppLayout.jsx
import {
  Box,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Divider,
  Menu,
  MenuItem,
} from "@mui/material"
import AccountCircleIcon from "@mui/icons-material/AccountCircle"
import Sidebar from "./Sidebar"
import { useState } from "react"

export default function AppLayout({ children, page, onNavigate, onLogout,credits }) {
  const [anchorEl, setAnchorEl] = useState(null)
  const open = Boolean(anchorEl)

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f4f6f8" }}>
      <CssBaseline />

      {/* Sidebar */}
      <Sidebar page={page} onNavigate={onNavigate} credits={credits} />

      {/* Main */}
      <Box sx={{ flexGrow: 1 }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{ bgcolor: "#ffffff", color: "#000" }}
        >
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Typography variant="h6">
              ระบบ OCR เอกสาร
            </Typography>

            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
              <AccountCircleIcon />
            </IconButton>

            <Menu
              anchorEl={anchorEl}
              open={open}
              onClose={() => setAnchorEl(null)}
            >
              <MenuItem
                onClick={() => {
                  setAnchorEl(null)
                  onNavigate("settings")
                }}
              >
                ตั้งค่าระบบ
              </MenuItem>

              <Divider />

              <MenuItem
                onClick={() => {
                  setAnchorEl(null)
                  onLogout()   // 👈 Firebase signOut ถูกเรียกจาก App.jsx
                }}
              >
                ออกจากระบบ
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Divider />

        <Box sx={{ p: 4 }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
