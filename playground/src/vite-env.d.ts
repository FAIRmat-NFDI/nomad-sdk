/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_BASE?: string;
  /** Self-hosted Pyodide distribution (URL ending in /); default: jsDelivr CDN. */
  readonly VITE_PYODIDE_BASE?: string;
  /** Where the SDK docs live; the Pages build sets `<base>docs` (deployed with the playground). */
  readonly VITE_DOCS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
