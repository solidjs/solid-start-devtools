import { describe, expect, it, vi } from 'vitest';
import { boxAlpha, drawBoxes, type FlashBox } from './canvas.js';
import { FADE_OUT_DURATION_MS } from './tracker.js';

function box(start: number): FlashBox {
  return {
    left: 10,
    top: 20,
    width: 80,
    height: 16,
    color: '#4483ec',
    background: 'rgba(68, 131, 236, 0.22)',
    start,
  };
}

function mockContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
  };
}

describe('boxAlpha', () => {
  it('holds, then fades to 0 at the end of the duration', () => {
    const b = box(0);
    expect(boxAlpha(b, 0, true)).toBe(1);
    expect(boxAlpha(b, FADE_OUT_DURATION_MS * 0.1, true)).toBe(1);
    const middle = boxAlpha(b, FADE_OUT_DURATION_MS * 0.6, true);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(boxAlpha(b, FADE_OUT_DURATION_MS, true)).toBe(0);
  });

  it('stays opaque until the end without the fade', () => {
    const b = box(0);
    expect(boxAlpha(b, FADE_OUT_DURATION_MS * 0.9, false)).toBe(1);
    expect(boxAlpha(b, FADE_OUT_DURATION_MS, false)).toBe(0);
  });
});

describe('drawBoxes', () => {
  it('draws the boxes still showing and drops the rest', () => {
    const ctx = mockContext();
    const fresh = box(1000);
    const old = box(1000 - FADE_OUT_DURATION_MS);

    const showing = drawBoxes(
      ctx as unknown as CanvasRenderingContext2D,
      800,
      600,
      [fresh, old],
      1000,
      true,
    );

    expect(showing).toEqual([fresh]);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(ctx.roundRect).toHaveBeenCalledTimes(1);
    // The border sits inside the box.
    expect(ctx.roundRect).toHaveBeenCalledWith(10.75, 20.75, 78.5, 14.5, 3);
    expect(ctx.strokeStyle).toBe('#4483ec');
    expect(ctx.globalAlpha).toBe(1);
  });
});
