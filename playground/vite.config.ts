import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
/// <reference types="vitest/config" />
import { zipSync } from 'fflate';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

const SDK_DIR = fileURLToPath(new URL('../src/nomad_sdk', import.meta.url));

/**
 * `npm run dev` only: serve /sdk.zip straight from ../src/nomad_sdk (same content as
 * `nomad_sdk.playground.bundle.build_sdk_zip`), rebuilt per request so Python edits apply on reload.
 * Builds (`build:package`, Pages) get the file from the Python bundler instead.
 */
function devSdkZip(): Plugin {
  const collect = (dir: string, out: Record<string, Uint8Array>) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.name === '__pycache__' || path === join(SDK_DIR, 'playground', 'static')) continue;
      if (entry.isDirectory()) collect(path, out);
      else out[relative(join(SDK_DIR, '..'), path).split(sep).join('/')] = readFileSync(path);
    }
    return out;
  };
  return {
    name: 'nomad-sdk-dev-zip',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0]?.endsWith('/sdk.zip')) return next();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Cache-Control', 'no-store');
        res.end(zipSync(collect(SDK_DIR, {})));
      });
    },
  };
}

// Same toolchain as the FAIRmat taxonomy app (app/vite.config.ts).
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // `/` for `nomad-sdk playground serve`; CI sets VITE_BASE=/<repo>/ for GitHub Pages.
    base: env.VITE_BASE || '/',
    // svgr: `import Icon from './x.svg?react'` → React component (used by the icon registry).
    plugins: [react(), svgr(), devSdkZip()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui';
            if (id.includes('@xyflow')) return 'vendor-graph';
            if (id.includes('/d3') || id.includes('/yaml/')) return 'vendor-d3';
            return 'vendor';
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
