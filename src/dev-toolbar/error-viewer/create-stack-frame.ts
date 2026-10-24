import { originalPositionFor, sourceContentFor, type TraceMap } from '@jridgewell/trace-mapping';
import type { StackFrameLite } from 'error-stack-parser-es/lite';
import { type Accessor, createMemo } from 'solid-js';
import getSourceMap from './get-source-map.js';

const HTTP_URL_REGEX = /^https?:\/\//;
const LEADING_SLASH_REGEX = /^\/+/;

export interface StackFrameSource {
  content: string;
  source: string;
  name?: string;
  line: number;
  column: number;
}

function isServerSource(path: string): boolean {
  return !HTTP_URL_REGEX.test(path);
}

function getActualFileSource(path: string): string {
  if (path.startsWith('file://')) {
    return '/@fs/' + path.substring('file://'.length).replace(LEADING_SLASH_REGEX, '');
  }
  if (isServerSource(path)) {
    return '/@fs/' + path.replace(LEADING_SLASH_REGEX, '');
  }
  return path;
}

export interface LoadedStackFrame {
  source: {
    fileName: string;
    line: number | undefined;
    column: number | undefined;
    functionName: string | undefined;
  };
  content: string;
  sourceMap: TraceMap | null;
  isServer: boolean;
}

/** Fetches the file of a frame and its source map. `null` when the file is unreachable. */
export async function loadStackFrame(stackframe: StackFrameLite): Promise<LoadedStackFrame | null> {
  const fileName = stackframe.file;
  if (!fileName) {
    return null;
  }
  const source = {
    fileName,
    line: stackframe.line,
    column: stackframe.col,
    functionName: stackframe.function,
  };
  // Sources can be unreachable — node internals, extension scripts,
  // files outside the dev server's allowlist. Treat any failure as
  // "no source" instead of throwing into the error boundary.
  try {
    const url = getActualFileSource(fileName);
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const content = await response.text();
    const sourceMap = await getSourceMap(url, content);
    return {
      source,
      content,
      sourceMap,
      isServer: isServerSource(fileName),
    };
  } catch (error) {
    console.warn('[solid dev toolbar] failed to load source for stack frame', error);
    return null;
  }
}

/** The position and content of a loaded frame, in the original source unless `isCompiled`. */
export function mapStackFrame(current: LoadedStackFrame, isCompiled: boolean): StackFrameSource {
  const { source, content, sourceMap, isServer } = current;

  if (!isCompiled && source.line && source.column && sourceMap) {
    if (isServer) {
      // The position is already original; only the original content needs
      // to be pulled out of the source map.
      const originalContent =
        sourceMap.sources.length && sourceMap.sources[0] != null
          ? sourceContentFor(sourceMap, sourceMap.sources[0])
          : null;
      if (originalContent) {
        return {
          source: source.fileName,
          line: source.line,
          column: source.column,
          name: source.functionName,
          content: originalContent,
        } as StackFrameSource;
      }
    } else {
      const result = originalPositionFor(sourceMap, {
        line: source.line,
        column: source.column,
      });
      if (result.source) {
        return {
          ...result,
          content: sourceContentFor(sourceMap, result.source),
        } as StackFrameSource;
      }
    }
  }

  return {
    source: source.fileName,
    line: source.line,
    column: source.column,
    name: source.functionName,
    content,
  } as StackFrameSource;
}

export function createStackFrame(stackframe: StackFrameLite, isCompiled: () => boolean) {
  const data = createMemo(() => loadStackFrame(stackframe));

  const info = createMemo(() => {
    const current = data();
    if (!current) {
      return undefined;
    }
    return mapStackFrame(current, isCompiled());
  });

  return info as Accessor<StackFrameSource>;
}
