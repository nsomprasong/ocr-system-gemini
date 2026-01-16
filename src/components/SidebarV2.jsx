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
import SettingsIcon from "@mui/icons-material/Settings"
import DescriptionIcon from "@mui/icons-material/Description"
import LogoutIcon from "@mui/icons-material/Logout"
import { auth } from "../firebase"

/**
 * Sidebar V2 - Modern sidebar for v2 UI
 */
export default function SidebarV2({ page, onNavigate, credits, onLogout }) {
  const user = auth.currentUser

  const menu = [
    { key: "template-settings", label: "Document Template Settings", icon: <DescriptionIcon /> },
    { key: "settings", label: "Settings", icon: <SettingsIcon /> },
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
      }}
    >
      {/* Header */}
      <Box sx={{ p: 1, pt: .5, borderBottom: "1px solid #334155", display: "flex", flexDirection: "column" }}>
        <Box
          component="img"
          src="/imageOcrSystem.png"
          alt="OCR System v2"
          sx={{
            width: "130%",
            maxWidth: "200px",
            height: "auto",
            mb: 0, // No margin bottom
            objectFit: "contain",
            alignSelf: "flex-start", // Align to top
          }}
        />
        {user && (
          <Box sx={{ mt: 0.25 }}>
            <Typography
              fontSize={12}
              sx={{ opacity: 0.8, wordBreak: "break-all", color: "#94a3b8" }}
            >
              {user.email}
            </Typography>
            <Typography fontSize={12} sx={{ mt: 0.5, opacity: 0.8, color: "#94a3b8" }}>
              Credits: {credits || 0} pages
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: "#334155" }} />

      {/* Menu */}
      <List sx={{ flex: 1, p: 1.5 }}>
        {menu.map((m) => (
          <ListItem key={m.key} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => onNavigate(m.key)}
              selected={page === m.key}
              sx={{
                borderRadius: 2,
                "&.Mui-selected": {
                  bgcolor: "#3b82f6",
                  "&:hover": {
                    bgcolor: "#2563eb",
                  },
                },
                "&:hover": {
                  bgcolor: "#334155",
                },
              }}
            >
              <ListItemIcon sx={{ color: "#fff", minWidth: 40 }}>
                {m.icon}
              </ListItemIcon>
              <ListItemText primary={m.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ borderColor: "#334155" }} />

      {/* Logout */}
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
          Logout
        </Button>
      </Box>
    </Box>
  )
}
