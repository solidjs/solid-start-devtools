import { describe, expect, it, vi } from 'vitest';
import { measureUpdate } from './rects.js';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height } as DOMRect;
}

describe('measureUpdate', () => {
  it('gives one box per line of a text node', () => {
    const range = {
      selectNodeContents: vi.fn(),
      getClientRects: () => [rect(10, 20, 80, 16), rect(10, 36, 40, 16)],
      detach: vi.fn(),
    };
    const text = {
      nodeType: 3,
      ownerDocument: { createRange: () => range },
    } as unknown as Node;

    expect(measureUpdate(text)).toEqual([
      { left: 10, top: 20, width: 80, height: 16 },
      { left: 10, top: 36, width: 40, height: 16 },
    ]);
    expect(range.selectNodeContents).toHaveBeenCalledWith(text);
  });

  it('gives the box of an element', () => {
    const element = {
      nodeType: 1,
      getBoundingClientRect: () => rect(4, 8, 120, 32),
    } as unknown as Node;

    expect(measureUpdate(element)).toEqual([{ left: 4, top: 8, width: 120, height: 32 }]);
  });

  it('skips boxes with no size', () => {
    const range = {
      selectNodeContents: vi.fn(),
      getClientRects: () => [rect(0, 0, 0, 16)],
      detach: vi.fn(),
    };
    const text = {
      nodeType: 3,
      ownerDocument: { createRange: () => range },
    } as unknown as Node;
    const element = {
      nodeType: 1,
      getBoundingClientRect: () => rect(0, 0, 0, 0),
    } as unknown as Node;

    expect(measureUpdate(text)).toEqual([]);
    expect(measureUpdate(element)).toEqual([]);
  });
});
