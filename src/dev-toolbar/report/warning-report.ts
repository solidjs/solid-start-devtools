import { warningText, type WarningEntry } from '../warnings/tracker.js';
import { code, fence } from './markdown.js';
import { redactJson, redactText, redactUrl, truncateText } from './redact.js';

export interface WarningReportInput {
  entry: WarningEntry;
  /** The section of the repair guide for the code, when the runtime knows it. */
  guideUrl: string | undefined;
  /** The path and query of the page. */
  route: string;
}

/** A Markdown report of a runtime warning, for an agent to read. */
export function warningReport(input: WarningReportInput): string {
  const { event, count } = input.entry;
  const out: string[] = [`# Solid ${event.severity}: ${code(event.code)}`, ''];

  out.push(fence(truncateText(redactText(warningText(event)))), '');
  out.push(`- Page: ${code(redactUrl(input.route))}`);
  out.push(`- Kind: ${event.kind}`);
  if (event.ownerPath?.length) out.push(`- Owner path: ${code(event.ownerPath.join(' > '))}`);
  if (event.nodeName) out.push(`- Node: ${code(event.nodeName)}`);
  if (count > 1) out.push(`- Reported ${count} times`);
  if (input.guideUrl) out.push(`- Repair guide: ${input.guideUrl}`);

  if (event.data && Object.keys(event.data).length) {
    const data = JSON.stringify(redactJson(event.data), null, 2);
    out.push('', '## Data', '', fence(truncateText(data), 'json'));
  }

  return out.join('\n');
}
