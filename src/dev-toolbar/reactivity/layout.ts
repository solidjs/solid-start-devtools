import type { ReactiveEdge, ReactiveNodeKind } from './registry.js';

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 44;
export const LAYER_GAP = 76;
export const ROW_GAP = 14;
export const PADDING = 24;

export interface LayoutInput {
  id: string;
  name: string;
  kind: ReactiveNodeKind;
}

const EFFECT_KINDS = new Set<ReactiveNodeKind>(['effect', 'render-effect', 'tracked-effect']);

export interface LayoutNode {
  id: string;
  layer: number;
  index: number;
  x: number;
  y: number;
}

export interface GraphLayout {
  nodes: Map<string, LayoutNode>;
  width: number;
  height: number;
  layers: number;
}

/** Sources of each node, ignoring edges that point outside the given nodes. */
function incomingEdges(nodes: LayoutInput[], edges: ReactiveEdge[]): Map<string, string[]> {
  const incoming = new Map<string, string[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of edges) {
    if (!incoming.has(edge.from) || !incoming.has(edge.to)) continue;
    incoming.get(edge.to)!.push(edge.from);
  }
  return incoming;
}

/** Layer of each node, measured as the longest path from a node with no sources. */
function assignLayers(nodes: LayoutInput[], incoming: Map<string, string[]>): Map<string, number> {
  const layers = new Map<string, number>();
  const visiting = new Set<string>();

  function layerOf(id: string): number {
    const known = layers.get(id);
    if (known !== undefined) return known;
    // A cycle has no longest path. Break it by treating the back edge as a source.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let layer = 0;
    for (const source of incoming.get(id) ?? []) {
      layer = Math.max(layer, layerOf(source) + 1);
    }
    visiting.delete(id);
    layers.set(id, layer);
    return layer;
  }

  for (const node of nodes) layerOf(node.id);
  return layers;
}

/**
 * Orders nodes inside each layer so edges cross as little as possible. Each
 * sweep moves a node towards the average position of its neighbours in the
 * previous layer. Ties keep the order the node had in the last layout, so a
 * node that gained no neighbours stays where the reader last saw it.
 */
function orderLayers(
  columns: string[][],
  edges: ReactiveEdge[],
  layers: Map<string, number>,
  rank: (id: string) => number,
): void {
  const sourcesOf = new Map<string, string[]>();
  const targetsOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (!layers.has(edge.from) || !layers.has(edge.to)) continue;
    (targetsOf.get(edge.from) ?? targetsOf.set(edge.from, []).get(edge.from)!).push(edge.to);
    (sourcesOf.get(edge.to) ?? sourcesOf.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  const positions = new Map<string, number>();
  for (const column of columns) {
    column.forEach((id, index) => positions.set(id, index));
  }

  function sweep(neighbours: Map<string, string[]>, order: number[]): void {
    for (const columnIndex of order) {
      const column = columns[columnIndex]!;
      const scores = new Map<string, number>();
      column.forEach((id, index) => {
        const related = neighbours.get(id) ?? [];
        if (related.length === 0) {
          scores.set(id, index);
          return;
        }
        let total = 0;
        for (const other of related) total += positions.get(other) ?? 0;
        scores.set(id, total / related.length);
      });
      column.sort(
        (a, b) => scores.get(a)! - scores.get(b)! || rank(a) - rank(b) || a.localeCompare(b),
      );
      column.forEach((id, index) => positions.set(id, index));
    }
  }

  const down = columns.map((_, index) => index);
  const up = [...down].reverse();
  for (let pass = 0; pass < 2; pass++) {
    sweep(sourcesOf, down);
    sweep(targetsOf, up);
  }
}

/**
 * Restores the order known nodes had, keeping new nodes at the position the
 * crossing sweeps chose for them.
 */
function keepKnownOrder(column: string[], rank: (id: string) => number, newNode: number): string[] {
  const swept = new Map(column.map((id, index) => [id, index]));
  const known = column.filter((id) => rank(id) !== newNode).sort((a, b) => rank(a) - rank(b));
  const fresh = column.filter((id) => rank(id) === newNode);

  const out = [...known];
  for (const id of fresh) {
    const target = swept.get(id)!;
    let index = 0;
    while (index < out.length && swept.get(out[index]!)! < target) index++;
    out.splice(index, 0, id);
  }
  return out;
}

/**
 * Places nodes on a left to right grid, one column per layer.
 *
 * Pass the layout this one replaces to keep the result stable: nodes hold the
 * slot they had, and new ones land after them. Without it the graph reshuffles
 * on every snapshot, which is the one thing a live view must not do.
 */
export function layoutGraph(
  nodes: LayoutInput[],
  edges: ReactiveEdge[],
  previous?: GraphLayout,
): GraphLayout {
  const incoming = incomingEdges(nodes, edges);
  const layers = assignLayers(nodes, incoming);

  // An effect that subscribes to nothing reads nothing, so it does not belong
  // in the column the signals start from. It gets a column of its own before
  // them, which keeps the first signal column about sources of data.
  const detached = nodes.filter(
    (node) => EFFECT_KINDS.has(node.kind) && incoming.get(node.id)!.length === 0,
  );
  if (detached.length > 0) {
    for (const [id, layer] of layers) layers.set(id, layer + 1);
    for (const node of detached) layers.set(node.id, 0);
  }

  const columnCount = nodes.length === 0 ? 0 : Math.max(...layers.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  for (const node of nodes) columns[layers.get(node.id)!]!.push(node.id);

  // A node the last layout did not have sorts after the ones it did.
  const NEW_NODE = Number.MAX_SAFE_INTEGER;
  const previousIndex = new Map<string, number>();
  if (previous) {
    for (const [id, node] of previous.nodes) previousIndex.set(id, node.index);
  }
  const rank = (id: string) => previousIndex.get(id) ?? NEW_NODE;

  for (const column of columns) {
    column.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  orderLayers(columns, edges, layers, rank);

  // The sweeps are free to reorder anything, which would move nodes the reader
  // is looking at. Keep the order known nodes already had, and slot the new
  // ones in where the sweeps put them.
  columns.forEach((column, index) => {
    columns[index] = keepKnownOrder(column, rank, NEW_NODE);
  });

  const tallest = columns.reduce((max, column) => Math.max(max, column.length), 0);
  const contentHeight = tallest * NODE_HEIGHT + Math.max(tallest - 1, 0) * ROW_GAP;

  // Columns hang from the top. Centring them would move every column whenever
  // one of them grew.
  const placed = new Map<string, LayoutNode>();
  columns.forEach((column, layer) => {
    column.forEach((id, index) => {
      placed.set(id, {
        id,
        layer,
        index,
        x: PADDING + layer * (NODE_WIDTH + LAYER_GAP),
        y: PADDING + index * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  const width =
    columnCount === 0 ? 0 : PADDING * 2 + columnCount * NODE_WIDTH + (columnCount - 1) * LAYER_GAP;

  return {
    nodes: placed,
    width,
    height: contentHeight + PADDING * 2,
    layers: columnCount,
  };
}

/** Curve from the right edge of one node to the left edge of another. */
export function edgePath(from: LayoutNode, to: LayoutNode): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;
  const distance = Math.max(Math.abs(endX - startX) * 0.5, 40);
  return `M ${startX} ${startY} C ${startX + distance} ${startY}, ${endX - distance} ${endY}, ${endX} ${endY}`;
}
