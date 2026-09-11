import { describe, expect, it } from 'vitest';
import { edgePath, layoutGraph, LAYER_GAP, NODE_HEIGHT, NODE_WIDTH } from './layout.js';

const node = (id: string) => ({ id, name: id });

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
