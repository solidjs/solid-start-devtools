import type { ResizableDetail } from '../../ui/use-resizable-detail.js';

/**
 * Turns a detail width into the width of the pane before the handle.
 *
 * The handle sits on the left edge of the pane after it, so dragging it to
 * the left makes the pane before it narrower, where it would widen a detail
 * pane that sits at the right edge.
 */
export function leadingPane(detail: ResizableDetail): ResizableDetail {
  return {
    ...detail,
    drag: (offsetX) => detail.drag(-offsetX),
    step: (deltaX, panelWidth) => detail.step(-deltaX, panelWidth),
  };
}
