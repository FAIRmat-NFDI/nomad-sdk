/*
 * Workflow card — port of the toolbar of NOMAD's WorkflowCard (nomad-FAIR,
 * gui/src/components/entry/properties/WorkflowCard.js) with MUI v9 components.
 *
 * Copyright The NOMAD Authors. Licensed under the Apache License, Version 2.0
 * (http://www.apache.org/licenses/LICENSE-2.0). Modified for nomad-sdk: data from the
 * generated YAML + local files; download of the graph as SVG added.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, IconButton, InputAdornment, Stack, TextField, Tooltip } from '@mui/material';
import {
  BackIcon,
  CloseIcon,
  DownloadIcon,
  ForceStartIcon,
  ForceStopIcon,
  LegendHideIcon,
  LegendShowIcon,
  ResetIcon,
} from '@/assets';
import { downloadText } from '@/lib/download';
import { localArchiveSource, rootArchive, type ArchiveFile } from '@/workflow/nomad/localArchives';
import type { GNode, Query } from '@/workflow/nomad/model';
import { WorkflowGraph, type GraphControls } from './WorkflowGraph';

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <IconButton aria-label={title} onClick={onClick}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

/** nomad-sdk addition: save the graph as it is shown. */
function download(svg: SVGSVGElement | null, name: string) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  downloadText(new XMLSerializer().serializeToString(clone), `${name || 'workflow'}.svg`, 'image/svg+xml');
}

interface WorkflowCardProps {
  /** The generated workflow.archive.yaml. */
  yaml: string;
  /** The opened files; referenced *.archive.yaml files are read to expand nested workflows. */
  files: ArchiveFile[];
  /** Used for the SVG file name. */
  name: string;
}

/** NOMAD's "Workflow Graph" card, on the workflow you are building (before upload). */
export function WorkflowCard({ yaml, files, name }: WorkflowCardProps) {
  const [showLegend, setShowLegend] = useState(false);
  const [enableForce, setEnableForce] = useState(false);
  const [currentNode, setCurrentNode] = useState<GNode | null>({ type: 'tasks' });
  const [inputValue, setInputValue] = useState('');
  const [graphError, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const controls = useRef<GraphControls>({});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  // NOMAD sizes the graph to its container (#container); here a ResizeObserver does it.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const query = useMemo<Query>(
    () => ({ source: localArchiveSource(files), sectionKeys: ['inputs', 'tasks', 'outputs'], maxNodes: 6 }),
    [files],
  );
  const { source, parseError } = useMemo<{ source: GNode | null; parseError: string | null }>(() => {
    try {
      return { source: { path: '/workflow2', archive: rootArchive(yaml) }, parseError: null };
    } catch (err) {
      return { source: null, parseError: String(err) };
    }
  }, [yaml]);
  const error = parseError ?? graphError;
  const onError = useCallback(
    (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    [],
  );

  let nodeType = 'tasks';
  let nodesCount = 0;
  if (currentNode) {
    nodeType = currentNode.type || 'tasks';
    let sourceNode = currentNode;
    if (['inputs', 'outputs'].includes(nodeType)) sourceNode = currentNode.parent || currentNode;
    const nodes = sourceNode.nodes ? sourceNode.nodes.filter((n) => n.type === nodeType) : [];
    if (nodes.length) nodesCount = nodes[0]!.total ?? 0;
  }
  let label = `No ${nodeType.slice(0, -1)} to show`;
  if (nodesCount) label = `Filter ${nodeType} to show`;

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <TextField
          fullWidth
          size="small"
          error={!currentNode}
          label={currentNode ? label : 'Invalid input'}
          disabled={!nodesCount || !currentNode}
          placeholder="Enter range: 5, 4:-1, :50%"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && inputValue) controls.current.filter?.(inputValue);
          }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="Clear the filter"
                    onClick={() => {
                      setInputValue('');
                      controls.current.clearFilter?.();
                    }}
                    edge="end"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <ToolbarButton
          title={`${enableForce ? 'Disable' : 'Enable'} force simulation`}
          onClick={() => controls.current.toggleForce?.()}
        >
          {enableForce ? <ForceStopIcon /> : <ForceStartIcon />}
        </ToolbarButton>
        <ToolbarButton
          title={showLegend ? 'Hide legend' : 'Show legend'}
          onClick={() => controls.current.toggleLegend?.()}
        >
          {showLegend ? <LegendHideIcon /> : <LegendShowIcon />}
        </ToolbarButton>
        <ToolbarButton title="Back" onClick={() => controls.current.back?.()}>
          <BackIcon />
        </ToolbarButton>
        <ToolbarButton title="Reset" onClick={() => controls.current.reset?.()}>
          <ResetIcon />
        </ToolbarButton>
        <ToolbarButton title="Download as SVG" onClick={() => download(svgRef.current, name)}>
          <DownloadIcon />
        </ToolbarButton>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Box ref={container} sx={{ width: '100%', overflow: 'hidden' }}>
        {source && (
          <WorkflowGraph
            source={source}
            query={query}
            width={width}
            controls={controls}
            svgRef={svgRef}
            setCurrentNode={setCurrentNode}
            setShowLegend={setShowLegend}
            setEnableForce={setEnableForce}
            onError={onError}
          />
        )}
      </Box>
    </Stack>
  );
}
