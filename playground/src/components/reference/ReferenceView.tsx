import { use, useEffect, useMemo, type ReactNode } from 'react';
import {
  Box,
  Breadcrumbs,
  Chip,
  Divider,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { EmptyState, PanelBody, SectionCard } from '@/components/common';
import { paths } from '@/routes/paths';
import { formatSignature, summary } from '@/reference/docstring';
import { examplesFor, loadReference } from '@/reference/load';
import { indexReference, type Found } from '@/reference/lookup';
import type {
  AttributeDoc,
  ClassDoc,
  FunctionDoc,
  ItemDoc,
  ModuleDoc,
  ParamDoc,
  TypedDoc,
} from '@/reference/types';
import { CodeBlock } from './CodeBlock';
import { RefContext, symbolHref } from './context';
import { DocText, InlineCode, InlineText, TypeText } from './DocText';

const KIND_LABEL: Record<string, string> = {
  module: 'Package',
  class: 'Class',
  exception: 'Exception',
  function: 'Function',
  property: 'Property',
  attribute: 'Attribute',
};

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <Box component="section" id={id} sx={{ display: 'grid', gap: 1.5, scrollMarginTop: 16 }}>
      <Typography variant="h6" component="h3">
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {head.map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((cells, i) => (
            <TableRow key={i}>
              {cells.map((c, j) => (
                <TableCell key={j} sx={{ verticalAlign: 'top' }}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ParamTables({ params }: { params: ParamDoc[] }) {
  const groups = [
    { title: 'Parameters', items: params.filter((p) => p.kind !== 'keyword-only') },
    { title: 'Keyword-only parameters', items: params.filter((p) => p.kind === 'keyword-only') },
  ];
  return groups
    .filter((g) => g.items.length)
    .map((g) => (
      <Section key={g.title} title={g.title}>
        <SimpleTable
          head={['Name', 'Type', 'Default', 'Description']}
          rows={g.items.map((p) => [
            <InlineCode key="n">{(p.kind === 'variadic keyword' ? '**' : '') + p.name}</InlineCode>,
            <TypeText key="t" type={p.type} />,
            p.default ? <InlineCode key="d">{p.default}</InlineCode> : <Typography key="d">—</Typography>,
            <InlineText key="x" text={p.description} />,
          ])}
        />
      </Section>
    ));
}

function TypedTable({ title, items, typeHead }: { title: string; items: TypedDoc[]; typeHead: string }) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <SimpleTable
        head={[typeHead, 'Description']}
        rows={items.map((r) => [
          <TypeText key="t" type={r.type} />,
          <InlineText key="d" text={r.description} />,
        ])}
      />
    </Section>
  );
}

const anchor = (path: string) => path.replace(/\./g, '-');

function MemberSummary({ title, members }: { title: string; members: (FunctionDoc | AttributeDoc)[] }) {
  if (!members.length) return null;
  return (
    <Section title={title}>
      <SimpleTable
        head={['Name', 'Summary']}
        rows={members.map((m) => [
          <Link key="n" component={RouterLink} to={symbolHref(m.path)} underline="hover">
            <InlineCode>{m.name}</InlineCode>
          </Link>,
          <InlineText key="s" text={summary(m.description)} />,
        ])}
      />
    </Section>
  );
}

function FunctionBody({ fn, owner }: { fn: FunctionDoc; owner?: ClassDoc }) {
  const head = fn.kind === 'property' ? `property ${fn.name}` : `def ${fn.signature}`;
  const returns = fn.returns_type && fn.kind !== 'property' ? ` -> ${fn.returns_type}` : '';
  const type = fn.kind === 'property' && fn.returns_type ? `: ${fn.returns_type}` : '';
  const returnRows = fn.returns.length
    ? fn.returns.map((r) => ({ ...r, type: r.type ?? fn.returns_type }))
    : fn.returns_type && fn.returns_type !== 'None' && fn.kind !== 'property'
      ? [{ type: fn.returns_type, description: '' }]
      : [];
  return (
    <Stack spacing={2}>
      <CodeBlock code={formatSignature(`${head}${returns}${type}`)} />
      <DocText text={fn.description || (owner ? '' : 'No description.')} />
      <ParamTables params={fn.parameters} />
      <TypedTable title="Returns" typeHead="Type" items={returnRows} />
      <TypedTable title="Raises" typeHead="Exception" items={fn.raises} />
    </Stack>
  );
}

function AttributeBody({ attr }: { attr: AttributeDoc }) {
  return (
    <Stack spacing={1}>
      <CodeBlock
        copy={false}
        code={`${attr.name}${attr.type ? `: ${attr.type}` : ''}${attr.default ? ` = ${attr.default}` : ''}`}
      />
      <DocText text={attr.description} />
    </Stack>
  );
}

function Examples({ name }: { name: string }) {
  const { examples } = use(loadReference());
  const used = examplesFor(examples, name);
  if (!used.length) return null;
  return (
    <Section title="Examples">
      <Typography variant="body2" color="text.secondary">
        From the documentation; each example is run in CI.
      </Typography>
      {used.map((e) => (
        <SectionCard
          key={e.file}
          title={e.title}
          badge={<Chip size="small" label={e.file} sx={{ ml: 1 }} />}
          flush
        >
          <CodeBlock code={e.code.trimEnd()} />
        </SectionCard>
      ))}
    </Section>
  );
}

function Crumbs({ found }: { found: Found }) {
  const trail = [
    { path: '', label: 'nomad-sdk' },
    { path: found.module.path, label: found.module.name },
    ...(found.item && found.item.path !== found.module.path
      ? [{ path: found.item.path, label: found.item.name }]
      : []),
  ];
  return (
    <Breadcrumbs aria-label="Location in the API">
      {trail.map((t) => (
        <Link
          key={t.path}
          component={RouterLink}
          to={t.path ? symbolHref(t.path) : paths.api}
          underline="hover"
          color="inherit"
        >
          {t.label}
        </Link>
      ))}
    </Breadcrumbs>
  );
}

function Heading({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography variant="h4" component="h2" sx={{ wordBreak: 'break-word' }}>
        {children}
      </Typography>
      <Chip size="small" variant="outlined" color="primary" label={KIND_LABEL[kind] ?? kind} />
    </Stack>
  );
}

function ItemPage({ item, found }: { item: ItemDoc; found: Found }) {
  if (!('members' in item)) {
    return (
      <Stack spacing={3}>
        <Crumbs found={found} />
        <Heading kind={item.kind}>{item.name}</Heading>
        <Typography variant="body2" color="text.secondary">
          Package: <InlineCode>{found.module.path}</InlineCode>
        </Typography>
        <FunctionBody fn={item} />
        <Examples name={item.name} />
      </Stack>
    );
  }
  const methods = item.members.filter((m): m is FunctionDoc => m.kind === 'function');
  const attributes = item.members.filter((m) => m.kind !== 'function');
  const signature = item.signature.startsWith('class ') ? item.signature : `class ${item.signature}`;
  return (
    <Stack spacing={3}>
      <Crumbs found={found} />
      <Heading kind={item.kind}>{item.name}</Heading>
      <Typography variant="body2" color="text.secondary">
        Package: <InlineCode>{found.module.path}</InlineCode>
        {item.bases.length > 0 && (
          <>
            {' · Inheritance: '}
            {item.bases.map((b, i) => (
              <Box component="span" key={b}>
                {i > 0 && ', '}
                <TypeText type={b} />
              </Box>
            ))}
            {' → '}
            <InlineCode>{item.name}</InlineCode>
          </>
        )}
      </Typography>
      <CodeBlock code={formatSignature(signature)} />
      <DocText text={item.description} />
      <ParamTables params={item.parameters} />
      <TypedTable title="Raises" typeHead="Exception" items={item.raises} />
      <MemberSummary title="Methods" members={methods} />
      <MemberSummary title="Attributes" members={attributes} />
      <Examples name={item.name} />
      {item.members.map((m) => (
        <Box key={m.path} id={anchor(m.path)} sx={{ scrollMarginTop: 16 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h5" component="h3">
                {m.name}
              </Typography>
              <Chip size="small" variant="outlined" label={KIND_LABEL[m.kind]} />
            </Stack>
            {m.kind === 'attribute' ? <AttributeBody attr={m} /> : <FunctionBody fn={m} owner={item} />}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function ItemTable({ items }: { items: ItemDoc[] }) {
  return (
    <SimpleTable
      head={['Name', 'Summary']}
      rows={items.map((i) => [
        <Link key="n" component={RouterLink} to={symbolHref(i.path)} underline="hover">
          <InlineCode>{i.name}</InlineCode>
        </Link>,
        <InlineText key="s" text={summary(i.description)} />,
      ])}
    />
  );
}

function ModulePage({ module, found }: { module: ModuleDoc; found: Found }) {
  const groups = [
    { title: 'Classes', items: module.members.filter((m) => m.kind === 'class') },
    { title: 'Exceptions', items: module.members.filter((m) => m.kind === 'exception') },
    { title: 'Functions', items: module.members.filter((m) => m.kind === 'function') },
  ];
  return (
    <Stack spacing={3}>
      <Crumbs found={found} />
      <Heading kind="module">{module.name}</Heading>
      <DocText text={module.description} />
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <Section key={g.title} title={g.title}>
            <ItemTable items={g.items} />
          </Section>
        ))}
    </Stack>
  );
}

function Overview({ packages }: { packages: ModuleDoc[] }) {
  return (
    <Stack spacing={3}>
      <Heading kind="module">nomad-sdk</Heading>
      <Typography variant="body1">
        Python client library for NOMAD. Install with <InlineCode>pip install nomad-sdk</InlineCode>. This
        reference is generated from the package's docstrings and signatures.
      </Typography>
      <Section title="Packages">
        <SimpleTable
          head={['Package', 'Summary']}
          rows={packages.map((p) => [
            <Link key="n" component={RouterLink} to={symbolHref(p.path)} underline="hover">
              <InlineCode>{p.name}</InlineCode>
            </Link>,
            <InlineText key="s" text={summary(p.description)} />,
          ])}
        />
      </Section>
    </Stack>
  );
}

/**
 * The API reference page body for `/api` (overview), `/api/<package>`, `/api/<package>.<Class>`
 * and `/api/<package>.<Class>.<member>` (the class page, scrolled to the member).
 */
export function ReferenceView({ symbol }: { symbol?: string }) {
  const { reference } = use(loadReference());
  const index = useMemo(() => indexReference(reference), [reference]);
  const found = symbol ? index.get(symbol) : undefined;
  const isMember = !!found && !!found.item && found.doc !== found.item;

  useEffect(() => {
    if (!symbol) return;
    const target = isMember ? document.getElementById(anchor(symbol)) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else document.querySelector('[data-reference-top]')?.scrollIntoView({ block: 'start' });
  }, [symbol, isMember]);

  let body: ReactNode;
  if (!symbol) body = <Overview packages={reference.packages} />;
  else if (!found)
    body = (
      <EmptyState title="Not in the reference" description={`${symbol} is not part of the public API.`} />
    );
  else if (found.doc.kind === 'module') body = <ModulePage module={found.module} found={found} />;
  else body = <ItemPage item={found.item!} found={found} />;

  return (
    <RefContext value={{ index, current: found }}>
      <PanelBody>
        <Box data-reference-top sx={{ maxWidth: 960, pt: 2, pb: 4 }}>
          {body}
        </Box>
      </PanelBody>
    </RefContext>
  );
}
