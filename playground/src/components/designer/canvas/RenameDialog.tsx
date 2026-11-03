import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import type { WfNode } from '@/workflow/model';

type Patch = Pick<WfNode, 'name' | 'sectionIndex'>;

/** Engine default first (as in the NOMAD docs); the value is passed through unchanged. */
const INDEX_OPTIONS = [
  { value: '', label: 'Last (-1, NOMAD default)' },
  { value: '0', label: 'First (0)' },
];

/**
 * Edit a node (double-click it, or the pencil in its toolbar): its name, and for inputs / outputs
 * which entry of the section list it references. The playground only passes these to the engine.
 */
export function RenameDialog({
  node,
  onClose,
  onRename,
}: {
  node: WfNode | null;
  onClose: () => void;
  onRename: (patch: Patch) => void;
}) {
  const [name, setName] = useState('');
  const [index, setIndex] = useState('');
  const [forId, setForId] = useState<number | null>(null);
  if (node && node.id !== forId) {
    setForId(node.id);
    setName(node.name);
    setIndex(node.sectionIndex === undefined ? '' : String(node.sectionIndex));
  }
  const save = () => {
    if (!name.trim()) return;
    onRename({ name: name.trim(), sectionIndex: index === '' ? undefined : Number(index) });
    onClose();
  };
  return (
    <Dialog
      open={node !== null}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ transition: { onExited: () => setForId(null) } }}
    >
      <DialogTitle>Edit node</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            helperText="Shown in the NOMAD workflow graph"
            autoFocus
            fullWidth
          />
          {node?.sectionType && (
            <TextField
              select
              label={`Section (${node.sectionType})`}
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              helperText={`Which ${node.sectionType} of the entry is referenced: run/0/${node.sectionType}/${index === '' ? '-1' : index}`}
              fullWidth
            >
              {INDEX_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={save}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
