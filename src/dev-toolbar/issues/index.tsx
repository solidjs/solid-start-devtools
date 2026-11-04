import type { JSX } from '@solidjs/web';
import { DEV, For, Show } from 'solid-js';
import { HealthButton } from '../health/HealthButton.js';
import { Glyph, type Tone } from '../health/HealthRow.js';
import { EyeIcon, TreeIcon } from '../icons.js';
import { CopyReportButton } from '../report/CopyReportButton.js';
import { pageRoute } from '../report/markdown.js';
import { issueReport } from '../report/issue-report.js';
import { issueText, type IssueEntry, type IssueEvent } from './tracker.js';
import './styles.css';

export type Severity = IssueEvent['severity'];

/** The tone an issue is drawn in: its severity. */
export const TONES: Record<Severity, Tone> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
};

/** The section of the repair guide for a code. Only dev builds of the runtime know it. */
function guideUrl(code: string): string | undefined {
  try {
    return DEV?.guideUrl(code as never);
  } catch {
    return undefined;
  }
}

/** A signal is not an owner, so the tree shows the owner it was created under. */
function ownerOf(subject: object): object {
  const node = subject as { _owner?: object; _parent?: object };
  return '_parent' in node || !node._owner ? subject : node._owner;
}

/** Computations and signals are in the graph. Components and roots are not. */
function isInGraph(subject: object): boolean {
  const node = subject as { _fn?: unknown; _parent?: unknown; _component?: unknown };
  if (node._component) return false;
  return typeof node._fn === 'function' || !('_parent' in node);
}

function dataText(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString();
}

/** Whether an issue's code, message, node or owners contain the lowercased `search`. */
export function matchesIssue(entry: IssueEntry, search: string): boolean {
  if (!search) return true;
  const { event } = entry;
  for (const text of [
    event.code,
    event.message,
    event.nodeName ?? '',
    ...(event.ownerPath ?? []),
  ]) {
    if (text.toLowerCase().includes(search)) return true;
  }
  return false;
}

export interface IssueDetailProps {
  entry: IssueEntry;
  /** Opens the owner of a finding in the ownership tree. */
  onViewOwner?: (owner: object) => void;
  /** Opens the node of a finding in the reactivity graph. */
  onViewInGraph?: (node: object) => void;
}

/** The rows of the key and value list: label, then a mono value. */
function issueFacts(entry: IssueEntry): { key: string; value: string }[] {
  const facts = [{ key: 'Kind', value: entry.event.kind }];
  if (entry.event.ownerPath?.length) {
    facts.push({ key: 'Owner', value: entry.event.ownerPath.join(' › ') });
  }
  if (entry.event.nodeName) facts.push({ key: 'Node', value: entry.event.nodeName });
  facts.push({
    key: 'Seen',
    value:
      entry.count > 1
        ? `${entry.count} times, ${time(entry.firstAt)} to ${time(entry.lastAt)}`
        : `once, ${time(entry.lastAt)}`,
  });
  return facts;
}

/** An issue in the header pattern of a thrown error, then its facts and actions. */
export function IssueDetail(props: IssueDetailProps): JSX.Element {
  const subject = () => props.entry.subject?.deref();
  const guide = () => guideUrl(props.entry.event.code);
  return (
    <div data-solid-issues-detail>
      <div data-solid-issues-head>
        <div data-solid-issues-top>
          <Glyph tone={TONES[props.entry.event.severity]} />
          <span
            data-solid-issues-severity={props.entry.event.severity}
            data-solid-issues-severity-label
          >
            {props.entry.event.severity}
          </span>
          <span data-solid-issues-spacer />
          <CopyReportButton
            label="this issue"
            text="Copy report"
            report={() =>
              issueReport({ entry: props.entry, guideUrl: guide(), route: pageRoute() })
            }
          />
        </div>
        <div data-solid-issues-code data-solid-issues-severity={props.entry.event.severity}>
          {props.entry.event.code}
        </div>
        <div data-solid-issues-detail-message>{issueText(props.entry.event)}</div>
      </div>

      <div data-solid-issues-body>
        <dl data-solid-issues-facts>
          <For each={issueFacts(props.entry)}>
            {(fact) => (
              <>
                <dt>{fact.key}</dt>
                <dd>{fact.value}</dd>
              </>
            )}
          </For>
        </dl>

        <div data-solid-issues-actions>
          <Show when={props.onViewOwner && subject()}>
            {(current) => (
              <HealthButton onClick={() => props.onViewOwner?.(ownerOf(current()))}>
                <TreeIcon title="" aria-hidden="true" />
                Show in the ownership tree
              </HealthButton>
            )}
          </Show>
          <Show when={props.onViewInGraph && subject() && isInGraph(subject()!) && subject()}>
            {(current) => (
              <HealthButton onClick={() => props.onViewInGraph?.(current())}>
                <EyeIcon title="" aria-hidden="true" />
                Show in the reactivity graph
              </HealthButton>
            )}
          </Show>
          <Show when={guide()}>
            {(url) => (
              <a data-solid-health-btn href={url()} target="_blank" rel="noreferrer">
                Open the repair guide
              </a>
            )}
          </Show>
        </div>

        <Show when={props.entry.event.data && Object.keys(props.entry.event.data!).length}>
          <div data-solid-issues-section>Data</div>
          <pre data-solid-issues-data>{dataText(props.entry.event.data!)}</pre>
        </Show>
      </div>
    </div>
  );
}
