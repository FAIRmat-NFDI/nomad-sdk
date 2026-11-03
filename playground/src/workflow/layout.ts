/**
 * Layered layout for the read-only "Simulate" view (the engine's generated graph has
 * extra default nodes, so it is laid out automatically). Plain TypeScript, deterministic.
 *  - rank  = longest path from a source; order within a rank by the predecessors' mean slot
 */
export interface LayoutEdge {
  source: number;
  target: number;
}

export function layeredPositions(
  nodeIds: number[],
  edges: LayoutEdge[],
  { rankGap, nodeGap }: { rankGap: number; nodeGap: number },
): Map<number, { x: number; y: number }> {
  const ids = new Set(nodeIds);
  const preds = new Map<number, number[]>(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) preds.get(e.target)!.push(e.source);
  }
  const rank = new Map<number, number>();
  const visiting = new Set<number>();
  const rankOf = (id: number): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // tolerate cycles
    visiting.add(id);
    const r = Math.max(-1, ...preds.get(id)!.map(rankOf)) + 1;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  nodeIds.forEach(rankOf);

  const layers: number[][] = [];
  for (const id of nodeIds) (layers[rank.get(id)!] ??= []).push(id);
  const slot = new Map<number, number>();
  for (const layer of layers) {
    if (!layer) continue;
    const score = (id: number) => {
      const p = preds.get(id)!.filter((q) => slot.has(q));
      return p.length ? p.reduce((sum, q) => sum + slot.get(q)!, 0) / p.length : Number.MAX_SAFE_INTEGER;
    };
    layer
      .map((id, i) => ({ id, i, s: score(id) }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .forEach(({ id }, i, all) => slot.set(id, i - (all.length - 1) / 2));
  }
  return new Map(nodeIds.map((id) => [id, { x: rank.get(id)! * rankGap, y: slot.get(id)! * nodeGap }]));
}
