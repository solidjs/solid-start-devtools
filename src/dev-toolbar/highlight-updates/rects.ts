export interface UpdateRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where an updated node shows on the screen. A text node gives one box per
 * line it covers, so a change outlines only the text that changed and follows
 * it when it wraps. An element gives its own box. Nodes with no size give none.
 */
export function measureUpdate(node: Node): UpdateRect[] {
  const rects: UpdateRect[] = [];
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    const document = node.ownerDocument;
    if (!document) return rects;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width >= 1 && rect.height >= 1) {
        rects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      }
    }
    range.detach();
    return rects;
  }
  if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
    const rect = (node as Element).getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) {
      rects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
  }
  return rects;
}
