import { CssBaseline, ThemeProvider } from '@mui/material';
import { RouterProvider } from 'react-router/dom';
import { router } from '@/routes/router';
import { theme } from '@/theme';
import { WorkspaceProvider } from '@/workspace';

/**
 * Adapted from taxonomy app/src/App.tsx.
 *  Theme      → FAIRmat / NOMAD design tokens (standalone copy, maintained here)
 *  Workspace  → locally opened files (browser memory only; nothing is uploaded)
 * Redux and React Query providers are added back with the first real functionality.
 */
export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WorkspaceProvider>
        <RouterProvider router={router} />
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
