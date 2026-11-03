import { useMemo, useReducer, useState, type ReactNode } from 'react';
import { preloadEngine } from '@/runtime/workflowEngine';
import { emptyWorkflow, workflowReducer } from '@/workflow/model';
import { WorkspaceContext, type Workspace, type WorkspaceState } from './WorkspaceContext';

/**
 * Holds the local workspace and the workflow designed on it, for the whole app (it survives
 * switching between /workflow and /api). Everything lives in browser memory only: nothing is
 * uploaded, and a page reload starts empty. Python (Pyodide) starts loading in the background
 * as soon as files are opened, so "Simulate" / "Generate YAML" are quick.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [workflow, dispatch] = useReducer(workflowReducer, emptyWorkflow);

  const value = useMemo<WorkspaceState>(
    () => ({
      workspace,
      dialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      load: (next) => {
        setWorkspace(next);
        dispatch({ type: 'reset' });
        setDialogOpen(false);
        preloadEngine();
      },
      workflow,
      dispatch,
    }),
    [workspace, dialogOpen, workflow],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
