import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_GRAPH,
  excludeReactiveOwner,
  includeReactiveOwner,
  isReactivityAvailable,
  snapshotReactivityGraph,
  startReactivityTracking,
  subscribeReactivityGraph,
} from './registry.js';

// Covers the path an app takes in production, where solid-js ships no dev
// hooks. The test runner resolves the development build, which has them, so
// the suite takes them away.
vi.mock('solid-js', async (original) => ({
  ...(await original<typeof import('solid-js')>()),
  DEV: undefined,
}));

describe('registry without the dev runtime', () => {
  it('reports that the graph is unavailable', () => {
    expect(isReactivityAvailable()).toBe(false);
  });

  it('returns an empty graph', () => {
    expect(snapshotReactivityGraph()).toBe(EMPTY_GRAPH);
  });

  it('keeps tracking a no-op', () => {
    const stop = startReactivityTracking();

    expect(() => stop()).not.toThrow();
  });

  it('ignores owners that are not objects', () => {
    expect(() => excludeReactiveOwner(null)).not.toThrow();
    expect(() => includeReactiveOwner(undefined)).not.toThrow();
  });

  it('never calls a listener', () => {
    let calls = 0;
    const unsubscribe = subscribeReactivityGraph(() => calls++);
    snapshotReactivityGraph();
    unsubscribe();

    expect(calls).toBe(0);
  });
});
