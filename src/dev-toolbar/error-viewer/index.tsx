// @refresh skip
import { parse as parseErrorStack, type StackFrameLite } from 'error-stack-parser-es/lite';
import * as htmlToImage from 'html-to-image';
import type { JSX } from '@solidjs/web';
import { Errored, For, Loading, Show, createMemo, createSignal } from 'solid-js';
import Button from '../../ui/Button.js';
import IconButton from '../../ui/IconButton.js';
import Placeholder from '../../ui/Placeholder.js';
import { ResizeHandle } from '../../ui/ResizeHandle.js';
import { Text } from '../../ui/Text.js';
import { useResizableDetail } from '../../ui/use-resizable-detail.js';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  DiscordIcon,
  GithubIcon,
  RefreshIcon,
  ViewCompiledIcon,
  ViewOriginalIcon,
} from '../icons.js';
import { openInEditor } from '../open-in-editor.js';
import { CopyReportButton } from '../report/CopyReportButton.js';
import { errorReport, resolveErrorFrames } from '../report/error-report.js';
import { pageRoute } from '../report/markdown.js';
import { CodeView } from './CodeView.js';
import { createStackFrame, type StackFrameSource } from './create-stack-frame.js';
import download from './download.js';
import { editorLocation, foldLibraryFrames, pickDefaultFrame } from './frames.js';
import './styles.css';

export function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface ErrorInfoProps {
  error: unknown;
}

function ErrorInfo(props: ErrorInfoProps): JSX.Element {
  const error = createMemo(() => {
    const e = props.error;

    if (e instanceof Error) {
      return { name: e.name, message: e.message };
    }

    if (e instanceof ErrorEvent) {
      return { message: e.message };
    }

    return { message: (e as Error).toString() };
  });

  return (
    <span data-solid-error-viewer-error-info>
      <span data-solid-error-viewer-error-info-name>{error().name}</span>
      <span data-solid-error-viewer-error-info-message>{error().message}</span>
    </span>
  );
}

function getFileName(source: string): string {
  try {
    const path = source.startsWith('/') ? new URL(source, 'file://') : new URL(source);
    const paths = path.pathname.split('/');
    return paths[paths.length - 1]!;
  } catch (error) {
    return getFileName(`/${source}`);
  }
}

function getFilePath(source: StackFrameSource) {
  const line = source.line ? `:${source.line}` : '';
  const column = source.column ? `:${source.column}` : '';
  return `${getFileName(source.source)}${line}${column}`;
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

// Frame rendered from the raw (unmapped) stack info — used while the source
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

interface CodeBarProps {
  source?: StackFrameSource;
  isCompiled: boolean;
  onToggleCompiled: () => void;
}

function CodeBar(props: CodeBarProps): JSX.Element {
  return (
    <div data-solid-error-viewer-stack-frames-code-bar>
      <span data-solid-error-viewer-stack-frames-code-source>{props.source?.source}</span>
      <Show when={props.source ? editorLocation(props.source) : undefined}>
        {(location) => (
          <Button
            data-solid-error-viewer-open-in-editor
            title={`Open ${location()} in editor`}
            onClick={() => openInEditor(location())}
          >
            Open in editor
          </Button>
        )}
      </Show>
      <IconButton data-solid-error-viewer-button onClick={props.onToggleCompiled} type="button">
        <Show when={props.isCompiled} fallback={<ViewOriginalIcon title="View Original Source" />}>
          <ViewCompiledIcon title="View Compiled Source" />
        </Show>
      </IconButton>
    </div>
  );
}

interface StackFramesContentProps {
  error: Error;
  isCompiled: boolean;
  onToggleCompiled: () => void;
}

function StackFramesContent(props: StackFramesContentProps) {
  // An error without a usable stack yields no frames instead of throwing.
  const stackframes = parseErrorStack(props.error, { allowEmpty: true });
  const segments = foldLibraryFrames(stackframes);

  const [selectedFrame, setSelectedFrame] = createSignal<StackFrameLite | undefined>(
    pickDefaultFrame(stackframes),
  );
  // Ids of the folded runs that are open.
  const [expanded, setExpanded] = createSignal<ReadonlySet<number>>(new Set());

  const detail = useResizableDetail({
    storageKey: 'solid-start-devtools:error-code-width',
    defaultWidth: 480,
  });

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
        <CodeBar isCompiled={props.isCompiled} onToggleCompiled={props.onToggleCompiled} />
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
      <div data-solid-error-viewer-stack-frames>
        <For each={segments}>
          {(segment) => {
            if (segment.type === 'frame') return frameOption(segment.frame);
            const open = () => expanded().has(segment.id);
            return (
              <>
                <button
                  type="button"
                  data-solid-error-viewer-stack-frames-fold
                  aria-expanded={open() ? 'true' : 'false'}
                  onClick={() => toggleFold(segment.id)}
                >
                  {`${open() ? '▾' : '▸'} ${segment.frames.length} ${
                    segment.frames.length === 1 ? 'frame' : 'frames'
                  } in libraries`}
                </button>
                <Show when={open()}>
                  <For each={segment.frames}>{(frame) => frameOption(frame)}</For>
                </Show>
              </>
            );
          }}
        </For>
      </div>
      <div data-solid-error-viewer-stack-frames-code style={{ width: `${detail.width()}px` }}>
        <ResizeHandle detail={detail} />
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
                            onToggleCompiled={props.onToggleCompiled}
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

interface StackFramesProps {
  error: unknown;
  isCompiled: boolean;
  onToggleCompiled: () => void;
}

function StackFrames(props: StackFramesProps) {
  return (
    <Show when={props.error instanceof Error && props.error} keyed>
      {(current) => (
        <StackFramesContent
          error={current}
          isCompiled={props.isCompiled}
          onToggleCompiled={props.onToggleCompiled}
        />
      )}
    </Show>
  );
}

interface ErrorViewerProps {
  show?: boolean;
  errors: any[];
  resetError: () => void;
  /** 0-based index into `errors`. When set, the parent owns the selection. */
  index?: number;
  onIndexChange?: (index: number) => void;
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

  function toggleIsCompiled() {
    setIsCompiled((c) => !c);
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
            <div data-solid-error-viewer-navbar>
              <div data-solid-error-viewer-navbar-left>
                <Show when={props.errors.length > 1}>
                  <div data-solid-error-viewer-pagination>
                    <IconButton data-solid-error-viewer-button onClick={goPrev} type="button">
                      <ArrowLeftIcon title="Go Previous" />
                    </IconButton>
                    <div data-solid-error-viewer-page-counter>
                      {`${current() + 1} of ${props.errors.length}`}
                    </div>
                    <IconButton data-solid-error-viewer-button onClick={goNext} type="button">
                      <ArrowRightIcon title="Go Next" />
                    </IconButton>
                  </div>
                </Show>
              </div>
              <div data-solid-error-viewer-controls>
                <CopyReportButton label="this error" report={copyErrorReport} />
                <IconButton data-solid-error-viewer-button onClick={redirectToGithub} type="button">
                  <GithubIcon title="Create an issue thread on Github" />
                </IconButton>
                <IconButton
                  data-solid-error-viewer-button
                  onClick={redirectToDiscord}
                  type="button"
                >
                  <DiscordIcon title="Join our Discord Channel" />
                </IconButton>
                <IconButton
                  data-solid-error-viewer-button
                  onClick={downloadScreenshot}
                  type="button"
                >
                  <CameraIcon title="Capture Error Overlay" />
                </IconButton>
                <IconButton data-solid-error-viewer-button onClick={props.resetError} type="button">
                  <RefreshIcon title="Reset Error" />
                </IconButton>
              </div>
            </div>
            <Show when={props.errors[current()]} keyed>
              {(error) => (
                <div data-solid-error-viewer-content>
                  <ErrorInfo error={error} />
                  <StackFrames
                    error={error}
                    isCompiled={isCompiled()}
                    onToggleCompiled={toggleIsCompiled}
                  />
                </div>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
