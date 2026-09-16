import { describe, expect, it, vi } from 'vitest';
import { createDevHooksHub, type DevHooksSlot } from './dev-hooks.js';

describe('createDevHooksHub', () => {
  it('leaves the slot alone until something listens', () => {
    const original = () => {};
    const slot: DevHooksSlot = { onUpdate: original };

    createDevHooksHub(slot);

    expect(slot.onUpdate).toBe(original);
  });

  it('calls the hooks it found and every listener', () => {
    const found = vi.fn();
    const slot: DevHooksSlot = { onUpdate: found };
    const hub = createDevHooksHub(slot);
    const first = vi.fn();
    const second = vi.fn();

    hub.listen({ onUpdate: first });
    hub.listen({ onUpdate: second });
    slot.onUpdate!();

    expect(found).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // Opening the graph from the ownership panel starts one listener and stops
  // another in the same flush. The listener that started must keep working.
  it('keeps a listener working when an older one leaves', () => {
    const slot: DevHooksSlot = {};
    const hub = createDevHooksHub(slot);
    const tree = vi.fn();
    const graph = vi.fn();

    const stopTree = hub.listen({ onOwner: tree });
    hub.listen({ onOwner: graph });
    stopTree();
    slot.onOwner!({});

    expect(graph).toHaveBeenCalledTimes(1);
    expect(tree).not.toHaveBeenCalled();
  });

  it('puts the original hooks back when the last listener leaves', () => {
    const original = () => {};
    const slot: DevHooksSlot = { onGraph: original };
    const hub = createDevHooksHub(slot);

    const stopFirst = hub.listen({});
    const stopSecond = hub.listen({});
    stopFirst();
    expect(slot.onGraph).not.toBe(original);
    stopSecond();

    expect(slot.onGraph).toBe(original);
  });

  it('ignores a stop called twice', () => {
    const slot: DevHooksSlot = {};
    const hub = createDevHooksHub(slot);
    const graph = vi.fn();

    const stop = hub.listen({});
    hub.listen({ onUpdate: graph });
    stop();
    stop();
    slot.onUpdate!();

    expect(graph).toHaveBeenCalledTimes(1);
  });

  it('installs again after every listener left', () => {
    const slot: DevHooksSlot = {};
    const hub = createDevHooksHub(slot);
    const graph = vi.fn();

    hub.listen({})();
    hub.listen({ onOwner: graph });
    slot.onOwner!({});

    expect(graph).toHaveBeenCalledTimes(1);
  });
});
