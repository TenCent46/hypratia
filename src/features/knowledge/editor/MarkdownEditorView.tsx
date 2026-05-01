import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ForwardedRef,
  forwardRef,
} from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, search } from '@codemirror/search';
import { foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { smartWrapInputHandler, wrapKeymap } from './extensions/smartWrap';
import {
  wikilinkCompletionSource,
  tagCompletionSource,
  wikilinkDecorations,
  extractDocTags,
  preloadKbFiles,
} from './extensions/wikilink';
import { frontmatterFold } from './extensions/frontmatterFold';
import { kbThemeExtension } from './extensions/theme';
import { livePreviewMarkerFold } from './extensions/livePreviewDecorations';
import { slashCommandCompletionSource } from './extensions/slashCommands';
import { attachmentDrop } from './extensions/attachmentDrop';
import {
  fireEditorPluginsOnload,
  fireEditorPluginsOnunload,
  pluginExtensions,
} from '../../../services/editor-plugins';

export type MarkdownEditorViewHandle = {
  view: EditorView | null;
  getDoc: () => string;
  setDoc: (next: string) => void;
  focus: () => void;
  /** Scroll the editor to a 1-based line and place the caret at line start. */
  jumpToLine: (line: number) => void;
};

type Props = {
  initialDoc: string;
  filePath: string;
  rootPath: string;
  mode: 'live-preview' | 'source';
  onChange: (doc: string) => void;
  onSave: () => void;
  onContextMenu: (e: MouseEvent) => void;
};

function MarkdownEditorViewImpl(
  { initialDoc, filePath, rootPath, mode, onChange, onSave, onContextMenu }: Props,
  ref: ForwardedRef<MarkdownEditorViewHandle>,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useMemo(() => new Compartment(), []);
  const docTagsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onContextMenuRef = useRef(onContextMenu);
  const initialDocRef = useRef(initialDoc);
  const modeRef = useRef(mode);

  // Keep refs current so the long-lived CM6 instance always calls the
  // latest React handlers without rebuilding the view on every render.
  // Done inside an effect because React's rules forbid touching refs
  // during render.
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    onContextMenuRef.current = onContextMenu;
    initialDocRef.current = initialDoc;
    modeRef.current = mode;
  });

  useLayoutEffect(() => {
    if (!hostRef.current) return;
    void preloadKbFiles(rootPath);

    const saveBinding = {
      key: 'Mod-s',
      preventDefault: true,
      run: () => {
        onSaveRef.current();
        return true;
      },
    };

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialDocRef.current,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          foldGutter(),
          indentOnInput(),
          EditorView.lineWrapping,
          search({ top: true }),
          markdown({
            base: markdownLanguage,
            codeLanguages: () => null,
            addKeymap: false,
          }),
          themeCompartment.of(kbThemeExtension(mode)),
          smartWrapInputHandler(),
          wikilinkDecorations(() => rootPath),
          autocompletion({
            override: [
              wikilinkCompletionSource(rootPath),
              tagCompletionSource(() => docTagsRef.current),
              slashCommandCompletionSource,
            ],
            closeOnBlur: true,
            activateOnTyping: true,
          }),
          attachmentDrop(),
          livePreviewMarkerFold(() => modeRef.current === 'live-preview'),
          frontmatterFold(),
          ...pluginExtensions(),
          keymap.of([
            saveBinding,
            ...wrapKeymap(),
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...completionKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const doc = u.state.doc.toString();
              docTagsRef.current = extractDocTags(doc);
              onChangeRef.current(doc);
            }
          }),
          EditorView.domEventHandlers({
            contextmenu: (e) => {
              onContextMenuRef.current(e);
              return true;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    docTagsRef.current = extractDocTags(initialDocRef.current);
    fireEditorPluginsOnload({ view, filePath, rootPath });
    queueMicrotask(() => {
      view.focus();
    });
    return () => {
      fireEditorPluginsOnunload({ view, filePath, rootPath });
      view.destroy();
      viewRef.current = null;
    };
    // We deliberately rebuild the editor when the file path or root changes:
    // the initial document and wikilink closures are baked into the CM state.
    // Mode swaps happen via the compartment effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, filePath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(kbThemeExtension(mode)),
    });
  }, [mode, themeCompartment]);

  useImperativeHandle(
    ref,
    (): MarkdownEditorViewHandle => ({
      get view() {
        return viewRef.current;
      },
      getDoc: () => viewRef.current?.state.doc.toString() ?? '',
      setDoc: (next: string) => {
        const v = viewRef.current;
        if (!v) return;
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: next },
        });
      },
      focus: () => viewRef.current?.focus(),
      jumpToLine: (line: number) => {
        const v = viewRef.current;
        if (!v) return;
        const safe = Math.min(Math.max(line, 1), v.state.doc.lines);
        const target = v.state.doc.line(safe);
        v.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
        });
        v.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className="markdown-cm-host" />;
}

export const MarkdownEditorView = forwardRef(MarkdownEditorViewImpl);
