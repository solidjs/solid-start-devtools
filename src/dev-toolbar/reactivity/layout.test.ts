import { describe, expect, it } from 'vitest';
import {
  ARROW_SIZE,
  edgePath,
  layoutGraph,
  LAYER_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  placeHoverCard,
} from './layout.js';

const node = (id: string) => ({ id, name: id, kind: 'signal' as const });
const effect = (id: string) => ({ id, name: id, kind: 'effect' as const });

describe('layoutGraph', () => {
  it('places a node with no sources in the first column', () => {
    const layout = layoutGraph([node('a')], []);

    expect(layout.layers).toBe(1);
    expect(layout.nodes.get('a')!.layer).toBe(0);
  });

  it('puts each node one column after its deepest source', () => {
    const layout = layoutGraph(
      [node('a'), node('b'), node('c')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    );

    expect(layout.nodes.get('a')!.layer).toBe(0);
    expect(layout.nodes.get('b')!.layer).toBe(1);
    expect(layout.nodes.get('c')!.layer).toBe(2);
    expect(layout.nodes.get('c')!.x - layout.nodes.get('b')!.x).toBe(NODE_WIDTH + LAYER_GAP);
  });

  it('does not hang on a cycle', () => {
    const layout = layoutGraph(
      [node('a'), node('b')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );

    expect(layout.nodes.size).toBe(2);
  });

  it('ignores edges pointing at nodes that are filtered out', () => {
    const layout = layoutGraph([node('a')], [{ from: 'hidden', to: 'a' }]);

    expect(layout.nodes.get('a')!.layer).toBe(0);
  });

  it('stacks nodes of one column without overlap', () => {
    const layout = layoutGraph(
      [node('a'), node('b'), node('c')],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    );
    const first = layout.nodes.get('b')!;
    const second = layout.nodes.get('c')!;

    expect(Math.abs(second.y - first.y)).toBeGreaterThanOrEqual(NODE_HEIGHT);
  });

  it('puts a node with no edges in the grid under the bands', () => {
    const layout = layoutGraph([node('a'), effect('lonely'), node('b')], [{ from: 'a', to: 'b' }]);

    expect(layout.nodes.get('a')!.layer).toBe(0);
    expect(layout.nodes.get('b')!.layer).toBe(1);
    expect(layout.nodes.get('lonely')!.y).toBeGreaterThan(layout.nodes.get('b')!.y + NODE_HEIGHT);
  });

  it('leaves an effect with sources where its sources put it', () => {
    const layout = layoutGraph([node('a'), effect('watcher')], [{ from: 'a', to: 'watcher' }]);

    expect(layout.nodes.get('a')!.layer).toBe(0);
    expect(layout.nodes.get('watcher')!.layer).toBe(1);
  });

  it('spreads nodes with no edges over rows of at least four columns', () => {
    const layout = layoutGraph(
      ['one', 'two', 'three', 'four', 'five'].map((id) => effect(id)),
      [],
    );

    expect(layout.layers).toBe(4);
    expect(layout.nodes.get('four')!.layer).toBe(3);
    expect(layout.nodes.get('five')!.layer).toBe(0);
    expect(layout.nodes.get('five')!.index).toBe(1);
  });

  it('gives each group of connected nodes a band of its own', () => {
    const layout = layoutGraph(
      [node('a'), node('b'), node('c'), node('d')],
      [
        { from: 'a', to: 'b' },
        { from: 'c', to: 'd' },
      ],
    );
    const firstBandBottom = Math.max(layout.nodes.get('a')!.y, layout.nodes.get('b')!.y);

    expect(layout.nodes.get('c')!.y).toBeGreaterThan(firstBandBottom + NODE_HEIGHT);
    expect(layout.nodes.get('d')!.y).toBe(layout.nodes.get('c')!.y);
  });

  it('routes an edge that skips a column through a waypoint beside the nodes', () => {
    const layout = layoutGraph(
      [node('a'), node('b'), node('c')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    );
    const route = layout.routes.get('a>c')!;

    expect(route).toHaveLength(1);
    expect(route[0]!.layer).toBe(1);
    expect(route[0]!.y).not.toBe(layout.nodes.get('b')!.y);
  });

  it('moves a node with no sources to the column before its nearest reader', () => {
    const layout = layoutGraph(
      [node('a'), node('b'), node('c'), node('late')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'late', to: 'c' },
      ],
    );

    expect(layout.nodes.get('late')!.layer).toBe(1);
    expect(layout.routes.has('late>c')).toBe(false);
  });

  it('orders rows so edges do not cross', () => {
    const layout = layoutGraph(
      [node('a'), node('b'), node('c'), node('d')],
      [
        { from: 'a', to: 'd' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    );

    expect(layout.nodes.get('a')!.index).toBe(layout.nodes.get('d')!.index);
  });

  it('keeps the arrangement of a band whose structure did not change', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [
      { from: 'a', to: 'd' },
      { from: 'b', to: 'c' },
      { from: 'a', to: 'c' },
    ];
    const first = layoutGraph(nodes, edges);
    const second = layoutGraph(
      [...nodes, node('other'), node('next')],
      [...edges, { from: 'other', to: 'next' }],
      first,
    );

    for (const id of ['a', 'b', 'c', 'd']) {
      expect(second.nodes.get(id)).toEqual(first.nodes.get(id));
    }
    expect([...second.bands.values()]).toContain([...first.bands.values()][0]);
  });

  it('keeps a node in its slot when another node appears', () => {
    const first = layoutGraph([node('a'), node('b')], []);
    const second = layoutGraph([node('a'), node('b'), node('c')], [], first);

    expect(second.nodes.get('a')!.y).toBe(first.nodes.get('a')!.y);
    expect(second.nodes.get('b')!.y).toBe(first.nodes.get('b')!.y);
    expect(second.nodes.get('c')!.layer).toBe(2);
  });

  it('keeps the previous order when the caller passes the nodes in another order', () => {
    const first = layoutGraph([node('a'), node('b')], []);
    const second = layoutGraph([node('b'), node('a')], [], first);

    expect(second.nodes.get('a')!.layer).toBe(0);
    expect(second.nodes.get('b')!.layer).toBe(1);
  });

  it('does not move one column when another column grows', () => {
    const edges = [{ from: 'a', to: 'out' }];
    const first = layoutGraph([node('a'), node('out')], edges);
    const second = layoutGraph([node('a'), node('b'), node('c'), node('out')], edges, first);

    expect(second.nodes.get('out')!.y).toBe(first.nodes.get('out')!.y);
  });

  it('gives the same layout for the same graph', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [{ from: 'a', to: 'c' }];
    const first = layoutGraph(nodes, edges);
    const second = layoutGraph(nodes, edges);

    expect([...second.nodes.entries()]).toEqual([...first.nodes.entries()]);
  });

  it('reports an empty layout for an empty graph', () => {
    const layout = layoutGraph([], []);

    expect(layout.width).toBe(0);
    expect(layout.layers).toBe(0);
  });
});

describe('edgePath', () => {
  it('starts at the right edge of the source and ends arrow-size before the left edge of the target', () => {
    const from = { id: 'a', layer: 0, index: 0, x: 0, y: 0 };
    const to = { id: 'b', layer: 1, index: 0, x: 280, y: 0 };
    const middle = NODE_HEIGHT / 2;
    const endX = to.x - ARROW_SIZE;
    const curve = Math.max((endX - NODE_WIDTH) * 0.5, 40);

    expect(edgePath(from, to)).toBe(
      `M ${NODE_WIDTH} ${middle} C ${NODE_WIDTH + curve} ${middle}, ${endX - curve} ${middle}, ${endX} ${middle}`,
    );
  });

  it('keeps a minimum curve when the nodes almost touch', () => {
    const from = { id: 'a', layer: 0, index: 0, x: 0, y: 0 };
    const to = { id: 'b', layer: 1, index: 1, x: NODE_WIDTH + 10, y: 60 };

    expect(edgePath(from, to)).toContain(`C ${NODE_WIDTH + 40} ${NODE_HEIGHT / 2}`);
  });
});

describe('edgePath through waypoints', () => {
  it('runs straight through each waypoint', () => {
    const from = { id: 'a', layer: 0, index: 0, x: 0, y: 0 };
    const via = [{ id: 'w', layer: 1, index: 1, x: 226, y: 58 }];
    const to = { id: 'c', layer: 2, index: 0, x: 452, y: 0 };
    const middle = 58 + NODE_HEIGHT / 2;

    expect(edgePath(from, to, via)).toContain(`226 ${middle} L ${226 + NODE_WIDTH} ${middle}`);
  });
});

describe('placeHoverCard', () => {
  const canvas = { width: 800, height: 600 };
  const card = { width: 288, height: 150 };
  const node = (left: number, top: number) => ({ left, top, width: 150, height: 44 });

  it('puts the card under the node when there is room', () => {
    const placement = placeHoverCard({ node: node(300, 100), canvas, card });

    expect(placement.side).toBe('below');
    expect(placement.y).toBe(100 + 44 + 8);
  });

  it('puts the card over the node when the space below is too short', () => {
    const placement = placeHoverCard({ node: node(300, 520), canvas, card });

    expect(placement.side).toBe('above');
    expect(placement.y).toBe(520 - 8);
  });

  it('never overlaps the node vertically', () => {
    for (const top of [0, 120, 300, 450, 556]) {
      const placement = placeHoverCard({ node: node(300, top), canvas, card });
      const cardTop = placement.side === 'below' ? placement.y : placement.y - card.height;
      const cardBottom = cardTop + card.height;
      expect(cardBottom <= top || cardTop >= top + 44).toBe(true);
    }
  });

  it('centers the card on the node', () => {
    const placement = placeHoverCard({ node: node(300, 100), canvas, card });

    expect(placement.left + card.width / 2).toBe(300 + 75);
    expect(placement.caret).toBe(card.width / 2);
  });

  it('keeps the card inside the canvas and points the caret at the node', () => {
    const atLeft = placeHoverCard({ node: node(0, 100), canvas, card });
    const atRight = placeHoverCard({ node: node(650, 100), canvas, card });

    expect(atLeft.left).toBe(8);
    expect(atLeft.caret).toBe(75 - 8);
    expect(atRight.left).toBe(800 - 288 - 8);
    expect(atRight.left + atRight.caret).toBe(650 + 75);
  });
});
