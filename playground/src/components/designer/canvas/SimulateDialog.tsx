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
import { CopyIcon, DownloadIcon } from '@/assets';
import type { EngineRun } from '@/hooks/useWorkflowEngine';
import { downloadText } from '@/lib/download';
import { monoFontFamily } from '@/theme';
import { useWorkspace } from '@/workspace';
import { WorkflowCard } from './nomad/WorkflowCard';

export const YAML_FILENAME = 'workflow.archive.yaml';

/**
 * "Simulate": what NOMAD will show once the YAML is uploaded with the files. Nothing is executed —
 * the engine (Python, in the browser) generates the archive, and the "Workflow" tab shows it in
 * NOMAD's own workflow graph (ported from nomad-FAIR), clickable as on an entry page.
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
  const [tab, setTab] = useState<'workflow' | 'yaml'>('workflow');
  const { workspace } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const result = run?.result;
  const yaml = result?.ok ? result.yaml : null;
  const blocking = run?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = [
    ...(run?.issues.filter((i) => i.severity === 'warning').map((i) => i.message) ?? []),
    ...(result?.ok ? result.warnings : []),
  ];

  const files = useMemo(
    () => (workspace?.files ?? []).map((f) => ({ path: f.path, text: () => f.blob.text() })),
    [workspace],
  );

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
          {yaml && (
            <>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Simulation result">
                <Tab value="workflow" label="Workflow" />
                <Tab value="yaml" label={YAML_FILENAME} />
              </Tabs>
              {tab === 'workflow' ? (
                <WorkflowCard yaml={yaml} files={files} name={workspace?.name ?? 'workflow'} />
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
                Click a task to expand it, or a link between tasks to see how they connect, as on a NOMAD
                entry page. Entries NOMAD creates from your files (such as .log files) appear as placeholders
                until upload. Upload {YAML_FILENAME} together with your files; no login or upload IDs are
                needed.
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
