export const paths = {
  designer: '/workflow',
  api: '/api',
} as const;

/** Page panels that move into the nav drawer on small screens (see components/layout/sidebarPanels). */
export type SidebarPanel = 'files' | 'reference';

/**
 * Per-route header data, read by the AppBar via `useMatches()` (same contract as the taxonomy app).
 * `title` = big heading; `switchTo` = the view the swap button jumps to (Workflow ⇄ API);
 * `sidebar` = panel shown at the top of the mobile nav drawer.
 */
export interface RouteHandle {
  title: string;
  switchTo?: { label: string; to: string };
  sidebar?: SidebarPanel;
}

export const routeHandles = {
  designer: { title: 'Workflow Designer', switchTo: { label: 'API', to: paths.api }, sidebar: 'files' },
  api: { title: 'API Explorer', switchTo: { label: 'Workflow', to: paths.designer }, sidebar: 'reference' },
} satisfies Record<string, RouteHandle>;
