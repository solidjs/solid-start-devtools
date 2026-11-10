import { describe, expect, it } from 'vitest';
import {
  editorLocation,
  foldLabel,
  foldLibraryFrames,
  isLibraryFile,
  libraryNames,
  pickDefaultFrame,
} from './frames.js';

describe('isLibraryFile', () => {
  it('flags node_modules, solid-js, @solidjs and the devtools', () => {
    expect(isLibraryFile('http://localhost:3000/node_modules/.vite/deps/x.js?v=1')).toBe(true);
    expect(isLibraryFile('/proj/node_modules/solid-js/dist/dev.js')).toBe(true);
    expect(isLibraryFile('http://localhost/@fs/proj/node_modules/@solidjs/web/dist/web.js')).toBe(
      true,
    );
    expect(isLibraryFile('/proj/packages/solid-js/src/index.ts')).toBe(true);
    expect(isLibraryFile('/proj/node_modules/@solidjs/start-devtools/dist/index.js')).toBe(true);
  });

  it('keeps app files and unknown files', () => {
    expect(isLibraryFile('http://localhost:3000/src/app.tsx')).toBe(false);
    expect(isLibraryFile('/proj/src/solid-js-notes.ts')).toBe(false);
    expect(isLibraryFile(undefined)).toBe(false);
  });
});

describe('foldLibraryFrames', () => {
  const app = (name: string) => ({ file: `/src/${name}.tsx` });
  const lib = (name: string) => ({ file: `/node_modules/${name}/index.js` });

  it('folds each run of library frames', () => {
    const frames = [app('a'), lib('x'), lib('y'), app('b'), lib('z')];
    const segments = foldLibraryFrames(frames);
    expect(segments.map((s) => s.type)).toEqual(['frame', 'fold', 'frame', 'fold']);
    const first = segments[1]!;
    expect(first.type === 'fold' && first.frames).toEqual([frames[1], frames[2]]);
    expect(first.type === 'fold' && first.id).toBe(1);
  });

  it('shows everything when all frames are library frames', () => {
    const segments = foldLibraryFrames([lib('x'), lib('y')]);
    expect(segments.map((s) => s.type)).toEqual(['frame', 'frame']);
  });

  it('shows everything when none is a library frame', () => {
    expect(foldLibraryFrames([app('a'), app('b')]).map((s) => s.type)).toEqual(['frame', 'frame']);
  });
});

describe('pickDefaultFrame', () => {
  it('picks the first app frame, else the first frame', () => {
    const lib = { file: '/node_modules/x/i.js' };
    const app = { file: '/src/a.tsx' };
    expect(pickDefaultFrame([lib, app])).toBe(app);
    expect(pickDefaultFrame([lib])).toBe(lib);
    expect(pickDefaultFrame([])).toBeUndefined();
  });
});

describe('editorLocation', () => {
  it('turns a served url into a root-relative location', () => {
    expect(
      editorLocation({ source: 'http://localhost:3000/src/app.tsx?t=1', line: 4, column: 7 }),
    ).toBe('src/app.tsx:4:7');
  });

  it('keeps absolute file system paths', () => {
    expect(editorLocation({ source: '/@fs/Users/me/app.tsx', line: 2, column: 1 })).toBe(
      '/Users/me/app.tsx:2:1',
    );
    expect(editorLocation({ source: 'file:///Users/me/app.tsx', line: 2 })).toBe(
      '/Users/me/app.tsx:2',
    );
  });

  it('drops leading ../ from source map paths', () => {
    expect(editorLocation({ source: '../../src/app.tsx', line: 9, column: 3 })).toBe(
      'src/app.tsx:9:3',
    );
  });

  it('is undefined without a file or line', () => {
    expect(editorLocation({ source: '', line: 1 })).toBeUndefined();
    expect(editorLocation({ source: 'a.ts' })).toBeUndefined();
  });
});

describe('libraryNames', () => {
  it('leaves out the hashed chunks Vite shares between dependencies', () => {
    expect(
      libraryNames([
        'http://localhost:5173/node_modules/.vite/deps/dev-shared-C0gnZxoQ.js?v=1',
        'http://localhost:5173/node_modules/.vite/deps/solid-js.js?v=1',
      ]),
    ).toEqual(['solid-js']);
  });

  it('reads package names from node_modules, pre-bundled and served paths', () => {
    expect(
      libraryNames([
        '/app/node_modules/.pnpm/solid-js@2.0.0/node_modules/solid-js/dist/dev.js',
        'http://localhost:3000/node_modules/.vite/deps/@solidjs_start_server.js?v=1',
        'http://localhost:3000/node_modules/@solidjs/start/dist/x.js',
        undefined,
      ]),
    ).toEqual(['solid-js', '@solidjs/start']);
  });
});

describe('foldLabel', () => {
  it('names the libraries of the run', () => {
    const files = ['/a/node_modules/solid-js/x.js', '/a/node_modules/@solidjs/start/y.js'];
    expect(foldLabel(files)).toBe('2 frames in solid-js and @solidjs/start');
    expect(foldLabel(['/a/node_modules/solid-js/x.js'])).toBe('1 frame in solid-js');
    expect(foldLabel(['http://x/y.js'])).toBe('1 frame in libraries');
  });
});
