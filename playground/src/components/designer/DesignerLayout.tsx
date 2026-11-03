import type { ReactNode } from 'react';
import { SidebarLayout } from '@/components/common';

/** /workflow: files | canvas — two panes, as in the design. */
export function DesignerLayout({ files, workflow }: { files: ReactNode; workflow: ReactNode }) {
  return (
    <SidebarLayout
      sidebar={{ label: 'Files available', content: files }}
      main={{ label: 'Workflow', content: workflow }}
    />
  );
}
