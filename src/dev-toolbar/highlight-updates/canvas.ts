import type { UpdateRect } from './rects.js';
import { FADE_OUT_DURATION_MS } from './tracker.js';

export interface FlashBox extends UpdateRect {
  /** The border color, as `#rrggbb`. */
  color: string;
  /** The fill color. */
  background: string;
  /** When the box appeared, in `performance.now()` time. */
  start: number;
}

/** The part of the fade a box stays fully opaque, so a short update is still seen. */
const HOLD = 0.15;
const BORDER_WIDTH = 1.5;
const RADIUS = 3;

/** How opaque a box is at `now`: 1 during the hold, then down to 0 at the end. */
export function boxAlpha(box: FlashBox, now: number, fade: boolean): number {
  const progress = (now - box.start) / FADE_OUT_DURATION_MS;
  if (progress >= 1) return 0;
  if (!fade || progress <= HOLD) return 1;
  return 1 - (progress - HOLD) / (1 - HOLD);
}

/**
 * Clears the canvas and draws every box that has not run out. The context is
 * a parameter, so the same code can draw on an OffscreenCanvas in a worker.
 * Returns the boxes still showing, for the next frame.
 */
export function drawBoxes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  boxes: FlashBox[],
  now: number,
  fade: boolean,
): FlashBox[] {
  ctx.clearRect(0, 0, width, height);
  const showing: FlashBox[] = [];
  for (const box of boxes) {
    const alpha = boxAlpha(box, now, fade);
    if (alpha <= 0) continue;
    showing.push(box);
    // The border is drawn inside the box, as `box-sizing: border-box` would.
    const inset = BORDER_WIDTH / 2;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(
      box.left + inset,
      box.top + inset,
      Math.max(0, box.width - BORDER_WIDTH),
      Math.max(0, box.height - BORDER_WIDTH),
      RADIUS,
    );
    ctx.fillStyle = box.background;
    ctx.fill();
    ctx.lineWidth = BORDER_WIDTH;
    ctx.strokeStyle = box.color;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return showing;
}
