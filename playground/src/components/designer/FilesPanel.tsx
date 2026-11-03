import { forwardRef, useMemo } from 'react';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { TreeItem, type TreeItemProps } from '@mui/x-tree-view/TreeItem';
import { AddIcon, CheckIcon, LoginIcon, OpenFilesIcon, TreeCollapsedIcon, TreeExpandedIcon } from '@/assets';
import { PanelBody, PanelHeader } from '@/components/common';
import { useWorkflowActions } from '@/hooks/useWorkflowActions';
import { isLikelyMainfile } from '@/workflow/model';
import { buildFileTree, folderIds, formatBytes, useWorkspace } from '@/workspace';

/** The two ways to start: local files (now) or files from NOMAD (needs login, later). */
function OpenActions() {
  const { openDialog } = useWorkspace();
  return (
    <Stack spacing={1.5} sx={{ px: 1, pt: 1 }}>
      <Button variant="contained" size="large" endIcon={<OpenFilesIcon />} onClick={openDialog} fullWidth>
        Select folder
      </Button>
      <Tooltip title="Coming soon: sign in to NOMAD and pick files from your uploads">
        {/* span: tooltips need an enabled wrapper around a disabled button */}
        <span>
          <Button variant="outlined" size="large" endIcon={<LoginIcon />} disabled fullWidth>
            Login and select
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );
}

/** Tree item with a "+" for files (adds a workflow step), a check once the file is used. */
const FileTreeItem = forwardRef<HTMLLIElement, TreeItemProps>(function FileTreeItem(props, ref) {
  const { addStep, usedMainfiles } = useWorkflowActions();
  const path = props.itemId;
  const isFile = !path.endsWith('/');
  const used = usedMainfiles.has(path);
  return (
    <TreeItem
      {...props}
      ref={ref}
      label={
        <Stack direction="row" sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography
            variant="body2"
            noWrap
            sx={{
              flexGrow: 1,
              fontWeight: isFile && isLikelyMainfile(path) ? 'fontWeightMedium' : undefined,
            }}
          >
            {props.label}
          </Typography>
          {isFile &&
            (used ? (
              <Tooltip title="In the workflow">
                <CheckIcon fontSize="small" color="success" sx={{ m: 0.75 }} />
              </Tooltip>
            ) : (
              <Tooltip title="Add as workflow step">
                <IconButton
                  size="small"
                  aria-label={`Add ${path} as workflow step`}
                  onClick={(e) => {
                    e.stopPropagation();
                    addStep(path);
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ))}
        </Stack>
      }
    />
  );
});

/** Column 1 (also in the mobile nav drawer): how to load files, then the loaded files as a tree. */
export function FilesPanel() {
  const { workspace, openDialog } = useWorkspace();
  const tree = useMemo(() => (workspace ? buildFileTree(workspace.files) : []), [workspace]);

  if (!workspace) {
    return (
      <>
        <PanelHeader title="Select the files" subtitle="Open a folder, files or a .zip from this computer" />
        <PanelBody dense>
          <OpenActions />
        </PanelBody>
      </>
    );
  }

  const size = workspace.files.reduce((sum, f) => sum + f.size, 0);
  return (
    <>
      <PanelHeader
        title="Files available"
        subtitle={`${workspace.root ? `${workspace.root}/ · ` : ''}${workspace.files.length} files · ${formatBytes(size)} · local only`}
        actions={
          <Tooltip title="Open other files">
            <IconButton aria-label="Open other files" onClick={openDialog}>
              <OpenFilesIcon />
            </IconButton>
          </Tooltip>
        }
      />
      <PanelBody dense>
        {/* key: remount with all folders expanded when another workspace is loaded */}
        <RichTreeView
          key={workspace.name + workspace.files.length}
          aria-label="Files"
          items={tree}
          defaultExpandedItems={folderIds(tree)}
          itemChildrenIndentation={12}
          disableSelection
          slots={{ item: FileTreeItem, expandIcon: TreeCollapsedIcon, collapseIcon: TreeExpandedIcon }}
        />
        <Box sx={{ px: 1, pt: 2 }}>
          <Typography variant="caption" color="text.secondary" component="p">
            Press + on a mainfile to add it as a workflow step. Likely mainfiles are in bold.
          </Typography>
        </Box>
      </PanelBody>
    </>
  );
}
