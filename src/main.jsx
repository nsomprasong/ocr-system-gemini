import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { ThemeProvider } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import theme from "./theme"

ReactDOM.createRoot(document.getElementById("root")).render(
  // Temporarily disabled StrictMode to prevent Firebase Firestore internal assertion errors
  // caused by useEffect running twice in development mode
  // <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  // </React.StrictMode>
)
