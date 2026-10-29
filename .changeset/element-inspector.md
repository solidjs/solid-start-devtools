---
'@solidjs/start-devtools': minor
---

Add interactive Element Inspector and cross-panel component funneling:

- Press `Alt+Shift+C` or click the crosshair icon in the dock header to inspect DOM elements.
- Hovering elements shows an overlay with the component name, file location, and dimensions.
- Clicking an element selects the component and funnels relevant data across devtool panels without interrupting your active view.
- Reactivity graph filters to reactive signals, memos, and computations owned by the selected component instance.
- Ownership tree automatically expands, scrolls to, and highlights the selected component.
- The funnel badge in the dock header provides quick navigation to the Ownership tree, direct "See in editor" launch, and 1-click filter clearing.
