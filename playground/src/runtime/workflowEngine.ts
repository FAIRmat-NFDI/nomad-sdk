/**
 * The workflow engine in the browser: `nomad_sdk.workflow.spec.generate_json`, running in
 * Pyodide (WebAssembly). No backend — the same Python code as the SDK, the docs and CI.
 *
 * Booted lazily on first use and shared app-wide. Plain TypeScript (no UI).
 */
import { bootPyodide, WORKFLOW_PACKAGES, type PyodideLike } from './pyodide';

export interface GraphNode {
  id: number;
  name: string | null;
  type: string | null;
  mainfile_path: string | null;
  /** Added by the engine (default input/output), not by the user. */
  default: boolean;
}

export interface GraphEdge {
  source: number;
  target: number;
  inputs: string[];
  outputs: string[];
}

export type GenerateResult =
  | { ok: true; yaml: string; nodes: GraphNode[]; edges: GraphEdge[]; warnings: string[] }
  | { ok: false; errors: string[] };

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading'; step: string }
  | { state: 'ready'; pyodideVersion: string }
  | { state: 'error'; message: string };

type Listener = (status: EngineStatus) => void;

let status: EngineStatus = { state: 'idle' };
let booting: Promise<(specJson: string) => string> | null = null;
const listeners = new Set<Listener>();

function setStatus(next: EngineStatus) {
  status = next;
  listeners.forEach((l) => l(next));
}

export function getEngineStatus(): EngineStatus {
  return status;
}

export function subscribeEngine(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function boot(): Promise<(specJson: string) => string> {
  try {
    const py: PyodideLike = await bootPyodide({
      packages: WORKFLOW_PACKAGES,
      onStatus: (step) => setStatus({ state: 'loading', step }),
    });
    await py.runPythonAsync('from nomad_sdk.workflow.spec import generate_json');
    const fn = py.globals.get('generate_json') as unknown as (specJson: string) => string;
    setStatus({ state: 'ready', pyodideVersion: py.version });
    return fn;
  } catch (err) {
    booting = null; // allow a retry
    setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Starts loading Python in the background (e.g. as soon as files are opened). */
export function preloadEngine(): void {
  booting ??= boot();
  booting.catch(() => undefined);
}

/** Runs the engine on a WorkflowSpec (see workflow/model.ts `toSpec`). */
export async function generateWorkflow(spec: unknown): Promise<GenerateResult> {
  booting ??= boot();
  const generateJson = await booting;
  return JSON.parse(generateJson(JSON.stringify(spec))) as GenerateResult;
}
