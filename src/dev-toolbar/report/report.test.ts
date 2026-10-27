import { toCrossJSONStream } from 'seroval';
import { describe, expect, it } from 'vitest';
import { BODY_FORMAT_KEY, BodyFormat } from '../functions/body-format.js';
import type { ServerFunctionRequest, ServerFunctionResponse } from '../functions/tracker.js';
import type { TreeNode } from '../ownership/tree.js';
import type { ReactiveNode } from '../reactivity/registry.js';
import { errorReport } from './error-report.js';
import { readReportBody, serverFunctionReport } from './function-report.js';
import { code, displayPath, excerpt, fence } from './markdown.js';
import { ownerReport } from './owner-report.js';
import { reactiveReport } from './reactive-report.js';
import { redactJson, redactText, redactUrl } from './redact.js';
import { serovalBodyText } from './seroval-text.js';
import { describeValue } from './value.js';

describe('markdown', () => {
  it('fences text longer than any backtick run inside it', () => {
    expect(fence('a ``` b', 'ts')).toBe('````ts\na ``` b\n````');
    expect(code('a`b')).toBe('``a`b``');
  });

  it('marks the line and the column of an excerpt', () => {
    const content = ['one', 'two', 'three', 'four', 'five'].join('\n');
    expect(excerpt(content, 3, 2, 1)).toBe(
      ['  2 | two', '> 3 | three', '    |  ^', '  4 | four'].join('\n'),
    );
  });

  it('cuts a long line around the column', () => {
    const line = `${'a'.repeat(300)}X${'b'.repeat(300)}`;
    const [marked, caret] = excerpt(line, 1, 301, 0).split('\n');
    expect(marked!.length).toBeLessThan(180);
    expect(marked![caret!.indexOf('^')]).toBe('X');
  });

  it('shows a path without its origin, /@fs prefix and query', () => {
    expect(displayPath('http://localhost:3000/src/App.tsx?t=123')).toBe('/src/App.tsx');
    expect(displayPath('http://localhost:3000/@fs/Users/me/app/src/App.tsx')).toBe(
      '/Users/me/app/src/App.tsx',
    );
    expect(displayPath('src/App.tsx')).toBe('src/App.tsx');
  });
});

describe('redaction', () => {
  it('replaces values with sensitive keys in JSON', () => {
    expect(redactJson({ user: 'ada', password: 'x', nested: [{ apiKey: 'k' }] })).toEqual({
      user: 'ada',
      password: '[redacted]',
      nested: [{ apiKey: '[redacted]' }],
    });
  });

  it('keeps keys that only look close to a sensitive name', () => {
    expect(redactJson({ author: 'ada', compass: 'n' })).toEqual({ author: 'ada', compass: 'n' });
  });

  it('replaces sensitive pairs in text and URLs', () => {
    expect(redactText('{ token: "abc", id: "1" }')).toBe('{ token: "[redacted]", id: "1" }');
    expect(redactText('session=abc&page=2')).toBe('session=[redacted]&page=2');
    expect(redactUrl('/login?next=%2F&token=abc')).toBe('/login?next=%2F&token=[redacted]');
  });

  it('replaces unquoted values, credentials and query pairs in text', () => {
    expect(redactText('{"password": 123, "id": 1}')).toBe('{"password": [redacted], "id": 1}');
    expect(redactText('token: abc123')).toBe('token: [redacted]');
    expect(redactText('Authorization: Bearer abc.def')).toBe('Authorization: Bearer [redacted]');
    expect(redactText('fn(apiKey=sk-1)')).toBe('fn(apiKey=[redacted])');
    expect(redactText('<http://h/x?a=1&token=abc>; rel="next"')).toBe(
      '<http://h/x?a=1&token=[redacted]>; rel="next"',
    );
    expect(redactText('user: ada')).toBe('user: ada');
  });
});

describe('describeValue', () => {
  it('prints nested values, cycles and sensitive keys', () => {
    const value: Record<string, unknown> = { list: [1, 'a'], secret: 's', map: new Map([[1, 2]]) };
    value.self = value;
    expect(describeValue(value)).toBe(
      '{ list: [1, "a"], secret: [redacted], map: Map(1) { 1 => 2 }, self: [Circular] }',
    );
  });

  it('stops at a depth limit', () => {
    expect(describeValue({ a: { b: { c: { d: 1 } } } })).toBe('{ a: { b: { c: {…} } } }');
  });
});

describe('errorReport', () => {
  it('lists the stack and the source of the first app frames', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'map')");
    const report = errorReport({
      error,
      route: '/todos?token=abc',
      frames: [
        {
          name: 'TodoList',
          file: 'http://localhost:3000/src/TodoList.tsx',
          line: 2,
          column: 15,
          content: 'export function TodoList(props) {\n  return props.items.map(Item);\n}',
        },
        {
          name: 'runComputation',
          file: 'http://localhost:3000/node_modules/.vite/deps/solid-js.js',
          line: 10,
          column: 1,
          content: 'x',
        },
        {
          name: 'TodoPage',
          file: 'http://localhost:3000/src/TodoPage.tsx',
          line: 1,
          column: 1,
          content: undefined,
        },
        {
          name: 'untrack',
          file: '/node_modules/.pnpm/@solidjs+signals@2.0.0/node_modules/@solidjs/signals/dist/dev.js',
          line: 1,
          column: 1,
          content: undefined,
        },
        {
          name: 'createComponent',
          file: '/node_modules/.pnpm/solid-js@2.0.0/node_modules/solid-js/dist/solid.dev.js',
          line: 1,
          column: 1,
          content: undefined,
        },
      ],
    });
    expect(report).toContain("TypeError: Cannot read properties of undefined (reading 'map')");
    expect(report).toContain('- Page: `/todos?token=[redacted]`');
    expect(report).toContain('- `TodoList` at `/src/TodoList.tsx:2:15`');
    expect(report).toContain(
      '- `runComputation` at `/node_modules/.vite/deps/solid-js.js:10:1` (dependency)',
    );
    expect(report).toContain('- … 2 frames in dependencies: `@solidjs/signals`, `solid-js`');
    expect(report).toContain(
      '```tsx\n  1 | export function TodoList(props) {\n> 2 |   return props.items.map(Item);',
    );
    expect(report).not.toContain('### `/node_modules');
  });

  it('reports a value that is not an error', () => {
    expect(errorReport({ error: 'boom', frames: [], route: '/' })).toContain('```\nboom\n```');
  });
});

function chunk(data: string): Uint8Array {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const out = new Uint8Array(12 + bytes.length);
  out.set(encoder.encode(`;0x${bytes.length.toString(16).padStart(8, '0')};`));
  out.set(bytes, 12);
  return out;
}

/** A body in the stream format of server functions, made by seroval itself. */
function serovalStream(value: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      toCrossJSONStream(value, {
        onParse(node) {
          controller.enqueue(chunk(JSON.stringify(node)));
        },
        onDone() {
          controller.close();
        },
        onError(error) {
          controller.error(error);
        },
      });
    },
  });
}

describe('serovalBodyText', () => {
  it('renders the value of a stream, with settled promises', async () => {
    const shared = { id: 1 };
    const text = await serovalBodyText(
      serovalStream({
        todos: [shared, shared],
        when: new Date('2026-01-01T00:00:00.000Z'),
        later: Promise.resolve('done'),
        password: 'hunter2',
      }),
    );
    expect(text).toContain('todos: [{ id: 1 }, { id: 1 }]');
    expect(text).toContain('when: Date(2026-01-01T00:00:00.000Z)');
    expect(text).toContain('later: Promise<resolved: "done">');
    expect(text).toContain('password: [redacted]');
    expect(text).not.toContain('hunter2');
  });

  it('redacts the values of sensitive Map keys', async () => {
    const text = await serovalBodyText(
      serovalStream(
        new Map([
          ['token', 'abc'],
          ['id', 'x'],
        ]),
      ),
    );
    expect(text).toBe('Map { "token" => [redacted], "id" => "x" }');
  });
});

function call(
  body: BodyInit | undefined,
  headers: Record<string, string>,
): { request: ServerFunctionRequest; response: ServerFunctionResponse } {
  return {
    request: {
      type: 'request',
      id: 'src/api.ts#getTodos',
      instance: 'src/api.ts#getTodos#1',
      source: new Request('http://localhost:3000/_server?id=1', {
        method: 'POST',
        body: JSON.stringify([{ filter: 'all', token: 'abc' }]),
        headers: { 'content-type': 'application/json', cookie: 'sid=1' },
      }),
      meta: { name: 'getTodos' },
      time: 1000,
    },
    response: {
      type: 'response',
      id: 'src/api.ts#getTodos',
      instance: 'src/api.ts#getTodos#1',
      source: new Response(body, { status: 200, headers }),
      meta: { name: 'getTodos' },
      time: 1250,
    },
  };
}

describe('serverFunctionReport', () => {
  it('reads both bodies and redacts headers and keys', async () => {
    const instance = call(serovalStream([{ id: 1, title: 'Write' }]), {
      [BODY_FORMAT_KEY]: BodyFormat.Serialized,
      'set-cookie': 'sid=2',
    });
    const [requestBody, responseBody] = await Promise.all([
      readReportBody(instance.request.source),
      readReportBody(instance.response.source),
    ]);
    const report = serverFunctionReport({ ...instance, requestBody, responseBody, route: '/' });

    expect(report).toContain('# Server function call: `getTodos`');
    expect(report).toContain('- Response: `200`');
    expect(report).toContain('- Time: 0.25s');
    expect(report).toContain('cookie: [redacted]');
    expect(report).toContain('set-cookie: [redacted]');
    expect(report).toContain('"token": "[redacted]"');
    expect(report).toContain('Body (seroval):');
    expect(report).toContain('[{ id: 1, title: "Write" }]');
    // The panel reads the original bodies, so the report reads clones.
    expect(instance.request.source.bodyUsed).toBe(false);
    expect(instance.response.source.bodyUsed).toBe(false);
  });

  it('redacts URLs in headers that are not sensitive by name', () => {
    const { request } = call(undefined, {});
    request.source.headers.set('x-return-to', 'http://localhost:3000/cb?access_token=abc');
    const report = serverFunctionReport({ request, route: '/' });
    expect(report).toContain('x-return-to: http://localhost:3000/cb?access_token=[redacted]');
  });

  it('stops reading a body that stays open', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\n'));
      },
    });
    const body = await readReportBody(
      new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    );
    expect(body?.text).toBe('data: 1\n\n… the rest of the body was not read');
  });

  it('says when the request failed', () => {
    const { request } = call(undefined, {});
    const report = serverFunctionReport({
      request: { ...request, meta: { name: 'getTodos', error: new Error('offline') } },
      route: '/',
    });
    expect(report).toContain('- Response: none, the request failed: offline');
  });
});

function treeNode(over: Partial<TreeNode>): TreeNode {
  return {
    id: 'n',
    parentId: undefined,
    kind: 'component',
    name: 'App',
    depth: 0,
    children: [],
    signals: [],
    props: undefined,
    value: undefined,
    hasValue: false,
    time: 0,
    disposed: false,
    scopes: [],
    location: undefined,
    owner: {},
    ...over,
  };
}

describe('ownerReport', () => {
  it('describes a component with its signals, children and ancestry', () => {
    const app = treeNode({ id: 'app', name: 'App', location: 'src/App.tsx:1:1' });
    const item = treeNode({ id: 'item', name: 'TodoItem' });
    const list = treeNode({
      id: 'list',
      parentId: 'app',
      name: 'TodoList',
      location: 'src/TodoList.tsx:3:1',
      props: ['items', 'onToggle'],
      children: ['item', 'item2'],
      signals: [
        { id: 's1', name: 'count', value: 3, time: 0, node: {} },
        { id: 's2', name: 'authToken', value: 'abc', time: 0, node: {} },
      ],
    });
    const nodes = new Map([
      ['app', app],
      ['list', list],
      ['item', item],
      ['item2', { ...item, id: 'item2' }],
    ]);
    const report = ownerReport({ node: list, ancestry: [list, app], nodes, route: '/' });

    expect(report).toContain('# Solid component: `TodoList`');
    expect(report).toContain('- Declared at: `src/TodoList.tsx:3:1`');
    expect(report).toContain('- Owner path: `App > TodoList`');
    expect(report).toContain('- Props: `items`, `onToggle`');
    expect(report).toContain('- `count` = `3`');
    expect(report).toContain('- `authToken` = [redacted]');
    expect(report).toContain('- component `TodoItem` ×2');
    expect(report).toContain('- component `App` at `src/App.tsx:1:1`');
  });
});

function reactiveNode(over: Partial<ReactiveNode>): ReactiveNode {
  return {
    id: 'n',
    kind: 'signal',
    name: 'count',
    value: 0,
    state: 'clean',
    pending: false,
    errored: false,
    uninitialized: false,
    lazy: false,
    error: undefined,
    ownerPath: [],
    raw: {},
    owner: undefined,
    sources: [],
    observers: [],
    updates: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('reactiveReport', () => {
  it('lists what a memo reads and what reads it', () => {
    const todos = reactiveNode({ id: 'a', name: 'todos', value: [1, 2] });
    const effect = reactiveNode({
      id: 'c',
      kind: 'render-effect',
      name: 'render',
      value: undefined,
    });
    const memo = reactiveNode({
      id: 'b',
      kind: 'memo',
      name: 'filtered',
      value: [1],
      ownerPath: ['App', 'TodoList'],
      sources: ['a'],
      observers: ['c'],
      updates: 4,
    });
    const nodes = new Map([todos, memo, effect].map((node) => [node.id, node]));
    const report = reactiveReport({ node: memo, nodes, route: '/' });

    expect(report).toContain('# Solid memo: `filtered`');
    expect(report).toContain('- Owner path: `App > TodoList`');
    expect(report).toContain('- Updates while the devtools watched: 4');
    expect(report).toContain('## Sources, what it reads\n\n- signal `todos` = `[1, 2]`');
    expect(report).toContain(
      '## Observers, what reads it\n\n- render-effect `render` = `undefined`',
    );
  });

  it('shows the error of a failed memo', () => {
    const error = new Error('bad input');
    const report = reactiveReport({
      node: reactiveNode({ kind: 'memo', errored: true, error }),
      nodes: new Map(),
      route: '/',
    });
    expect(report).toContain('- State: errored');
    expect(report).toContain('## Error');
    expect(report).toContain('Error: bad input');
  });
});

describe('serovalBodyText with an open stream', () => {
  it('renders what arrived and stops reading', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        toCrossJSONStream(
          { later: new Promise(() => {}) },
          { onParse: (node) => controller.enqueue(chunk(JSON.stringify(node))) },
        );
      },
    });
    expect(await serovalBodyText(stream)).toBe('{ later: Promise<pending> }');
  });
});
