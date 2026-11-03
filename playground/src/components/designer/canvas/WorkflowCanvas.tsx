// React Flow's own stylesheet (library CSS, required by the package) — not custom styling.
// eslint-disable-next-line no-restricted-imports
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Box } from '@mui/material';
import {
  ConnectionMode,
  Controls,
  getViewportForBounds,
  ReactFlow,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import { CANVAS_BOUNDS, laneOf } from '@/workflow/lanes';
import { canConnect, type WfNode } from '@/workflow/model';
import { useWorkspace } from '@/workspace';
import { defaultEdgeOptions, laneId, laneNodes, nodeTypes } from './flow';
import type { StepNode } from './nodes';
import { RenameDialog } from './RenameDialog';

function caption(n: WfNode): string {
  const what = n.sectionType ?? n.archivePath ?? (n.entryType === 'simulation' ? 'simulation' : n.type);
  return [what, n.mainfilePath ?? 'mainfile from the connected step'].join(' · ');
}

/** Swap a connection drawn "backwards" (e.g. from an output to its step) into data-flow direction. */
function normalise(c: Connection, kinds: Map<string, string>): Connection {
  const backwards = kinds.get(c.source) === 'output' || kinds.get(c.target) === 'input';
  return backwards ? { ...c, source: c.target, target: c.source } : c;
}

const FIT_PADDING = 0.04;
const MAX_ZOOM = 2;
/** Panning stays around the lanes (a margin so nodes at the edge are reachable when zoomed in). */
const TRANSLATE_EXTENT: [[number, number], [number, number]] = [
  [CANVAS_BOUNDS.x - 40, CANVAS_BOUNDS.y - 40],
  [CANVAS_BOUNDS.x + CANVAS_BOUNDS.width + 40, CANVAS_BOUNDS.y + CANVAS_BOUNDS.height + 40],
];

/**
 * Zooming out stops at "fit to screen" (wheel, pinch and the − button alike): the minimum zoom is
 * the zoom at which all lanes fit the current canvas size, recomputed when the canvas is resized.
 */
function FitZoomFloor({ setFloor }: { setFloor: Dispatch<SetStateAction<number>> }) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const { fitView, getZoom } = useReactFlow();
  useEffect(() => {
    if (!width || !height) return;
    const { zoom } = getViewportForBounds(CANVAS_BOUNDS, width, height, 0.01, MAX_ZOOM, FIT_PADDING);
    setFloor(zoom);
    if (getZoom() < zoom) void fitView({ padding: FIT_PADDING });
  }, [width, height, setFloor, fitView, getZoom]);
  return null;
}

/**
 * The editable workflow: React Flow does dragging, connecting (any side of a node, drag or
 * click-click), selection, Delete-key removal, zoom and pan. Our reducer stays the source of
 * truth; React Flow only holds transient drag state.
 */
export function WorkflowCanvas() {
  const { workspace, workflow, dispatch } = useWorkspace();
  const [renaming, setRenaming] = useState<WfNode | null>(null);
  const [minZoom, setMinZoom] = useState(0.3);
  const kinds = useMemo(() => new Map(workflow.nodes.map((n) => [String(n.id), n.type])), [workflow.nodes]);

  const derived = useMemo<Node[]>(() => {
    const counts: Record<string, number> = { inputs: 0, steps: 0, outputs: 0 };
    workflow.nodes.forEach((n) => (counts[laneOf(n.type)] = (counts[laneOf(n.type)] ?? 0) + 1));
    const lanes = laneNodes(workspace?.name ?? 'Workflow', {
      steps: counts.steps
        ? undefined
        : 'Press + next to a mainfile in the files panel to add a workflow step.',
      inputs: counts.inputs ? undefined : 'Add nodes → Input system',
      outputs: counts.outputs ? undefined : 'Add nodes → Output',
    });
    const steps: StepNode[] = workflow.nodes.map((n) => ({
      id: String(n.id),
      type: 'step',
      parentId: laneId(laneOf(n.type)),
      extent: 'parent',
      position: n.position ?? { x: 20, y: 60 },
      data: {
        label: n.name,
        kind: n.type,
        caption: `${n.name} · ${caption(n)}`,
        onRename: () => setRenaming(n),
        onRemove: () => dispatch({ type: 'remove', id: n.id }),
      },
    }));
    return [...lanes, ...steps];
  }, [workflow.nodes, workspace?.name, dispatch]);

  // Mirror the reducer into React Flow's node state, keeping the user's current selection.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived);
  useEffect(() => {
    setNodes((current) => {
      const selected = new Set(current.filter((n) => n.selected).map((n) => n.id));
      return derived.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n));
    });
  }, [derived, setNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((e) => ({
        id: `${e.source}->${e.target}`,
        source: String(e.source),
        target: String(e.target),
        // Data flows left → right: leave a node on its right arrow, enter the next on its left one.
        sourceHandle: 'right',
        targetHandle: 'left',
      })),
    [workflow.edges],
  );

  return (
    <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 360 }}>
      <ReactFlow
        aria-label="Workflow canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        isValidConnection={(c) => {
          const { source, target } = normalise(c as Connection, kinds);
          return canConnect(workflow, Number(source), Number(target));
        }}
        onConnect={(c) => {
          const { source, target } = normalise(c, kinds);
          dispatch({ type: 'connect', source: Number(source), target: Number(target) });
        }}
        onNodeDragStop={(_, node) => dispatch({ type: 'move', id: Number(node.id), position: node.position })}
        onNodeDoubleClick={(_, node) => {
          const n = workflow.nodes.find((w) => String(w.id) === node.id);
          if (n) setRenaming(n);
        }}
        onNodesDelete={(deleted) =>
          deleted
            .filter((n) => n.type === 'step')
            .forEach((n) => dispatch({ type: 'remove', id: Number(n.id) }))
        }
        onEdgesDelete={(deleted) =>
          deleted.forEach((e) =>
            dispatch({ type: 'disconnect', source: Number(e.source), target: Number(e.target) }),
          )
        }
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={minZoom}
        maxZoom={MAX_ZOOM}
        translateExtent={TRANSLATE_EXTENT}
        proOptions={{ hideAttribution: true }}
      >
        <FitZoomFloor setFloor={setMinZoom} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <RenameDialog
        node={renaming}
        onClose={() => setRenaming(null)}
        onRename={(patch) => renaming && dispatch({ type: 'update', id: renaming.id, patch })}
      />
    </Box>
  );
}
