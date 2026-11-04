import type { JSX } from '@solidjs/web';
import { DEV, Show } from 'solid-js';
import { Badge } from '../../ui/Badge.js';
import { Text } from '../../ui/Text.js';
import { EyeIcon, TreeIcon } from '../icons.js';
import { CopyReportButton } from '../report/CopyReportButton.js';
import { pageRoute } from '../report/markdown.js';
import { issueReport } from '../report/issue-report.js';
import { issueText, type IssueEntry, type IssueEvent } from './tracker.js';
import './styles.css';

export type Severity = IssueEvent['severity'];

export const SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
];

export const BADGES: Record<Severity, 'failure' | 'warning' | 'info'> = {
  error: 'failure',
  warn: 'warning',
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

export interface IssueRowProps {
  entry: IssueEntry;
  selected: boolean;
  onSelect: () => void;
}

export function IssueRow(props: IssueRowProps): JSX.Element {
  return (
    <button
      type="button"
      data-solid-issues-row
      data-severity={props.entry.event.severity}
      data-selected={props.selected ? '' : undefined}
      onClick={props.onSelect}
    >
      <span data-solid-issues-row-head>
        <Badge type={BADGES[props.entry.event.severity]}>{props.entry.event.code}</Badge>
        <Show when={props.entry.count > 1}>
          <span data-solid-issues-row-count>{`×${props.entry.count}`}</span>
        </Show>
        <Show when={props.entry.event.ownerPath?.length}>
          <Text data-solid-issues-row-owner options={{ size: 'xs', font: 'mono', wrap: 'nowrap' }}>
            {props.entry.event.ownerPath!.join(' › ')}
          </Text>
        </Show>
      </span>
      <Text data-solid-issues-row-message options={{ size: 'xs' }}>
        {issueText(props.entry.event)}
      </Text>
    </button>
  );
}

export interface IssueDetailProps {
  entry: IssueEntry;
  /** Opens the owner of a finding in the ownership tree. */
  onViewOwner?: (owner: object) => void;
  /** Opens the node of a finding in the reactivity graph. */
  onViewInGraph?: (node: object) => void;
}

export function IssueDetail(props: IssueDetailProps): JSX.Element {
  const subject = () => props.entry.subject?.deref();
  const guide = () => guideUrl(props.entry.event.code);
  return (
    <div data-solid-issues-detail>
      <div data-solid-issues-detail-head>
        <Badge type={BADGES[props.entry.event.severity]}>{props.entry.event.severity}</Badge>
        <Text options={{ size: 'sm', weight: 'semibold', font: 'mono' }}>
          {props.entry.event.code}
        </Text>
        <CopyReportButton
          label="this issue"
          report={() => issueReport({ entry: props.entry, guideUrl: guide(), route: pageRoute() })}
        />
      </div>

      <Text data-solid-issues-detail-message options={{ size: 'xs' }}>
        {issueText(props.entry.event)}
      </Text>

      <div data-solid-kv-table>
        <div data-solid-kv-row>
          <Text data-solid-kv-key options={{ size: 'xs', font: 'mono' }}>
            Kind
          </Text>
          <Text data-solid-kv-value options={{ size: 'xs', font: 'mono' }}>
            {props.entry.event.kind}
          </Text>
        </div>
        <Show when={props.entry.event.ownerPath?.length}>
          <div data-solid-kv-row>
            <Text data-solid-kv-key options={{ size: 'xs', font: 'mono' }}>
              Owner
            </Text>
            <Text data-solid-kv-value options={{ size: 'xs', font: 'mono' }}>
              {props.entry.event.ownerPath!.join(' › ')}
            </Text>
          </div>
        </Show>
        <Show when={props.entry.event.nodeName}>
          {(name) => (
            <div data-solid-kv-row>
              <Text data-solid-kv-key options={{ size: 'xs', font: 'mono' }}>
                Node
              </Text>
              <Text data-solid-kv-value options={{ size: 'xs', font: 'mono' }}>
                {name()}
              </Text>
            </div>
          )}
        </Show>
        <div data-solid-kv-row>
          <Text data-solid-kv-key options={{ size: 'xs', font: 'mono' }}>
            Seen
          </Text>
          <Text data-solid-kv-value options={{ size: 'xs', font: 'mono' }}>
            {props.entry.count > 1
              ? `${props.entry.count} times, ${time(props.entry.firstAt)} to ${time(props.entry.lastAt)}`
              : `once, ${time(props.entry.lastAt)}`}
          </Text>
        </div>
      </div>

      <div data-solid-issues-actions>
        <Show when={props.onViewOwner && subject()}>
          {(current) => (
            <button
              type="button"
              data-solid-issues-action
              onClick={() => props.onViewOwner?.(ownerOf(current()))}
            >
              <TreeIcon title="" aria-hidden="true" />
              <Text options={{ size: 'xs', weight: 'semibold' }}>Show in the ownership tree</Text>
            </button>
          )}
        </Show>
        <Show when={props.onViewInGraph && subject() && isInGraph(subject()!) && subject()}>
          {(current) => (
            <button
              type="button"
              data-solid-issues-action
              onClick={() => props.onViewInGraph?.(current())}
            >
              <EyeIcon title="" aria-hidden="true" />
              <Text options={{ size: 'xs', weight: 'semibold' }}>Show in the reactivity graph</Text>
            </button>
          )}
        </Show>
        <Show when={guide()}>
          {(url) => (
            <a data-solid-issues-action href={url()} target="_blank" rel="noreferrer">
              <Text options={{ size: 'xs', weight: 'semibold' }}>Open the repair guide</Text>
            </a>
          )}
        </Show>
      </div>

      <Show when={props.entry.event.data && Object.keys(props.entry.event.data!).length}>
        <div data-solid-issues-data>
          <Text options={{ size: 'xs', weight: 'semibold' }}>Data</Text>
          <pre>
            <Text options={{ size: 'xs', font: 'mono' }}>{dataText(props.entry.event.data!)}</Text>
          </pre>
        </div>
      </Show>
    </div>
  );
}
