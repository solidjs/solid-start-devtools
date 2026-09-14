import { describe, expect, it } from 'vitest';
import {
  EMPTY_GRAPH,
  excludeReactiveOwner,
  includeReactiveOwner,
  isReactivityAvailable,
  snapshotReactivityGraph,
  startReactivityTracking,
  subscribeReactivityGraph,
} from './registry.js';

// This suite runs against the server build of solid-js, which ships no dev
// hooks. It covers the path an app takes in production.
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
