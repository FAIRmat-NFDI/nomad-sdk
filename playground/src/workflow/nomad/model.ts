/*
 * Workflow graph model — TypeScript port of the data logic of NOMAD's WorkflowCard
 * (nomad-FAIR, gui/src/components/entry/properties/WorkflowCard.js: resolveSection,
 * getNodes, getLinks; gui/src/utils.js: resolveInternalRef).
 *
 * Copyright The NOMAD Authors. Licensed under the Apache License, Version 2.0
 * (http://www.apache.org/licenses/LICENSE-2.0). Modified for nomad-sdk: archives come
 * from an ArchiveSource (local files) instead of the NOMAD API; types added.
 */

/** An archive section (plain JSON from a *.archive.yaml / *.json or a stub). */
export interface Section {
  name?: string;
  task?: string;
  section?: string | Section;
  inputs?: Section[];
  outputs?: Section[];
  tasks?: Section[];
  color?: string;
  [key: string]: unknown;
}

export interface Archive {
  metadata?: { mainfile?: string; upload_id?: string; entry_id?: string };
  /** nomad-sdk: base of node urls (NOMAD uses the entry API url). */
  __key: string;
  /** nomad-sdk: placeholder for an entry whose archive is not available locally. */
  __stub?: Map<string, Section>;
  [key: string]: unknown;
}

/** Resolves the entry part of a reference (e.g. `../upload/archive/mainfile/Emin/x.log`). */
export interface ArchiveSource {
  load(entryRef: string, from: Archive): Promise<Archive | null>;
}

export interface Query {
  source: ArchiveSource;
  sectionKeys: string[];
  maxNodes?: number;
  resolveIndices?: Record<string, number[] | null>;
}

/** A node of the graph (NOMAD's untyped node object; layout fields are set by the view). */
export interface GNode {
  name?: string | null;
  section?: Section | string;
  sectionType?: string;
  path?: string | Section;
  archive?: Archive | null;
  url?: string;
  entryId?: string;
  color?: string;
  nChildren?: number;
  type?: string;
  index?: number;
  parent?: GNode;
  total?: number;
  nodes?: GNode[] | null;
  links?: GLink[] | null;
  children?: GNode[] | null;
  // view state
  id?: number;
  x?: number;
  y?: number;
  r?: number;
  size?: number;
  fx?: number | null;
  fy?: number | null;
  _name?: string | null;
  _type?: string;
  _nodes?: GNode[];
  _links?: GLink[];
}

export interface GLink {
  source: GNode;
  target: GNode;
  label: string | null;
  dashed?: boolean;
  id?: string;
}

const isPlainObject = (v: unknown): v is Section => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Port of nomad-FAIR utils.resolveInternalRef (single url, archive data). */
export function resolveInternalRef(url: string, data: Archive): Section | undefined {
  if (!url.startsWith('#') && !url.startsWith('/')) throw new Error(`Expected internal ref, got ${url}`);
  const path = url.slice(1);
  if (data.__stub) {
    // nomad-sdk: an entry we cannot read locally; every path resolves to a placeholder
    // section with a stable identity, so links between references still match.
    const stub = data.__stub;
    if (!stub.has(path)) stub.set(path, {});
    return stub.get(path);
  }
  const segments = path.split('/').filter((s) => s !== '');
  let current: unknown = data;
  for (const segment of segments) {
    if (!current) throw new Error(`Path does not exist: ${path}`);
    if (isNaN(Number(segment))) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      const list = current as unknown[];
      let index = parseInt(segment);
      if (index < 0) index = list.length + index;
      current = list[index];
    }
  }
  return current as Section | undefined;
}

const baseUrl = (archive?: Archive | null) => `local://${archive?.__key ?? ''}`;

export async function resolveSection(source: GNode, query: Query): Promise<GNode | undefined> {
  if (isPlainObject(source.section)) {
    // already resolved
    return source;
  }

  let path = source.path;
  if (typeof path !== 'string') path = (source.section as string | undefined) || '/';
  const pathSegments = path.split('#').filter((p) => p);

  let archive = source.archive ?? undefined;
  let section: Section | undefined;
  if (pathSegments.length === 1) {
    // internal reference
    path = pathSegments[0]!;
    if (!path.startsWith('/') && !path.startsWith('#')) path = `/${path}`;
    try {
      section = source.section ? (source.path as Section) : resolveInternalRef(path, archive!);
    } catch {
      console.error(`Cannot resolve section ${path}`);
      return;
    }
  } else {
    // external reference
    try {
      const loaded = await query.source.load(pathSegments[0]!, archive!);
      if (!loaded) return;
      archive = loaded;
      path = pathSegments[1]!;
      if (!path.startsWith('/')) path = `/${path}`;
      section = source.section ? (source.path as Section) : resolveInternalRef(path, archive);
    } catch (error) {
      console.error(`Cannot resolve entry ${pathSegments[0]}: ${String(error)}`);
      return;
    }
  }

  if (!section) return;

  const match = path.match('.*/([^/]+)/(\\d+)$');
  const sectionKeys = query.sectionKeys || [];
  const nChildren = (s: Section) =>
    sectionKeys.map((key) => ((s[key] as unknown[]) || []).length).reduce((a, b) => a + b, 0);
  if (section.task) {
    const task = await resolveSection({ path: section.task, archive }, query);
    if (!task) return;
    const taskSection = task.section as Section;
    taskSection.inputs = section.inputs && section.inputs.length ? section.inputs : taskSection.inputs;
    taskSection.outputs = section.outputs && section.outputs.length ? section.outputs : taskSection.outputs;
    task.nChildren = nChildren(taskSection);
    return task;
  }

  return {
    name: section.name,
    section,
    sectionType: match ? match[1] : path.split('/').pop(),
    path,
    archive: source.section ? null : archive,
    url: [baseUrl(archive), path].join('#'),
    entryId: archive?.metadata?.entry_id,
    color: section.color,
    nChildren: nChildren(section),
  };
}

const range = (start: number, stop: number) =>
  Array.from(
    Array(Math.max(stop - start, 0))
      .fill(start)
      .map((n: number, i) => n + i),
  );

export async function getNodes(source: GNode, query: Query): Promise<GNode[]> {
  const { resolveIndices, sectionKeys } = query;
  const maxNodes = query.maxNodes || 7;

  let nodes = source.nodes || [];
  if (nodes.length && !resolveIndices) return nodes;

  const resolved = await resolveSection(source, query);
  if (!resolved) return nodes;
  const parent = resolved.section as Section | undefined;
  if (!parent) return nodes;

  nodes = [];
  const archive = resolved.archive;
  for (const key of sectionKeys) {
    let children = (parent[key] as Section[] | Section | undefined) || [];
    if (!Array.isArray(children)) children = [children];
    const nChildren = children.length;

    let sectionIndices = range(0, nChildren);
    if (resolveIndices && resolveIndices[key]) {
      sectionIndices = resolveIndices[key] || sectionIndices;
    } else if (maxNodes < nChildren) {
      const mid = Math.floor(maxNodes / 2);
      // show first and last few nodes
      sectionIndices = [...range(0, mid), ...range(nChildren - mid, nChildren)];
    }

    for (const index of sectionIndices) {
      const child = children[index];
      if (!child) continue;

      let path: string | Section = child;
      if (!child.section) path = `${source.path as string}/${key}/${index}`;
      const section = await resolveSection(
        { section: child.section as string | undefined, path, archive },
        query,
      );
      if (!section) continue;

      section.name = child.name;
      section.type = key;
      section.index = index;
      section.parent = source;
      section.total = nChildren;
      nodes.push(section);
    }
  }

  return nodes;
}

export async function getLinks(source: GNode, query: Query): Promise<GLink[] | undefined> {
  if (source.links) return source.links;

  const nodes = source.nodes;
  if (!nodes) return;

  const links: GLink[] = [];
  for (const node of nodes) {
    if (node.type === 'tasks') {
      node.nodes = await getNodes(node, query);
    }
  }

  const isLinked = (source: GNode, target: GNode) => {
    if (source.url === target.url) return false;

    const inputs: (string | undefined)[] = [];
    if (target.type === 'tasks' && target.nodes) {
      inputs.push(...target.nodes.filter((n) => n.type && n.type.startsWith('inputs')).map((n) => n.url));
    } else {
      inputs.push(target.url);
    }

    if (inputs.includes(source.url)) return true;

    const outputs: (string | undefined)[] = [];
    if (source.type === 'tasks' && source.nodes) {
      outputs.push(...source.nodes.filter((n) => n.type === 'outputs').map((n) => n.url));
    } else {
      outputs.push(source.url);
    }

    if (outputs.includes(target.url)) return true;

    for (const output of outputs) {
      if (!output) continue;
      if (inputs.includes(output)) return true;
    }
    return false;
  };

  // links from inputs to source
  nodes
    .filter((n) => n.type && n.type.startsWith('inputs') && n.url)
    .forEach((input) => links.push({ source: input, target: source, label: null }));
  // links from source to outputs
  nodes
    .filter((n) => n.type === 'outputs' && n.url)
    .forEach((output) => links.push({ source, target: output, label: null }));

  // source and target are linked if any of the outputs of source or source itself is any of the
  // inputs of target or target itself
  for (const from of ['inputs', 'tasks']) {
    for (const to of ['outputs', 'tasks']) {
      const sourceNodes = nodes.filter((n) => n.type && n.type.startsWith(from) && n.url);
      const targetNodes = nodes.filter((n) => n.type === to && n.url);
      sourceNodes.forEach((sourceNode) => {
        targetNodes.forEach((targetNode) => {
          if (isLinked(sourceNode, targetNode)) {
            const label = from === 'inputs' || to === 'outputs' ? null : 'Click to see how tasks are linked';
            links.push({ source: sourceNode, target: targetNode, label });
          }
        });
      });
    }
  }

  // add pseudo link for serial tasks where the intermediate tasks were filtered out
  const tasks = nodes.filter((n) => n.type === 'tasks' && n.url);
  tasks.forEach((task, index) => {
    const nextTask = tasks[index + 1];
    if (nextTask && (nextTask.index ?? 0) - (task.index ?? 0) > 1) {
      links.push({ source: task, target: nextTask, label: 'Intermediate link', dashed: true });
    }
  });

  return links;
}

/** The filter box syntax (`5, 4:-1, :50%`) → indices; port of setShowNodes' parser. */
export function parseNodeFilter(inputValue: string, total: number): number[] {
  const toNumber = (raw: string) => {
    let value: number;
    if (raw.includes('%')) return Math.floor((parseFloat(raw.replace('%', '')) * total) / 100);
    if (raw.includes('.')) return Math.floor(parseFloat(raw) * total);
    value = parseInt(raw);
    if (Number.isNaN(value)) throw new Error(`Invalid index: ${raw}`);
    if (value < 0) value = total + value;
    return value;
  };
  const value: number[] = [];
  for (const part of inputValue.split(',')) {
    const q = part.trim().split(':');
    if (q.length === 2) {
      value.push(
        ...range(...(q.map((qi, n) => (qi ? toNumber(qi) : n === 0 ? 0 : total)) as [number, number])),
      );
    } else {
      value.push(toNumber(q[0]!));
    }
  }
  return [...new Set(value)];
}
