import { describe, expect, it } from 'vitest';
import { SignalHistory } from './signal-history.js';

describe('SignalHistory', () => {
  it('has no change for a node seen once', () => {
    const history = new SignalHistory();
    expect(history.lastChange({ _value: 1 }, 10)).toBeUndefined();
  });

  it('reports the previous value and when it changed', () => {
    const history = new SignalHistory();
    const node = { _value: 'paid' };
    history.lastChange(node, 10);
    node._value = 'refunded';
    expect(history.lastChange(node, 20)).toEqual({ prev: '"paid"', at: 20 });
    // Reading again without a change keeps the same answer.
    expect(history.lastChange(node, 30)).toEqual({ prev: '"paid"', at: 20 });
  });
});
