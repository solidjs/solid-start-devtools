import type { JSX } from '@solidjs/web';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  useContext,
} from 'solid-js';
import {
  countEntries,
  formatBytes,
  PROJECT,
  type Entry,
  type FileEntry,
  type FolderEntry,
} from './tree-data.js';
import './styles.css';

interface Selection {
  path: () => string;
  entry: () => Entry | undefined;
  select: (path: string, entry: Entry) => void;
}

const SelectionContext = createContext<Selection>();

function useSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error('SelectionProvider is missing');
  return selection;
}

/** Owns the selection. Every row below reads it out of context. */
function SelectionProvider(props: { children: JSX.Element }): JSX.Element {
  const [path, setPath] = createSignal('app', { name: 'selected-path' });
  const [entry, setEntry] = createSignal<Entry | undefined>(PROJECT, { name: 'selected-entry' });

  const value: Selection = {
    path,
    entry,
    select(next, item) {
      setPath(next);
      setEntry(() => item);
    },
  };

  return <SelectionContext value={value}>{props.children}</SelectionContext>;
}

function FileNode(props: { entry: FileEntry; path: string; depth: number }): JSX.Element {
  const selection = useSelection();
  const active = createMemo(() => selection.path() === props.path, { name: 'file-active' });

  return (
    <button
      class={active() ? 'row active' : 'row'}
      style={{ 'padding-left': `${props.depth * 0.875 + 0.5}rem` }}
      onClick={() => selection.select(props.path, props.entry)}
    >
      <span class={`dot lang-${props.entry.language}`} />
      <span class="row-name">{props.entry.name}</span>
      <span class="row-meta">{formatBytes(props.entry.size)}</span>
    </button>
  );
}

/**
 * Renders itself for every nested folder. Opening a folder mounts a component
 * for each child, so the ownership tree grows with the folder.
 */
function FolderNode(props: { entry: FolderEntry; path: string; depth: number }): JSX.Element {
  const selection = useSelection();
  const [open, setOpen] = createSignal(props.depth < 1, { name: 'folder-open' });
  const stats = createMemo(() => countEntries(props.entry), { name: 'folder-stats' });

  return (
    <>
      <button
        class={selection.path() === props.path ? 'row active' : 'row'}
        style={{ 'padding-left': `${props.depth * 0.875 + 0.25}rem` }}
        onClick={() => {
          setOpen((current) => !current);
          selection.select(props.path, props.entry);
        }}
      >
        <span class={open() ? 'chevron open' : 'chevron'} />
        <span class="row-name folder">{props.entry.name}</span>
        <span class="row-meta">{`${stats().files} files`}</span>
      </button>
      <Show when={open()}>
        <For each={props.entry.entries}>
          {(child) =>
            child.kind === 'folder' ? (
              <FolderNode
                entry={child}
                path={`${props.path}/${child.name}`}
                depth={props.depth + 1}
              />
            ) : (
              <FileNode
                entry={child}
                path={`${props.path}/${child.name}`}
                depth={props.depth + 1}
              />
            )
          }
        </For>
      </Show>
    </>
  );
}

function Breadcrumbs(): JSX.Element {
  const selection = useSelection();
  const segments = createMemo(() => selection.path().split('/'), { name: 'path-segments' });

  return (
    <nav class="breadcrumbs">
      <For each={segments()}>
        {(segment, index) => (
          <>
            <Show when={index() > 0}>
              <span class="crumb-sep">/</span>
            </Show>
            <span class="crumb">{segment}</span>
          </>
        )}
      </For>
    </nav>
  );
}

function Stats(props: { entry: Entry }): JSX.Element {
  const totals = createMemo(() => countEntries(props.entry), { name: 'entry-totals' });
  const average = createMemo(() => (totals().files === 0 ? 0 : totals().bytes / totals().files), {
    name: 'average-size',
  });

  return (
    <div class="stats">
      <div class="stat">
        <span class="stat-label">Files</span>
        <span class="stat-value">{totals().files}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Folders</span>
        <span class="stat-value">{totals().folders}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Size</span>
        <span class="stat-value">{formatBytes(totals().bytes)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Average</span>
        <span class="stat-value">{formatBytes(Math.round(average()))}</span>
      </div>
    </div>
  );
}

/** Mounted and disposed by the toggle, so the tree gains and loses a subtree. */
function PreviewPane(): JSX.Element {
  const selection = useSelection();
  const lines = createMemo(
    () => {
      const entry = selection.entry();
      if (!entry) return [];
      if (entry.kind === 'folder') {
        return entry.entries.map(
          (child) => `${child.kind === 'folder' ? '📁' : '📄'} ${child.name}`,
        );
      }
      return [
        `// ${entry.name}`,
        `// ${entry.language}, ${formatBytes(entry.size)}`,
        'export function handler() {',
        '  return new Response("ok");',
        '}',
      ];
    },
    { name: 'preview-lines' },
  );

  createEffect(
    () => selection.path(),
    (path) => {
      document.title = `${path} — explorer`;
    },
    { name: 'sync-title' },
  );

  return (
    <pre class="preview">
      <For each={lines()}>{(line) => <div>{line}</div>}</For>
    </pre>
  );
}

function Inspector(): JSX.Element {
  const selection = useSelection();
  const [showPreview, setShowPreview] = createSignal(true, { name: 'show-preview' });

  return (
    <section class="inspector">
      <header class="inspector-head">
        <Breadcrumbs />
        <button class="toggle" onClick={() => setShowPreview((current) => !current)}>
          {showPreview() ? 'Hide preview' : 'Show preview'}
        </button>
      </header>
      <Show when={selection.entry()}>{(entry) => <Stats entry={entry()} />}</Show>
      <Show when={showPreview()}>
        <PreviewPane />
      </Show>
    </section>
  );
}

function Explorer(): JSX.Element {
  return (
    <section class="explorer">
      <header class="explorer-head">
        <span class="explorer-title">Project</span>
      </header>
      <div class="rows">
        <FolderNode entry={PROJECT} path="app" depth={0} />
      </div>
    </section>
  );
}

export default function App(): JSX.Element {
  return (
    <SelectionProvider>
      <main class="page">
        <header class="masthead">
          <div>
            <h1>Explorer</h1>
            <p class="subtitle">
              A demo app for the ownership panel. Open the toolbar, pick the tree icon, then expand
              a folder and watch the components appear.
            </p>
          </div>
        </header>
        <div class="columns">
          <Explorer />
          <Inspector />
        </div>
      </main>
    </SelectionProvider>
  );
}
