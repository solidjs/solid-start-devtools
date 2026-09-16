/**
 * Collects the stylesheets the panels ship with.
 *
 * The toolbar renders in the page, where the document head reaches everything
 * it draws. Vite DevTools mounts a panel inside a shadow root instead, and the
 * document head does not cross that boundary, so every root that asks for the
 * styles gets its own copy of the same text.
 */
type StyleRoot = Document | ShadowRoot;

const sheets: string[] = [];
const mounted = new Map<StyleRoot, HTMLStyleElement>();

function write(root: StyleRoot, element: HTMLStyleElement): void {
  element.textContent = sheets.join('\n');
  if (element.isConnected) return;
  const parent = root instanceof Document ? root.head : root;
  parent.append(element);
}

/** Adds a stylesheet. The build calls this for every css file the panels import. */
export function registerStyle(text: string): void {
  sheets.push(text);
  // The page itself is styled as soon as anything is imported, which is what
  // the standalone toolbar expects.
  if (typeof document !== 'undefined') attachStyles(document);
  for (const [root, element] of mounted) write(root, element);
}

/** Puts every stylesheet into a root. The returned function takes them back out. */
export function attachStyles(root: StyleRoot): () => void {
  let element = mounted.get(root);
  if (!element) {
    element = (root instanceof Document ? root : root.ownerDocument).createElement('style');
    element.dataset.solidDevToolbarStyles = '';
    mounted.set(root, element);
  }
  write(root, element);
  return () => {
    mounted.get(root)?.remove();
    mounted.delete(root);
  };
}
