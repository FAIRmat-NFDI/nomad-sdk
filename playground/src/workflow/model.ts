/**
 * The workflow the user is designing: nodes + edges, mirroring
 * `nomad_sdk.workflow.spec.WorkflowSpec` (Python), which turns it into the archive YAML.
 *
 * Plain TypeScript — no React/MUI. All editing goes through the pure `workflowReducer`.
 */

export type NodeType = 'input' | 'task' | 'workflow' | 'output';

export interface WfNode {
  /** Unique, stable integer key (the engine requires integer node keys). */
  id: number;
  name: string;
  type: NodeType;
  /** `simulation` lets the engine add the default system / calculation links. */
  entryType?: 'simulation';
  /** Path relative to the workspace root; omitted → inherited along edges. */
  mainfilePath?: string;
  /** Inputs / outputs: section name such as `system` or `calculation`. */
  sectionType?: string;
  /** Index into the section list; omitted → the engine default -1 (last), as in the NOMAD docs. */
  sectionIndex?: number;
  /** Full archive path, e.g. `data` (overrides the defaults). */
  archivePath?: string;
  /** Canvas position inside the node's lane (inputs | steps | outputs). Not sent to the engine. */
  position?: { x: number; y: number };
}

export interface WfEdge {
  source: number;
  target: number;
}

export interface WorkflowDoc {
  nodes: WfNode[];
  edges: WfEdge[];
}

export const emptyWorkflow: WorkflowDoc = { nodes: [], edges: [] };

export const NODE_TYPES: { value: NodeType; label: string; hint: string }[] = [
  { value: 'workflow', label: 'Workflow', hint: 'An entry with its own workflow2 (e.g. a simulation)' },
  { value: 'task', label: 'Task', hint: 'A single step without its own workflow' },
  { value: 'input', label: 'Input', hint: 'Data the workflow starts from' },
  { value: 'output', label: 'Output', hint: 'A result of the workflow' },
];

export const SECTION_TYPES = ['system', 'calculation', 'method'] as const;

/** Mainfiles of common simulation codes — a hint only; the user decides. */
const MAINFILE_HINTS = [
  /\.log$/i, // GROMACS md.log, CP2K, Gaussian
  /(^|\/)vasprun\.xml$/i,
  /(^|\/)OUTCAR$/,
  /\.out$/i, // Quantum ESPRESSO, FHI-aims, ORCA
  /\.archive\.(ya?ml|json)$/i, // NOMAD archive / ELN files
  /\.(nxs|h5|hdf5)$/i,
];

export function isLikelyMainfile(path: string): boolean {
  return MAINFILE_HINTS.some((re) => re.test(path));
}

/** Default node name for a mainfile: its folder (`Emin/mdrun.log` → `Emin`) or file stem. */
export function suggestName(mainfilePath: string): string {
  const parts = mainfilePath.split('/');
  if (parts.length > 1) return parts[parts.length - 2]!;
  return parts[0]!.replace(/\.[^.]+$/, '');
}

export type WorkflowAction =
  | { type: 'add'; node: Omit<WfNode, 'id'>; connectFrom?: number[]; connectTo?: number[] }
  | { type: 'connect'; source: number; target: number }
  | { type: 'disconnect'; source: number; target: number }
  | { type: 'move'; id: number; position: { x: number; y: number } }
  | { type: 'update'; id: number; patch: Partial<Omit<WfNode, 'id'>> }
  | { type: 'remove'; id: number }
  | { type: 'setEdges'; id: number; from: number[]; to: number[] }
  | { type: 'reset' };

const nextId = (doc: WorkflowDoc) => doc.nodes.reduce((max, n) => Math.max(max, n.id + 1), 0);

/** True if `to` can reach `from` already — adding from→to would close a cycle. */
export function createsCycle(edges: WfEdge[], from: number, to: number): boolean {
  if (from === to) return true;
  const stack = [to];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

function addEdges(edges: WfEdge[], pairs: [number, number][]): WfEdge[] {
  const out = [...edges];
  for (const [source, target] of pairs) {
    const exists = out.some((e) => e.source === source && e.target === target);
    if (!exists && !createsCycle(out, source, target)) out.push({ source, target });
  }
  return out;
}

export function workflowReducer(doc: WorkflowDoc, action: WorkflowAction): WorkflowDoc {
  switch (action.type) {
    case 'add': {
      const id = nextId(doc);
      const edges = addEdges(doc.edges, [
        ...(action.connectFrom ?? []).map((s): [number, number] => [s, id]),
        ...(action.connectTo ?? []).map((t): [number, number] => [id, t]),
      ]);
      return { nodes: [...doc.nodes, { ...action.node, id }], edges };
    }
    case 'connect': {
      if (!canConnect(doc, action.source, action.target)) return doc;
      return { ...doc, edges: addEdges(doc.edges, [[action.source, action.target]]) };
    }
    case 'disconnect':
      return {
        ...doc,
        edges: doc.edges.filter((e) => !(e.source === action.source && e.target === action.target)),
      };
    case 'move':
      return {
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === action.id ? { ...n, position: action.position } : n)),
      };
    case 'update':
      return { ...doc, nodes: doc.nodes.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n)) };
    case 'remove':
      return {
        nodes: doc.nodes.filter((n) => n.id !== action.id),
        edges: doc.edges.filter((e) => e.source !== action.id && e.target !== action.id),
      };
    case 'setEdges': {
      const kept = doc.edges.filter((e) => e.source !== action.id && e.target !== action.id);
      return {
        ...doc,
        edges: addEdges(kept, [
          ...action.from.map((s): [number, number] => [s, action.id]),
          ...action.to.map((t): [number, number] => [action.id, t]),
        ]),
      };
    }
    case 'reset':
      return emptyWorkflow;
  }
}

/**
 * Data flows inputs → steps → outputs: nothing flows into an input or out of an output,
 * an input never links straight to an output, and no loops or duplicates.
 */
export function canConnect(doc: WorkflowDoc, source: number, target: number): boolean {
  const from = doc.nodes.find((n) => n.id === source);
  const to = doc.nodes.find((n) => n.id === target);
  if (!from || !to || from.type === 'output' || to.type === 'input') return false;
  if (from.type === 'input' && to.type === 'output') return false; // needs a step in between
  if (doc.edges.some((e) => e.source === source && e.target === target)) return false;
  return !createsCycle(doc.edges, source, target);
}

/** JSON for `nomad_sdk.workflow.spec.generate_json` (snake_case, empty fields dropped). */
export function toSpec(name: string, doc: WorkflowDoc) {
  return {
    name,
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      ...(n.entryType && { entry_type: n.entryType }),
      ...(n.mainfilePath && { mainfile_path: n.mainfilePath }),
      ...(n.sectionType && { section_type: n.sectionType }),
      ...(n.sectionIndex !== undefined && { section_index: n.sectionIndex }),
      ...(n.archivePath && { archive_path: n.archivePath }),
    })),
    edges: doc.edges.map(({ source, target }) => ({ source, target })),
  };
}

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: number;
}

/** Checks that can be done locally, before the engine runs. */
export function checkWorkflow(doc: WorkflowDoc, filePaths: ReadonlySet<string>): Issue[] {
  const issues: Issue[] = [];
  if (!doc.nodes.some((n) => n.type === 'task' || n.type === 'workflow')) {
    issues.push({ severity: 'error', message: 'Add at least one task or workflow node.' });
  }
  const connected = new Set(doc.edges.flatMap((e) => [e.source, e.target]));
  for (const n of doc.nodes) {
    if (n.mainfilePath && !filePaths.has(n.mainfilePath)) {
      issues.push({
        severity: 'error',
        nodeId: n.id,
        message: `${n.name}: ${n.mainfilePath} is not in the loaded files.`,
      });
    }
    if (!n.mainfilePath && !connected.has(n.id)) {
      issues.push({
        severity: 'error',
        nodeId: n.id,
        message: `${n.name}: needs a mainfile or a connection to inherit one from.`,
      });
    }
    if (doc.nodes.length > 1 && !connected.has(n.id)) {
      issues.push({ severity: 'warning', nodeId: n.id, message: `${n.name} is not connected.` });
    }
  }
  return issues;
}
