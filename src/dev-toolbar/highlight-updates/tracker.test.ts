import { describe, expect, it, vi } from 'vitest';
import {
  getFlashColors,
  INACTIVITY_RESET_MS,
  MAX_UPDATES_PER_FRAME,
  type UpdateEvent,
  UpdateHighlightTracker,
} from './tracker.js';

describe('getFlashColors', () => {
  it('returns solid light blue for 1 update', () => {
    const colors = getFlashColors(1);
    expect(colors.color).toBe('#4483ec');
    expect(colors.background).toContain('rgba(68, 131, 236');
  });

  it('returns purple for 2-3 updates', () => {
    expect(getFlashColors(2).color).toBe('#9333ea');
    expect(getFlashColors(3).color).toBe('#9333ea');
  });

  it('returns pink for 4-7 updates', () => {
    expect(getFlashColors(4).color).toBe('#ec4899');
    expect(getFlashColors(7).color).toBe('#ec4899');
  });

  it('returns red for 8+ updates', () => {
    expect(getFlashColors(8).color).toBe('#ef4444');
    expect(getFlashColors(15).color).toBe('#ef4444');
  });
});

describe('UpdateHighlightTracker', () => {
  function createMockElement(): Element {
    const el = {
      tagName: 'BUTTON',
      isConnected: true,
      closest: vi.fn().mockReturnValue(null),
    };
    return el as unknown as Element;
  }

  function createMockTextNode(text = '42') {
    const parent = createMockElement();
    return {
      nodeType: 3,
      textContent: text,
      parentElement: parent,
      isConnected: true,
    } as unknown as Node;
  }

  it('tracks node updates and increments count within window', () => {
    vi.useFakeTimers();
    const tracker = new UpdateHighlightTracker();

    const events: UpdateEvent[] = [];
    tracker.subscribe((event) => {
      events.push(event);
    });

    const textNode = createMockTextNode('100');
    tracker.recordNodeUpdate(textNode);

    expect(events).toHaveLength(1);
    expect(events[0].count).toBe(1);
    expect(events[0].node).toBe(textNode);

    // Repeated update within inactivity window increments count
    tracker.recordNodeUpdate(textNode);
    expect(events).toHaveLength(2);
    expect(events[1].count).toBe(2);

    // After inactivity resets, next update starts at 1
    vi.advanceTimersByTime(INACTIVITY_RESET_MS);
    tracker.recordNodeUpdate(textNode);
    expect(events).toHaveLength(3);
    expect(events[2].count).toBe(1);

    vi.useRealTimers();
  });

  it('reports at most MAX_UPDATES_PER_FRAME updates in one frame', () => {
    let frame: (() => void) | undefined;
    const win = {
      requestAnimationFrame: (callback: () => void) => {
        frame = callback;
        return 1;
      },
    } as unknown as Window;
    const tracker = new UpdateHighlightTracker(win);
    const events: UpdateEvent[] = [];
    tracker.subscribe((event) => {
      events.push(event);
    });

    const pending = (tracker as unknown as { pendingNodes: Set<Node> }).pendingNodes;
    for (let i = 0; i < MAX_UPDATES_PER_FRAME + 50; i++) {
      pending.add(createMockTextNode(String(i)));
    }
    (tracker as unknown as { scheduleFlush: () => void }).scheduleFlush();
    frame?.();

    expect(events).toHaveLength(MAX_UPDATES_PER_FRAME);
    expect(pending.size).toBe(0);
    tracker.stop();
  });
});
