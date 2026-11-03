import { useCallback, useState, useSyncExternalStore } from 'react';
import {
  generateWorkflow,
  getEngineStatus,
  subscribeEngine,
  type EngineStatus,
  type GenerateResult,
} from '@/runtime/workflowEngine';
import { checkWorkflow, toSpec, type Issue, type WorkflowDoc } from '@/workflow/model';
import { useWorkspace } from '@/workspace';

export interface EngineRun {
  /** Workflow the result belongs to; a newer workflow makes it stale. */
  doc: WorkflowDoc;
  issues: Issue[];
  result: GenerateResult | null;
}

/**
 * Runs nomad_sdk.workflow (Python, in Pyodide) on the current design.
 * Local checks run first; blocking issues skip the engine.
 */
export function useWorkflowEngine() {
  const { workspace, workflow } = useWorkspace();
  const status: EngineStatus = useSyncExternalStore(subscribeEngine, getEngineStatus);
  const [run, setRun] = useState<EngineRun | null>(null);
  const [running, setRunning] = useState(false);

  const generate = useCallback(async (): Promise<EngineRun | null> => {
    if (!workspace) return null;
    const issues = checkWorkflow(workflow, new Set(workspace.files.map((f) => f.path)));
    if (issues.some((i) => i.severity === 'error')) {
      const next = { doc: workflow, issues, result: null };
      setRun(next);
      return next;
    }
    setRunning(true);
    try {
      const result = await generateWorkflow(toSpec(workspace.name, workflow));
      const next = { doc: workflow, issues, result };
      setRun(next);
      return next;
    } catch (err) {
      const next: EngineRun = {
        doc: workflow,
        issues,
        result: { ok: false, errors: [err instanceof Error ? err.message : String(err)] },
      };
      setRun(next);
      return next;
    } finally {
      setRunning(false);
    }
  }, [workspace, workflow]);

  const current = run && run.doc === workflow ? run : null;
  return { status, generate, running, run: current };
}
