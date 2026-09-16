/// <reference types="@vitejs/devtools-kit" />
import type { Plugin } from 'vite';
import { OWNERSHIP_DOCK_ID, REACTIVITY_DOCK_ID } from './devtools/ids.js';

const RENDERER = '@solidjs/start-devtools/devtools-renderer';
const COLLECTOR = '@solidjs/start-devtools/devtools-collector';

/**
 * Adds the reactivity graph and the ownership tree to Vite DevTools.
 *
 * Both panels read the runtime of the running app, so they render in the app's
 * own page through a custom-render dock rather than in an iframe. The toolbar
 * keeps working on its own; this only offers the same panels to projects that
 * already have Vite DevTools open.
 */
export function solidDevtoolsDocks(): Plugin {
  return {
    name: 'solid-start-devtools:docks',
    apply: 'serve',
    // The runtime only reports nodes as they are created, so the page starts
    // watching with the app rather than when a panel first opens.
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `/@id/${COLLECTOR}` },
          injectTo: 'head-prepend' as const,
        },
      ];
    },
    devtools: {
      setup(context) {
        context.docks.register({
          id: REACTIVITY_DOCK_ID,
          title: 'Reactivity Graph',
          icon: 'ph:graph-duotone',
          category: 'app',
          type: 'custom-render',
          renderer: { importFrom: RENDERER, importName: 'default' },
        });
        context.docks.register({
          id: OWNERSHIP_DOCK_ID,
          title: 'Ownership Tree',
          icon: 'ph:tree-structure-duotone',
          category: 'app',
          type: 'custom-render',
          renderer: { importFrom: RENDERER, importName: 'default' },
        });
      },
    },
  };
}

export default solidDevtoolsDocks;
