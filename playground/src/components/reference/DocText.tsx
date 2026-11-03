import { Fragment, useContext } from 'react';
import { Box, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { monoFontFamily } from '@/theme';
import { parseDocstring, parseInline, type Inline } from '@/reference/docstring';
import { resolveTarget } from '@/reference/lookup';
import { CodeBlock } from './CodeBlock';
import { RefContext, symbolHref } from './context';

export function InlineCode({ children }: { children: string }) {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: monoFontFamily,
        fontSize: '0.9em',
        bgcolor: 'action.hover',
        px: 0.5,
        borderRadius: 0.5,
      }}
    >
      {children}
    </Box>
  );
}

/** A symbol name or type annotation, linked when it is documented here. */
export function SymbolRef({ target, label }: { target: string; label?: string }) {
  const ctx = useContext(RefContext);
  const path = ctx && resolveTarget(ctx.index, target, ctx.current);
  const text = label ?? target;
  if (!path) return <InlineCode>{text}</InlineCode>;
  return (
    <Link component={RouterLink} to={symbolHref(path)} underline="hover">
      <InlineCode>{text}</InlineCode>
    </Link>
  );
}

/** Type annotation such as `TokenCredential | None`: documented names become links. */
export function TypeText({ type }: { type: string | null }) {
  const ctx = useContext(RefContext);
  if (!type) return null;
  const parts = type.split(/([A-Za-z_][\w.]*)/);
  return (
    <Box component="span" sx={{ fontFamily: monoFontFamily, fontSize: '0.9em' }}>
      {parts.map((p, i) => {
        const path = /^[A-Za-z_]/.test(p) && ctx ? resolveTarget(ctx.index, p, ctx.current) : null;
        return path ? (
          <Link key={i} component={RouterLink} to={symbolHref(path)} underline="hover">
            {p}
          </Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </Box>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((part, i) =>
    'code' in part ? (
      <InlineCode key={i}>{part.code}</InlineCode>
    ) : 'ref' in part ? (
      <SymbolRef key={i} target={part.ref} label={part.label} />
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    ),
  );
}

/** One-line text (table cells): inline markup only. */
export function InlineText({ text }: { text: string }) {
  return <Inlines inlines={parseInline(text.replace(/\s+/g, ' '))} />;
}

/** A docstring description: paragraphs, bullet lists and code blocks. */
export function DocText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {parseDocstring(text).map((block, i) =>
        block.type === 'code' ? (
          <CodeBlock key={i} code={block.code} />
        ) : block.type === 'list' ? (
          <Box key={i} component="ul" sx={{ m: 0, pl: 3 }}>
            {block.items.map((item, j) => (
              <Typography key={j} component="li" variant="body1">
                <Inlines inlines={item} />
              </Typography>
            ))}
          </Box>
        ) : (
          <Typography key={i} variant="body1">
            <Inlines inlines={block.inlines} />
          </Typography>
        ),
      )}
    </Box>
  );
}
