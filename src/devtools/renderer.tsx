import { render } from '@solidjs/web';
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client';
import { getOwner } from 'solid-js';
import OwnershipViewer from '../dev-toolbar/ownership/index.js';
import { excludeOwner } from '../dev-toolbar/ownership/registry.js';
import ReactivityViewer from '../dev-toolbar/reactivity/index.js';
import { excludeReactiveOwner } from '../dev-toolbar/reactivity/registry.js';
import { attachStyles } from '../dev-toolbar/styles.js';
import { graphFocus, ownershipFocus, setGraphFocus, setOwnershipFocus } from './bridge.js';
import { OWNERSHIP_DOCK_ID, REACTIVITY_DOCK_ID } from './ids.js';
import './renderer.css';

/**
 * Renders a panel into a Vite DevTools dock.
 *
 * The dock runs this in the page the app runs in, so the panels read the same
 * runtime they read inside the toolbar. Nothing crosses to the dev server.
 */
export default function setup(context: DockClientScriptContext): void {
  const id = context.current.entryMeta.id;
  let dispose: (() => void) | undefined;

  function mount(panel: HTMLElement): void {
    dispose?.();

    // The dock may isolate the panel in a shadow root, which the document head
    // does not reach, so the styles are delivered to the root that holds it.
    const detachStyles = attachStyles(panel.getRootNode() as Document | ShadowRoot);
    const host = document.createElement('div');
    host.dataset.solidDevtoolsDock = '';
    panel.append(host);

    const unmount = render(() => {
      // The panel renders in the page it inspects. Marking its root keeps
      // everything it creates out of the graph and the tree it draws.
      const owner = getOwner();
      excludeOwner(owner);
      excludeReactiveOwner(owner);

      return id === OWNERSHIP_DOCK_ID ? (
        <OwnershipViewer
          show
          focus={ownershipFocus()}
          onViewInGraph={(node) => {
            setGraphFocus({ node });
            void context.docks.switchEntry(REACTIVITY_DOCK_ID);
          }}
        />
      ) : (
        <ReactivityViewer
          show
          focus={graphFocus()}
          onViewOwner={(owner) => {
            setOwnershipFocus({ owner });
            void context.docks.switchEntry(OWNERSHIP_DOCK_ID);
          }}
        />
      );
    }, host);

    dispose = () => {
      unmount();
      host.remove();
      detachStyles();
      dispose = undefined;
    };
  }

  context.current.events.on('dom:panel:mounted', mount);

  context.current.events.on('entry:deactivated', () => {
    dispose?.();
  });

  // The dock loads this module the first time the entry opens, which is after
  // it mounted the panel, so the event for that panel has already been sent.
  const panel = context.current.domElements.panel;
  if (panel) mount(panel);
}
