import { Suspense } from 'react';
import { LinearProgress } from '@mui/material';
import { useParams } from 'react-router';
import { SidebarLayout } from '@/components/common';
import { ReferenceNav, ReferenceView } from '@/components/reference';

/**
 * /api — the nomad-sdk Python API reference, in the style of Microsoft Learn's SDK reference:
 * packages → classes → members on the left; signature, parameters, returns, raises and the
 * documentation examples that use the symbol on the right. Generated from the docstrings
 * (playground/public/api.json); deep links: /api/nomad_sdk.identity.PersonalAccessTokenCredential.
 */
export function ApiPage() {
  const { symbol } = useParams();
  const loading = <LinearProgress aria-label="Loading the API reference" />;
  return (
    <SidebarLayout
      sidebar={{
        label: 'API reference navigation',
        content: (
          <Suspense fallback={loading}>
            <ReferenceNav />
          </Suspense>
        ),
      }}
      main={{
        label: 'API reference',
        content: (
          <Suspense fallback={loading}>
            <ReferenceView symbol={symbol} />
          </Suspense>
        ),
      }}
    />
  );
}
