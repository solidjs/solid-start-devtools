import { createEffect } from 'solid-js';
import { drawBoxes, type FlashBox } from './canvas.js';
import { measureUpdate } from './rects.js';
import { getFlashColors, UpdateHighlightTracker } from './tracker.js';

export interface HighlightUpdatesOverlayProps {
  active: boolean;
}

/**
 * Outlines each updated node on one canvas above the page. The canvas sits in
 * a shadow root, so page styles cannot reach it, and drawing adds no elements
 * the page could see.
 */
export function HighlightUpdatesOverlay(props: HighlightUpdatesOverlayProps): null {
  createEffect(
    () => props.active,
    (active) => {
      if (!active || typeof window === 'undefined') return;

      const host = document.createElement('div');
      host.setAttribute('data-solid-highlight-overlay', '');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText =
        'all:initial;position:fixed;inset:0;pointer-events:none;z-index:999998;display:block';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:100%;height:100%';
      host.attachShadow({ mode: 'open' }).append(canvas);
      document.body.append(host);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        host.remove();
        return;
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      // The boxes of each node. A node that updates again replaces its boxes.
      const boxes = new Map<Node, FlashBox[]>();
      let frame: number | null = null;

      function resize() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.round(window.innerWidth * dpr);
        const height = Math.round(window.innerHeight * dpr);
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Setting the size clears the canvas, so draw now rather than show an
        // empty frame. The pending frame is dropped first, or each resize would
        // start one more draw loop.
        if (frame !== null) cancelAnimationFrame(frame);
        draw();
      }

      function draw() {
        frame = null;
        const all: FlashBox[] = [];
        for (const list of boxes.values()) all.push(...list);
        const showing = new Set(
          drawBoxes(
            ctx!,
            window.innerWidth,
            window.innerHeight,
            all,
            performance.now(),
            !reducedMotion.matches,
          ),
        );
        for (const [node, list] of boxes) {
          if (!showing.has(list[0]!)) boxes.delete(node);
        }
        if (boxes.size > 0) schedule();
      }

      function schedule() {
        frame ??= requestAnimationFrame(draw);
      }

      // The boxes are in viewport coordinates, so they move against a scroll of the window.
      let scrollX = window.scrollX;
      let scrollY = window.scrollY;
      function onScroll() {
        const dx = window.scrollX - scrollX;
        const dy = window.scrollY - scrollY;
        scrollX = window.scrollX;
        scrollY = window.scrollY;
        if (dx === 0 && dy === 0) return;
        for (const list of boxes.values()) {
          for (const box of list) {
            box.left -= dx;
            box.top -= dy;
          }
        }
        schedule();
      }

      const tracker = new UpdateHighlightTracker();
      const unsubscribe = tracker.subscribe((event) => {
        const rects = measureUpdate(event.node);
        if (rects.length === 0) return;
        const colors = getFlashColors(event.count);
        const start = performance.now();
        const list: FlashBox[] = [];
        for (const rect of rects) {
          list.push({ ...rect, color: colors.color, background: colors.background, start });
        }
        boxes.set(event.node, list);
        schedule();
      });

      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('scroll', onScroll, { passive: true });
      tracker.start();

      return () => {
        unsubscribe();
        tracker.stop();
        window.removeEventListener('resize', resize);
        window.removeEventListener('scroll', onScroll);
        if (frame !== null) cancelAnimationFrame(frame);
        boxes.clear();
        host.remove();
      };
    },
  );

  return null;
}
