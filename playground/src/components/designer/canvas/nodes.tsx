import { useState } from 'react';
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react';
import { ConnectIcon, DeleteIcon, EditIcon } from '@/assets';
import { NODE_SIZE } from '@/workflow/lanes';

/**
 * React Flow node types for the workflow canvas, drawn with MUI components.
 *  - lane: one of the three background areas (inputs | workflow steps | outputs)
 *  - step: a workflow node; four connection handles (shown as arrows when hovered / selected,
 *          as in the design) and a NodeToolbar with rename / remove when selected
 */

export type LaneNode = Node<{ label: string; hint?: string; tone: 'steps' | 'io' }, 'lane'>;

export function LaneNodeView({ data, width, height }: NodeProps<LaneNode>) {
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: 1,
        bgcolor: data.tone === 'steps' ? 'action.selected' : 'action.hover',
        position: 'relative',
      }}
    >
      <Typography
        variant={data.tone === 'steps' ? 'h6' : 'overline'}
        color={data.tone === 'steps' ? 'primary' : 'text.secondary'}
        component="div"
        sx={{ px: 2, pt: 1 }}
        noWrap
      >
        {data.label}
      </Typography>
      {data.hint && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            px: 4,
            textAlign: 'center',
          }}
        >
          {data.hint}
        </Typography>
      )}
    </Box>
  );
}

export type StepNode = Node<
  {
    label: string;
    kind: string;
    caption?: string;
    /** Added by the engine (Simulate view): faded. */
    isDefault?: boolean;
    readOnly?: boolean;
    onRename?: () => void;
    onRemove?: () => void;
  },
  'step'
>;

/** One handle per side, a little outside the circle (like the arrows in the design). */
const SIDES = [
  { position: Position.Top, rotate: -90, offset: { top: -14 } },
  { position: Position.Right, rotate: 0, offset: { right: -14 } },
  { position: Position.Bottom, rotate: 90, offset: { bottom: -14 } },
  { position: Position.Left, rotate: 180, offset: { left: -14 } },
] as const;

export function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const [hover, setHover] = useState(false);
  const io = data.kind === 'input' || data.kind === 'output';
  const showArrows = !data.readOnly && (selected || hover);

  return (
    <Box onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {!data.readOnly && (
        <NodeToolbar position={Position.Bottom} offset={28}>
          <Paper variant="elevation" elevation={2} sx={{ display: 'flex', borderRadius: 2 }}>
            <Tooltip title="Rename">
              <IconButton size="small" aria-label={`Rename ${data.label}`} onClick={data.onRename}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove (Delete key)">
              <IconButton size="small" aria-label={`Remove ${data.label}`} onClick={data.onRemove}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Paper>
        </NodeToolbar>
      )}
      <Tooltip title={data.caption ?? ''} placement="top" disableInteractive>
        <Stack
          sx={{
            width: NODE_SIZE,
            height: NODE_SIZE,
            borderRadius: '50%',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: 1,
            border: 1.5,
            borderStyle: data.isDefault ? 'dashed' : 'solid',
            borderColor: io ? 'primary.dark' : 'primary.main',
            bgcolor: io ? (data.isDefault ? 'background.paper' : 'primary.dark') : 'grey.200',
            color: io && !data.isDefault ? 'primary.contrastText' : 'primary.dark',
            opacity: data.isDefault ? 0.75 : 1,
            boxShadow: selected ? 4 : 0,
          }}
        >
          {/* Long names: hyphenated, at most four lines; the full name is in the tooltip. */}
          <Typography
            variant="caption"
            lang="en"
            sx={{
              lineHeight: 1.15,
              hyphens: 'auto',
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: data.isDefault ? 3 : 4,
              overflow: 'hidden',
            }}
          >
            {data.label}
          </Typography>
        </Stack>
      </Tooltip>
      {/* Any side can start or end a connection (ConnectionMode.Loose); arrows only show the affordance. */}
      {SIDES.map(({ position, rotate, offset }) => (
        <Handle
          key={position}
          id={position}
          type="source"
          position={position}
          isConnectable={!data.readOnly}
          style={{ width: 22, height: 22, background: 'transparent', border: 0, ...offset }}
        >
          {showArrows && (
            <ConnectIcon
              color="primary"
              sx={{ fontSize: 22, transform: `rotate(${rotate}deg)`, pointerEvents: 'none' }}
            />
          )}
        </Handle>
      ))}
    </Box>
  );
}
