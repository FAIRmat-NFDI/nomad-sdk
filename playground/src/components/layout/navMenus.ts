/** Static dropdown menus in the AppBar. Pure data — edit here, not in components. */
export interface NavMenuItem {
  label: string;
  href: string;
}

export interface NavMenu {
  label: string;
  items: NavMenuItem[];
}

const NOMAD_DOCS = 'https://nomad-lab.eu/prod/v1/docs';
/**
 * SDK pages: the docs deployed next to the playground (GitHub Pages sets VITE_DOCS_URL);
 * elsewhere (`npm run dev`, `nomad-sdk playground serve`) the published NOMAD docs.
 */
const DOCS = import.meta.env.VITE_DOCS_URL?.replace(/\/$/, '') || NOMAD_DOCS;

/** Workflow ⇄ API is a view switch (route handle `switchTo`), not a menu. */
export const navMenus: NavMenu[] = [
  {
    label: 'Docs',
    items: [
      { label: 'Workflows explained', href: `${DOCS}/explanation/workflows.html` },
      { label: 'Create custom workflows', href: `${DOCS}/howto/manage/gui/workflows.html` },
      { label: 'Use the NOMAD Python SDK', href: `${DOCS}/howto/manage/program/nomad_sdk.html` },
      { label: 'Use the API', href: `${DOCS}/howto/manage/program/api.html` },
      { label: 'NOMAD documentation', href: `${NOMAD_DOCS}/` },
      { label: 'nomad-sdk on GitHub', href: 'https://github.com/FAIRmat-NFDI/nomad-sdk' },
    ],
  },
];
