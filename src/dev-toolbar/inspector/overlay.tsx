import { JSX, Portal } from '@solidjs/web';
import { createEffect, createSignal, Show } from 'solid-js';
import { findComponentFromElement, type InspectedComponent } from './lookup.js';
import './overlay.css';

export interface InspectorOverlayProps {
  active: boolean;
  onSelect: (component: InspectedComponent) => void;
  onCancel: () => void;
}

interface HoverState {
  rect: DOMRect;
  name: string;
  location?: string;
  component?: InspectedComponent;
}

function formatLocation(loc?: string): string | undefined {
  if (!loc) return undefined;
  const parts = loc.split('/');
  return parts.length > 1 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : loc;
}

export function InspectorOverlay(props: InspectorOverlayProps): JSX.Element {
  const [hovered, setHovered] = createSignal<HoverState>();
  let lastTarget: Element | null = null;

  function updateHover(target: Element | null) {
    if (!target || target === document.body || target === document.documentElement) {
      setHovered(undefined);
      lastTarget = null;
      return;
    }

    if (target.closest('[data-solid-dev-toolbar]')) {
      setHovered(undefined);
      lastTarget = null;
      return;
    }

    lastTarget = target;
    const comp = findComponentFromElement(target);
    if (comp) {
      setHovered({
        rect: comp.element.getBoundingClientRect(),
        name: comp.name,
        location: comp.location,
        component: comp,
      });
      return;
    }

    setHovered({
      rect: target.getBoundingClientRect(),
      name: `<${target.tagName.toLowerCase()}>`,
    });
  }

  createEffect(
    () => props.active,
    (active) => {
      if (!active || typeof window === 'undefined') return;

      const previousCursor = document.body.style.cursor;
      document.body.style.cursor = 'crosshair';

      const onPointerMove = (e: PointerEvent) => {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        // The lookup walks the whole ownership tree, so it runs only when the
        // pointer moves onto another element.
        if (target === lastTarget) return;
        updateHover(target);
      };

      const onClick = (e: MouseEvent) => {
        const target = e.target as Element | null;
        if (target?.closest('[data-solid-dev-toolbar]')) return;

        e.preventDefault();
        e.stopPropagation();

        const current = hovered();
        if (current?.component) {
          props.onSelect(current.component);
        } else {
          props.onCancel();
        }
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          props.onCancel();
        }
      };

      const onScrollOrResize = () => {
        if (lastTarget) updateHover(lastTarget);
      };

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('click', onClick, { capture: true });
      window.addEventListener('keydown', onKeyDown, { capture: true });
      window.addEventListener('scroll', onScrollOrResize, {
        passive: true,
        capture: true,
      });
      window.addEventListener('resize', onScrollOrResize, { passive: true });

      return () => {
        document.body.style.cursor = previousCursor;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('click', onClick, { capture: true });
        window.removeEventListener('keydown', onKeyDown, { capture: true });
        window.removeEventListener('scroll', onScrollOrResize, { capture: true });
        window.removeEventListener('resize', onScrollOrResize);
        setHovered(undefined);
        lastTarget = null;
      };
    },
  );

  return (
    <Show when={props.active && hovered()}>
      {(state) => {
        const rect = () => state().rect;
        const top = () =>
          rect().top < 34 ? `${rect().bottom + 6}px` : `${Math.max(4, rect().top - 28)}px`;
        const left = () => `${Math.max(8, Math.min(rect().left, window.innerWidth - 240))}px`;

        return (
          <Portal>
            <div data-solid-inspector-overlay aria-hidden="true">
              <div
                data-solid-inspector-box
                style={{
                  left: `${rect().left}px`,
                  top: `${rect().top}px`,
                  width: `${rect().width}px`,
                  height: `${rect().height}px`,
                }}
              />
              <div
                data-solid-inspector-badge
                style={{
                  left: left(),
                  top: top(),
                }}
              >
                <span data-solid-inspector-badge-name>{state().name}</span>
                <Show when={state().location}>
                  {(loc) => <span data-solid-inspector-badge-loc>{formatLocation(loc())}</span>}
                </Show>
                <span data-solid-inspector-badge-size>
                  {`${Math.round(rect().width)} × ${Math.round(rect().height)}`}
                </span>
              </div>
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
