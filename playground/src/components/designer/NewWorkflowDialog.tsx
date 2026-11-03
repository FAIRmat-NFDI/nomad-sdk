import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Link,
  Stack,
  TextField,
} from '@mui/material';
import { OpenFilesIcon } from '@/assets';
import { expandZips, formatBytes, stripRootFolder, useWorkspace, type LocalFile } from '@/workspace';
import { FileDropZone } from './FileDropZone';

/**
 * "New workflow": a name and a set of local files (folder, files or .zip).
 * Standard MUI Dialog (dimmed backdrop, focus trap, Esc to close). Everything stays client-side.
 */
export function NewWorkflowDialog() {
  const { dialogOpen, closeDialog, load } = useWorkspace();
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [root, setRoot] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setNameEdited(false);
    setFiles([]);
    setRoot(null);
    setError(null);
  };

  const onSelect = async (selection: Promise<LocalFile[]>) => {
    setReading(true);
    setError(null);
    try {
      const expanded = await expandZips(await selection);
      if (!expanded.length) throw new Error('The selection contains no files.');
      const relative = stripRootFolder(expanded);
      setFiles(relative.files);
      setRoot(relative.root);
      if (!nameEdited) setName(relative.root ?? '');
    } catch (err) {
      setFiles([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  };

  const canOpen = name.trim() !== '' && files.length > 0 && !reading;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Dialog
      open={dialogOpen}
      onClose={closeDialog}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onExited: reset } }}
      aria-labelledby="new-workflow-title"
    >
      <DialogTitle id="new-workflow-title">New workflow</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            placeholder="e.g. Equilibration procedure"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
            required
            fullWidth
            autoFocus
          />
          <FileDropZone onSelect={onSelect} disabled={reading} />
          {reading && <LinearProgress aria-label="Reading files" />}
          {error && <Alert severity="error">{error}</Alert>}
          {files.length > 0 && !reading && (
            <Alert
              severity="success"
              action={
                <Link component="button" type="button" onClick={() => setFiles([])}>
                  Clear
                </Link>
              }
            >
              {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
              {root && ` · paths relative to ${root}/`}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button
          variant="contained"
          endIcon={<OpenFilesIcon />}
          disabled={!canOpen}
          onClick={() => load({ name: name.trim(), files, root })}
        >
          Open
        </Button>
      </DialogActions>
    </Dialog>
  );
}
