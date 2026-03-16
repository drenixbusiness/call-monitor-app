'use client';
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#07090f',
      paper: '#0e1118',
    },
    primary: {
      main: '#00d9f5',
    },
    error: {
      main: '#ff4566',
    },
    success: {
      main: '#00e09a',
    },
    warning: {
      main: '#ffcc44',
    },
    secondary: {
      main: '#9b7dff'
    },
  },
  typography: {
    fontFamily: '"Google Sans", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        :root {
          --bg: #07090f;
          --surface: #0e1118;
          --surface2: #141720;
          --surface3: #1a1f2e;
          --border: #1e2436;
          --border2: #252d42;
          --accent: #00d9f5;
          --red: #ff4566;
          --purple: #9b7dff;
          --green: #00e09a;
          --yellow: #ffcc44;
          --text: #dde2f0;
          --text2: #8892b0;
          --text3: #4a5470;
        }

        body {
          font-family: "Google Sans", "Helvetica", "Arial", sans-serif;
          font-size: 17px;
          background-color: var(--bg);
          color: var(--text);
          margin: 0;
          padding: 0;
          overflow: hidden;
          height: 100vh;
        }

        * {
          box-sizing: border-box;
        }

        ::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: var(--border2);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--text3);
        }

        body::after {
          content: " ";
          display: block;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0) 50%,
            rgba(0, 0, 0, 0.05) 51%,
            rgba(0, 0, 0, 0.05) 100%
          );
          background-size: 100% 4px;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.8;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes breathe {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 10px var(--accent); }
          100% { transform: scale(1); opacity: 0.8; }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `,
    },
  },
});
