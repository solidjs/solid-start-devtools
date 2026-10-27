import { parse as parseErrorStack } from 'error-stack-parser-es/lite';
import {
  loadStackFrame,
  mapStackFrame,
  type StackFrameSource,
} from '../error-viewer/create-stack-frame.js';
import { code, displayPath, excerpt, fence, languageOf } from './markdown.js';
import { redactText, redactUrl, truncateText } from './redact.js';

/** One frame of the stack, in the original source when its source map was found. */
export interface ReportFrame {
  name: string | undefined;
  file: string | undefined;
  line: number | undefined;
  column: number | undefined;
  /** The content of the file, when the dev server served it. */
  content: string | undefined;
}

export interface ErrorReportInput {
  error: unknown;
  frames: ReportFrame[];
  /** The path and query of the page. */
  route: string;
}

/** How many frames get the lines of source around them. */
const EXCERPT_FRAMES = 3;

function describeError(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof ErrorEvent === 'function' && error instanceof ErrorEvent) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function frameLocation(frame: ReportFrame): string {
  if (!frame.file) return '<unknown source>';
  let text = displayPath(frame.file);
  if (frame.line) text += `:${frame.line}`;
  if (frame.line && frame.column) text += `:${frame.column}`;
  return text;
}

function isDependency(frame: ReportFrame): boolean {
  return !!frame.file && /\/node_modules\/|\/\.vite\/deps\//.test(frame.file);
}

/** The package a dependency frame is in, such as `solid-js`. */
function packageOf(frame: ReportFrame): string {
  const path = displayPath(frame.file!);
  const packages = Array.from(path.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g), (m) => m[1]!);
  const last = packages.filter((name) => name !== '.pnpm').pop();
  return last ?? path.slice(path.lastIndexOf('/') + 1);
}

function frameLine(frame: ReportFrame): string {
  return `- ${code(frame.name ?? '<anonymous>')} at ${code(frameLocation(frame))}`;
}

/**
 * The stack, top first. A run of frames in dependencies, such as the
 * runtime calling a component, is one line that names the packages.
 */
function stackLines(frames: ReportFrame[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < frames.length;) {
    let end = index;
    while (end < frames.length && isDependency(frames[end]!)) end++;
    if (end - index > 1) {
      const packages = [...new Set(frames.slice(index, end).map(packageOf))];
      out.push(`- … ${end - index} frames in dependencies: ${packages.map(code).join(', ')}`);
      index = end;
    } else {
      const frame = frames[index]!;
      out.push(`${frameLine(frame)}${isDependency(frame) ? ' (dependency)' : ''}`);
      index++;
    }
  }
  return out;
}

/**
 * The frames whose source goes into the report: the first ones in the app,
 * or the first one at all when every frame is in a dependency.
 */
function excerptFrames(frames: ReportFrame[]): ReportFrame[] {
  const readable = frames.filter((frame) => frame.content && frame.line);
  const app = readable.filter((frame) => !isDependency(frame));
  return (app.length ? app : readable).slice(0, EXCERPT_FRAMES);
}

/** A Markdown report of an error, for an agent to read. */
export function errorReport(input: ErrorReportInput): string {
  const { name, message } = describeError(input.error);
  const out: string[] = ['# Error in a Solid app', ''];
  out.push(fence(redactText(name ? `${name}: ${message}` : message)), '');
  out.push(`- Page: ${code(redactUrl(input.route))}`);

  if (input.frames.length) {
    out.push('', '## Stack', '');
    out.push(...stackLines(input.frames));

    const shown = excerptFrames(input.frames);
    if (shown.length) {
      out.push('', '## Source');
      for (const frame of shown) {
        out.push(
          '',
          `### ${code(frameLocation(frame))}`,
          '',
          fence(
            redactText(excerpt(frame.content!, frame.line!, frame.column)),
            languageOf(frame.file!),
          ),
        );
      }
    }
  }

  const cause = input.error instanceof Error ? input.error.cause : undefined;
  if (cause !== undefined) {
    const text = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
    out.push('', '## Cause', '', fence(truncateText(redactText(text))));
  }

  return out.join('\n');
}

/**
 * A source map names its sources relative to the file it maps, such as
 * `app.tsx` or `../../.pnpm/…`. Resolved against the URL of the frame, they
 * become paths from the root of the dev server.
 */
function resolveSource(source: string, frameFile: string | undefined): string {
  if (!frameFile) return source;
  try {
    return new URL(source, frameFile).href;
  } catch {
    return source;
  }
}

function toReportFrame(source: StackFrameSource | undefined, fallback: ReportFrame): ReportFrame {
  if (!source) return fallback;
  return {
    name: source.name ?? fallback.name,
    file: resolveSource(source.source, fallback.file),
    line: source.line,
    column: source.column,
    content: source.content,
  };
}

/** Parses the stack of an error and maps each frame to its original source. */
export async function resolveErrorFrames(error: unknown): Promise<ReportFrame[]> {
  if (!(error instanceof Error)) return [];
  const frames = parseErrorStack(error, { allowEmpty: true });
  return Promise.all(
    frames.map(async (frame) => {
      const raw: ReportFrame = {
        name: frame.function,
        file: frame.file,
        line: frame.line,
        column: frame.col,
        content: undefined,
      };
      const loaded = await loadStackFrame(frame);
      return toReportFrame(loaded ? mapStackFrame(loaded, false) : undefined, raw);
    }),
  );
}
