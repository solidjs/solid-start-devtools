import type { ReactiveEdge, ReactiveNodeKind } from './registry.js';

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 44;
export const LAYER_GAP = 76;
export const ROW_GAP = 14;
export const BAND_GAP = 40;
export const PADDING = 24;
export const ARROW_SIZE = 8;

/** Fewest columns the grid of unconnected nodes spreads over. */
const MIN_GRID_COLUMNS = 4;
/**
 * Rank of the first node the previous layout did not have. New nodes rank
 * after every known one, in the order the caller passed them.
 */
const NEW_NODE = 1e12;
/** Crossing sweeps run per band. The best order seen wins. */
const SWEEPS = 6;

export interface LayoutInput {
  id: string;
  name: string;
  kind: ReactiveNodeKind;
}

export interface LayoutNode {
  id: string;
  /** Column inside the node's band, or inside the grid. */
  layer: number;
  /** Row inside that column. */
  index: number;
  x: number;
  y: number;
}

/** Arrangement of one band, in columns and rows, before it gets pixels. */
interface BandLayout {
  /** Node ids per column, top to bottom. Includes the waypoints of long edges. */
  columns: string[][];
  /** Waypoint ids of each edge that skips columns, keyed `from>to`. */
  routes: Map<string, string[]>;
}

export interface GraphLayout {
  nodes: Map<string, LayoutNode>;
  /** Waypoints, left to right, of each edge that skips columns, keyed `from>to`. */
  routes: Map<string, LayoutNode[]>;
  width: number;
  height: number;
  layers: number;
  /** Arrangement of each band, keyed by the band's nodes and edges. */
  bands: Map<string, BandLayout>;
}

export function edgeKey(edge: ReactiveEdge): string {
  return `${edge.from}>${edge.to}`;
}

function waypointId(edge: ReactiveEdge, layer: number): string {
  return `\0${edgeKey(edge)}#${layer}`;
}

/** Groups node ids into sets that edges connect, in any direction. */
function connectedGroups(ids: string[], edges: ReactiveEdge[]): string[][] {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  function rootOf(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Point every node on the way straight at the root.
    let current = id;
    while (current !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  }

  for (const edge of edges) {
    const a = rootOf(edge.from);
    const b = rootOf(edge.to);
    if (a !== b) parent.set(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = rootOf(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()];
}

/** Layer of each node, measured as the longest path from a node with no sources. */
function assignLayers(ids: string[], edges: ReactiveEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    incoming.get(edge.to)!.push(edge.from);
    outgoing.get(edge.from)!.push(edge.to);
  }

  const layers = new Map<string, number>();
  const visiting = new Set<string>();

  function layerOf(id: string): number {
    const known = layers.get(id);
    if (known !== undefined) return known;
    // A cycle has no longest path. Break it by treating the back edge as a source.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let layer = 0;
    for (const source of incoming.get(id)!) {
      layer = Math.max(layer, layerOf(source) + 1);
    }
    visiting.delete(id);
    layers.set(id, layer);
    return layer;
  }

  for (const id of ids) layerOf(id);

  // A signal read only by a deep node would sit in the first column and send
  // one long edge across the band. Move each node with no sources to the
  // column right before its nearest reader.
  for (const id of ids) {
    if (incoming.get(id)!.length > 0) continue;
    let nearest = Infinity;
    for (const target of outgoing.get(id)!) {
      const layer = layers.get(target)!;
      if (layer > layers.get(id)!) nearest = Math.min(nearest, layer);
    }
    if (nearest !== Infinity) layers.set(id, nearest - 1);
  }

  return layers;
}

/** Crossings between the edges of two neighbouring columns. */
function countCrossings(segments: [number, number][]): number {
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    const [a1, b1] = segments[i]!;
    for (let j = i + 1; j < segments.length; j++) {
      const [a2, b2] = segments[j]!;
      if ((a1 - a2) * (b1 - b2) < 0) crossings++;
    }
  }
  return crossings;
}

/**
 * Arranges one band. Edges that skip columns get a waypoint in each column
 * they pass, so they run in a lane of their own instead of through nodes.
 * Rows are then ordered to cross as few edges as possible.
 */
function arrangeBand(
  ids: string[],
  edges: ReactiveEdge[],
  rank: (id: string) => number,
): BandLayout {
  const layers = assignLayers(ids, edges);
  const columnCount = Math.max(...layers.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  const order = new Map<string, number>();
  for (const id of ids) {
    columns[layers.get(id)!]!.push(id);
    order.set(id, rank(id));
  }

  // Each segment joins two neighbouring columns.
  const segments: { from: string; to: string }[] = [];
  const routes = new Map<string, string[]>();
  for (const edge of edges) {
    const start = layers.get(edge.from)!;
    const end = layers.get(edge.to)!;
    // Edges that point back or stay in one column close a cycle. They are drawn
    // straight and take no part in the order.
    if (end <= start) continue;
    let previous = edge.from;
    const route: string[] = [];
    for (let layer = start + 1; layer < end; layer++) {
      const id = waypointId(edge, layer);
      columns[layer]!.push(id);
      order.set(id, rank(edge.from));
      route.push(id);
      segments.push({ from: previous, to: id });
      previous = id;
    }
    segments.push({ from: previous, to: edge.to });
    if (route.length > 0) routes.set(edgeKey(edge), route);
  }

  // Start from the order the reader saw last, so ties keep it.
  for (const column of columns) {
    column.sort((a, b) => order.get(a)! - order.get(b)! || (a < b ? -1 : a > b ? 1 : 0));
  }

  const sourcesOf = new Map<string, string[]>();
  const targetsOf = new Map<string, string[]>();
  for (const segment of segments) {
    (targetsOf.get(segment.from) ?? targetsOf.set(segment.from, []).get(segment.from)!).push(
      segment.to,
    );
    (sourcesOf.get(segment.to) ?? sourcesOf.set(segment.to, []).get(segment.to)!).push(
      segment.from,
    );
  }

  const positions = new Map<string, number>();
  function recordPositions(): void {
    for (const column of columns) {
      for (let index = 0; index < column.length; index++) positions.set(column[index]!, index);
    }
  }

  function totalCrossings(): number {
    let total = 0;
    for (let layer = 0; layer + 1 < columns.length; layer++) {
      const pairs: [number, number][] = [];
      for (const id of columns[layer]!) {
        for (const target of targetsOf.get(id) ?? []) {
          pairs.push([positions.get(id)!, positions.get(target)!]);
        }
      }
      total += countCrossings(pairs);
    }
    return total;
  }

  // Moves each node to the average row of its neighbours in the column swept from.
  function sweep(neighbours: Map<string, string[]>, layerOrder: number[]): void {
    for (const layer of layerOrder) {
      const column = columns[layer]!;
      const scores = new Map<string, number>();
      for (let index = 0; index < column.length; index++) {
        const id = column[index]!;
        const related = neighbours.get(id) ?? [];
        if (related.length === 0) {
          scores.set(id, index);
          continue;
        }
        let total = 0;
        for (const other of related) total += positions.get(other)!;
        scores.set(id, total / related.length);
      }
      column.sort(
        (a, b) => scores.get(a)! - scores.get(b)! || positions.get(a)! - positions.get(b)!,
      );
      for (let index = 0; index < column.length; index++) positions.set(column[index]!, index);
    }
  }

  recordPositions();
  let best = columns.map((column) => [...column]);
  let fewest = totalCrossings();
  const down: number[] = [];
  for (let layer = 1; layer < columns.length; layer++) down.push(layer);
  const up: number[] = [];
  for (let layer = columns.length - 2; layer >= 0; layer--) up.push(layer);

  for (let pass = 0; pass < SWEEPS && fewest > 0; pass++) {
    sweep(sourcesOf, down);
    sweep(targetsOf, up);
    const crossings = totalCrossings();
    if (crossings < fewest) {
      fewest = crossings;
      best = columns.map((column) => [...column]);
    }
  }

  // Averages leave pairs that a swap would untangle. Swapping two neighbours
  // only changes the crossings between their own edges, so compare those.
  function crossingsBetween(upper: string, lower: string): number {
    let crossings = 0;
    for (const neighbours of [sourcesOf, targetsOf]) {
      for (const u of neighbours.get(upper) ?? []) {
        for (const v of neighbours.get(lower) ?? []) {
          if (positions.get(u)! > positions.get(v)!) crossings++;
        }
      }
    }
    return crossings;
  }

  for (let layer = 0; layer < best.length; layer++) columns[layer] = best[layer]!;
  recordPositions();
  let improved = fewest > 0;
  for (let round = 0; improved && round < SWEEPS; round++) {
    improved = false;
    for (const column of columns) {
      for (let index = 0; index + 1 < column.length; index++) {
        const a = column[index]!;
        const b = column[index + 1]!;
        if (crossingsBetween(b, a) >= crossingsBetween(a, b)) continue;
        column[index] = b;
        column[index + 1] = a;
        positions.set(a, index + 1);
        positions.set(b, index);
        improved = true;
      }
    }
  }

  return { columns, routes };
}

/** Identity of a band's structure. Equal keys give equal arrangements. */
function bandKey(ids: string[], edges: ReactiveEdge[]): string {
  const keys: string[] = [];
  for (const edge of edges) keys.push(edgeKey(edge));
  return `${[...ids].sort().join('|')}\n${keys.sort().join('|')}`;
}

/**
 * Places nodes in bands, one per group of connected nodes, stacked top to
 * bottom. Inside a band nodes run left to right, one column per layer. Nodes
 * with no edges at all share a grid under the bands.
 *
 * Pass the layout this one replaces to keep the result stable. A band whose
 * nodes and edges did not change keeps its arrangement, and bands keep their
 * order. Only a band whose structure changed is arranged again, so it can
 * shed the crossings it gained instead of piling them up.
 */
export function layoutGraph(
  nodes: LayoutInput[],
  edges: ReactiveEdge[],
  previous?: GraphLayout,
): GraphLayout {
  const ids: string[] = [];
  const known = new Set<string>();
  for (const node of nodes) {
    if (known.has(node.id)) continue;
    known.add(node.id);
    ids.push(node.id);
  }

  // Edges to filtered nodes, self loops and repeats draw nothing useful.
  const kept: ReactiveEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.from === edge.to || !known.has(edge.from) || !known.has(edge.to)) continue;
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(edge);
  }

  // The reading order of the last layout, top to bottom, then left to right.
  const previousRank = new Map<string, number>();
  if (previous) {
    const placed = [...previous.nodes.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let index = 0; index < placed.length; index++) previousRank.set(placed[index]!.id, index);
  }
  const inputOrder = new Map<string, number>();
  for (let index = 0; index < ids.length; index++) inputOrder.set(ids[index]!, index);
  const rank = (id: string) => previousRank.get(id) ?? NEW_NODE + inputOrder.get(id)!;
  const byRank = (a: string, b: string) => rank(a) - rank(b);

  const groupOf = new Map<string, number>();
  const groups = connectedGroups(ids, kept);
  for (let index = 0; index < groups.length; index++) {
    for (const id of groups[index]!) groupOf.set(id, index);
  }
  const groupEdges: ReactiveEdge[][] = groups.map(() => []);
  for (const edge of kept) groupEdges[groupOf.get(edge.from)!]!.push(edge);

  const bands: { ids: string[]; edges: ReactiveEdge[]; first: number }[] = [];
  const loose: string[] = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    if (group.length === 1) {
      loose.push(group[0]!);
      continue;
    }
    let first = Infinity;
    for (const id of group) first = Math.min(first, rank(id));
    bands.push({ ids: group, edges: groupEdges[index]!, first });
  }
  // Bands the reader saw keep their order. New ones go under them.
  bands.sort((a, b) => a.first - b.first);
  loose.sort(byRank);

  const placed = new Map<string, LayoutNode>();
  const routes = new Map<string, LayoutNode[]>();
  const arrangements = new Map<string, BandLayout>();
  const columnX = (layer: number) => PADDING + layer * (NODE_WIDTH + LAYER_GAP);
  const rowY = (top: number, index: number) => top + index * (NODE_HEIGHT + ROW_GAP);

  let top = PADDING;
  let widest = 0;
  for (const band of bands) {
    const key = bandKey(band.ids, band.edges);
    const arrangement = previous?.bands.get(key) ?? arrangeBand(band.ids, band.edges, rank);
    arrangements.set(key, arrangement);

    const waypoints = new Map<string, LayoutNode>();
    let tallest = 0;
    for (let layer = 0; layer < arrangement.columns.length; layer++) {
      const column = arrangement.columns[layer]!;
      tallest = Math.max(tallest, column.length);
      for (let index = 0; index < column.length; index++) {
        const id = column[index]!;
        const position = { id, layer, index, x: columnX(layer), y: rowY(top, index) };
        if (id.startsWith('\0')) waypoints.set(id, position);
        else placed.set(id, position);
      }
    }
    for (const [edge, route] of arrangement.routes) {
      const points: LayoutNode[] = [];
      for (const id of route) points.push(waypoints.get(id)!);
      routes.set(edge, points);
    }

    widest = Math.max(widest, arrangement.columns.length);
    top = rowY(top, tallest) - ROW_GAP + BAND_GAP;
  }

  if (loose.length > 0) {
    // As wide as the widest band, so the grid does not add width of its own.
    const gridColumns = Math.max(widest, MIN_GRID_COLUMNS);
    for (let index = 0; index < loose.length; index++) {
      const id = loose[index]!;
      const layer = index % gridColumns;
      const row = Math.floor(index / gridColumns);
      placed.set(id, { id, layer, index: row, x: columnX(layer), y: rowY(top, row) });
    }
    widest = Math.max(widest, Math.min(gridColumns, loose.length));
    const rows = Math.ceil(loose.length / gridColumns);
    top = rowY(top, rows) - ROW_GAP + BAND_GAP;
  }

  const empty = ids.length === 0;
  return {
    nodes: placed,
    routes,
    width: empty ? 0 : PADDING * 2 + widest * NODE_WIDTH + (widest - 1) * LAYER_GAP,
    height: empty ? 0 : top - BAND_GAP + PADDING,
    layers: widest,
    bands: arrangements,
  };
}

export interface HoverCardInput {
  /** The hovered node's box, in canvas pixels. */
  node: { left: number; top: number; width: number; height: number };
  canvas: { width: number; height: number };
  card: { width: number; height: number };
  /** Space between the node and the card. */
  gap?: number;
  /** Space kept between the card and the canvas edge. */
  margin?: number;
}

export interface HoverCardPlacement {
  left: number;
  /** The card's top edge when below the node, its bottom edge when above. */
  y: number;
  side: 'above' | 'below';
  /** Where the caret points, measured from the card's left edge. */
  caret: number;
}

/**
 * Places the hover card under or over the node, never beside it. A card beside
 * the node covers the nodes in the next column.
 *
 * The card prefers the side under the node. It moves over the node only when
 * the space below is too short and the space above is larger.
 */
export function placeHoverCard(input: HoverCardInput): HoverCardPlacement {
  const gap = input.gap ?? 8;
  const margin = input.margin ?? 8;
  const { node, canvas, card } = input;

  const center = node.left + node.width / 2;
  const maxLeft = Math.max(margin, canvas.width - card.width - margin);
  const left = Math.min(Math.max(center - card.width / 2, margin), maxLeft);

  const bottom = node.top + node.height;
  const roomBelow = canvas.height - bottom - gap - margin;
  const roomAbove = node.top - gap - margin;
  const side = roomBelow >= card.height || roomBelow >= roomAbove ? 'below' : 'above';

  return {
    left,
    y: side === 'below' ? bottom + gap : node.top - gap,
    side,
    caret: Math.min(Math.max(center - left, 12), card.width - 12),
  };
}

function curve(startX: number, startY: number, endX: number, endY: number): string {
  const distance = Math.max(Math.abs(endX - startX) * 0.5, 40);
  return `C ${startX + distance} ${startY}, ${endX - distance} ${endY}, ${endX} ${endY}`;
}

/**
 * Curve from the right edge of one node to the left edge of another. An edge
 * that skips columns runs straight through each of its waypoints.
 */
export function edgePath(from: LayoutNode, to: LayoutNode, via: LayoutNode[] = []): string {
  let x = from.x + NODE_WIDTH;
  let y = from.y + NODE_HEIGHT / 2;
  let path = `M ${x} ${y}`;
  for (const point of via) {
    const middle = point.y + NODE_HEIGHT / 2;
    path += ` ${curve(x, y, point.x, middle)} L ${point.x + NODE_WIDTH} ${middle}`;
    x = point.x + NODE_WIDTH;
    y = middle;
  }
  return `${path} ${curve(x, y, to.x - ARROW_SIZE, to.y + NODE_HEIGHT / 2)}`;
}
