import { expect, it } from 'vitest';
import { laneOf, nextPosition } from './lanes';
import { emptyWorkflow, workflowReducer } from './model';

it('maps node types to lanes', () => {
  expect(['input', 'task', 'workflow', 'output'].map((t) => laneOf(t as never))).toEqual([
    'inputs',
    'steps',
    'steps',
    'outputs',
  ]);
});

it('places steps left → right and inputs in a column', () => {
  const doc = workflowReducer(emptyWorkflow, { type: 'add', node: { name: 'a', type: 'workflow' } });
  expect(nextPosition(emptyWorkflow, 'workflow')).toEqual({ x: 40, y: 80 });
  expect(nextPosition(doc, 'workflow').x).toBeGreaterThan(40);
  expect(nextPosition(doc, 'input')).toEqual(nextPosition(emptyWorkflow, 'input'));
});
