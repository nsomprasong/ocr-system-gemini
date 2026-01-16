import { Box, CssBaseline } from "@mui/material"
import Sidebar from "./Sidebar"

/**
 * App Layout V2 - Modern v2 layout with sidebar
 */
export default function AppLayoutV2({ children, page, onNavigate, onLogout, credits }) {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f8fafc" }}>
      <CssBaseline />
      <Sidebar page={page} onNavigate={onNavigate} onLogout={onLogout} credits={credits} />
      <Box sx={{ flexGrow: 1, ml: "240px" }}>
        {children}
      </Box>
    </Box>
  )
}
