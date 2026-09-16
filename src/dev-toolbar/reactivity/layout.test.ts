import { describe, expect, it } from 'vitest';
import {
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
    const layout = layoutGraph([node('a'), node('b')], []);
    const first = layout.nodes.get('a')!;
    const second = layout.nodes.get('b')!;

    expect(Math.abs(second.y - first.y)).toBeGreaterThanOrEqual(NODE_HEIGHT);
  });

  it('puts an effect that subscribes to nothing before the signals', () => {
    const layout = layoutGraph([node('a'), effect('lonely'), node('b')], [{ from: 'a', to: 'b' }]);

    expect(layout.nodes.get('lonely')!.layer).toBe(0);
    expect(layout.nodes.get('a')!.layer).toBe(1);
    expect(layout.nodes.get('b')!.layer).toBe(2);
  });

  it('leaves an effect with sources where its sources put it', () => {
    const layout = layoutGraph([node('a'), effect('watcher')], [{ from: 'a', to: 'watcher' }]);

    expect(layout.nodes.get('a')!.layer).toBe(0);
    expect(layout.nodes.get('watcher')!.layer).toBe(1);
  });

  it('keeps one column when every node is a detached effect', () => {
    const layout = layoutGraph([effect('one'), effect('two')], []);

    expect(layout.layers).toBe(1);
  });

  it('keeps a node in its slot when another node appears', () => {
    const first = layoutGraph([node('a'), node('b')], []);
    const second = layoutGraph([node('a'), node('b'), node('c')], [], first);

    expect(second.nodes.get('a')!.y).toBe(first.nodes.get('a')!.y);
    expect(second.nodes.get('b')!.y).toBe(first.nodes.get('b')!.y);
    expect(second.nodes.get('c')!.index).toBe(2);
  });

  it('keeps the previous order when the caller passes the nodes in another order', () => {
    const first = layoutGraph([node('a'), node('b')], []);
    const second = layoutGraph([node('b'), node('a')], [], first);

    expect(second.nodes.get('a')!.index).toBe(0);
    expect(second.nodes.get('b')!.index).toBe(1);
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
  it('starts at the right edge of the source and ends at the left edge of the target', () => {
    const from = { id: 'a', layer: 0, index: 0, x: 0, y: 0 };
    const to = { id: 'b', layer: 1, index: 0, x: 280, y: 0 };
    const middle = NODE_HEIGHT / 2;
    const curve = Math.max((to.x - NODE_WIDTH) * 0.5, 40);

    expect(edgePath(from, to)).toBe(
      `M ${NODE_WIDTH} ${middle} C ${NODE_WIDTH + curve} ${middle}, ${to.x - curve} ${middle}, ${to.x} ${middle}`,
    );
  });

  it('keeps a minimum curve when the nodes almost touch', () => {
    const from = { id: 'a', layer: 0, index: 0, x: 0, y: 0 };
    const to = { id: 'b', layer: 1, index: 1, x: NODE_WIDTH + 10, y: 60 };

    expect(edgePath(from, to)).toContain(`C ${NODE_WIDTH + 40} ${NODE_HEIGHT / 2}`);
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
