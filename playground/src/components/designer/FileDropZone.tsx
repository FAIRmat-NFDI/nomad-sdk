import { useRef, useState, type DragEvent } from 'react';
import { Link, Paper, Stack, Typography } from '@mui/material';
import { OpenFilesIcon } from '@/assets';
import { fromDataTransfer, fromFileList, type LocalFile } from '@/workspace';

interface FileDropZoneProps {
  /** Receives the raw selection; zips are expanded by the caller. */
  onSelect: (files: Promise<LocalFile[]>) => void;
  disabled?: boolean;
}

/**
 * Drop area + two pickers (a folder, or files / .zip). Built from MUI parts only:
 * an outlined Paper, Links that trigger hidden native inputs, Typography.
 * Files are read locally; nothing is uploaded.
 */
export function FileDropZone({ onSelect, disabled = false }: FileDropZoneProps) {
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) onSelect(fromDataTransfer(e.dataTransfer)); // read synchronously, inside the event
  };
  const pick = (input: HTMLInputElement | null) => {
    if (!input?.files?.length) return;
    onSelect(Promise.resolve(fromFileList(input.files)));
    input.value = ''; // allow choosing the same folder again
  };

  return (
    <Paper
      variant="outlined"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      sx={{
        borderStyle: 'dashed',
        borderColor: dragging ? 'primary.main' : undefined,
        bgcolor: dragging ? 'action.selected' : undefined,
        px: 3,
        py: 5,
      }}
    >
      <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <OpenFilesIcon color="primary" fontSize="large" />
        <Typography>
          <Link
            component="button"
            type="button"
            disabled={disabled}
            onClick={() => folderInput.current?.click()}
          >
            Choose a folder
          </Link>
          {', '}
          <Link
            component="button"
            type="button"
            disabled={disabled}
            onClick={() => filesInput.current?.click()}
          >
            files or a .zip
          </Link>
          , or drag and drop them here
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Files stay on this computer. Archives are unpacked in the browser.
        </Typography>
      </Stack>
      <input
        ref={(el) => {
          folderInput.current = el;
          el?.setAttribute('webkitdirectory', ''); // not in React's typings
        }}
        type="file"
        hidden
        multiple
        onChange={(e) => pick(e.currentTarget)}
      />
      <input ref={filesInput} type="file" hidden multiple onChange={(e) => pick(e.currentTarget)} />
    </Paper>
  );
}
