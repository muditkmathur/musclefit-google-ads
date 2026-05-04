'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: '#2563eb' },
    secondary: { main: '#9333ea' },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
});

export default theme;
