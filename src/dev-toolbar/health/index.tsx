import type { JSX } from '@solidjs/web';
import { clientOnly } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { ResizeHandle } from '../../ui/ResizeHandle.js';
import { useResizableDetail } from '../../ui/use-resizable-detail.js';
import type { ErrorRecord } from '../error-record.js';
import { IssueDetail, matchesIssue, TONES } from '../issues/index.js';
import { isIssuesAvailable, issueText, type IssueEntry } from '../issues/tracker.js';
import { describeError } from './describe-error.js';
import { HealthRow } from './HealthRow.js';
import { leadingPane } from './leading-pane.js';
import { formatAge } from './time.js';
import './styles.css';

export { describeError } from './describe-error.js';

// The error panel is the heaviest part of the view, so it loads when an error is opened.
const ErrorViewer = clientOnly(() => import('../error-viewer/index.js'), { lazy: true });

/** What the detail pane shows: a thrown error by its index, or an issue by its key. */
type Selection = { kind: 'error'; index: number } | { kind: 'issue'; key: string };

/** Which entries the list shows. */
type Filter = 'all' | 'error' | 'warn' | 'info';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
];

/** How often the ages in the list move on. */
const TICK_MS = 5000;

export interface HealthViewerProps {
  show?: boolean;
  /** The errors the toolbar caught, newest first. */
  errors: ErrorRecord[];
  resetError: () => void;
  issues: IssueEntry[];
  onClearIssues: () => void;
  onViewOwner?: (owner: object) => void;
  onViewInGraph?: (node: object) => void;
  /** The label of the action an error's origin belongs to, such as `setCurrency("XYZ")`. */
  describeOrigin?: (origin: object) => string | undefined;
  /** Opens the action an error's origin belongs to in the Activity view. */
  onShowInActivity?: (origin: object) => void;
}

/** Thrown errors and the runtime's diagnostics in one list, with the selected entry beside it. */
export default function HealthViewer(props: HealthViewerProps): JSX.Element {
  const [filter, setFilter] = createSignal<Filter>('all');
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal<Selection>();
  const [tick, setTick] = createSignal(0);

  // The handle is the left edge of the detail, so it sizes the list before it.
  const listWidth = leadingPane(
    useResizableDetail({
      storageKey: 'solid-start-devtools:health-list-width',
      defaultWidth: 320,
      minWidth: 200,
    }),
  );

  // The ages in the rows move on without a change to the lists, so a clock runs.
  onSettled(() => {
    const timer = setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  });

  // A new error lands at the top of the list and is opened, as the old Errors panel did.
  let seenErrors = 0;
  createEffect(
    () => props.errors.length,
    (count) => {
      if (count > seenErrors) setSelected({ kind: 'error', index: 0 });
      seenErrors = count;
    },
  );

  // Thrown errors count as errors, so only the All and Errors chips list them.
  const shownErrors = createMemo(() => {
    const result: { record: ErrorRecord; index: number }[] = [];
    if (filter() !== 'all' && filter() !== 'error') return result;
    const search = query().trim().toLowerCase();
    let index = 0;
    for (const record of props.errors) {
      const { name, message } = describeError(record.error);
      if (!search || `${name} ${message}`.toLowerCase().includes(search)) {
        result.push({ record, index });
      }
      index++;
    }
    return result;
  });

  const shownIssues = createMemo(() => {
    const search = query().trim().toLowerCase();
    const result: IssueEntry[] = [];
    for (const entry of props.issues) {
      if (filter() !== 'all' && entry.event.severity !== filter()) continue;
      if (matchesIssue(entry, search)) result.push(entry);
    }
    return result;
  });

  const total = () => props.errors.length + props.issues.length;
  const shownCount = () => shownErrors().length + shownIssues().length;

  // What the detail shows: the pick, else the first row. A cleared pick falls back the same way.
  const current = createMemo(() => {
    const value = selected();
    if (value?.kind === 'error' && value.index < props.errors.length) return value;
    if (value?.kind === 'issue') {
      const entry = props.issues.find((item) => item.key === value.key);
      if (entry) return { kind: 'issue' as const, entry };
    }
    const first = shownErrors()[0];
    if (first) return { kind: 'error' as const, index: first.index };
    const issue = shownIssues()[0];
    return issue ? { kind: 'issue' as const, entry: issue } : undefined;
  });

  function clearAll(): void {
    setSelected(undefined);
    props.resetError();
    props.onClearIssues();
  }

  // The age of a thrown error is on the clock the timeline uses, an issue's on the wall clock.
  function errorAge(record: ErrorRecord): string {
    tick();
    return formatAge(performance.now() - record.at);
  }

  function issueAge(entry: IssueEntry): string {
    tick();
    if (entry.count > 1) return `×${entry.count}`;
    return formatAge(Date.now() - entry.lastAt);
  }

  function emptyText(): string {
    return isIssuesAvailable()
      ? 'No errors or issues so far.'
      : 'No errors so far. Issues need a development build of solid-js.';
  }

  return (
    <Show when={props.show}>
      <div data-solid-dev-toolbar-panel>
        <div data-solid-health-viewer>
          <div data-solid-health-list style={{ width: `${listWidth.width()}px` }}>
            <div data-solid-health-searchrow>
              <label data-solid-health-search>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m20 20-4.5-4.5" />
                </svg>
                <input
                  data-solid-issues-search
                  type="search"
                  placeholder="Filter by name, code, message or owner"
                  aria-label="Filter by name, code, message or owner"
                  value={query()}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <span data-solid-health-count>{`${shownCount()} of ${total()}`}</span>
            </div>
            <div data-solid-health-filters>
              <For each={FILTERS}>
                {(item) => (
                  <button
                    type="button"
                    data-solid-health-chip
                    data-solid-health-filter={item.value}
                    data-on={filter() === item.value ? '' : undefined}
                    aria-pressed={filter() === item.value ? 'true' : 'false'}
                    onClick={() => setFilter(item.value)}
                  >
                    {item.label}
                  </button>
                )}
              </For>
              <button
                type="button"
                data-solid-health-chip
                data-ghost
                aria-label="Clear errors and issues"
                title="Clear errors and issues"
                disabled={!total()}
                onClick={clearAll}
              >
                Clear
              </button>
            </div>
            <For each={shownErrors()}>
              {(item) => {
                const info = () => describeError(item.record.error);
                const isSelected = () => {
                  const value = current();
                  return value?.kind === 'error' && value.index === item.index;
                };
                return (
                  <HealthRow
                    data-solid-health-error-row
                    tone="error"
                    title={info().name}
                    subtitle={info().message}
                    time={errorAge(item.record)}
                    selected={isSelected()}
                    onClick={() => setSelected({ kind: 'error', index: item.index })}
                  />
                );
              }}
            </For>
            <For each={shownIssues()}>
              {(entry) => {
                const isSelected = () => {
                  const value = current();
                  return value?.kind === 'issue' && value.entry.key === entry.key;
                };
                return (
                  <HealthRow
                    data-solid-issues-row
                    data-severity={entry.event.severity}
                    tone={TONES[entry.event.severity]}
                    title={entry.event.code}
                    subtitle={issueText(entry.event)}
                    time={issueAge(entry)}
                    selected={isSelected()}
                    onClick={() => setSelected({ kind: 'issue', key: entry.key })}
                  />
                );
              }}
            </For>
          </div>
          <div data-solid-health-detail>
            <ResizeHandle detail={listWidth} title="Drag to resize, double-click to reset" />
            <Show
              when={current()}
              fallback={
                <div data-solid-health-empty>
                  {total() ? 'Nothing matches this filter.' : emptyText()}
                </div>
              }
            >
              {(value) => (
                <Show
                  when={value().kind === 'error' && (value() as { index: number })}
                  fallback={
                    <IssueDetail
                      entry={(value() as { entry: IssueEntry }).entry}
                      onViewOwner={props.onViewOwner}
                      onViewInGraph={props.onViewInGraph}
                    />
                  }
                >
                  {(error) => (
                    <ErrorViewer
                      show
                      errors={props.errors.map((record) => record.error)}
                      records={props.errors}
                      index={error().index}
                      onIndexChange={(index: number) => setSelected({ kind: 'error', index })}
                      describeOrigin={props.describeOrigin}
                      onShowInActivity={props.onShowInActivity}
                      resetError={() => {
                        setSelected(undefined);
                        props.resetError();
                      }}
                    />
                  )}
                </Show>
              )}
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
