export interface FileEntry {
  kind: 'file';
  name: string;
  size: number;
  language: string;
}

export interface FolderEntry {
  kind: 'folder';
  name: string;
  entries: Entry[];
}

export type Entry = FileEntry | FolderEntry;

function file(name: string, size: number, language: string): FileEntry {
  return { kind: 'file', name, size, language };
}

function folder(name: string, entries: Entry[]): FolderEntry {
  return { kind: 'folder', name, entries };
}

/** Fixed data so the server render and the client render agree. */
export const PROJECT: FolderEntry = folder('app', [
  folder('routes', [
    file('index.tsx', 1240, 'tsx'),
    file('about.tsx', 640, 'tsx'),
    folder('orders', [
      file('[id].tsx', 2180, 'tsx'),
      file('layout.tsx', 820, 'tsx'),
      folder('components', [
        file('OrderRow.tsx', 1460, 'tsx'),
        file('OrderTotals.tsx', 980, 'tsx'),
      ]),
    ]),
  ]),
  folder('lib', [
    file('db.ts', 3120, 'ts'),
    file('session.ts', 1580, 'ts'),
    folder('hooks', [file('use-cart.ts', 940, 'ts'), file('use-theme.ts', 520, 'ts')]),
  ]),
  folder('styles', [file('app.css', 2260, 'css'), file('reset.css', 410, 'css')]),
  file('entry-client.tsx', 380, 'tsx'),
  file('entry-server.tsx', 460, 'tsx'),
]);

export function countEntries(entry: Entry): { files: number; folders: number; bytes: number } {
  if (entry.kind === 'file') return { files: 1, folders: 0, bytes: entry.size };
  return entry.entries.reduce(
    (total, child) => {
      const inner = countEntries(child);
      return {
        files: total.files + inner.files,
        folders: total.folders + inner.folders,
        bytes: total.bytes + inner.bytes,
      };
    },
    { files: 0, folders: 1, bytes: 0 },
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}
