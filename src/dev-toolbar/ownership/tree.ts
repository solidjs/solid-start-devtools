/** Raw owner or signal from the runtime. Only the fields the tree needs are read. */
export type RawNode = Record<string, any>;

const REACTIVE_DISPOSED = 1 << 6;

const EFFECT_RENDER = 1;
const EFFECT_USER = 2;
const EFFECT_TRACKED = 3;

export type OwnerKind =
  | 'component'
  | 'root'
  | 'memo'
  | 'effect'
  | 'render-effect'
  | 'tracked-effect'
  | 'scope';

const KIND_LABELS: Record<OwnerKind, string> = {
  component: 'component',
  root: 'root',
  memo: 'memo',
  effect: 'effect',
  'render-effect': 'render effect',
  'tracked-effect': 'tracked effect',
  scope: 'scope',
};

export interface OwnedSignal {
  id: string;
  name: string;
  value: unknown;
}

/** A scope folded into the component above it, such as a memo or an effect. */
export interface FoldedScope {
  id: string;
  kind: OwnerKind;
  name: string;
  value: unknown;
  hasValue: boolean;
}

export interface TreeNode {
  id: string;
  parentId: string | undefined;
  kind: OwnerKind;
  name: string;
  depth: number;
  children: string[];
  /** Signals this owner created, plus those of the scopes it stands in for. */
  signals: OwnedSignal[];
  /**
   * Prop names of a component. Props are getters, so the tree lists the names
   * and never reads the values.
   */
  props: string[] | undefined;
  /** Current value of a computed owner. */
  value: unknown;
  hasValue: boolean;
  disposed: boolean;
  /** Owners this node stands in for, when scopes are folded away. */
  scopes: FoldedScope[];
}

export interface OwnershipTree {
  nodes: TreeNode[];
  roots: string[];
  /** Cheap identity of the tree. Equal fingerprints mean nothing changed. */
  fingerprint: string;
}

export const EMPTY_TREE: OwnershipTree = { nodes: [], roots: [], fingerprint: 'empty' };

export function isComponent(owner: RawNode): boolean {
  return !!owner._component;
}

function isComputed(owner: RawNode): boolean {
  return '_deps' in owner && typeof owner._fn === 'function';
}

export function ownerKind(owner: RawNode): OwnerKind {
  if (isComponent(owner)) return 'component';
  if (isComputed(owner)) {
    switch (owner._type) {
      case EFFECT_RENDER:
        return 'render-effect';
      case EFFECT_USER:
        return 'effect';
      case EFFECT_TRACKED:
        return 'tracked-effect';
      default:
        return 'memo';
    }
  }
  if (owner._root) return 'root';
  return 'scope';
}

/** The hot reload transform wraps components, and its wrapper carries the tag. */
const REFRESH_PREFIX = '[solid-refresh]';

export function ownerName(owner: RawNode, kind: OwnerKind): string {
  if (kind === 'component') {
    let name = owner._component?.name;
    if (typeof name === 'string' && name.startsWith(REFRESH_PREFIX)) {
      name = name.slice(REFRESH_PREFIX.length);
    }
    return `<${typeof name === 'string' && name.length > 0 ? name : 'Anonymous'}>`;
  }
  const name = owner._name;
  if (typeof name === 'string' && name.length > 0) return name;
  return KIND_LABELS[kind];
}

function propNames(owner: RawNode): string[] | undefined {
  const props = owner._component?.props;
  if (!props || typeof props !== 'object') return undefined;
  try {
    return Object.keys(props);
  } catch {
    return undefined;
  }
}

function isDisposed(owner: RawNode): boolean {
  return typeof owner._flags === 'number' && (owner._flags & REACTIVE_DISPOSED) !== 0;
}

export interface BuildOptions {
  children(owner: RawNode): RawNode[];
  signals(owner: RawNode): RawNode[];
  identify(node: object): string;
  /** Owners that belong to the toolbar. Their subtree is hidden. */
  isExcluded(owner: RawNode): boolean;
  /** Owners that are app code again, even inside a hidden subtree. */
  isIncluded(owner: RawNode): boolean;
  /** Show components only, folding the scopes between them away. */
  componentsOnly: boolean;
  /** Keep owners the runtime already disposed. */
  includeDisposed?: boolean;
}

/**
 * Builds the owner tree, depth first.
 *
 * In component mode only component owners become rows. The scopes between them
 * are folded into the nearest component above, and the signals those scopes own
 * are listed on that component, so a component shows everything created under
 * it.
 */
export function buildOwnershipTree(roots: RawNode[], options: BuildOptions): OwnershipTree {
  const nodes: TreeNode[] = [];
  const topLevel: string[] = [];
  const seen = new Set<RawNode>();

  function describe(owner: RawNode, parentId: string | undefined, depth: number): TreeNode {
    const kind = ownerKind(owner);
    const node: TreeNode = {
      id: options.identify(owner),
      parentId,
      kind,
      name: ownerName(owner, kind),
      depth,
      children: [],
      signals: [],
      props: kind === 'component' ? propNames(owner) : undefined,
      value: '_value' in owner ? owner._value : undefined,
      hasValue: '_value' in owner,
      disposed: isDisposed(owner),
      scopes: [],
    };
    nodes.push(node);
    if (parentId === undefined) topLevel.push(node.id);
    return node;
  }

  function collectSignals(owner: RawNode, into: TreeNode): void {
    for (const signal of options.signals(owner)) {
      if (!signal || typeof signal !== 'object') continue;
      const name = signal._name;
      into.signals.push({
        id: options.identify(signal),
        name: typeof name === 'string' && name.length > 0 ? name : 'signal',
        value: signal._value,
      });
    }
  }

  function walk(owner: RawNode, host: TreeNode | undefined, depth: number, hidden: boolean): void {
    if (!owner || typeof owner !== 'object' || seen.has(owner)) return;
    seen.add(owner);

    // The nearest marker decides. The toolbar wraps the app, so the app's own
    // scope sits inside the toolbar's hidden subtree and turns visibility back
    // on for everything below it. The marker itself is toolbar code, so it
    // never becomes a row.
    if (options.isIncluded(owner)) {
      for (const child of options.children(owner)) walk(child, undefined, 0, false);
      return;
    }

    if (options.isExcluded(owner) || hidden) {
      for (const child of options.children(owner)) walk(child, undefined, 0, true);
      return;
    }

    if (isDisposed(owner) && !options.includeDisposed) return;

    const shown = !options.componentsOnly || isComponent(owner);

    if (shown) {
      const node = describe(owner, host?.id, depth);
      if (host) host.children.push(node.id);
      collectSignals(owner, node);
      for (const child of options.children(owner)) walk(child, node, depth + 1, false);
      return;
    }

    // Folded scope. Its signals and children belong to the component above it.
    if (host) {
      const kind = ownerKind(owner);
      host.scopes.push({
        id: options.identify(owner),
        kind,
        name: ownerName(owner, kind),
        value: '_value' in owner ? owner._value : undefined,
        hasValue: '_value' in owner,
      });
      collectSignals(owner, host);
    }
    for (const child of options.children(owner)) walk(child, host, depth, false);
  }

  for (const root of roots) walk(root, undefined, 0, false);

  let fingerprint = `${nodes.length}:${topLevel.length}`;
  for (const node of nodes) {
    fingerprint += `|${node.id}${node.kind}${node.children.length}${node.signals.length}${
      node.scopes.length
    }${node.disposed ? 'd' : ''}`;
    for (const signal of node.signals) fingerprint += `,${signal.id}`;
    for (const scope of node.scopes) fingerprint += `;${scope.id}`;
  }

  return { nodes, roots: topLevel, fingerprint };
}

/** Ids of `id` and every node above it, used to keep matches visible. */
export function ancestorsOf(nodes: Map<string, TreeNode>, id: string): string[] {
  const path: string[] = [];
  let current = nodes.get(id);
  while (current?.parentId) {
    path.push(current.parentId);
    current = nodes.get(current.parentId);
  }
  return path;
}
