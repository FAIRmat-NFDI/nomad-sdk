import { lazy, Suspense, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { AddIcon, CheckIcon, DownloadIcon, LoginIcon, OpenFilesIcon } from '@/assets';
import { EmptyState, PanelHeader } from '@/components/common';
import { useWorkflowActions, type IoPreset } from '@/hooks/useWorkflowActions';
import { useWorkflowEngine } from '@/hooks/useWorkflowEngine';
import { downloadText } from '@/lib/download';
import type { EngineStatus } from '@/runtime/workflowEngine';
import { useWorkspace } from '@/workspace';
import { SimulateDialog, YAML_FILENAME } from './canvas/SimulateDialog';

// React Flow loads with the canvas, not with the app shell (as the taxonomy app does for its graph).
const WorkflowCanvas = lazy(() =>
  import('./canvas/WorkflowCanvas').then((m) => ({ default: m.WorkflowCanvas })),
);

const ADD_MENU: { preset: IoPreset; label: string; hint: string }[] = [
  { preset: 'input-system', label: 'Input system', hint: 'Starting structure of the first step' },
  { preset: 'output-system', label: 'Output system', hint: 'Final structure of the last step' },
  {
    preset: 'output-calculation',
    label: 'Output calculation',
    hint: 'Final energies, forces, … of the last step',
  },
];

function statusText(status: EngineStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Python (WebAssembly) loads on first use';
    case 'loading':
      return `Python: ${status.step.toLowerCase()}`;
    case 'ready':
      return 'Python ready · everything runs in your browser';
    case 'error':
      return `Python failed to load: ${status.message}`;
  }
}

/**
 * The workflow designer, as in the design:
 *   [+ Add nodes]                                   [Simulate ✓]
 *   inputs | workflow steps (named after the workflow) | outputs
 *   status                             [Login and load] [Generate YAML ↓]
 */
export function WorkflowPanel() {
  const { workspace, workflow, openDialog } = useWorkspace();
  const { addIo } = useWorkflowActions();
  const { status, generate, running, run } = useWorkflowEngine();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const loaded = workspace !== null;
  const hasNodes = workflow.nodes.length > 0;

  const simulate = async () => {
    await generate();
    setSimulateOpen(true);
  };
  const generateYaml = async () => {
    const done = await generate();
    if (done?.result?.ok) {
      downloadText(done.result.yaml, YAML_FILENAME, 'application/x-yaml');
      setSaved(true);
    } else {
      setSimulateOpen(true); // show what needs fixing
    }
  };

  return (
    <>
      <PanelHeader
        title={workspace?.name ?? 'No workflow yet'}
        subtitle={
          loaded
            ? `${workflow.nodes.length} nodes · ${workflow.edges.length} connections · drag the arrows to connect`
            : 'Select files to start'
        }
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              disabled={!loaded}
              onClick={(e) => setMenu(e.currentTarget)}
              aria-haspopup="menu"
            >
              Add nodes
            </Button>
            <Button
              variant="contained"
              endIcon={running ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
              disabled={!hasNodes || running}
              onClick={() => void simulate()}
            >
              Simulate
            </Button>
          </Stack>
        }
      />
      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        {ADD_MENU.map((item) => (
          <MenuItem
            key={item.preset}
            onClick={() => {
              addIo(item.preset);
              setMenu(null);
            }}
          >
            <ListItemText primary={item.label} secondary={item.hint} />
          </MenuItem>
        ))}
        <MenuItem disabled>
          <ListItemText primary="Workflow step" secondary="Use + next to a mainfile in the files panel" />
        </MenuItem>
      </Menu>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', px: 2 }}>
        {loaded ? (
          <Suspense fallback={<CircularProgress sx={{ m: 'auto' }} aria-label="Loading canvas" />}>
            <WorkflowCanvas />
          </Suspense>
        ) : (
          <Box sx={{ m: 'auto' }}>
            <EmptyState
              icon={<OpenFilesIcon />}
              title="Start with your files"
              description="Open the folder that holds the simulation files of your workflow. Nothing is uploaded."
              action={
                <Button variant="contained" endIcon={<OpenFilesIcon />} onClick={openDialog}>
                  Select folder
                </Button>
              }
            />
          </Box>
        )}
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, flexShrink: 0, p: 2 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexGrow: 1, minWidth: 0 }}>
          {loaded && status.state === 'loading' && <CircularProgress size={14} />}
          <Typography
            variant="caption"
            color={status.state === 'error' ? 'error' : 'text.secondary'}
            noWrap
            role="status"
          >
            {loaded ? statusText(status) : ''}
          </Typography>
        </Stack>
        <Button variant="outlined" startIcon={<LoginIcon />} disabled>
          Login and load
        </Button>
        <Button
          variant="contained"
          endIcon={<DownloadIcon />}
          disabled={!hasNodes || running}
          onClick={() => void generateYaml()}
        >
          Generate YAML
        </Button>
      </Stack>

      <SimulateDialog open={simulateOpen} onClose={() => setSimulateOpen(false)} run={run} />
      <Snackbar
        open={saved}
        autoHideDuration={4000}
        onClose={() => setSaved(false)}
        message={`${YAML_FILENAME} saved — upload it together with your files`}
      />
    </>
  );
}
