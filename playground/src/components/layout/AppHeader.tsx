import { AppBar, Box, Button, Stack, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { NomadLogo } from '@/assets/images';
import { LoginButton } from '@/components/auth/LoginButton';
import { logoRules } from '@/theme';
import { navMenus } from './navMenus';
import { paths } from '@/routes/paths';
import { MobileNavDrawer } from './MobileNavDrawer';
import { sidebarPanels } from './sidebarPanels';
import { NavMenuButton } from './NavMenuButton';
import { useRouteHandle } from './useRouteHandle';

/**
 * Adapted from taxonomy app/src/components/layout/AppHeader.tsx (same structure and breakpoints):
 *   LOGO (+ PLAYGROUND) | DIV1 (nav row / title) | spacer | DIV2 (account)
 * Changes: NOMAD logo with a "Playground" caption, no branch switcher, Login placeholder.
 */
export function AppHeader() {
  const handle = useRouteHandle();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });

  return (
    <AppBar position="relative">
      <Toolbar sx={{ py: { xs: 0.5, md: 1 }, gap: { xs: 1, md: 3 } }}>
        {!isDesktop && (
          <MobileNavDrawer
            switchTo={handle?.switchTo}
            sidebar={handle?.sidebar && sidebarPanels[handle.sidebar]}
          />
        )}

        {/* LOGO — ≥ 36px tall online (§2.3), clear space around it (§2.4) */}
        <Stack
          component={RouterLink}
          to={paths.designer}
          aria-label="NOMAD Playground home"
          sx={{
            flexShrink: 0,
            alignItems: 'flex-end',
            p: { md: logoRules.clearSpace },
            textDecoration: 'none',
          }}
        >
          {/* Logo tones bound to the NOMAD palette, as nomad-docs does (light scheme). */}
          <NomadLogo
            titleAccess="NOMAD"
            sx={(t) => ({
              height: logoRules.minHeightPx,
              width: 'auto',
              '--nomad-logo-primary': (t.vars ?? t).palette.nomad.complementary,
              '--nomad-logo-secondary': (t.vars ?? t).palette.nomad.primary,
            })}
          />
          {!isPhone && (
            <Typography variant="overline" color="primary" component="span">
              Playground
            </Typography>
          )}
        </Stack>

        {/* DIV1 */}
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          {isDesktop && (
            <Stack direction="row" spacing={1}>
              {handle?.switchTo && (
                <Button component={RouterLink} to={handle.switchTo.to} variant="nav">
                  {handle.switchTo.label}
                </Button>
              )}
              {navMenus.map((menu) => (
                <NavMenuButton key={menu.label} menu={menu} />
              ))}
            </Stack>
          )}
          {/* Guideline "Title" role; titles stay on one line (§5.2) */}
          <Typography variant="h1" noWrap sx={{ px: { md: 1 } }}>
            {handle?.title ?? 'NOMAD Playground'}
          </Typography>
        </Stack>

        {/* SPACER */}
        <Box sx={{ flexGrow: 1 }} />

        {/* DIV2 */}
        <Stack sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <LoginButton compact={isPhone} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
