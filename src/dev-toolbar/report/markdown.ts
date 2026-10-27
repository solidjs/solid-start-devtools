const LANGUAGES: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  mts: 'ts',
  cts: 'ts',
  css: 'css',
  html: 'html',
  json: 'json',
};

/** The fence language for a file, from its extension. */
export function languageOf(file: string): string {
  const clean = file.split(/[?#]/)[0]!;
  const extension = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase();
  return LANGUAGES[extension] ?? '';
}

/** A code block whose fence is longer than any run of backticks in the text. */
export function fence(text: string, language = ''): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const marks = '`'.repeat(longest + 1);
  return `${marks}${language}\n${text}\n${marks}`;
}

/** Inline code, with a fence that the text cannot close. */
export function code(text: string): string {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const marks = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${marks}${pad}${text}${pad}${marks}`;
}

/** Longest line an excerpt keeps, so a minified file does not fill the report. */
const MAX_LINE = 160;

/**
 * A line cut to `MAX_LINE` characters around the column (1-based), with the
 * column moved to match.
 */
function clipLine(text: string, column?: number): { text: string; column?: number } {
  if (text.length <= MAX_LINE) return { text, column };
  const center = column ? column - 1 - MAX_LINE / 2 : 0;
  const start = Math.max(0, Math.min(center, text.length - MAX_LINE));
  const head = start > 0 ? '…' : '';
  const tail = start + MAX_LINE < text.length ? '…' : '';
  return {
    text: `${head}${text.slice(start, start + MAX_LINE)}${tail}`,
    column: column && column - start + head.length,
  };
}

/**
 * The lines around `line` (1-based), numbered, with the line marked by `>` and
 * the column (1-based) by a caret below it.
 */
export function excerpt(content: string, line: number, column?: number, radius = 3): string {
  const lines = content.split('\n');
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const width = String(end).length;
  const out: string[] = [];
  for (let current = start; current <= end; current++) {
    const marker = current === line ? '>' : ' ';
    const number = String(current).padStart(width);
    const clipped = clipLine(lines[current - 1] ?? '', current === line ? column : undefined);
    out.push(`${marker} ${number} | ${clipped.text}`.trimEnd());
    if (current === line && clipped.column && clipped.column > 0) {
      out.push(`  ${' '.repeat(width)} | ${' '.repeat(clipped.column - 1)}^`);
    }
  }
  return out.join('\n');
}

/**
 * A file path as the agent finds it in the project: no origin, no `/@fs`
 * prefix, no query such as Vite's `?t=` timestamp.
 */
export function displayPath(file: string): string {
  let path = file;
  try {
    const url = new URL(file);
    if (url.protocol === 'http:' || url.protocol === 'https:') path = url.pathname;
    else if (url.protocol === 'file:') path = decodeURIComponent(url.pathname);
  } catch {
    // Not a URL, such as a path relative to the root.
  }
  path = path.replace(/[?#].*$/, '');
  if (path.startsWith('/@fs/')) path = path.slice('/@fs'.length);
  return path;
}

/** The path and query of the page the devtools run in. */
export function pageRoute(): string {
  return location.pathname + location.search;
}
