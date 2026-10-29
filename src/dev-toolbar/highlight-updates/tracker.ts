export interface HighlightColors {
  color: string;
  background: string;
}

/**
 * SolidJS themed color progression based on update frequency:
 * 1 update: Solid Light Blue (#4483ec)
 * 2-3 updates: Purple (#9333ea)
 * 4-7 updates: Pink (#ec4899)
 * 8+ updates: Red (#ef4444)
 */
export function getFlashColors(count: number): HighlightColors {
  if (count <= 1) {
    return {
      color: '#4483ec',
      background: 'rgba(68, 131, 236, 0.22)',
    };
  }
  if (count <= 3) {
    return {
      color: '#9333ea',
      background: 'rgba(147, 51, 234, 0.25)',
    };
  }
  if (count <= 7) {
    return {
      color: '#ec4899',
      background: 'rgba(236, 72, 153, 0.28)',
    };
  }
  return {
    color: '#ef4444',
    background: 'rgba(239, 68, 68, 0.32)',
  };
}

export const FADE_OUT_DURATION_MS = 400;
export const INACTIVITY_RESET_MS = 800;
/** The most updates one frame reports, so a large change does not stall the page. */
export const MAX_UPDATES_PER_FRAME = 200;

export interface UpdateEvent {
  node: Node;
  count: number;
}

export type UpdateListener = (event: UpdateEvent) => void;

function isElement(node: unknown): node is Element {
  if (typeof Element !== 'undefined') {
    return node instanceof Element;
  }
  return typeof node === 'object' && node !== null && 'tagName' in node;
}

function isIgnored(target: Node | null): boolean {
  if (!target) return true;
  if (typeof document !== 'undefined') {
    if (target === document.body || target === document.documentElement) return true;
  }

  const element = isElement(target) ? target : target.parentElement;
  if (!element) return true;

  if (
    element.closest(
      '[data-solid-dev-toolbar], [data-solid-highlight-overlay], [data-solid-inspector-overlay]',
    )
  ) {
    return true;
  }

  const tag = element.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'meta' || tag === 'link') {
    return true;
  }

  return false;
}

interface ActiveCounter {
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

export class UpdateHighlightTracker {
  private activeCounts = new Map<Node, ActiveCounter>();
  private observer: MutationObserver | null = null;
  private listeners = new Set<UpdateListener>();
  private pendingNodes = new Set<Node>();
  private rafId: number | null = null;
  private windowObj: Window | undefined;

  constructor(windowObj?: Window) {
    this.windowObj = windowObj ?? (typeof window !== 'undefined' ? window : undefined);
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: UpdateEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public start() {
    const win = this.windowObj;
    if (!win || this.observer || typeof MutationObserver === 'undefined') return;

    const ObserverClass = (win as any).MutationObserver ?? MutationObserver;
    this.observer = new ObserverClass((mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        if (isIgnored(mutation.target)) continue;

        if (mutation.type === 'characterData') {
          this.pendingNodes.add(mutation.target);
        } else if (mutation.type === 'childList') {
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const added = mutation.addedNodes[i];
            if (!isIgnored(added)) {
              this.pendingNodes.add(added);
            }
          }
        } else if (mutation.type === 'attributes') {
          if (isElement(mutation.target) && !isIgnored(mutation.target)) {
            this.pendingNodes.add(mutation.target);
          }
        }
      }

      this.scheduleFlush();
    });

    this.observer.observe(win.document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true,
    });
  }

  public stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.rafId !== null && this.windowObj) {
      this.windowObj.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    for (const entry of this.activeCounts.values()) {
      clearTimeout(entry.timer);
    }
    this.activeCounts.clear();
    this.pendingNodes.clear();
  }

  public recordNodeUpdate(node: Node) {
    if (isIgnored(node)) return;

    const existing = this.activeCounts.get(node);
    const count = (existing?.count ?? 0) + 1;

    if (existing) {
      clearTimeout(existing.timer);
      existing.count = count;
      existing.timer = setTimeout(() => {
        this.activeCounts.delete(node);
      }, INACTIVITY_RESET_MS);
    } else {
      const entry: ActiveCounter = {
        count,
        timer: setTimeout(() => {
          this.activeCounts.delete(node);
        }, INACTIVITY_RESET_MS),
      };
      this.activeCounts.set(node, entry);
    }

    this.notify({ node, count });
  }

  private scheduleFlush = () => {
    if (this.rafId !== null || !this.windowObj) return;
    this.rafId = this.windowObj.requestAnimationFrame(() => {
      this.rafId = null;
      let reported = 0;
      for (const node of this.pendingNodes) {
        if (reported >= MAX_UPDATES_PER_FRAME) break;
        if (node.isConnected) {
          this.recordNodeUpdate(node);
          reported++;
        }
      }
      this.pendingNodes.clear();
    });
  };
}
