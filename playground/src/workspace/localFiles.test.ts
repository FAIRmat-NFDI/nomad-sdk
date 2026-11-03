import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  buildFileTree,
  expandZips,
  folderIds,
  formatBytes,
  rootFolderName,
  stripRootFolder,
  type LocalFile,
} from './localFiles';

const file = (path: string, text = 'x'): LocalFile => ({ path, size: text.length, blob: new Blob([text]) });
const zip = (path: string, entries: Record<string, string>): LocalFile => {
  const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])));
  return { path, size: bytes.length, blob: new Blob([bytes]) };
};

describe('expandZips', () => {
  it('keeps plain files, drops OS clutter and normalises paths', async () => {
    const out = await expandZips([
      file('./a/b.log'),
      file('a\\c.log'),
      file('a/.DS_Store'),
      file('__MACOSX/a/x'),
    ]);
    expect(out.map((f) => f.path)).toEqual(['a/b.log', 'a/c.log']);
  });

  it('uses the archive root folder when there is one', async () => {
    const out = await expandZips([
      zip('upload.zip', { 'workflow1/Emin/mdrun.log': 'log', 'workflow1/': '' }),
    ]);
    expect(out.map((f) => f.path)).toEqual(['workflow1/Emin/mdrun.log']);
    expect(await out[0]!.blob.text()).toBe('log');
  });

  it('unpacks a flat archive into a folder named after it', async () => {
    const out = await expandZips([zip('data/sim.zip', { 'a.log': '1', 'b/c.log': '2' })]);
    expect(out.map((f) => f.path)).toEqual(['data/sim/a.log', 'data/sim/b/c.log']);
  });

  it('reports a broken archive', async () => {
    await expect(expandZips([file('bad.zip', 'not a zip')])).rejects.toThrow(/bad\.zip/);
  });
});

describe('tree', () => {
  const files = [file('w/Prod/p.log'), file('w/Emin/e.log'), file('w/readme.md'), file('w/Emin/e.gro')];

  it('nests folders first, alphabetically', () => {
    const tree = buildFileTree(files);
    expect(tree.map((i) => i.label)).toEqual(['w']);
    expect(tree[0]!.children!.map((i) => i.label)).toEqual(['Emin', 'Prod', 'readme.md']);
    expect(tree[0]!.children![0]!.children!.map((i) => i.id)).toEqual(['w/Emin/e.gro', 'w/Emin/e.log']);
  });

  it('lists folder ids for expanding everything', () => {
    expect(folderIds(buildFileTree(files))).toEqual(['w/', 'w/Emin/', 'w/Prod/']);
  });

  it('makes paths relative to the picked folder', () => {
    const { root, files: rel } = stripRootFolder(files);
    expect(root).toBe('w');
    expect(rel.map((f) => f.path)).toEqual(['Prod/p.log', 'Emin/e.log', 'readme.md', 'Emin/e.gro']);
    expect(stripRootFolder([file('a.log'), file('b/c.log')]).root).toBeNull();
  });

  it('finds a single root folder', () => {
    expect(rootFolderName(files)).toBe('w');
    expect(rootFolderName([...files, file('top.log')])).toBeNull();
  });
});

it('formats sizes', () => {
  expect([formatBytes(12), formatBytes(2048), formatBytes(5 * 1024 ** 2)]).toEqual([
    '12 B',
    '2.0 KB',
    '5.0 MB',
  ]);
});
