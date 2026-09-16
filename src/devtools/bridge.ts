import { createSignal } from 'solid-js';

/**
 * Carries a jump between two dock panels.
 *
 * The toolbar keeps these requests in the component that renders both panels.
 * Each dock entry mounts on its own, with no component above the two, so the
 * requests live here instead. Both panels run in the page the app runs in, so
 * a signal is enough and nothing has to be serialized.
 */
export const [graphFocus, setGraphFocus] = createSignal<{ node: object }>();
export const [ownershipFocus, setOwnershipFocus] = createSignal<{ owner: object }>();
