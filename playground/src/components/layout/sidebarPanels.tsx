import type { ReactNode } from 'react';
import { FilesPanel } from '@/components/designer';
import { ReferenceNav } from '@/components/reference';
import type { SidebarPanel } from '@/routes/paths';

/** Route handle `sidebar` key → what the mobile nav drawer shows above the menu links. */
export const sidebarPanels: Record<SidebarPanel, ReactNode> = {
  files: <FilesPanel />,
  reference: <ReferenceNav />,
};
