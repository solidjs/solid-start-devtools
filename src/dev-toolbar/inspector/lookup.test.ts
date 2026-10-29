import { afterEach, describe, expect, it } from 'vitest';
import {
  findComponentFromElement,
  findComponentOwner,
  installElementTracking,
  tagElementComponent,
  uninstallElementTracking,
} from './lookup.js';
import type { RawNode } from '../ownership/tree.js';

interface MockElement {
  tagName: string;
  parentElement: MockElement | null;
  isToolbar?: boolean;
  closest(selector: string): MockElement | null;
}

function createMockElement(tag: string, parent: MockElement | null = null): MockElement {
  const el: MockElement = {
    tagName: tag.toUpperCase(),
    parentElement: parent,
    closest(selector: string) {
      if (selector === '[data-solid-dev-toolbar]' && this.isToolbar) return this;
      return this.parentElement ? this.parentElement.closest(selector) : null;
    },
  };
  return el;
}

describe('findComponentOwner', () => {
  it('returns undefined if owner is nullish', () => {
    expect(findComponentOwner(undefined)).toBeUndefined();
    expect(findComponentOwner(null)).toBeUndefined();
  });

  it('returns owner directly if it is a component', () => {
    const compOwner: RawNode = {
      _component: { name: 'App', props: {}, fn() {} },
    };
    expect(findComponentOwner(compOwner)).toBe(compOwner);
  });

  it('climbs parent chain to find component owner', () => {
    const compOwner: RawNode = {
      _component: { name: 'Header', props: {}, fn() {} },
    };
    const memoOwner: RawNode = {
      _parent: compOwner,
      _deps: null,
      _fn() {},
    };
    const effectOwner: RawNode = {
      _parent: memoOwner,
      _deps: null,
      _fn() {},
    };

    expect(findComponentOwner(effectOwner)).toBe(compOwner);
  });
});

describe('findComponentFromElement with tagged nodes', () => {
  it('ignores elements inside the dev toolbar', () => {
    const toolbar = createMockElement('div');
    toolbar.isToolbar = true;
    const button = createMockElement('button', toolbar);

    const compOwner: RawNode = {
      _component: { name: 'Ignored', props: {}, fn() {} },
    };
    tagElementComponent(button as unknown as Element, compOwner);

    expect(findComponentFromElement(button as unknown as Element)).toBeUndefined();
  });

  it('finds component owner on tagged element', () => {
    const button = createMockElement('button');

    const compOwner: RawNode = {
      _component: { name: 'Card', props: {}, fn() {} },
    };
    tagElementComponent(button as unknown as Element, compOwner);

    const result = findComponentFromElement(button as unknown as Element);
    expect(result).toBeDefined();
    expect(result?.owner).toBe(compOwner);
    expect(result?.name).toBe('<Card>');
    expect(result?.element).toBe(button as unknown as Element);
  });

  it('finds component owner when nested child is hovered', () => {
    const section = createMockElement('section');
    const span = createMockElement('span', section);

    const compOwner: RawNode = {
      _component: {
        name: 'Greeting',
        props: {},
        fn: Object.assign(() => {}, { location: 'src/Greeting.tsx:10:2' }),
      },
    };
    tagElementComponent(section as unknown as Element, compOwner);

    const result = findComponentFromElement(span as unknown as Element);
    expect(result).toBeDefined();
    expect(result?.owner).toBe(compOwner);
    expect(result?.name).toBe('<Greeting>');
    expect(result?.location).toBe('src/Greeting.tsx:10:2');
    expect(result?.element).toBe(section as unknown as Element);
  });
});

describe('installElementTracking', () => {
  afterEach(() => {
    uninstallElementTracking();
  });

  it('installs and uninstalls cleanly in node environment', () => {
    const cleanup = installElementTracking();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
