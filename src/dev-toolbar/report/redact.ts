/**
 * A report leaves the page through the clipboard, so values that look like
 * secrets are replaced before it is written. The match is by name: a key, a
 * header, a form field or a signal whose name says it holds a secret.
 */
const SENSITIVE_NAME =
  /pass(word|wd|phrase|code)|secret|token|auth(?!or)|cookie|session|api[-_]?key|credential|private[-_]?key|signature|bearer|jwt/i;

export const REDACTED = '[redacted]';

/** Longest text a report keeps for one body or value. */
export const MAX_TEXT = 4000;

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

export function truncateText(text: string, max = MAX_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… ${text.length - max} more characters`;
}

/**
 * Header lines, with the value of each sensitive header replaced. Other values
 * can hold a URL, such as `referer` or `location`, so their pairs are redacted
 * too.
 */
export function redactHeaders(headers: Headers): string {
  const lines: string[] = [];
  headers.forEach((value, key) => {
    lines.push(`${key}: ${isSensitiveName(key) ? REDACTED : redactText(value)}`);
  });
  return lines.join('\n');
}

/** A copy of a JSON value with the value of each sensitive key replaced. */
export function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = isSensitiveName(key) ? REDACTED : redactJson(inner);
    }
    return out;
  }
  return value;
}

// `"key": "value"` and `key: 'value'`, for text that is not JSON.
const QUOTED_PAIR = /(["']?)([\w-]+)\1(\s*:\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
// `key: value`, `"key": 123` and `key=value`. The value ends at a space, a
// delimiter or a query, so a URL's parameters are checked one by one. A quoted
// or nested value is left to the other patterns.
const PLAIN_PAIR = /(["']?)\b([\w-]+)\1(\s*[:=]\s*)(?!["'{[])([^\s?&,;"'<>(){}[\]]+)/g;
// The credentials of an `Authorization` value, wherever it appears.
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[\w.~+/-]+=*/gi;

/** Text with the values of sensitive `key: value` and `key=value` pairs and credentials replaced. */
export function redactText(text: string): string {
  return text
    .replace(QUOTED_PAIR, (match, quote: string, key: string, separator: string) =>
      isSensitiveName(key) ? `${quote}${key}${quote}${separator}"${REDACTED}"` : match,
    )
    .replace(PLAIN_PAIR, (match, quote: string, key: string, separator: string) =>
      isSensitiveName(key) ? `${quote}${key}${quote}${separator}${REDACTED}` : match,
    )
    .replace(AUTH_SCHEME, (_, scheme: string) => `${scheme} ${REDACTED}`);
}

/** A URL with the value of each sensitive query parameter replaced. */
export function redactUrl(url: string): string {
  const query = url.indexOf('?');
  if (query === -1) return url;
  const params = new URLSearchParams(url.slice(query + 1));
  const kept: string[] = [];
  params.forEach((value, key) => {
    kept.push(
      `${encodeURIComponent(key)}=${isSensitiveName(key) ? REDACTED : encodeURIComponent(value)}`,
    );
  });
  return kept.length ? `${url.slice(0, query)}?${kept.join('&')}` : url.slice(0, query);
}
