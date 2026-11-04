import { describe, expect, it } from 'vitest';
import {
  collectActivity,
  describeHeat,
  formatAgo,
  pushRateSample,
  type ActivityNode,
  type RateSample,
} from './heat.js';
import type { TreeNode } from './tree.js';

function row(id: string, owner: object): TreeNode {
  return { id, owner } as unknown as TreeNode;
}

describe('collectActivity', () => {
  it('adds a memo and a signal to the component above them', () => {
    const component = { _parent: null };
    const memo = { _parent: component };
    const activity = collectActivity(
      [row('a', component)],
      [
        { kind: 'memo', updates: 2, updatedAt: 10, pending: false, raw: memo, owner: component },
        {
          kind: 'signal',
          updates: 1,
          updatedAt: 30,
          pending: true,
          raw: {},
          owner: component,
        } satisfies ActivityNode,
      ],
    );
    expect(activity.get('a')).toEqual({ updates: 3, updatedAt: 30, pending: true });
  });

  it('skips nodes outside every row', () => {
    const activity = collectActivity(
      [row('a', {})],
      [{ kind: 'memo', updates: 1, updatedAt: 1, pending: false, raw: {}, owner: undefined }],
    );
    expect(activity.size).toBe(0);
  });
});

describe('pushRateSample', () => {
  it('measures updates per second over the window', () => {
    const samples: RateSample[] = [];
    expect(pushRateSample(samples, 1000, 0)).toBe(0);
    expect(pushRateSample(samples, 2000, 60)).toBe(60);
  });

  it('starts over when the total goes down', () => {
    const samples: RateSample[] = [];
    pushRateSample(samples, 1000, 50);
    pushRateSample(samples, 2000, 0);
    expect(samples).toHaveLength(1);
  });
});

describe('describeHeat', () => {
  const now = 100_000;
  it('shows nothing for a row that never ran', () => {
    expect(describeHeat(undefined, 0, now)).toEqual({
      dot: undefined,
      text: undefined,
      tone: undefined,
    });
  });

  it('marks a very frequent row red with its rate', () => {
    const heat = describeHeat({ updates: 90, updatedAt: now - 10, pending: false }, 60, now);
    expect(heat).toMatchObject({ dot: 'red', text: '60/s' });
  });

  it('tells a recent update and goes amber after a while', () => {
    expect(
      describeHeat({ updates: 1, updatedAt: now - 4000, pending: false }, 0, now),
    ).toMatchObject({
      dot: 'red',
      text: 'updated 4s ago',
    });
    expect(
      describeHeat({ updates: 1, updatedAt: now - 20_000, pending: false }, 0, now),
    ).toMatchObject({
      dot: 'amber',
    });
    expect(describeHeat({ updates: 1, updatedAt: now - 120_000, pending: false }, 0, now)).toEqual({
      dot: undefined,
      text: undefined,
      tone: undefined,
    });
  });

  it('shows waiting in amber', () => {
    expect(describeHeat({ updates: 0, updatedAt: 0, pending: true }, 0, now)).toMatchObject({
      text: 'waiting',
      tone: 'amber',
    });
  });
});

describe('formatAgo', () => {
  it('picks the unit', () => {
    expect(formatAgo(4000)).toBe('4s');
    expect(formatAgo(120_000)).toBe('2m');
    expect(formatAgo(7_200_000)).toBe('2h');
  });
});
