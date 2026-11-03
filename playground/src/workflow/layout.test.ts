import { expect, it } from 'vitest';
import { layeredPositions } from './layout';

const gaps = { rankGap: 100, nodeGap: 50 };

it('ranks by the longest path from a source', () => {
  const pos = layeredPositions(
    [0, 1, 2, 3],
    [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 0, target: 3 },
    ],
    gaps,
  );
  expect([0, 1, 2, 3].map((id) => pos.get(id)!.x)).toEqual([0, 100, 200, 300]);
});

it('keeps siblings aligned with their predecessors and survives cycles', () => {
  const pos = layeredPositions(
    [0, 1, 3, 2],
    [
      { source: 0, target: 2 },
      { source: 1, target: 3 },
    ],
    gaps,
  );
  expect([0, 1, 2, 3].map((id) => pos.get(id)!.y)).toEqual([-25, 25, -25, 25]);
  expect(
    layeredPositions(
      [0, 1],
      [
        { source: 0, target: 1 },
        { source: 1, target: 0 },
      ],
      gaps,
    ).size,
  ).toBe(2);
});
