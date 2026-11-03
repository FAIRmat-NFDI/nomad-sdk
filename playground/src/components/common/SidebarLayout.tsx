import type { ReactNode } from 'react';
import { Box, Stack, useMediaQuery, useTheme } from '@mui/material';
import { layout } from '@/theme';
import { Pane } from './PaneLayout';

interface SidebarLayoutProps {
  /** Column 1, flush. Desktop only; on smaller screens it lives in the nav drawer. */
  sidebar: { label: string; content: ReactNode };
  /** Column 2: one card, open at the bottom edge. */
  main: { label: string; content: ReactNode };
}

const { gap } = layout.docPane;

/** Two panes — sidebar | main — built from `Pane` and the layout tokens (/workflow, /api). */
export function SidebarLayout({ sidebar, main }: SidebarLayoutProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  return (
    <Stack direction="row" sx={{ height: '100%' }}>
      {isDesktop && (
        <Box sx={{ width: layout.sidebarWidth, flexShrink: 0 }}>
          <Pane component="nav" label={sidebar.label} shape="sidebar">
            {sidebar.content}
          </Pane>
        </Box>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0, pt: gap, px: gap }}>
        <Pane component="article" label={main.label} shape="bottom">
          {main.content}
        </Pane>
      </Box>
    </Stack>
  );
}
