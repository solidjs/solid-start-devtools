import type { JSX } from '@solidjs/web';
import { clientOnly } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import IconButton from '../../ui/IconButton.js';
import Placeholder from '../../ui/Placeholder.js';
import { ResizeHandle } from '../../ui/ResizeHandle.js';
import { Text } from '../../ui/Text.js';
import { useResizableDetail } from '../../ui/use-resizable-detail.js';
import { TrashIcon } from '../icons.js';
import { IssueDetail, IssueRow, matchesIssue, SEVERITIES, type Severity } from '../issues/index.js';
import { isIssuesAvailable, type IssueEntry } from '../issues/tracker.js';
import './styles.css';

// The error panel is the heaviest part of the view, so it loads when an error is opened.
const ErrorViewer = clientOnly(() => import('../error-viewer/index.js'), { lazy: true });

/** What the detail pane shows: a thrown error by its index, or an issue by its key. */
type Selection = { kind: 'error'; index: number } | { kind: 'issue'; key: string };

/** The first line of a thrown value, split into its name and message. */
export function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message };
  }
  if (error instanceof ErrorEvent) {
    return { name: 'Error', message: error.message };
  }
  return { name: 'Thrown value', message: String(error) };
}

export interface HealthViewerProps {
  show?: boolean;
  errors: unknown[];
  resetError: () => void;
  issues: IssueEntry[];
  onClearIssues: () => void;
  onViewOwner?: (owner: object) => void;
  onViewInGraph?: (node: object) => void;
}

/** Thrown errors and the runtime's diagnostics in one list, with the selected entry beside it. */
export default function HealthViewer(props: HealthViewerProps): JSX.Element {
  const [query, setQuery] = createSignal('');
  const [hideErrors, setHideErrors] = createSignal(false);
  const [hidden, setHidden] = createSignal<Severity[]>([]);
  const [selected, setSelected] = createSignal<Selection>();
  const detail = useResizableDetail({
    storageKey: 'solid-start-devtools:health-detail-width',
    defaultWidth: 640,
    minWidth: 360,
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

  const shownErrors = createMemo(() => {
    if (hideErrors()) return [];
    const search = query().trim().toLowerCase();
    const result: { error: unknown; index: number }[] = [];
    let index = 0;
    for (const error of props.errors) {
      const { name, message } = describeError(error);
      if (!search || `${name} ${message}`.toLowerCase().includes(search)) {
        result.push({ error, index });
      }
      index++;
    }
    return result;
  });

  const shownIssues = createMemo(() => {
    const search = query().trim().toLowerCase();
    const off = hidden();
    const result: IssueEntry[] = [];
    for (const entry of props.issues) {
      if (!off.includes(entry.event.severity) && matchesIssue(entry, search)) result.push(entry);
    }
    return result;
  });

  const total = () => props.errors.length + props.issues.length;
  const shownCount = () => shownErrors().length + shownIssues().length;

  // An issue that was cleared or an error index past the end selects nothing.
  const current = createMemo(() => {
    const value = selected();
    if (!value) return undefined;
    if (value.kind === 'error') return value.index < props.errors.length ? value : undefined;
    const entry = props.issues.find((item) => item.key === value.key);
    return entry ? { kind: 'issue' as const, entry } : undefined;
  });

  function toggleSeverity(value: Severity): void {
    setHidden((list) =>
      list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
    );
  }

  function clearAll(): void {
    setSelected(undefined);
    props.resetError();
    props.onClearIssues();
  }

  return (
    <Show when={props.show}>
      <div data-solid-dev-toolbar-panel>
        <div data-solid-health-viewer>
          <div data-solid-health-list-pane>
            <div data-solid-issues-nav>
              <input
                data-solid-issues-search
                type="search"
                placeholder="Filter by name, code, message or owner"
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <div data-solid-issues-filters>
                <button
                  type="button"
                  data-solid-issues-filter="thrown"
                  data-off={hideErrors() ? '' : undefined}
                  aria-pressed={hideErrors() ? 'false' : 'true'}
                  onClick={() => setHideErrors((value) => !value)}
                >
                  <Text options={{ size: 'xs', weight: 'semibold', wrap: 'nowrap' }}>Thrown</Text>
                </button>
                <For each={SEVERITIES}>
                  {(severity) => (
                    <button
                      type="button"
                      data-solid-issues-filter={severity.value}
                      data-off={hidden().includes(severity.value) ? '' : undefined}
                      aria-pressed={hidden().includes(severity.value) ? 'false' : 'true'}
                      onClick={() => toggleSeverity(severity.value)}
                    >
                      <Text options={{ size: 'xs', weight: 'semibold', wrap: 'nowrap' }}>
                        {severity.label}
                      </Text>
                    </button>
                  )}
                </For>
              </div>
              <div data-solid-issues-nav-actions>
                <Text data-solid-issues-count options={{ size: 'xs', font: 'mono' }}>
                  {`${shownCount()} of ${total()}`}
                </Text>
                <IconButton disabled={!total()} onClick={clearAll}>
                  <TrashIcon title="Clear errors and issues" />
                </IconButton>
              </div>
            </div>
            <div data-solid-issues-list>
              <Show
                when={shownCount()}
                fallback={
                  <Placeholder>
                    <Text options={{ size: 'xs' }}>
                      {total()
                        ? 'Nothing matches this filter.'
                        : isIssuesAvailable()
                          ? 'No errors or issues so far.'
                          : 'No errors so far. Issues need a development build of solid-js.'}
                    </Text>
                  </Placeholder>
                }
              >
                <For each={shownErrors()}>
                  {(item) => {
                    const info = () => describeError(item.error);
                    const isSelected = () => {
                      const value = current();
                      return value?.kind === 'error' && value.index === item.index;
                    };
                    return (
                      <button
                        type="button"
                        data-solid-health-error-row
                        data-selected={isSelected() ? '' : undefined}
                        onClick={() => setSelected({ kind: 'error', index: item.index })}
                      >
                        <Text data-solid-health-error-name options={{ size: 'xs', font: 'mono' }}>
                          {info().name}
                        </Text>
                        <Text data-solid-issues-row-message options={{ size: 'xs' }}>
                          {info().message}
                        </Text>
                      </button>
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
                      <IssueRow
                        entry={entry}
                        selected={isSelected()}
                        onSelect={() => setSelected({ kind: 'issue', key: entry.key })}
                      />
                    );
                  }}
                </For>
              </Show>
            </div>
          </div>
          <Show when={current()}>
            {(value) => (
              <aside data-solid-health-detail style={{ width: `${detail.width()}px` }}>
                <ResizeHandle detail={detail} />
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
                      errors={props.errors}
                      index={error().index}
                      onIndexChange={(index: number) => setSelected({ kind: 'error', index })}
                      resetError={() => {
                        setSelected(undefined);
                        props.resetError();
                      }}
                    />
                  )}
                </Show>
              </aside>
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
}
