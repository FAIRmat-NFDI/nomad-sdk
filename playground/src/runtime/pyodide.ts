/**
 * Python runtime for the playground: nomad-sdk inside Pyodide (CPython on WebAssembly).
 * Ported from the M1 static page. Plain TypeScript — no React/MUI here (same layering
 * rule as taxonomy api/). The workflow designer uses it through `workflowEngine.ts`.
 *
 * Pyodide is loaded from the jsDelivr CDN by default; set VITE_PYODIDE_BASE at build
 * time to self-host it (e.g. for offline / air-gapped `nomad-sdk playground serve`).
 *
 * Served next to index.html by both hosts (`nomad-sdk playground serve`, GitHub Pages):
 *   sdk.zip        nomad_sdk sources, unpacked onto sys.path
 *   examples.json  tested doc snippets (python -m nomad_sdk.playground.bundle)
 */

export const PYODIDE_VERSION = '314.0.7'; // Python 3.14; nomad-sdk deps verified in its pyodide-lock.json
const PYODIDE_BASE =
  import.meta.env.VITE_PYODIDE_BASE || `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
/** What nomad_sdk.workflow needs (no network stack). All ship in the Pyodide distribution. */
export const WORKFLOW_PACKAGES = ['pydantic', 'pyyaml'];
/**
 * Installed alone, without their declared dependencies: Pyodide's lock lists numpy,
 * matplotlib, decorator and setuptools for networkx, none of which the engine imports.
 */
export const NO_DEPS_PACKAGES = ['networkx'];
/** Everything, including the HTTP stack for nomad_sdk.api. */
export const ALL_PACKAGES = [...WORKFLOW_PACKAGES, 'requests', 'pyodide-http'];
export const WORKDIR = '/home/pyodide/work';

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

/** Minimal surface of the Pyodide API used here (avoids a type dependency on the CDN build). */
export interface PyodideLike {
  version: string;
  loadPackage(names: string[]): Promise<void>;
  unpackArchive(buffer: ArrayBuffer, format: string, options?: { extractDir?: string }): void;
  runPython(code: string): unknown;
  runPythonAsync(code: string, options?: { globals?: unknown }): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  toPy(value: unknown): { destroy(): void };
  globals: {
    get(name: string): (...args: unknown[]) => { destroy(): void };
    set(name: string, value: unknown): void;
  };
  FS: { mkdirTree(path: string): void; readdir(path: string): string[]; readFile(path: string): Uint8Array };
}

export interface Example {
  title: string;
  /** docs page the example appears on, and the example file both include and CI run */
  page: string;
  file: string;
  code: string;
}

export interface BootOptions {
  /** Pyodide packages to load (default: everything nomad-sdk can use). */
  packages?: string[];
  onStatus?: (status: string) => void;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
}

/** Load Pyodide, nomad-sdk's dependencies and nomad-sdk itself. */
export async function bootPyodide({
  packages = ALL_PACKAGES,
  onStatus,
  onStdout,
  onStderr,
}: BootOptions = {}): Promise<PyodideLike> {
  onStatus?.('Loading Python…');
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`)) as {
    loadPyodide: (options: { indexURL: string }) => Promise<PyodideLike>;
  };
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });
  if (onStdout) py.setStdout({ batched: onStdout });
  if (onStderr) py.setStderr({ batched: onStderr });

  onStatus?.('Loading packages…');
  await py.loadPackage(packages);
  await installWithoutDeps(py, NO_DEPS_PACKAGES);

  onStatus?.('Loading nomad-sdk…');
  const sdk = await fetch(asset('sdk.zip'), { cache: 'no-store' });
  if (!sdk.ok) throw new Error(`sdk.zip: HTTP ${sdk.status}`);
  const zip = await sdk.arrayBuffer();
  // A host without the file usually answers with index.html (SPA fallback); say so instead of a zip error.
  const magic = new Uint8Array(zip, 0, Math.min(2, zip.byteLength));
  if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
    throw new Error(
      'sdk.zip is missing on this host (got a non-zip response). Use `npm run dev`, ' +
        '`npm run build:package` or `python -m nomad_sdk.playground.bundle` to provide it.',
    );
  }
  py.unpackArchive(zip, 'zip', { extractDir: '/sdk' });
  py.FS.mkdirTree(WORKDIR);
  await py.runPythonAsync(`
import os, sys
sys.path.insert(0, '/sdk')
os.chdir('${WORKDIR}')
try:
    import pyodide_http
    pyodide_http.patch_all()  # route requests through the browser's fetch
except ImportError:
    pass  # workflow-only boot: no HTTP stack loaded
import nomad_sdk
`);
  return py;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Installs wheels from the same Pyodide release, checked against its lock file, skipping their deps. */
async function installWithoutDeps(py: PyodideLike, names: string[]): Promise<void> {
  const lockRes = await fetch(`${PYODIDE_BASE}pyodide-lock.json`);
  if (!lockRes.ok) throw new Error(`pyodide-lock.json: HTTP ${lockRes.status}`);
  const lock = (await lockRes.json()) as { packages: Record<string, { file_name: string; sha256: string }> };
  const site = String(py.runPython('import site; site.getsitepackages()[0]'));
  for (const name of names) {
    const entry = lock.packages[name];
    if (!entry) throw new Error(`${name} is not in this Pyodide release`);
    const res = await fetch(`${PYODIDE_BASE}${entry.file_name}`);
    if (!res.ok) throw new Error(`${entry.file_name}: HTTP ${res.status}`);
    const wheel = await res.arrayBuffer();
    if ((await sha256Hex(wheel)) !== entry.sha256) throw new Error(`${entry.file_name}: checksum mismatch`);
    py.unpackArchive(wheel, 'wheel', { extractDir: site });
  }
}

/** Run user code in a fresh namespace with NOMAD_API_URL / NOMAD_PAT set for this run. */
export async function runCode(
  py: PyodideLike,
  code: string,
  env: { apiUrl: string; pat: string },
): Promise<void> {
  const pyEnv = py.toPy({ NOMAD_API_URL: env.apiUrl.trim(), NOMAD_PAT: env.pat.trim() });
  const namespace = py.globals.get('dict')();
  try {
    py.globals.set('_pg_env', pyEnv);
    await py.runPythonAsync(`
import os
for _k, _v in _pg_env.items():
    if _v: os.environ[_k] = _v
    else: os.environ.pop(_k, None)
`);
    await py.runPythonAsync(code, { globals: namespace });
  } finally {
    pyEnv.destroy();
    namespace.destroy();
  }
}

/** Files the code wrote to the working directory (e.g. workflow.archive.yaml). */
export function listOutputFiles(py: PyodideLike): { name: string; data: Uint8Array }[] {
  return py.FS.readdir(WORKDIR)
    .filter((name) => !name.startsWith('.'))
    .map((name) => ({ name, data: py.FS.readFile(`${WORKDIR}/${name}`) }));
}

/** Tested doc snippets bundled with the app. */
export async function loadExamples(): Promise<Example[]> {
  const res = await fetch(asset('examples.json'), { cache: 'no-store' });
  return res.ok ? ((await res.json()) as Example[]) : [];
}
