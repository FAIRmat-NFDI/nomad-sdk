/**
 * Local workspace files. Everything here runs in the browser: files are read from
 * the user's disk (folder picker, file picker, drag & drop) and .zip archives are
 * unpacked in memory. Nothing is uploaded anywhere.
 *
 * Plain TypeScript — no React/MUI (same layering rule as the taxonomy app's api/).
 */
import { unzip } from 'fflate';

export interface LocalFile {
  /** POSIX path relative to the workspace root, e.g. `workflow1/Emin/mdrun_Emin.log`. */
  path: string;
  size: number;
  /** File contents; never leaves the browser. */
  blob: Blob;
}

export interface FileTreeItem {
  /** Full path; unique within the workspace. */
  id: string;
  label: string;
  children?: FileTreeItem[];
}

/** OS and archive clutter that is never part of a workflow. */
const JUNK = [/(^|\/)__MACOSX\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)desktop\.ini$/i];

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

const isJunk = (path: string) => JUNK.some((re) => re.test(path));
const isZip = (name: string) => /\.zip$/i.test(name);

function clean(files: LocalFile[]): LocalFile[] {
  const byPath = new Map<string, LocalFile>();
  for (const f of files) {
    const path = normalizePath(f.path);
    if (path && !path.endsWith('/') && !isJunk(path)) byPath.set(path, { ...f, path });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Files from `<input type="file">` (with or without `webkitdirectory`). */
export function fromFileList(list: FileList | File[]): LocalFile[] {
  return Array.from(list, (file) => ({
    path: file.webkitRelativePath || file.name,
    size: file.size,
    blob: file,
  }));
}

type Entry = FileSystemEntry;
const isFile = (e: Entry): e is FileSystemFileEntry => e.isFile;
const isDir = (e: Entry): e is FileSystemDirectoryEntry => e.isDirectory;

async function readEntry(entry: Entry): Promise<LocalFile[]> {
  if (isFile(entry)) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ path: entry.fullPath, size: file.size, blob: file }];
  }
  if (!isDir(entry)) return [];
  const reader = entry.createReader();
  const children: Entry[] = [];
  // readEntries returns results in batches until an empty batch.
  for (;;) {
    const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(readEntry))).flat();
}

/**
 * Files from a drop event, including whole folders. Must be called synchronously
 * inside the drop handler (the DataTransfer is emptied after the event).
 */
export function fromDataTransfer(data: DataTransfer): Promise<LocalFile[]> {
  const entries = Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is Entry => !!e);
  if (!entries.length) return Promise.resolve(fromFileList(data.files));
  return Promise.all(entries.map(readEntry)).then((lists) => lists.flat());
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => unzip(data, (err, out) => (err ? reject(err) : resolve(out))));
}

/**
 * Replaces every .zip by its contents (in memory). A zip is unpacked next to where it
 * was, under a folder named after it — unless the archive already has a single root
 * folder, which is then used as is.
 */
export async function expandZips(files: LocalFile[]): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  for (const f of clean(files)) {
    if (!isZip(f.path)) {
      out.push(f);
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = await unzipAsync(new Uint8Array(await f.blob.arrayBuffer()));
    } catch (err) {
      throw new Error(
        `Could not read ${f.path} as a zip archive (${err instanceof Error ? err.message : err})`,
        {
          cause: err,
        },
      );
    }
    const inner = clean(
      Object.entries(entries).map(([path, bytes]) => ({
        path,
        size: bytes.length,
        blob: new Blob([bytes as Uint8Array<ArrayBuffer>]),
      })), // fflate output owns a plain ArrayBuffer,
    );
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : '';
    const prefix = rootFolderName(inner) ? dir : `${dir}${f.path.slice(dir.length).replace(/\.zip$/i, '')}/`;
    out.push(...inner.map((e) => ({ ...e, path: prefix + e.path })));
  }
  return clean(out);
}

/** The single top-level folder all files share, if any (used as the default workflow name). */
export function rootFolderName(files: LocalFile[]): string | null {
  const roots = new Set(files.map((f) => (f.path.includes('/') ? f.path.split('/')[0] : null)));
  if (roots.size !== 1) return null;
  const [root] = roots;
  return root ?? null;
}

/**
 * Makes paths relative to the folder the user picked: `workflow1/Emin/x.log` → `Emin/x.log`.
 * Mainfile references in workflow.archive.yaml are resolved from the upload root, and the
 * workflow file sits next to the simulation folders (as in the nomad-docs examples).
 */
export function stripRootFolder(files: LocalFile[]): { root: string | null; files: LocalFile[] } {
  const root = rootFolderName(files);
  if (!root) return { root: null, files };
  return { root, files: files.map((f) => ({ ...f, path: f.path.slice(root.length + 1) })) };
}

/** Nested tree for the files panel: folders first, then files, each alphabetical. */
export function buildFileTree(files: LocalFile[]): FileTreeItem[] {
  interface Node {
    item: FileTreeItem;
    dirs: Map<string, Node>;
    files: FileTreeItem[];
  }
  const root: Node = { item: { id: '', label: '' }, dirs: new Map(), files: [] };
  for (const { path } of files) {
    const parts = path.split('/');
    let node = root;
    parts.slice(0, -1).forEach((part, i) => {
      const id = parts.slice(0, i + 1).join('/') + '/';
      let next = node.dirs.get(part);
      if (!next) {
        next = { item: { id, label: part }, dirs: new Map(), files: [] };
        node.dirs.set(part, next);
      }
      node = next;
    });
    node.files.push({ id: path, label: parts[parts.length - 1]! });
  }
  const byLabel = (a: FileTreeItem, b: FileTreeItem) => a.label.localeCompare(b.label);
  const toItems = (node: Node): FileTreeItem[] => [
    ...[...node.dirs.values()].map((d) => ({ ...d.item, children: toItems(d) })).sort(byLabel),
    ...node.files.sort(byLabel),
  ];
  return toItems(root);
}

/** Ids of all folders (for expanding the whole tree). */
export function folderIds(items: FileTreeItem[]): string[] {
  return items.flatMap((i) => (i.children ? [i.id, ...folderIds(i.children)] : []));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
