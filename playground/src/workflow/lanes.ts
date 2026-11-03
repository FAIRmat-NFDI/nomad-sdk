/**
 * Canvas geometry: three lanes, as in the design — inputs | workflow steps | outputs.
 * A node lives in the lane of its type and is placed automatically when added.
 * Plain TypeScript (no UI); positions are relative to the lane.
 */
import type { NodeType, WorkflowDoc } from './model';

export type LaneId = 'inputs' | 'steps' | 'outputs';

export const NODE_SIZE = 96;
export const LANE_HEIGHT = 620;

export const LANES: { id: LaneId; label: string; x: number; width: number }[] = [
  { id: 'inputs', label: 'Inputs', x: 0, width: 190 },
  { id: 'steps', label: 'Workflow', x: 230, width: 660 },
  { id: 'outputs', label: 'Outputs', x: 930, width: 190 },
];

/** The whole canvas (all three lanes): the zoom-out limit and pan area. */
export const CANVAS_BOUNDS = {
  x: 0,
  y: 0,
  width: LANES[LANES.length - 1]!.x + LANES[LANES.length - 1]!.width,
  height: LANE_HEIGHT,
};

export function laneOf(type: NodeType): LaneId {
  if (type === 'input') return 'inputs';
  if (type === 'output') return 'outputs';
  return 'steps';
}

const STEP_GAP_X = 140;
const STEP_GAP_Y = 150;
const STEPS_PER_ROW = 5;

/** Where the next node of `type` goes: a column for inputs / outputs, rows of steps left → right. */
export function nextPosition(doc: WorkflowDoc, type: NodeType): { x: number; y: number } {
  const lane = laneOf(type);
  const k = doc.nodes.filter((n) => laneOf(n.type) === lane).length;
  if (lane === 'steps') {
    return { x: 40 + (k % STEPS_PER_ROW) * STEP_GAP_X, y: 80 + Math.floor(k / STEPS_PER_ROW) * STEP_GAP_Y };
  }
  const width = LANES.find((l) => l.id === lane)!.width;
  return { x: (width - NODE_SIZE) / 2, y: 60 + (k % 5) * (NODE_SIZE + 30) };
}
