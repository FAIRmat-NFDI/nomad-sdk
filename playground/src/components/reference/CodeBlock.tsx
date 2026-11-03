import { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { CheckIcon, CopyIcon } from '@/assets';
import { monoFontFamily } from '@/theme';

/** Preformatted code with a copy button (signatures, examples). */
export function CodeBlock({ code, copy = true }: { code: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          pr: copy ? 6 : 2,
          overflowX: 'auto',
          bgcolor: 'action.hover',
          borderRadius: 1,
          fontFamily: monoFontFamily,
          fontSize: 'body2.fontSize',
        }}
      >
        {code}
      </Box>
      {copy && (
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton
            size="small"
            aria-label="Copy code"
            onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}
            onMouseLeave={() => setCopied(false)}
            sx={{ position: 'absolute', top: 6, right: 6 }}
          >
            {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
