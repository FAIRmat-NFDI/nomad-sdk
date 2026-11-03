import { Box } from '@mui/material';
import { Outlet } from 'react-router';
import { AppHeader } from './AppHeader';

/**
 * Adapted from taxonomy app/src/components/layout/AppLayout.tsx.
 * Full-viewport shell: the AppBar never scrolls; each view manages its own scrolling.
 * Session restore, data loading and the busy overlay come back with real functionality.
 */
export function AppLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <AppHeader />
      <Box component="main" sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </Box>
    </Box>
  );
}
