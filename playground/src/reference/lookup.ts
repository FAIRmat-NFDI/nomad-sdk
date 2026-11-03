/**
 * Navigation over the API reference: find a symbol by dotted path, build the tree, filter it.
 * Plain TypeScript (no React), unit-tested.
 */
import type { AnyDoc, ApiReference, ItemDoc, ModuleDoc } from './types';

export interface Found {
  doc: AnyDoc;
  module: ModuleDoc;
  /** The class or function (for a member: its owner). */
  item?: ItemDoc;
}

/** Every documented symbol by its public dotted path (`nomad_sdk.identity.AccessToken.token`). */
export function indexReference(ref: ApiReference): Map<string, Found> {
  const index = new Map<string, Found>();
  for (const module of ref.packages) {
    index.set(module.path, { doc: module, module });
    for (const item of module.members) {
      index.set(item.path, { doc: item, module, item });
      if ('members' in item) for (const m of item.members) index.set(m.path, { doc: m, module, item });
    }
  }
  return index;
}

/** Resolve a docstring cross-reference (`~nomad_sdk.identity.TokenCredential`, `NomadClient.users`). */
export function resolveTarget(index: Map<string, Found>, target: string, context?: Found): string | null {
  const t = target.replace(/^[~.]/, '');
  if (index.has(t)) return t;
  // Re-exports: `nomad_sdk.api.models.User` is documented as `nomad_sdk.api.User`.
  const short = t.split('.').pop()!;
  const scoped = [context?.item?.path, context?.module.path].filter(Boolean).map((p) => `${p}.${t}`);
  for (const candidate of scoped) if (index.has(candidate!)) return candidate!;
  const matches = [...index.keys()].filter(
    (k) => k.endsWith(`.${short}`) && index.get(k)!.doc.kind !== 'attribute',
  );
  return matches.length === 1 ? matches[0]! : null;
}

export interface TreeNode {
  id: string;
  label: string;
  kind: AnyDoc['kind'];
  children?: TreeNode[];
}

/** Packages → classes / functions → methods / attributes (the Learn-style left navigation). */
export function referenceTree(ref: ApiReference, query = ''): TreeNode[] {
  const q = query.trim().toLowerCase();
  const hit = (path: string) => !q || path.toLowerCase().includes(q);
  return ref.packages
    .map((module) => {
      const items = module.members
        .map((item) => {
          const members = ('members' in item ? item.members : []).filter((m) => hit(m.path));
          if (!hit(item.path) && !members.length) return null;
          const node: TreeNode = { id: item.path, label: item.name, kind: item.kind };
          if ('members' in item && item.members.length) {
            node.children = (hit(item.path) ? item.members : members).map((m) => ({
              id: m.path,
              label: m.name,
              kind: m.kind,
            }));
          }
          return node;
        })
        .filter((n): n is TreeNode => n !== null);
      if (!items.length && !hit(module.path)) return null;
      return { id: module.path, label: module.name, kind: module.kind, children: items } as TreeNode;
    })
    .filter((n): n is TreeNode => n !== null);
}

/** Ancestors of a path that the tree should expand to show it. */
export function ancestors(path: string, index: Map<string, Found>): string[] {
  const found = index.get(path);
  if (!found) return [];
  return [found.module.path, found.item?.path].filter((p): p is string => !!p && p !== path);
}
