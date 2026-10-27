import type { SerovalNode } from 'seroval';
import { ChunkReader } from '@solidjs/web/server-functions/client';
import {
  getConstantValue,
  getNodeType,
  getSymbolValue,
  traverse,
} from '../functions/seroval-node.js';
import { isSensitiveName, REDACTED } from './redact.js';

/** How long a report waits for the rest of a streamed body, such as a promise that settles later. */
const STREAM_WAIT_MS = 500;
const MAX_DEPTH = 6;
const MAX_ENTRIES = 50;

type PromiseResult = Extract<SerovalNode, { t: 23 | 24 }>;
type StreamEvent = Extract<SerovalNode, { t: 32 | 33 | 34 }>;

interface Context {
  nodes: Map<number, SerovalNode>;
  promises: Map<number, PromiseResult>;
  streams: Map<number, StreamEvent[]>;
}

function collect(ctx: Context, node: SerovalNode): void {
  switch (node.t) {
    case 23:
    case 24:
      ctx.promises.set(node.i, node);
      return;
    case 32:
    case 33:
    case 34: {
      const events = ctx.streams.get(node.i) ?? [];
      events.push(node);
      ctx.streams.set(node.i, events);
      return;
    }
  }
  // Nodes that can be referenced later by index.
  if (node.t >= 5 && node.i !== undefined && node.t !== 18 && node.t !== 22) {
    ctx.nodes.set(node.i, node);
  }
}

function keyText(ctx: Context, key: string | SerovalNode, seen: number[], depth: number): string {
  return typeof key === 'string' ? key : `[${render(ctx, key, seen, depth)}]`;
}

function record(
  ctx: Context,
  keys: (string | SerovalNode)[],
  values: SerovalNode[],
  seen: number[],
  depth: number,
): string[] {
  const out = keys.slice(0, MAX_ENTRIES).map((key, index) => {
    const name = keyText(ctx, key, seen, depth);
    if (typeof key === 'string' && isSensitiveName(key)) return `${name}: ${REDACTED}`;
    return `${name}: ${render(ctx, values[index]!, seen, depth + 1)}`;
  });
  if (keys.length > MAX_ENTRIES) out.push(`…${keys.length - MAX_ENTRIES} more`);
  return out;
}

function list(ctx: Context, items: (SerovalNode | 0)[], seen: number[], depth: number): string {
  const out = items
    .slice(0, MAX_ENTRIES)
    .map((item) => (item ? render(ctx, item, seen, depth + 1) : '<empty>'));
  if (items.length > MAX_ENTRIES) out.push(`…${items.length - MAX_ENTRIES} more`);
  return out.join(', ');
}

function render(ctx: Context, node: SerovalNode, seen: number[], depth: number): string {
  if (depth > MAX_DEPTH) return '…';
  if (node.i !== undefined && node.t !== 4 && seen.includes(node.i)) return '[Circular]';
  const next = node.i !== undefined && node.t !== 4 ? [...seen, node.i] : seen;

  switch (node.t) {
    case 0:
      return String(node.s);
    case 1:
      return `"${node.s}"`;
    case 2:
      return getConstantValue(node.s);
    case 3:
      return `${node.s}n`;
    case 4: {
      if (seen.includes(node.i)) return '[Circular]';
      const target = ctx.nodes.get(node.i);
      return target ? render(ctx, target, seen, depth) : `<ref #${node.i}>`;
    }
    case 5:
      return `Date(${node.s})`;
    case 6:
      return `/${node.c}/${node.m}`;
    case 7:
      return `Set { ${list(ctx, node.a, next, depth)} }`;
    case 8: {
      const entries = node.e.k.slice(0, MAX_ENTRIES).map((key, index) => {
        const name = render(ctx, key, next, depth + 1);
        if (key.t === 1 && isSensitiveName(key.s)) return `${name} => ${REDACTED}`;
        return `${name} => ${render(ctx, node.e.v[index]!, next, depth + 1)}`;
      });
      if (node.e.k.length > MAX_ENTRIES) entries.push(`…${node.e.k.length - MAX_ENTRIES} more`);
      return `Map { ${entries.join(', ')} }`;
    }
    case 9:
      return `[${list(ctx, node.a, next, depth)}]`;
    case 10:
    case 11: {
      const entries = record(ctx, node.p.k, node.p.v, next, depth);
      return entries.length ? `{ ${entries.join(', ')} }` : '{}';
    }
    case 12:
      return `Promise<${node.s === 0 ? 'resolved' : 'rejected'}: ${render(ctx, node.f, next, depth + 1)}>`;
    case 13:
    case 14: {
      const head = `${getNodeType(node)}: ${node.m}`;
      if (!node.p) return head;
      const entries = record(ctx, node.p.k, node.p.v, next, depth);
      return entries.length ? `${head} { ${entries.join(', ')} }` : head;
    }
    case 15:
    case 16:
      return `${node.c}(${node.l})`;
    case 17:
      return getSymbolValue(node.s);
    case 18:
      return `<reference ${node.s}>`;
    case 19:
      return 'ArrayBuffer';
    case 20:
      return `DataView(${node.l})`;
    case 21:
      return `Boxed(${render(ctx, node.f, next, depth + 1)})`;
    case 22: {
      const result = ctx.promises.get(node.s);
      if (!result) return 'Promise<pending>';
      const value = render(ctx, result.a[1], next, depth + 1);
      return `Promise<${result.t === 23 ? 'resolved' : 'rejected'}: ${value}>`;
    }
    case 25: {
      const entries = Object.entries(node.s).map(([key, value]) =>
        isSensitiveName(key)
          ? `${key}: ${REDACTED}`
          : `${key}: ${render(ctx, value, next, depth + 1)}`,
      );
      return `${node.c} { ${entries.join(', ')} }`;
    }
    case 31: {
      const events = (ctx.streams.get(node.i) ?? []).map((event) => {
        const value = render(ctx, event.f, next, depth + 1);
        return event.t === 32 ? value : `${event.t === 33 ? 'throw' : 'return'} ${value}`;
      });
      return `Stream [${events.join(', ')}]`;
    }
    case 35:
      return `Sequence [${list(ctx, node.a, next, depth)}]`;
    default:
      return `<${getNodeType(node)}>`;
  }
}

/**
 * The body of a server function in seroval's stream format, as source-like
 * text. The first chunk holds the value. The chunks after it settle promises
 * and streams, so this reads them for a moment before rendering.
 */
export async function serovalBodyText(body: ReadableStream<Uint8Array>): Promise<string> {
  // Piped, so the copy can stop reading a stream that stays open.
  const abort = new AbortController();
  const reader = new ChunkReader(
    body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal: abort.signal }),
  );
  const ctx: Context = { nodes: new Map(), promises: new Map(), streams: new Map() };
  const read = (chunk: string): SerovalNode => {
    const node = JSON.parse(chunk) as SerovalNode;
    traverse(node, (child) => collect(ctx, child));
    return node;
  };

  try {
    const first = await reader.next();
    if (first.done || first.value === undefined) return '';
    const root = read(first.value);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, STREAM_WAIT_MS);
    });
    const rest = (async () => {
      while (true) {
        const chunk = await reader.next();
        if (chunk.done) return;
        if (chunk.value !== undefined) read(chunk.value);
      }
    })().catch(() => {});
    await Promise.race([rest, timeout]);
    clearTimeout(timer);
    return render(ctx, root, [], 0);
  } finally {
    // A stream that is still open is left to the call; this copy stops reading.
    abort.abort();
  }
}
