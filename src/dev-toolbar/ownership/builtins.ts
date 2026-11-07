import { For, Hydration, Match, NoHydration, Repeat, Reveal, Show, Switch } from 'solid-js';
import { Dynamic, HydrationScript, Portal } from '@solidjs/web';
import { componentLocation, type RawNode } from './tree.js';

/** The components Solid ships. Loading and Errored are left out, they mark boundaries. */
const BUILTIN_FUNCTIONS = new Set<unknown>([
  For,
  Show,
  Switch,
  Match,
  Repeat,
  Reveal,
  NoHydration,
  Hydration,
  Dynamic,
  Portal,
  HydrationScript,
]);

/**
 * Names to fall back on for built-ins whose function the runtime wraps, such
 * as `Dynamic`. A name only counts when the component has no source location,
 * because the app's own components carry one.
 */
const BUILTIN_NAMES = new Set([
  'For',
  'Index',
  'Show',
  'Switch',
  'Match',
  'Repeat',
  'Dynamic',
  'Portal',
  'Reveal',
  'NoHydration',
  'Hydration',
  'HydrationScript',
  'Document',
]);

/** True for a component owner that comes from solid-js or @solidjs/web. */
export function isSolidBuiltin(owner: RawNode): boolean {
  const component = owner._component;
  if (!component) return false;
  // Step 1: the function itself is the reliable test.
  if (BUILTIN_FUNCTIONS.has(component.fn)) return true;
  // Step 2: otherwise trust the name, unless the app declared it.
  const name = typeof component.name === 'string' ? component.name : component.fn?.name;
  return typeof name === 'string' && BUILTIN_NAMES.has(name) && !componentLocation(owner);
}
