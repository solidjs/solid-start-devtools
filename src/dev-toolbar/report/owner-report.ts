import type { TreeNode } from '../ownership/tree.js';
import { code } from './markdown.js';
import { isSensitiveName, REDACTED, redactUrl } from './redact.js';
import { describeValue } from './value.js';

export interface OwnerReportInput {
  node: TreeNode;
  /** The owners above the node, nearest first. */
  ancestry: TreeNode[];
  nodes: Map<string, TreeNode>;
  /** The path and query of the page. */
  route: string;
}

function valueOf(name: string, value: unknown): string {
  return isSensitiveName(name) ? REDACTED : code(describeValue(value));
}

/** A Markdown report of a component or another owner, for an agent to read. */
export function ownerReport(input: OwnerReportInput): string {
  const { node } = input;
  const out: string[] = [`# Solid ${node.kind}: ${code(node.name)}`, ''];

  out.push(`- Page: ${code(redactUrl(input.route))}`);
  if (node.location) out.push(`- Declared at: ${code(node.location)}`);
  const path = [...input.ancestry].reverse().map((frame) => frame.name);
  out.push(`- Owner path: ${code(path.join(' > '))}`);
  if (node.disposed) out.push('- Disposed: yes');
  if (node.hasValue) out.push(`- Value: ${valueOf(node.name, node.value)}`);
  if (node.props) {
    const names = node.props.map(code).join(', ');
    out.push(
      `- Props: ${names || 'none'}${names ? ' (the names only: props are getters, and reading them would track)' : ''}`,
    );
  }

  if (node.signals.length) {
    out.push('', '## Signals', '');
    for (const signal of node.signals) {
      out.push(`- ${code(signal.name)} = ${valueOf(signal.name, signal.value)}`);
    }
  }

  if (node.scopes.length) {
    out.push('', '## Memos and effects inside it', '');
    for (const scope of node.scopes) {
      const value = scope.hasValue ? ` = ${valueOf(scope.name, scope.value)}` : '';
      out.push(`- ${scope.kind} ${code(scope.name)}${value}`);
    }
  }

  if (node.children.length) {
    // Repeated children, such as the rows of a list, are counted on one line.
    const counts = new Map<string, number>();
    for (const id of node.children) {
      const child = input.nodes.get(id);
      if (!child) continue;
      const label = `${child.kind} ${code(child.name)}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    out.push('', '## Children', '');
    for (const [label, count] of counts) {
      out.push(`- ${label}${count > 1 ? ` ×${count}` : ''}`);
    }
  }

  if (input.ancestry.length > 1) {
    out.push('', '## Ancestry, nearest first', '');
    for (const frame of input.ancestry.slice(1)) {
      const at = frame.location ? ` at ${code(frame.location)}` : '';
      out.push(`- ${frame.kind} ${code(frame.name)}${at}`);
    }
  }

  return out.join('\n');
}
