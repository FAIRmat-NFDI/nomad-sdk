import { use, useMemo, useState } from 'react';
import { InputAdornment, TextField } from '@mui/material';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { useNavigate, useParams } from 'react-router';
import { SearchIcon, TreeCollapsedIcon, TreeExpandedIcon } from '@/assets';
import { PanelBody, PanelHeader } from '@/components/common';
import { loadReference } from '@/reference/load';
import { ancestors, indexReference, referenceTree, type TreeNode } from '@/reference/lookup';
import { symbolHref } from './context';

const allIds = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((n) => (n.children ? [n.id, ...allIds(n.children)] : []));

/** Left navigation: packages → classes → members, with a filter (as on Microsoft Learn). */
export function ReferenceNav() {
  const { reference } = use(loadReference());
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const index = useMemo(() => indexReference(reference), [reference]);
  const tree = useMemo(() => referenceTree(reference, query), [reference, query]);
  const [expanded, setExpanded] = useState<string[]>(() =>
    symbol ? ancestors(symbol, index) : reference.packages.map((p) => p.path),
  );

  return (
    <>
      <PanelHeader title="nomad-sdk" subtitle="Python API reference" />
      <PanelBody dense>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': 'Filter the API reference' },
          }}
          sx={{ px: 1, pb: 1 }}
        />
        <RichTreeView
          aria-label="API reference"
          items={tree}
          expandedItems={query ? allIds(tree) : expanded}
          onExpandedItemsChange={(_, ids) => !query && setExpanded(ids)}
          selectedItems={symbol ?? null}
          onItemClick={(_, id) => navigate(symbolHref(id))}
          itemChildrenIndentation={12}
          slots={{ expandIcon: TreeCollapsedIcon, collapseIcon: TreeExpandedIcon }}
        />
      </PanelBody>
    </>
  );
}
