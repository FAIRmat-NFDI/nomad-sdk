import { describe, expect, it } from 'vitest';
import { localArchiveSource, rootArchive } from './localArchives';
import golden from '../../../../tests/workflow/golden/md_equilibration.archive.yaml?raw';
import { getLinks, getNodes, parseNodeFilter, resolveSection, type GNode, type Query } from './model';

async function build(yaml: string, files: { path: string; text: string }[] = []) {
  const query: Query = {
    source: localArchiveSource(files.map((f) => ({ path: f.path, text: async () => f.text }))),
    sectionKeys: ['inputs', 'tasks', 'outputs'],
    maxNodes: 6,
  };
  const root = (await resolveSection({ path: '/workflow2', archive: rootArchive(yaml) }, query))!;
  root.nodes = await getNodes(root, query);
  root.links = (await getLinks(root, query))!;
  return { root, query };
}

const names = (nodes: GNode[], type: string) => nodes.filter((n) => n.type === type).map((n) => n.name);
const pairs = (root: GNode) =>
  root.links!.map((l) => `${l.source.name ?? 'root'} -> ${l.target.name ?? 'root'}`);

describe('NOMAD workflow graph logic on the generated YAML', () => {
  it('finds the inputs, tasks and outputs of workflow2', async () => {
    const { root } = await build(golden);
    expect(root.name).toBe('md_equilibration');
    expect(names(root.nodes!, 'inputs')).toEqual(['input system']);
    expect(names(root.nodes!, 'tasks')).toEqual([
      'Geometry Optimization',
      'Equilibration NPT Molecular Dynamics',
      'Production NVT Molecular Dynamics',
    ]);
    expect(names(root.nodes!, 'outputs')).toEqual(['output system', 'output properties']);
  });

  it('links tasks in series through matching references (as NOMAD does)', async () => {
    const { root } = await build(golden);
    const links = pairs(root);
    expect(links).toContain('input system -> Geometry Optimization');
    expect(links).toContain('Geometry Optimization -> Equilibration NPT Molecular Dynamics');
    expect(links).toContain('Equilibration NPT Molecular Dynamics -> Production NVT Molecular Dynamics');
    expect(links).toContain('Production NVT Molecular Dynamics -> output system');
    expect(links).not.toContain('Geometry Optimization -> Production NVT Molecular Dynamics');
  });

  it('gives each task its own inputs and outputs (what a click expands)', async () => {
    const { root } = await build(golden);
    const npt = root.nodes!.find((n) => n.name === 'Equilibration NPT Molecular Dynamics')!;
    expect(names(npt.nodes!, 'inputs')).toEqual(['input system from Geometry Optimization']);
    expect(names(npt.nodes!, 'outputs')).toHaveLength(2);
  });

  it('expands a nested workflow from a local *.archive.yaml', async () => {
    const outer = `workflow2:
  name: project
  tasks:
  - m_def: nomad.datamodel.metainfo.workflow.TaskReference
    name: MD
    task: '../upload/archive/mainfile/md/workflow.archive.yaml#/workflow2'
`;
    const { root, query } = await build(outer, [{ path: 'md/workflow.archive.yaml', text: golden }]);
    const md = root.nodes![0]!;
    expect(md.nChildren).toBe(6);
    const inner = (await resolveSection(md, query))!;
    const nodes = await getNodes(inner, query);
    expect(names(nodes, 'tasks')).toHaveLength(3);
  });

  it('shows the first and last tasks with a dashed intermediate link for long workflows', async () => {
    const tasks = Array.from(
      { length: 10 },
      (_, i) => `  - name: Step ${i}\n    inputs: []\n    outputs: []`,
    ).join('\n');
    const { root } = await build(`workflow2:\n  name: long\n  tasks:\n${tasks}\n`);
    expect(names(root.nodes!, 'tasks')).toEqual(['Step 0', 'Step 1', 'Step 2', 'Step 7', 'Step 8', 'Step 9']);
    expect(root.links!.filter((l) => l.dashed).map((l) => `${l.source.name}..${l.target.name}`)).toEqual([
      'Step 2..Step 7',
    ]);
  });
});

it('parses the filter syntax (5, 4:-1, :50%)', () => {
  expect(parseNodeFilter('5', 10)).toEqual([5]);
  expect(parseNodeFilter('7:-1', 10)).toEqual([7, 8]);
  expect(parseNodeFilter(':50%', 10)).toEqual([0, 1, 2, 3, 4]);
  expect(parseNodeFilter('0, -1', 10)).toEqual([0, 9]);
  expect(() => parseNodeFilter('abc', 10)).toThrow();
});
