/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_BASE?: string;
  /** Self-hosted Pyodide distribution (URL ending in /); default: jsDelivr CDN. */
  readonly VITE_PYODIDE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
