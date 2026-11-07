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
  // A linked checkout of the devtools. Only its code: the examples in the
  // checkout are apps, and a server stack names them by their absolute path.
  /[\\/]solid-start-devtools[\\/](?:dist|src)[\\/]/,
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

/** The package a library file belongs to, when its path says. */
function packageOf(file: string): string | undefined {
  const path = file.split('?')[0]!.replace(/\\/g, '/');

  // A pre-bundled dependency is one flat file, with `/` of a scoped name written as `_`.
  const bundled = /\/\.vite\/deps\/([^/]+?)(?:\.[cm]?js)?$/.exec(path)?.[1];
  if (bundled) {
    // A chunk Vite split out and shares between dependencies ends in a hash,
    // such as `dev-shared-C0gnZxoQ`. It names no package.
    if (/-[A-Za-z0-9_]{8}$/.test(bundled)) return undefined;
    const scoped = /^(@[^_]+)_([^_]+)/.exec(bundled);
    return scoped ? `${scoped[1]}/${scoped[2]}` : bundled.split('_')[0];
  }

  // A package manager folder holds the package name after the last node_modules.
  const modules = path.split('node_modules/');
  if (modules.length > 1) {
    const parts = modules[modules.length - 1]!.split('/');
    if (parts[0]!.startsWith('@') && parts[1]) return `${parts[0]}/${parts[1]}`;
    return parts[0] || undefined;
  }

  // The runtime and the start package, served from outside node_modules.
  const scoped = /\/(@solidjs)\/([^/]+)/.exec(path);
  if (scoped) return `${scoped[1]}/${scoped[2]}`;
  if (/\/solid-js(?:\/|$)/.test(path)) return 'solid-js';
  return undefined;
}

/** The names of the packages a run of library frames comes from, first seen first. */
export function libraryNames(files: (string | undefined)[]): string[] {
  const names: string[] = [];
  for (const file of files) {
    const name = file ? packageOf(file) : undefined;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The label of a folded run: "6 frames in solid-js and @solidjs/start". */
export function foldLabel(files: (string | undefined)[]): string {
  const names = libraryNames(files);
  const count = `${files.length} ${files.length === 1 ? 'frame' : 'frames'}`;
  if (names.length === 0) return `${count} in libraries`;
  if (names.length === 1) return `${count} in ${names[0]}`;
  if (names.length === 2) return `${count} in ${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${count} in ${names[0]}, ${names[1]} and ${names[2]}`;
  return `${count} in ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
