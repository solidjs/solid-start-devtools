import { getOwner } from 'solid-js';
import { snapshotOwnershipTree } from '../ownership/registry.js';
import {
  componentLocation,
  isComponent,
  ownerName,
  type RawNode,
  type TreeNode,
} from '../ownership/tree.js';

export interface InspectedComponent {
  element: Element;
  owner: RawNode;
  name: string;
  location?: string;
  treeNode?: TreeNode;
}

const nodeToComponent = new WeakMap<Node, RawNode>();
let elementTrackingInstalled = false;
let originalClone: typeof Node.prototype.cloneNode | undefined;
let originalCreate: typeof Document.prototype.createElement | undefined;
let originalCreateNS: typeof Document.prototype.createElementNS | undefined;

/**
 * Climbs the reactive owner hierarchy to find the nearest enclosing component owner.
 */
export function findComponentOwner(owner: RawNode | null | undefined): RawNode | undefined {
  let cur = owner;
  while (cur) {
    if (isComponent(cur)) return cur;
    cur = cur._parent;
  }
  return undefined;
}

/**
 * Associates a DOM element directly with a component owner.
 */
export function tagElementComponent(node: Node, compOwner: RawNode): void {
  nodeToComponent.set(node, compOwner);
}

/**
 * Patches DOM creation primitives so elements created while a component
 * is executing can be mapped directly back to that component owner.
 */
export function installElementTracking(): () => void {
  if (elementTrackingInstalled || typeof window === 'undefined') {
    return uninstallElementTracking;
  }
  elementTrackingInstalled = true;

  originalClone = Node.prototype.cloneNode;
  Node.prototype.cloneNode = function (this: Node, deep?: boolean): Node {
    const clone = originalClone!.call(this, deep);
    const owner = getOwner();
    const comp = findComponentOwner(owner as RawNode | null | undefined);
    if (comp && clone) {
      nodeToComponent.set(clone, comp);
    }
    return clone;
  };

  originalCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (
    this: Document,
    ...args: Parameters<typeof Document.prototype.createElement>
  ): HTMLElement {
    const el = originalCreate!.apply(this, args);
    const owner = getOwner();
    const comp = findComponentOwner(owner as RawNode | null | undefined);
    if (comp && el) {
      nodeToComponent.set(el, comp);
    }
    return el;
  };

  originalCreateNS = Document.prototype.createElementNS;
  Document.prototype.createElementNS = function (this: Document, ...args: [any, any, any?]): any {
    const el = originalCreateNS!.apply(
      this,
      args as Parameters<typeof Document.prototype.createElementNS>,
    );
    const owner = getOwner();
    const comp = findComponentOwner(owner as RawNode | null | undefined);
    if (comp && el) {
      nodeToComponent.set(el, comp);
    }
    return el;
  };

  return uninstallElementTracking;
}

/**
 * Restores original DOM creation primitives.
 */
export function uninstallElementTracking(): void {
  if (!elementTrackingInstalled || typeof window === 'undefined') return;
  elementTrackingInstalled = false;

  if (originalClone) {
    Node.prototype.cloneNode = originalClone;
    originalClone = undefined;
  }
  if (originalCreate) {
    Document.prototype.createElement = originalCreate;
    originalCreate = undefined;
  }
  if (originalCreateNS) {
    Document.prototype.createElementNS = originalCreateNS;
    originalCreateNS = undefined;
  }
}

/**
 * Finds the component owner associated with a given DOM element.
 * Walks up the DOM tree and checks the weak node map as well as
 * any binding effects recorded in the ownership hierarchy.
 */
export function findComponentFromElement(target: Element): InspectedComponent | undefined {
  if (typeof target.closest === 'function' && target.closest('[data-solid-dev-toolbar]')) {
    return undefined;
  }

  const compTree = snapshotOwnershipTree({ componentsOnly: true });
  const compNodesByOwner = new Map<RawNode, TreeNode>();
  for (const node of compTree.nodes) {
    compNodesByOwner.set(node.owner, node);
  }

  // Also snapshot full tree to discover any _devElement references on render effects
  const fullTree = snapshotOwnershipTree({ componentsOnly: false });
  const devElementToComp = new Map<Element, RawNode>();
  for (const node of fullTree.nodes) {
    const devEl = node.owner?._devElement;
    if (devEl && typeof devEl === 'object') {
      const comp = findComponentOwner(node.owner);
      if (comp) {
        devElementToComp.set(devEl, comp);
      }
    }
  }

  let current: Element | null = target;
  while (current) {
    if (
      typeof document !== 'undefined' &&
      (current === document.body || current === document.documentElement)
    ) {
      break;
    }

    let comp = nodeToComponent.get(current) ?? devElementToComp.get(current);

    if (comp) {
      const treeNode = compNodesByOwner.get(comp);
      const name = treeNode?.name ?? ownerName(comp, 'component');
      const location = treeNode?.location ?? componentLocation(comp);
      return {
        element: current,
        owner: comp,
        name,
        location,
        treeNode,
      };
    }

    current = current.parentElement;
  }

  return undefined;
}
