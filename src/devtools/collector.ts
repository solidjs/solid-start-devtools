import { startOwnershipTracking } from '../dev-toolbar/ownership/registry.js';
import { startReactivityTracking } from '../dev-toolbar/reactivity/registry.js';

/**
 * Watches the runtime from the moment the page loads.
 *
 * The toolbar wraps the app, so it is listening before the app creates
 * anything. A dock panel opens whenever the reader asks for it, which is long
 * after the app rendered, and the runtime only reports owners and signals as
 * they are created. The plugin loads this module with the app instead, so both
 * registries already hold the app by the time a panel opens.
 */
let stop: (() => void) | undefined;

export function startCollecting(): () => void {
  if (stop) return stop;
  const stopOwnership = startOwnershipTracking();
  const stopReactivity = startReactivityTracking();
  stop = () => {
    stopOwnership();
    stopReactivity();
    stop = undefined;
  };
  return stop;
}

startCollecting();
