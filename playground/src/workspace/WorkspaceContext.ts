import { createContext, useContext, type Dispatch } from 'react';
import type { WorkflowAction, WorkflowDoc } from '@/workflow/model';
import type { LocalFile } from './localFiles';

/** A loaded set of local files plus the workflow name the user gave it. In memory only. */
export interface Workspace {
  name: string;
  /** Paths relative to the upload root (where workflow.archive.yaml will sit). */
  files: LocalFile[];
  /** Folder the user picked, if the selection had one; shown, not part of paths. */
  root: string | null;
}

export interface WorkspaceState {
  workspace: Workspace | null;
  /** The "New workflow" dialog is app-wide, so it can be opened from any panel or the nav drawer. */
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  load: (workspace: Workspace) => void;
  /** The workflow being designed on the loaded files (reset when other files are opened). */
  workflow: WorkflowDoc;
  dispatch: Dispatch<WorkflowAction>;
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return value;
}
