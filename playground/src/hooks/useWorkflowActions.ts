import { useCallback } from 'react';
import { nextPosition } from '@/workflow/lanes';
import { isLikelyMainfile, suggestName } from '@/workflow/model';
import { useWorkspace } from '@/workspace';

/** The few ways to add nodes — each one click, sensible defaults, editable afterwards. */
export const IO_PRESETS = {
  'input-system': { name: 'Input system', type: 'input', sectionType: 'system' },
  'output-system': { name: 'Output system', type: 'output', sectionType: 'system' },
  'output-calculation': { name: 'Output calculation', type: 'output', sectionType: 'calculation' },
} as const;

export type IoPreset = keyof typeof IO_PRESETS;

export function useWorkflowActions() {
  const { workflow, dispatch } = useWorkspace();

  /** A workflow step from a mainfile: named after its folder, simulation defaults for known codes. */
  const addStep = useCallback(
    (mainfilePath: string) =>
      dispatch({
        type: 'add',
        node: {
          name: suggestName(mainfilePath),
          type: 'workflow',
          mainfilePath,
          ...(isLikelyMainfile(mainfilePath) && { entryType: 'simulation' as const }),
          position: nextPosition(workflow, 'workflow'),
        },
      }),
    [workflow, dispatch],
  );

  /** An input or output; its mainfile is inherited from the step it gets connected to. */
  const addIo = useCallback(
    (preset: IoPreset) => {
      const node = IO_PRESETS[preset];
      dispatch({ type: 'add', node: { ...node, position: nextPosition(workflow, node.type) } });
    },
    [workflow, dispatch],
  );

  const usedMainfiles = new Set(workflow.nodes.map((n) => n.mainfilePath).filter(Boolean));
  return { addStep, addIo, usedMainfiles };
}
