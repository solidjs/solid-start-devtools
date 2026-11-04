// @refresh skip
import { parse as parseErrorStack, type StackFrameLite } from 'error-stack-parser-es/lite';
import * as htmlToImage from 'html-to-image';
import type { JSX } from '@solidjs/web';
import { Errored, For, Loading, Show, createMemo, createSignal } from 'solid-js';
import Placeholder from '../../ui/Placeholder.js';
import { ResizeHandle } from '../../ui/ResizeHandle.js';
import { Text } from '../../ui/Text.js';
import { useResizableDetail } from '../../ui/use-resizable-detail.js';
import type { ErrorRecord } from '../error-record.js';
import { describeError } from '../health/describe-error.js';
import { HealthButton } from '../health/HealthButton.js';
import { leadingPane } from '../health/leading-pane.js';
import { formatClock, wallTime } from '../health/time.js';
import { CameraIcon, DiscordIcon, GithubIcon, RefreshIcon } from '../icons.js';
import { openInEditor } from '../open-in-editor.js';
import { CopyReportButton } from '../report/CopyReportButton.js';
import { errorReport, resolveErrorFrames } from '../report/error-report.js';
import { pageRoute } from '../report/markdown.js';
import { CodeView } from './CodeView.js';
import { createStackFrame, type StackFrameSource } from './create-stack-frame.js';
import download from './download.js';
import {
  editorLocation,
  foldLabel,
  foldLibraryFrames,
  isLibraryFile,
  pickDefaultFrame,
} from './frames.js';
import './styles.css';

/** The path of a source without its query and origin, split into folder and file name. */
function splitPath(source: string): { folder: string; file: string } {
  let path = source.split(/[?#]/)[0]!;
  path = path.replace(/^file:\/\//, '').replace(/^https?:\/\/[^/]+/, '');
  const slash = path.lastIndexOf('/');
  return { folder: path.slice(0, slash + 1), file: path.slice(slash + 1) };
}

/** `file:line:column` of a frame, as the frame list shows it. */
function getFilePath(source: StackFrameSource): string {
  const line = source.line ? `:${source.line}` : '';
  const column = source.column ? `:${source.column}` : '';
  return `${splitPath(source.source).file}${line}${column}`;
}

function CodeFallback(): JSX.Element {
  return (
    <div data-solid-error-viewer-stack-frames-code-fallback>
      <span>Source not available.</span>
    </div>
  );
}

interface FrameButtonProps {
  name: string | undefined;
  file: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

function FrameButton(props: FrameButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-solid-error-viewer-stack-frame
      data-selected={props.selected ? '' : undefined}
      aria-current={props.selected ? 'true' : undefined}
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      <span data-solid-error-viewer-stack-frame-function>{props.name ?? '<anonymous>'}</span>
      <span data-solid-error-viewer-stack-frame-file>{props.file}</span>
    </button>
  );
}

interface FrameOptionProps {
  frame: StackFrameLite;
  isCompiled: boolean;
  selected: boolean;
  onSelect: (frame: StackFrameLite) => void;
}

// Frame rendered from the raw (unmapped) stack info, used while the source
// is loading or when it is unreachable, so the frame never vanishes from
// the list.
function rawFrameFile(frame: StackFrameLite): string {
  if (!frame.file) return '<unknown source>';
  return getFilePath({
    source: frame.file,
    content: '',
    line: frame.line!,
    column: frame.col!,
    name: frame.function,
  });
}

function FrameOption(props: FrameOptionProps): JSX.Element {
  function select() {
    props.onSelect(props.frame);
  }
  function raw(disabled?: boolean) {
    return (
      <FrameButton
        name={props.frame.function}
        file={rawFrameFile(props.frame)}
        selected={props.selected}
        disabled={disabled}
        onSelect={select}
      />
    );
  }

  return (
    <Errored fallback={raw(true)}>
      {(() => {
        const data = createStackFrame(props.frame, () => props.isCompiled);
        return (
          <Loading fallback={raw()}>
            <Show when={data()} keyed fallback={raw()}>
              {(source) => (
                <FrameButton
                  name={source.name}
                  file={getFilePath(source)}
                  selected={props.selected}
                  onSelect={select}
                />
              )}
            </Show>
          </Loading>
        );
      })()}
    </Errored>
  );
}

function OpenIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

interface CodeBarProps {
  source?: StackFrameSource;
  isCompiled: boolean;
  onSetCompiled: (compiled: boolean) => void;
}

/** The path of the frame, the Original and Compiled switch and the editor button. */
function CodeBar(props: CodeBarProps): JSX.Element {
  return (
    <div data-solid-error-viewer-stack-frames-code-bar>
      <span data-solid-error-viewer-stack-frames-code-source title={props.source?.source}>
        <Show when={props.source}>
          {(source) => (
            <>
              {splitPath(source().source).folder}
              <b>{splitPath(source().source).file}</b>
              {source().line ? `:${source().line}` : ''}
              {source().column ? `:${source().column}` : ''}
            </>
          )}
        </Show>
      </span>
      <div data-solid-error-viewer-segment>
        <button
          type="button"
          title="View Original Source"
          aria-pressed={props.isCompiled ? 'false' : 'true'}
          data-on={props.isCompiled ? undefined : ''}
          onClick={() => props.onSetCompiled(false)}
        >
          Original
        </button>
        <button
          type="button"
          title="View Compiled Source"
          aria-pressed={props.isCompiled ? 'true' : 'false'}
          data-on={props.isCompiled ? '' : undefined}
          onClick={() => props.onSetCompiled(true)}
        >
          Compiled
        </button>
      </div>
      <Show when={props.source ? editorLocation(props.source) : undefined}>
        {(location) => (
          <HealthButton
            primary
            data-solid-error-viewer-open-in-editor
            title={`Open ${location()} in editor`}
            onClick={() => openInEditor(location())}
          >
            <OpenIcon />
            Open in editor
          </HealthButton>
        )}
      </Show>
    </div>
  );
}

interface StackFramesContentProps {
  frames: StackFrameLite[];
  isCompiled: boolean;
  onSetCompiled: (compiled: boolean) => void;
}

function StackFramesContent(props: StackFramesContentProps) {
  const segments = foldLibraryFrames(props.frames);

  const [selectedFrame, setSelectedFrame] = createSignal<StackFrameLite | undefined>(
    pickDefaultFrame(props.frames),
  );
  // Ids of the folded runs that are open.
  const [expanded, setExpanded] = createSignal<ReadonlySet<number>>(new Set());

  // The handle is the left edge of the code, so it sizes the frame list before it.
  const framesWidth = leadingPane(
    useResizableDetail({
      storageKey: 'solid-start-devtools:error-frames-width',
      defaultWidth: 250,
      minWidth: 160,
    }),
  );

  function toggleFold(id: number) {
    const next = new Set(expanded());
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
  }

  function selectFrame(frame: StackFrameLite) {
    setSelectedFrame(frame);
  }

  function codeFallback() {
    return (
      <>
        <CodeBar isCompiled={props.isCompiled} onSetCompiled={props.onSetCompiled} />
        <CodeFallback />
      </>
    );
  }

  function frameOption(frame: StackFrameLite) {
    return (
      <FrameOption
        frame={frame}
        isCompiled={props.isCompiled}
        selected={selectedFrame() === frame}
        onSelect={selectFrame}
      />
    );
  }

  return (
    <div data-solid-error-viewer-stack-frames-content>
      <div data-solid-error-viewer-stack-frames style={{ width: `${framesWidth.width()}px` }}>
        <For each={segments}>
          {(segment) => {
            if (segment.type === 'frame') return frameOption(segment.frame);
            const open = () => expanded().has(segment.id);
            const label = foldLabel(segment.frames.map((frame) => frame.file));
            return (
              <>
                <button
                  type="button"
                  data-solid-error-viewer-stack-frames-fold
                  aria-expanded={open() ? 'true' : 'false'}
                  onClick={() => toggleFold(segment.id)}
                >
                  {`${open() ? '▾' : '▸'} ${label}`}
                </button>
                <Show when={open()}>
                  <For each={segment.frames}>{(frame) => frameOption(frame)}</For>
                </Show>
              </>
            );
          }}
        </For>
      </div>
      <div data-solid-error-viewer-stack-frames-code>
        <ResizeHandle detail={framesWidth} title="Drag to resize, double-click to reset" />
        <Show when={selectedFrame()} keyed>
          {(frame) => (
            // Keyed on the frame so a failure inspecting one frame (an
            // unreachable source, a failed highlight) resets when another
            // frame is selected instead of leaving the pane stuck.
            <Errored fallback={codeFallback()}>
              {(() => {
                const data = createStackFrame(frame, () => props.isCompiled);
                return (
                  <Loading fallback={codeFallback()}>
                    <Show when={data()} keyed fallback={codeFallback()}>
                      {(source) => (
                        <>
                          <CodeBar
                            source={source}
                            isCompiled={props.isCompiled}
                            onSetCompiled={props.onSetCompiled}
                          />
                          <div data-solid-error-viewer-stack-frames-code-container>
                            <CodeView
                              fileName={source.source}
                              line={source.line}
                              column={source.column}
                              content={source.content}
                            />
                          </div>
                        </>
                      )}
                    </Show>
                  </Loading>
                );
              })()}
            </Errored>
          )}
        </Show>
      </div>
    </div>
  );
}

interface ErrorViewerProps {
  show?: boolean;
  errors: any[];
  /** When and during what each error was caught, in the order of `errors`. */
  records?: ErrorRecord[];
  resetError: () => void;
  /** 0-based index into `errors`. When set, the parent owns the selection. */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** The label of the action an origin belongs to, when it belongs to one. */
  describeOrigin?: (origin: object) => string | undefined;
  /** Opens the action an origin belongs to in the Activity view. */
  onShowInActivity?: (origin: object) => void;
}

const ISSUE_THREAD = 'https://github.com/solidjs/solid-start-devtools/issues/new';
const DISCORD_INVITE = 'https://discord.com/invite/solidjs';

export default function ErrorViewer(props: ErrorViewerProps): JSX.Element {
  const [page, setPage] = createSignal(0);
  const [isCompiled, setIsCompiled] = createSignal(false);
  const length = createMemo(() => props.errors.length);

  // The 0-based index shown, from the parent when it controls the selection.
  const current = createMemo(() => {
    const wanted = props.index ?? page();
    return Math.max(0, Math.min(wanted, length() - 1));
  });

  function selectIndex(next: number) {
    if (props.index === undefined) setPage(next);
    props.onIndexChange?.(next);
  }

  function goPrev() {
    selectIndex(current() > 0 ? current() - 1 : length() - 1);
  }

  function goNext() {
    selectIndex(current() < length() - 1 ? current() + 1 : 0);
  }

  const [panel, setPanel] = createSignal<HTMLElement>();

  function downloadScreenshot() {
    const current = panel();
    if (current) {
      htmlToImage
        .toPng(current, {
          style: {
            transform: 'scale(0.75)',
          },
        })
        .then((url) => {
          download(url, 'solid-screenshot.png');
        });
    }
  }

  function redirectToGithub() {
    const url = new URL(ISSUE_THREAD);
    url.searchParams.append('labels', 'bug');
    url.searchParams.append('labels', 'needs+triage');
    url.searchParams.append('template', 'bug.yml');
    url.searchParams.append('title', `[Bug?]:` + props.errors[current()].toString());
    window.open(url, '_blank')!.focus();
  }

  async function copyErrorReport(): Promise<string> {
    const error = props.errors[current()];
    return errorReport({ error, frames: await resolveErrorFrames(error), route: pageRoute() });
  }

  function redirectToDiscord() {
    window.open(DISCORD_INVITE, '_blank')!.focus();
  }

  return (
    <Show when={props.show}>
      <div data-solid-dev-toolbar-panel>
        <Show
          when={props.errors.length}
          fallback={
            <Placeholder>
              <Text options={{ size: 'xs' }}>No errors captured.</Text>
            </Placeholder>
          }
        >
          <div ref={setPanel} data-solid-error-viewer>
            <Show when={props.errors[current()]} keyed>
              {(error) => {
                // An error without a usable stack yields no frames instead of throwing.
                const frames =
                  error instanceof Error ? parseErrorStack(error, { allowEmpty: true }) : [];
                const info = describeError(error);
                const record = () => props.records?.[current()];
                // The first frame from the app, which is where the error was thrown from.
                const thrownIn = () => {
                  const frame = pickDefaultFrame(frames);
                  return frame && !isLibraryFile(frame.file) ? frame.function : undefined;
                };
                // The action that was running, when the origin belongs to one.
                const action = () => {
                  const origin = record()?.origin;
                  const label = origin && props.describeOrigin?.(origin);
                  return label ? { origin: origin as object, label } : undefined;
                };
                return (
                  <>
                    <div data-solid-error-viewer-head>
                      <div data-solid-error-viewer-top>
                        <Show when={props.errors.length > 1}>
                          <div data-solid-error-viewer-pagination>
                            <button type="button" title="Previous error" onClick={goPrev}>
                              ‹
                            </button>
                            <span data-solid-error-viewer-page-counter>
                              {`${current() + 1} of ${props.errors.length}`}
                            </span>
                            <button type="button" title="Next error" onClick={goNext}>
                              ›
                            </button>
                          </div>
                        </Show>
                        <Show when={thrownIn()}>
                          {(name) => (
                            <span data-solid-error-viewer-where>
                              in <b>{`ƒ ${name()}`}</b>
                            </span>
                          )}
                        </Show>
                        <span data-solid-error-viewer-spacer />
                        <HealthButton icon onClick={redirectToGithub}>
                          <GithubIcon title="Create an issue thread on GitHub" />
                        </HealthButton>
                        <HealthButton icon onClick={redirectToDiscord}>
                          <DiscordIcon title="Join our Discord channel" />
                        </HealthButton>
                        <HealthButton icon onClick={downloadScreenshot}>
                          <CameraIcon title="Capture the error as an image" />
                        </HealthButton>
                        <CopyReportButton
                          label="this error"
                          text="Copy report"
                          report={copyErrorReport}
                        />
                        <HealthButton title="Reset the error" onClick={props.resetError}>
                          <RefreshIcon title="" aria-hidden="true" />
                          Reset
                        </HealthButton>
                      </div>
                      <div data-solid-error-viewer-error-info-name>{info.name}</div>
                      <div data-solid-error-viewer-error-info-message>{info.message}</div>
                      <Show when={record()}>
                        {(item) => (
                          <div data-solid-error-viewer-meta>
                            {formatClock(wallTime(item().at))}
                            <Show when={action()}>
                              {(found) => (
                                <>
                                  {' · after '}
                                  <span data-solid-error-viewer-mono>{found().label}</span>
                                  {' on '}
                                  <span data-solid-error-viewer-mono>{pageRoute()}</span>
                                  <Show when={props.onShowInActivity}>
                                    {(show) => (
                                      <>
                                        {' · '}
                                        <button
                                          type="button"
                                          data-solid-error-viewer-link
                                          onClick={() => show()(found().origin)}
                                        >
                                          see it in Activity
                                        </button>
                                      </>
                                    )}
                                  </Show>
                                </>
                              )}
                            </Show>
                          </div>
                        )}
                      </Show>
                    </div>
                    <Show
                      when={frames.length}
                      fallback={
                        <div data-solid-error-viewer-nostack>This value has no stack to show.</div>
                      }
                    >
                      <StackFramesContent
                        frames={frames}
                        isCompiled={isCompiled()}
                        onSetCompiled={setIsCompiled}
                      />
                    </Show>
                  </>
                );
              }}
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
