/**
 * nomad-sdk: the ArchiveSource for the playground — references resolve against the files
 * the user opened, never the network (files stay local).
 *  - same upload, `*.archive.yaml|yml|json` mainfile → the file itself, parsed (nested
 *    custom workflows can be expanded)
 *  - any other mainfile (a code output such as `mdrun_Emin.log`) → a stub: NOMAD would parse
 *    it into an archive on upload, which we cannot do in the browser
 *  - other uploads / entry ids → a stub (they live on a NOMAD server)
 */
import { parse } from 'yaml';
import type { Archive, ArchiveSource } from './model';

export interface ArchiveFile {
  path: string;
  text(): Promise<string>;
}

const ARCHIVE_FILE = /\.archive\.(ya?ml|json)$/i;

function stub(key: string, mainfile?: string): Archive {
  return { __key: key, __stub: new Map(), metadata: mainfile ? { mainfile } : {} };
}

/** Root archive from the generated workflow YAML (the entry `workflow.archive.yaml`). */
export function rootArchive(yamlText: string, mainfile = 'workflow.archive.yaml'): Archive {
  const data = parse(yamlText) as Record<string, unknown>;
  return { ...data, __key: `mainfile:${mainfile}`, metadata: { mainfile } };
}

export function localArchiveSource(files: ArchiveFile[]): ArchiveSource {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const cache = new Map<string, Promise<Archive | null>>();

  const load = (key: string, mainfile: string | undefined, read: () => Promise<Archive>) => {
    if (!cache.has(key))
      cache.set(
        key,
        read().catch(() => stub(key, mainfile)),
      );
    return cache.get(key)!;
  };

  return {
    load(entryRef) {
      const parts = entryRef.split('/').filter((p) => p && p !== '..');
      // ../upload/archive/mainfile/<path>
      if (parts[0] === 'upload' && parts[1] === 'archive' && parts[2] === 'mainfile') {
        const mainfile = parts.slice(3).map(decodeURIComponent).join('/');
        const key = `mainfile:${mainfile}`;
        const file = byPath.get(mainfile);
        if (file && ARCHIVE_FILE.test(mainfile)) {
          return load(key, mainfile, async () => {
            const data = parse(await file.text()) as Record<string, unknown>;
            return { ...data, __key: key, metadata: { mainfile } };
          });
        }
        return load(key, mainfile, async () => stub(key, mainfile));
      }
      // ../uploads/<upload_id>/archive/<entry_id | mainfile/...>, /entries/<id>/archive, ...
      const key = `ref:${parts.join('/')}`;
      return load(key, undefined, async () => stub(key));
    },
  };
}
