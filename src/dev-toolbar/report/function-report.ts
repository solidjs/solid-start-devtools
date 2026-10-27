import { BODY_FORMAT_FILE_KEY, BODY_FORMAT_KEY, BodyFormat } from '../functions/body-format.js';
import type { ServerFunctionRequest, ServerFunctionResponse } from '../functions/tracker.js';
import { code, fence } from './markdown.js';
import {
  isSensitiveName,
  REDACTED,
  redactHeaders,
  redactJson,
  redactText,
  redactUrl,
  truncateText,
} from './redact.js';
import { serovalBodyText } from './seroval-text.js';

export interface ReportBody {
  /** What the body is, such as `JSON` or `form data`. */
  format: string;
  text: string;
  /** The fence language of the text. */
  language?: string;
}

export interface ServerFunctionReportInput {
  request: ServerFunctionRequest;
  response?: ServerFunctionResponse;
  requestBody?: ReportBody;
  responseBody?: ReportBody;
  /** The path and query of the page. */
  route: string;
}

function blobText(blob: Blob, label: string): string {
  const name = blob instanceof File ? ` ${JSON.stringify(blob.name)}` : '';
  return `<${label}${name}, ${blob.size} bytes${blob.type ? `, ${blob.type}` : ''}>`;
}

function formDataText(data: FormData): string {
  const lines: string[] = [];
  data.forEach((value, key) => {
    if (isSensitiveName(key)) lines.push(`${key}: ${REDACTED}`);
    else if (typeof value === 'string') lines.push(`${key}: ${JSON.stringify(value)}`);
    else lines.push(`${key}: ${blobText(value, 'File')}`);
  });
  return lines.join('\n');
}

function jsonText(text: string): ReportBody {
  try {
    return {
      format: 'JSON',
      text: JSON.stringify(redactJson(JSON.parse(text)), null, 2),
      language: 'json',
    };
  } catch {
    return { format: 'text', text: redactText(text) };
  }
}

async function readBody(source: Request | Response): Promise<ReportBody | undefined> {
  const format = source.headers.get(BODY_FORMAT_KEY);
  const contentType = source.headers.get('Content-Type') ?? '';
  switch (true) {
    case format === BodyFormat.Serialized:
      return { format: 'seroval', text: redactText(await serovalBodyText(source.body!)) };
    case format === BodyFormat.Json:
    case contentType.startsWith('application/json'):
      return jsonText(await source.text());
    case format === BodyFormat.String:
      return { format: 'string', text: redactText(await source.text()) };
    case format === BodyFormat.File: {
      const file = (await source.formData()).get(BODY_FORMAT_FILE_KEY);
      return { format: 'file', text: file instanceof File ? blobText(file, 'File') : '<file>' };
    }
    case format === BodyFormat.FormData:
    case contentType.startsWith('multipart/form-data'):
      return { format: 'form data', text: formDataText(await source.formData()) };
    case format === BodyFormat.URLSearchParams:
    case contentType.startsWith('application/x-www-form-urlencoded'):
      return { format: 'URL search params', text: redactUrl(`?${await source.text()}`).slice(1) };
    case format === BodyFormat.Blob:
    case format === BodyFormat.ArrayBuffer:
    case format === BodyFormat.Uint8Array:
      return { format: 'binary', text: blobText(await source.blob(), 'Binary') };
    case contentType.startsWith('text/'):
    case contentType === '':
      return { format: 'text', text: redactText(await source.text()) };
  }
  return { format: contentType, text: blobText(await source.blob(), 'Binary') };
}

/** How long a report waits for a body that is still arriving. */
const BODY_WAIT_MS = 500;
/** Most bytes a report reads from one body. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The bytes of a body, read until it ends, it passes the size limit or the wait
 * runs out. A body that streams for the life of the call, such as server-sent
 * events, is cut off instead of keeping the report waiting.
 */
async function readBodyBytes(
  body: ReadableStream<Uint8Array>,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; complete: boolean }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), BODY_WAIT_MS);
  });
  try {
    while (size < MAX_BODY_BYTES) {
      const result = await Promise.race([reader.read(), timeout]);
      if (!result) break;
      if (result.done) {
        complete = true;
        break;
      }
      chunks.push(result.value);
      size += result.value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    // This reads a clone, so cancelling it leaves the call alone.
    reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, complete };
}

/**
 * The body of a request or response, read from a clone so the panel can still
 * read the original. `undefined` when there is no body, or when it cannot be
 * read.
 */
export async function readReportBody(source: Request | Response): Promise<ReportBody | undefined> {
  if (!source.body || source.bodyUsed) return undefined;
  try {
    const { bytes, complete } = await readBodyBytes(source.clone().body!);
    const body = await readBody(new Response(bytes, { headers: source.headers }));
    if (!body) return undefined;
    const text = truncateText(body.text);
    return { ...body, text: complete ? text : `${text}\n… the rest of the body was not read` };
  } catch {
    return undefined;
  }
}

function failureOf(request: ServerFunctionRequest): string | undefined {
  const error = request.meta?.error;
  if (error === undefined) return undefined;
  return error instanceof Error ? error.message : String(error);
}

function bodySection(out: string[], body: ReportBody | undefined): void {
  if (!body) return;
  out.push('', `Body (${body.format}):`, '', fence(body.text, body.language));
}

/** A Markdown report of a server function call, for an agent to read. */
export function serverFunctionReport(input: ServerFunctionReportInput): string {
  const { request, response } = input;
  const name = request.meta?.name ?? request.id;
  const out: string[] = [`# Server function call: ${code(name)}`, ''];

  out.push(`- Function id: ${code(request.id)}`);
  out.push(`- Page: ${code(redactUrl(input.route))}`);
  out.push(`- Request: ${code(`${request.source.method} ${redactUrl(request.source.url)}`)}`);
  const failure = failureOf(request);
  if (response) {
    const status = `${response.source.status} ${response.source.statusText}`.trim();
    out.push(`- Response: ${code(status)}${response.source.ok ? '' : ' (failed)'}`);
    out.push(`- Time: ${((response.time - request.time) / 1000).toFixed(2)}s`);
  } else if (failure !== undefined) {
    out.push(`- Response: none, the request failed: ${redactText(failure)}`);
  } else {
    out.push('- Response: still pending');
  }

  out.push('', '## Request', '', 'Headers:', '', fence(redactHeaders(request.source.headers)));
  bodySection(out, input.requestBody);

  if (response) {
    out.push('', '## Response', '', 'Headers:', '', fence(redactHeaders(response.source.headers)));
    bodySection(out, input.responseBody);
  }

  out.push('', 'Values of headers, keys and fields with sensitive names are redacted.');
  return out.join('\n');
}
