import { createTheme } from "@mui/material/styles"

const theme = createTheme({
  typography: {
    fontFamily: "Sarabun, sans-serif",
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      textTransform: "none",
      fontWeight: 500,
    },
  },

  palette: {
    primary: {
      main: "#2563eb", // blue-600
    },
    secondary: {
      main: "#64748b", // slate
    },
    background: {
      default: "#f4f6f8",
      paper: "#ffffff",
    },
  },

  shape: {
    borderRadius: 8,
  },

  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          paddingLeft: 16,
          paddingRight: 16,
          height: 44,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
        },
      },
    },
  },
})

export default theme
