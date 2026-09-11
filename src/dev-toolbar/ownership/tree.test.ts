import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  buildOwnershipTree,
  ownerKind,
  ownerName,
  type BuildOptions,
  type RawNode,
  type TreeNode,
} from './tree.js';

const REACTIVE_DISPOSED = 1 << 6;

interface FakeOptions {
  name?: string;
  component?: string;
  effect?: number;
  memo?: boolean;
  root?: boolean;
  disposed?: boolean;
  value?: unknown;
  signals?: RawNode[];
  children?: RawNode[];
}

/** Builds an owner shaped like the ones the runtime creates. */
function owner(options: FakeOptions = {}): RawNode {
  const node: RawNode = {
    _children: options.children ?? [],
    _signals: options.signals ?? [],
  };
  if (options.name) node._name = options.name;
  if (options.component) node._component = { name: options.component, props: {}, fn() {} };
  if (options.memo || options.effect !== undefined) {
    node._deps = null;
    node._fn = () => undefined;
    node._value = options.value;
  }
  if (options.effect !== undefined) node._type = options.effect;
  if (options.root) node._root = true;
  if (options.disposed) node._flags = REACTIVE_DISPOSED;
  return node;
}

function signal(name: string, value: unknown): RawNode {
  return { _name: name, _value: value };
}

function build(roots: RawNode[], over: Partial<BuildOptions> = {}) {
  const ids = new Map<object, string>();
  return buildOwnershipTree(roots, {
    children: (node) => node._children ?? [],
    signals: (node) => node._signals ?? [],
    identify: (node) => {
      let id = ids.get(node);
      if (!id) {
        id = `n${ids.size + 1}`;
        ids.set(node, id);
      }
      return id;
    },
    isExcluded: () => false,
    isIncluded: () => false,
    componentsOnly: true,
    ...over,
  });
}

const names = (nodes: TreeNode[]) => nodes.map((node) => node.name);

describe('ownerKind', () => {
  it('reads the kind off the raw owner', () => {
    expect(ownerKind(owner({ component: 'App' }))).toBe('component');
    expect(ownerKind(owner({ memo: true }))).toBe('memo');
    expect(ownerKind(owner({ effect: 2 }))).toBe('effect');
    expect(ownerKind(owner({ effect: 1 }))).toBe('render-effect');
    expect(ownerKind(owner({ root: true }))).toBe('root');
    expect(ownerKind(owner())).toBe('scope');
  });
});

describe('ownerName', () => {
  it('wraps component names in angle brackets', () => {
    expect(ownerName(owner({ component: 'App' }), 'component')).toBe('<App>');
    expect(ownerName(owner({ component: '' }), 'component')).toBe('<Anonymous>');
  });

  it('drops the hot reload tag from a component name', () => {
    expect(ownerName(owner({ component: '[solid-refresh]Counter' }), 'component')).toBe(
      '<Counter>',
    );
  });

  it('falls back to the kind when an owner has no name', () => {
    expect(ownerName(owner({ name: 'count' }), 'memo')).toBe('count');
    expect(ownerName(owner(), 'scope')).toBe('scope');
  });
});

describe('buildOwnershipTree in component mode', () => {
  it('keeps components and folds the scopes between them', () => {
    const child = owner({ component: 'Child' });
    const memo = owner({ memo: true, name: 'total', value: 7, children: [child] });
    const root = owner({ component: 'App', children: [memo] });

    const tree = build([root]);

    expect(names(tree.nodes)).toEqual(['<App>', '<Child>']);
    expect(tree.nodes[0]!.scopes).toEqual([
      { id: expect.any(String), kind: 'memo', name: 'total', value: 7, hasValue: true },
    ]);
    expect(tree.nodes[0]!.children).toEqual([tree.nodes[1]!.id]);
  });

  it('gives a folded scope its signals to the component above', () => {
    const scope = owner({ memo: true, name: 'derived', signals: [signal('inner', 1)] });
    const root = owner({ component: 'App', signals: [signal('outer', 0)], children: [scope] });

    const tree = build([root]);

    expect(tree.nodes[0]!.signals.map((entry) => entry.name)).toEqual(['outer', 'inner']);
  });

  it('lists prop names of a component', () => {
    const root = owner({ component: 'Greeting' });
    root._component.props = { name: 'ada', greeting: 'hi' };

    expect(build([root]).nodes[0]!.props).toEqual(['name', 'greeting']);
  });
});

describe('buildOwnershipTree in owner mode', () => {
  it('keeps every owner', () => {
    const memo = owner({ memo: true, name: 'total' });
    const root = owner({ component: 'App', children: [memo] });

    expect(names(build([root], { componentsOnly: false }).nodes)).toEqual(['<App>', 'total']);
  });
});

describe('buildOwnershipTree visibility', () => {
  it('hides an excluded subtree', () => {
    const hidden = owner({ component: 'Toolbar' });
    const root = owner({ component: 'App', children: [hidden] });

    const tree = build([root], { isExcluded: (node) => node === hidden });

    expect(names(tree.nodes)).toEqual(['<App>']);
  });

  it('shows an included scope inside a hidden subtree, without the marker itself', () => {
    const app = owner({ component: 'App' });
    const marker = owner({ component: 'AppScope', children: [app] });
    const toolbar = owner({ component: 'Toolbar', children: [marker] });

    const tree = build([toolbar], {
      isExcluded: (node) => node === toolbar,
      isIncluded: (node) => node === marker,
    });

    expect(names(tree.nodes)).toEqual(['<App>']);
    expect(tree.roots).toEqual([tree.nodes[0]!.id]);
  });

  it('drops disposed owners unless asked for them', () => {
    const gone = owner({ component: 'Gone', disposed: true });
    const root = owner({ component: 'App', children: [gone] });

    expect(names(build([root]).nodes)).toEqual(['<App>']);
    expect(names(build([root], { includeDisposed: true }).nodes)).toEqual(['<App>', '<Gone>']);
  });

  it('visits an owner once even when two roots reach it', () => {
    const shared = owner({ component: 'Shared' });
    const first = owner({ component: 'First', children: [shared] });
    const second = owner({ component: 'Second', children: [shared] });

    expect(names(build([first, second]).nodes)).toEqual(['<First>', '<Shared>', '<Second>']);
  });
});

describe('fingerprint', () => {
  it('changes when the tree gains a signal', () => {
    const root = owner({ component: 'App' });
    const before = build([root]).fingerprint;
    root._signals = [signal('count', 0)];

    expect(build([root]).fingerprint).not.toBe(before);
  });

  it('stays the same when nothing moved', () => {
    const root = owner({ component: 'App', signals: [signal('count', 0)] });

    expect(build([root]).fingerprint).toBe(build([root]).fingerprint);
  });
});

describe('ancestorsOf', () => {
  it('walks up to the root', () => {
    const leaf = owner({ component: 'Leaf' });
    const middle = owner({ component: 'Middle', children: [leaf] });
    const root = owner({ component: 'Root', children: [middle] });
    const tree = build([root]);
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));

    expect(ancestorsOf(byId, tree.nodes[2]!.id).map((id) => byId.get(id)!.name)).toEqual([
      '<Middle>',
      '<Root>',
    ]);
  });
});
