import { describe, expect, it } from 'vitest';
import {
  canConnect,
  checkWorkflow,
  createsCycle,
  emptyWorkflow,
  isLikelyMainfile,
  suggestName,
  toSpec,
  workflowReducer,
  type WorkflowAction,
  type WorkflowDoc,
} from './model';

const apply = (actions: WorkflowAction[], doc: WorkflowDoc = emptyWorkflow) =>
  actions.reduce(workflowReducer, doc);

const md = apply([
  {
    type: 'add',
    node: { name: 'input system', type: 'input', mainfilePath: 'Emin/mdrun_Emin.log', sectionType: 'system' },
  },
  {
    type: 'add',
    node: { name: 'Emin', type: 'workflow', entryType: 'simulation', mainfilePath: 'Emin/mdrun_Emin.log' },
    connectFrom: [0],
  },
  {
    type: 'add',
    node: {
      name: 'NPT',
      type: 'workflow',
      entryType: 'simulation',
      mainfilePath: 'Equil_NPT/mdrun_Equil-NPT.log',
    },
    connectFrom: [1],
  },
]);

describe('workflowReducer', () => {
  it('assigns increasing integer ids and connects on add', () => {
    expect(md.nodes.map((n) => n.id)).toEqual([0, 1, 2]);
    expect(md.edges).toEqual([
      { source: 0, target: 1 },
      { source: 1, target: 2 },
    ]);
  });

  it('never creates cycles, duplicates or self-loops', () => {
    // 0→1→2 exists; asking for 1→0 (cycle), 0→0 (self-loop) and 0→2 twice.
    const doc = apply([{ type: 'setEdges', id: 0, from: [0], to: [1, 2, 2] }], md);
    expect(doc.edges).toEqual([
      { source: 1, target: 2 },
      { source: 0, target: 1 },
      { source: 0, target: 2 },
    ]);
    expect(createsCycle(md.edges, 2, 0)).toBe(true);
    expect(apply([{ type: 'setEdges', id: 2, from: [1], to: [0] }], md).edges).toEqual([
      { source: 0, target: 1 },
      { source: 1, target: 2 },
    ]);
  });

  it('removes a node with its edges and keeps ids stable', () => {
    const doc = apply(
      [
        { type: 'remove', id: 1 },
        { type: 'add', node: { name: 'x', type: 'task' } },
      ],
      md,
    );
    expect(doc.nodes.map((n) => n.id)).toEqual([0, 2, 3]);
    expect(doc.edges).toEqual([]);
  });

  it('updates fields', () => {
    expect(apply([{ type: 'update', id: 2, patch: { name: 'NPT run' } }], md).nodes[2]!.name).toBe('NPT run');
  });
});

it('serialises to the Python WorkflowSpec shape', () => {
  expect(toSpec('Equilibration', md)).toEqual({
    name: 'Equilibration',
    nodes: [
      {
        id: 0,
        name: 'input system',
        type: 'input',
        mainfile_path: 'Emin/mdrun_Emin.log',
        section_type: 'system',
      },
      {
        id: 1,
        name: 'Emin',
        type: 'workflow',
        entry_type: 'simulation',
        mainfile_path: 'Emin/mdrun_Emin.log',
      },
      {
        id: 2,
        name: 'NPT',
        type: 'workflow',
        entry_type: 'simulation',
        mainfile_path: 'Equil_NPT/mdrun_Equil-NPT.log',
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
    ],
  });
});

describe('checkWorkflow', () => {
  const files = new Set(['Emin/mdrun_Emin.log', 'Equil_NPT/mdrun_Equil-NPT.log']);
  it('passes a valid workflow', () => {
    expect(checkWorkflow(md, files)).toEqual([]);
  });
  it('flags missing files, missing mainfiles and loose nodes', () => {
    const doc = apply([{ type: 'add', node: { name: 'orphan', type: 'output' } }], md);
    const messages = checkWorkflow(doc, new Set(['Emin/mdrun_Emin.log'])).map(
      (i) => `${i.severity}:${i.message}`,
    );
    expect(messages).toContain('error:NPT: Equil_NPT/mdrun_Equil-NPT.log is not in the loaded files.');
    expect(messages).toContain('error:orphan: needs a mainfile or a connection to inherit one from.');
    expect(messages).toContain('warning:orphan is not connected.');
  });
  it('needs a task', () => {
    expect(checkWorkflow(emptyWorkflow, files)[0]!.severity).toBe('error');
  });
});

it('hints mainfiles and names', () => {
  expect(['Emin/mdrun_Emin.log', 'run/vasprun.xml', 'x/confout.gro'].map(isLikelyMainfile)).toEqual([
    true,
    true,
    false,
  ]);
  expect([suggestName('Emin/mdrun_Emin.log'), suggestName('single.out')]).toEqual(['Emin', 'single']);
});

describe('connect', () => {
  const doc = apply([{ type: 'add', node: { name: 'out', type: 'output' } }], md); // id 3
  it('follows inputs → steps → outputs', () => {
    expect(canConnect(doc, 2, 3)).toBe(true);
    expect(canConnect(doc, 3, 2)).toBe(false); // out of an output
    expect(canConnect(doc, 1, 0)).toBe(false); // into an input
    expect(canConnect(doc, 2, 1)).toBe(false); // loop
    expect(canConnect(doc, 0, 1)).toBe(false); // duplicate
    expect(canConnect(doc, 0, 3)).toBe(false); // input straight to output
  });
  it('connects, disconnects and moves', () => {
    let next = apply([{ type: 'connect', source: 2, target: 3 }], doc);
    expect(next.edges).toContainEqual({ source: 2, target: 3 });
    expect(apply([{ type: 'connect', source: 3, target: 2 }], next)).toBe(next);
    next = apply(
      [
        { type: 'disconnect', source: 2, target: 3 },
        { type: 'move', id: 3, position: { x: 5, y: 6 } },
      ],
      next,
    );
    expect(next.edges).not.toContainEqual({ source: 2, target: 3 });
    expect(next.nodes.find((n) => n.id === 3)!.position).toEqual({ x: 5, y: 6 });
  });
});

it('passes a section index through, including 0', () => {
  const doc = apply([{ type: 'update', id: 0, patch: { sectionIndex: 0 } }], md);
  expect(toSpec('x', doc).nodes[0]).toMatchObject({ section_type: 'system', section_index: 0 });
  expect(toSpec('x', md).nodes[0]).not.toHaveProperty('section_index');
});
