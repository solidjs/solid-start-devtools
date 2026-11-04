/** A run of consecutive frames, shown as is or folded behind one row. */
export type FrameSegment<T> =
  | { type: 'frame'; frame: T }
  | { type: 'fold'; id: number; frames: T[] };

const LIBRARY_PATTERNS = [
  /[\\/]node_modules[\\/]/,
  /[\\/]\.vite[\\/]deps[\\/]/,
  /[\\/]solid-js(?:[\\/]|$)/,
  /[\\/]@solidjs[\\/]/,
  /[\\/]start-devtools[\\/]/,
  /[\\/]solid-start-devtools[\\/]/,
];

/** Whether a frame's file belongs to a library or to the devtools instead of the app. */
export function isLibraryFile(file: string | undefined): boolean {
  if (!file) return false;
  // Drop the query so `?v=abc` cannot hide a match.
  const path = file.split('?')[0]!;
  for (const pattern of LIBRARY_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  return false;
}

/**
 * Groups frames into rows. Each run of library frames becomes one fold row.
 * When every frame is a library frame, or none is, nothing folds.
 */
export function foldLibraryFrames<T extends { file?: string }>(frames: T[]): FrameSegment<T>[] {
  const library: boolean[] = [];
  let libraryCount = 0;
  for (const frame of frames) {
    const isLibrary = isLibraryFile(frame.file);
    library.push(isLibrary);
    if (isLibrary) libraryCount++;
  }

  const segments: FrameSegment<T>[] = [];
  if (libraryCount === 0 || libraryCount === frames.length) {
    for (const frame of frames) segments.push({ type: 'frame', frame });
    return segments;
  }

  let run: T[] = [];
  let runStart = 0;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    if (library[i]) {
      if (run.length === 0) runStart = i;
      run.push(frame);
      continue;
    }
    if (run.length > 0) {
      segments.push({ type: 'fold', id: runStart, frames: run });
      run = [];
    }
    segments.push({ type: 'frame', frame });
  }
  if (run.length > 0) segments.push({ type: 'fold', id: runStart, frames: run });
  return segments;
}

/** The frame the panel opens on: the first one from the app, else the first one. */
export function pickDefaultFrame<T extends { file?: string }>(frames: T[]): T | undefined {
  for (const frame of frames) {
    if (!isLibraryFile(frame.file)) return frame;
  }
  return frames[0];
}

/**
 * The `file:line:column` the dev server's open-in-editor endpoint expects.
 * `undefined` when the frame has no file or line.
 */
export function editorLocation(source: {
  source?: string;
  line?: number;
  column?: number;
}): string | undefined {
  const raw = source.source;
  if (!raw || !source.line) return undefined;

  // Reduce the source to a path the dev server can find.
  let path = raw.split('?')[0]!;
  if (path.startsWith('file://')) {
    path = path.slice('file://'.length);
  } else if (/^https?:\/\//.test(path)) {
    // A served file is relative to the project root, not the origin.
    path = path.replace(/^https?:\/\/[^/]+\/?/, '');
  }
  if (path.startsWith('/@fs/')) path = '/' + path.slice('/@fs/'.length).replace(/^\/+/, '');
  // Source maps point to files with `../` segments that only mean something to the bundler.
  path = path.replace(/^(\.\.?\/)+/, '');
  if (!path) return undefined;

  const column = source.column ? `:${source.column}` : '';
  return `${path}:${source.line}${column}`;
}
