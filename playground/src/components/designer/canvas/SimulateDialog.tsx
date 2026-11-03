import { useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
} from '@mui/material';
import { ConnectionMode, ReactFlow, type Edge } from '@xyflow/react';
import { CopyIcon, DownloadIcon } from '@/assets';
import type { EngineRun } from '@/hooks/useWorkflowEngine';
import { downloadText } from '@/lib/download';
import { monoFontFamily } from '@/theme';
import { layeredPositions } from '@/workflow/layout';
import { NODE_SIZE } from '@/workflow/lanes';
import { defaultEdgeOptions, nodeTypes } from './flow';
import type { StepNode } from './nodes';

export const YAML_FILENAME = 'workflow.archive.yaml';

/**
 * "Simulate": what NOMAD will show once the YAML is uploaded with the files. Nothing is executed —
 * the engine (Python, in the browser) generates the archive, including its default inputs / outputs
 * (dashed), and the YAML itself.
 */
export function SimulateDialog({
  open,
  onClose,
  run,
}: {
  open: boolean;
  onClose: () => void;
  run: EngineRun | null;
}) {
  const [tab, setTab] = useState<'graph' | 'yaml'>('graph');
  const [copied, setCopied] = useState(false);
  const result = run?.result;
  const yaml = result?.ok ? result.yaml : null;
  const blocking = run?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = [
    ...(run?.issues.filter((i) => i.severity === 'warning').map((i) => i.message) ?? []),
    ...(result?.ok ? result.warnings : []),
  ];

  const graph = useMemo(() => {
    if (!result?.ok) return null;
    const pos = layeredPositions(
      result.nodes.map((n) => n.id),
      result.edges,
      { rankGap: NODE_SIZE + 90, nodeGap: NODE_SIZE + 24 },
    );
    const nodes: StepNode[] = result.nodes.map((n) => ({
      id: String(n.id),
      type: 'step',
      position: pos.get(n.id)!,
      data: {
        label: n.name ?? `#${n.id}`,
        kind: n.type ?? 'task',
        isDefault: n.default,
        readOnly: true,
        caption: [n.name, n.mainfile_path].filter(Boolean).join(' · '),
      },
      draggable: false,
      connectable: false,
    }));
    const edges: Edge[] = result.edges.map((e) => ({
      id: `${e.source}->${e.target}`,
      source: String(e.source),
      target: String(e.target),
      sourceHandle: 'right',
      targetHandle: 'left',
    }));
    return { nodes, edges };
  }, [result]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="simulate-title">
      <DialogTitle id="simulate-title">Simulate</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {blocking.length > 0 && (
            <Alert severity="error">
              <AlertTitle>Fix these first</AlertTitle>
              {blocking.map((i) => (
                <div key={i.message}>{i.message}</div>
              ))}
            </Alert>
          )}
          {result && !result.ok && (
            <Alert severity="error">
              <AlertTitle>The workflow engine reported a problem</AlertTitle>
              {result.errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Alert>
          )}
          {warnings.length > 0 && (
            <Alert severity="warning">
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </Alert>
          )}
          {graph && yaml && (
            <>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Simulation result">
                <Tab value="graph" label="Graph in NOMAD" />
                <Tab value="yaml" label={YAML_FILENAME} />
              </Tabs>
              {tab === 'graph' ? (
                <Box sx={{ height: '55vh', bgcolor: 'action.hover', borderRadius: 1 }}>
                  <ReactFlow
                    aria-label="Generated workflow graph"
                    nodes={graph.nodes}
                    edges={graph.edges}
                    nodeTypes={nodeTypes}
                    defaultEdgeOptions={defaultEdgeOptions}
                    // Every handle is a "source" (see nodes.tsx), so edges need loose mode to attach.
                    connectionMode={ConnectionMode.Loose}
                    nodesConnectable={false}
                    nodesDraggable={false}
                    fitView
                    proOptions={{ hideAttribution: true }}
                  />
                </Box>
              ) : (
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 2,
                    height: '55vh',
                    overflow: 'auto',
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontFamily: monoFontFamily,
                    fontSize: 'body2.fontSize',
                  }}
                >
                  {yaml}
                </Box>
              )}
              <Alert severity="info">
                Dashed nodes are the default inputs and outputs the engine adds. Upload {YAML_FILENAME}{' '}
                together with your files; no login or upload IDs are needed.
              </Alert>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button
          startIcon={<CopyIcon />}
          disabled={!yaml}
          onClick={() => yaml && void navigator.clipboard.writeText(yaml).then(() => setCopied(true))}
          onBlur={() => setCopied(false)}
        >
          {copied ? 'Copied' : 'Copy YAML'}
        </Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          disabled={!yaml}
          onClick={() => yaml && downloadText(yaml, YAML_FILENAME, 'application/x-yaml')}
        >
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}
