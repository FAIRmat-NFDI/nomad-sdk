import { createContext } from 'react';
import type { Found } from '@/reference/lookup';
import { paths } from '@/routes/paths';

/** Symbol index + current symbol, for resolving :class:`…` cross-references to links. */
export const RefContext = createContext<{ index: Map<string, Found>; current?: Found } | null>(null);

export const symbolHref = (path: string) => `${paths.api}/${path}`;
