/** Shared React Flow configuration for the editor and the Simulate view (no components here). */
import { MarkerType } from '@xyflow/react';
import { LANE_HEIGHT, LANES } from '@/workflow/lanes';
import { LaneNodeView, StepNodeView, type LaneNode } from './nodes';

export const laneId = (id: string) => `lane:${id}`;

export const nodeTypes = { lane: LaneNodeView, step: StepNodeView };

export const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { strokeWidth: 1.5 },
};

/** The lanes as fixed background nodes; the steps lane is titled with the workflow name. */
export function laneNodes(title: string, hints: Partial<Record<string, string>>): LaneNode[] {
  return LANES.map((lane) => ({
    id: laneId(lane.id),
    type: 'lane',
    position: { x: lane.x, y: 0 },
    width: lane.width,
    height: LANE_HEIGHT,
    data: {
      label: lane.id === 'steps' ? title : lane.label,
      hint: hints[lane.id],
      tone: lane.id === 'steps' ? 'steps' : 'io',
    },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    zIndex: -1,
  }));
}
