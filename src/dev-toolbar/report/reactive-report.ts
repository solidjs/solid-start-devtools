import type { ReactiveNode } from '../reactivity/registry.js';
import { code, fence } from './markdown.js';
import { isSensitiveName, REDACTED, redactText, redactUrl, truncateText } from './redact.js';
import { describeValue } from './value.js';

export interface ReactiveReportInput {
  node: ReactiveNode;
  nodes: Map<string, ReactiveNode>;
  /** The path and query of the page. */
  route: string;
}

function stateText(node: ReactiveNode): string {
  if (node.errored) return 'errored';
  if (node.pending) return 'pending';
  if (node.uninitialized) return 'not computed yet';
  return node.state;
}

function valueOf(node: ReactiveNode): string {
  return isSensitiveName(node.name) ? REDACTED : code(describeValue(node.value));
}

function links(out: string[], title: string, ids: string[], nodes: Map<string, ReactiveNode>) {
  out.push('', `## ${title}`, '');
  if (!ids.length) {
    out.push('- none');
    return;
  }
  for (const id of ids) {
    const linked = nodes.get(id);
    if (linked) out.push(`- ${linked.kind} ${code(linked.name)} = ${valueOf(linked)}`);
  }
}

/** A Markdown report of a signal, memo or effect, for an agent to read. */
export function reactiveReport(input: ReactiveReportInput): string {
  const { node } = input;
  const out: string[] = [`# Solid ${node.kind}: ${code(node.name)}`, ''];

  out.push(`- Page: ${code(redactUrl(input.route))}`);
  if (node.ownerPath.length) out.push(`- Owner path: ${code(node.ownerPath.join(' > '))}`);
  out.push(`- State: ${stateText(node)}${node.lazy ? ', lazy' : ''}`);
  out.push(`- Updates while the devtools watched: ${node.updates}`);
  if (!node.errored) out.push(`- Value: ${valueOf(node)}`);

  if (node.errored) {
    const error = node.error;
    const text = error instanceof Error ? (error.stack ?? error.message) : describeValue(error);
    out.push('', '## Error', '', fence(truncateText(redactText(text))));
  }

  links(out, 'Sources, what it reads', node.sources, input.nodes);
  links(out, 'Observers, what reads it', node.observers, input.nodes);

  return out.join('\n');
}
