import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store';
import { dialog } from '../../services/dialog';
import { storage } from '../../services/storage';
import { obsidianExporter } from '../../services/export/ObsidianExporter';
import { openTodayDailyNote } from '../daily/DailyNotes';
import { confirmDangerTwice } from '../../lib/confirm';
import { getCurrentEditor } from '../../features/knowledge/editor/editorRegistry';
import {
  resetAllKnowledgeBase,
  resetProjectKnowledgeBase,
} from '../../services/knowledge/resetKnowledgeBase';
import {
  resetMirrorState,
  syncConversationMirror,
} from '../../services/knowledge/conversationMarkdownMirror';
import { rebuildProjectKnowledge } from '../../services/knowledge/projectRetrieval';
import { resolveMarkdownRoot } from '../../services/storage/MarkdownFileService';
import { openRelationshipTreeWindow } from '../../services/window';
import type { Command } from './CommandRegistry';

export function useCommands(): Command[] {
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const setQuickCaptureOpen = useStore((s) => s.setQuickCaptureOpen);
  const createConversation = useStore((s) => s.createConversation);
  const removeConversation = useStore((s) => s.removeConversation);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const renameConversation = useStore((s) => s.renameConversation);
  const conversations = useStore((s) => s.conversations);
  const lastConversationId = useStore((s) => s.settings.lastConversationId);
  const setViewMode = useStore((s) => s.setViewMode);
  const viewMode = useStore((s) => s.ui.viewMode);
  const canvasTool = useStore((s) => s.ui.canvasTool);
  const setCanvasTool = useStore((s) => s.setCanvasTool);
  const canvasWheelMode = useStore(
    (s) => s.settings.canvasWheelMode ?? 'pan',
  );
  const setCanvasWheelMode = useStore((s) => s.setCanvasWheelMode);
  const incognitoUnprojectedChats = useStore(
    (s) => s.settings.incognitoUnprojectedChats ?? false,
  );
  const setIncognitoUnprojectedChats = useStore(
    (s) => s.setIncognitoUnprojectedChats,
  );
  const setGraphImportOpen = useStore((s) => s.setGraphImportOpen);
  const activeRightTab = useStore((s) => s.ui.activeRightTab);
  const setActiveRightTab = useStore((s) => s.setActiveRightTab);
  const setTheme = useStore((s) => s.setTheme);
  const theme = useStore((s) => s.settings.theme);
  const addNode = useStore((s) => s.addNode);
  const openAiPalette = useStore((s) => s.openAiPalette);
  const setObsidianVault = useStore((s) => s.setObsidianVault);
  const obsidianVaultPath = useStore((s) => s.settings.obsidianVaultPath);
  const flow = useReactFlow();

  return useMemo<Command[]>(() => {
    function dispatchLayoutAction(action: string) {
      window.dispatchEvent(new CustomEvent('mc:layout-action', { detail: { action } }));
    }

    function nextConversation(direction: 1 | -1) {
      if (!lastConversationId || conversations.length === 0) return;
      const idx = conversations.findIndex((c) => c.id === lastConversationId);
      if (idx < 0) return;
      const nextIdx =
        (idx + direction + conversations.length) % conversations.length;
      setActiveConversation(conversations[nextIdx].id);
    }

    function centerViewport() {
      flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
    }

    function addEmptyNode() {
      const conv = lastConversationId;
      if (!conv) return;
      const center = flow.screenToFlowPosition({
        x: window.innerWidth / 3,
        y: window.innerHeight / 2,
      });
      addNode({
        conversationId: conv,
        title: 'New note',
        contentMarkdown: '',
        position: center,
        tags: [],
      });
    }

    return [
      {
        id: 'conversation.new',
        title: 'New conversation',
        section: 'Conversation',
        shortcut: '⌘N',
        match: 'mod+n',
        run: () => {
          const id = createConversation();
          setActiveConversation(id);
        },
      },
      {
        id: 'conversation.rename',
        title: 'Rename current conversation…',
        section: 'Conversation',
        when: () => Boolean(lastConversationId),
        run: () => {
          if (!lastConversationId) return;
          const cur = conversations.find((c) => c.id === lastConversationId);
          const next = window.prompt('Rename conversation', cur?.title ?? '');
          if (next && next.trim()) renameConversation(lastConversationId, next.trim());
        },
      },
      {
        id: 'conversation.delete',
        title: 'Delete current conversation',
        section: 'Conversation',
        when: () => Boolean(lastConversationId),
        run: () => {
          if (!lastConversationId) return;
          const cur = conversations.find((c) => c.id === lastConversationId);
          if (
            confirmDangerTwice({
              title: `Delete conversation "${cur?.title ?? 'Untitled'}"?`,
              detail:
                'This will remove the conversation, its messages, canvas nodes, and connected edges.',
              finalDetail:
                'Second confirmation: permanently delete this conversation?',
            })
          ) {
            removeConversation(lastConversationId);
          }
        },
      },
      {
        id: 'conversation.next',
        title: 'Switch to next conversation',
        section: 'Conversation',
        shortcut: '⌘]',
        match: 'mod+]',
        run: () => nextConversation(1),
      },
      {
        id: 'conversation.prev',
        title: 'Switch to previous conversation',
        section: 'Conversation',
        shortcut: '⌘[',
        match: 'mod+[',
        run: () => nextConversation(-1),
      },
      {
        id: 'canvas.empty-node',
        title: 'Add empty node at viewport center',
        section: 'Canvas',
        shortcut: '⌘E',
        match: 'mod+e',
        run: addEmptyNode,
      },
      {
        id: 'canvas.center',
        title: 'Center viewport',
        section: 'Canvas',
        shortcut: '⌘0',
        match: 'mod+0',
        run: centerViewport,
      },
      {
        id: 'canvas.toggle-global',
        title: `Toggle map mode (${viewMode === 'global' ? 'now Global' : 'now Current'})`,
        section: 'Canvas',
        shortcut: '⌘G',
        match: 'mod+g',
        run: () => setViewMode(viewMode === 'global' ? 'current' : 'global'),
      },
      {
        id: 'canvas.undo',
        title: 'Undo last canvas delete',
        section: 'Canvas',
        shortcut: '⌘Z',
        match: 'mod+z',
        // The keymap automatically lets Cmd-Z reach inputs / textareas /
        // contenteditables (native text undo wins there). On the canvas
        // surface, Cmd-Z restores the last deleted node or edge from
        // the in-memory ring buffer (cap 10). See store `undoStack`.
        when: () => useStore.getState().undoStack.length > 0,
        run: () => {
          useStore.getState().undoCanvasDelete();
        },
      },
      {
        id: 'canvas.titles-only',
        title:
          viewMode === 'titles'
            ? 'Exit Titles view (back to Current Map)'
            : 'Show Titles only (compact map view)',
        section: 'Canvas',
        run: () => setViewMode(viewMode === 'titles' ? 'current' : 'titles'),
      },
      {
        id: 'canvas.open-tree-window',
        title: 'Open Title Tree Window (Relationship Tree)',
        section: 'Canvas',
        run: () => {
          // The tree window mirrors the active conversation. It picks
          // up `lastConversationId` on its own through the broadcast
          // store-sync, but passing the chatId here keeps the URL
          // self-describing for debugging / reload.
          const id = lastConversationId;
          void openRelationshipTreeWindow(id);
        },
      },
      {
        id: 'canvas.tool.select',
        title: 'Select Tool',
        section: 'Canvas',
        shortcut: 'V',
        match: 'v',
        when: () => canvasTool !== 'select',
        run: () => setCanvasTool('select'),
      },
      {
        id: 'canvas.tool.hand',
        title: 'Hand Tool',
        section: 'Canvas',
        shortcut: 'H',
        match: 'h',
        when: () => canvasTool !== 'hand',
        run: () => setCanvasTool('hand'),
      },
      {
        id: 'canvas.wheel.toggle',
        title:
          canvasWheelMode === 'pan'
            ? 'Wheel: switch to Zoom mode'
            : 'Wheel: switch to Scroll/Pan mode',
        section: 'Canvas',
        shortcut: 'S',
        match: 's',
        run: () =>
          setCanvasWheelMode(canvasWheelMode === 'pan' ? 'zoom' : 'pan'),
      },
      {
        id: 'canvas.import-graph',
        title: 'Import to map…',
        section: 'Canvas',
        run: () => setGraphImportOpen(true),
      },
      {
        id: 'ai.palette',
        title: 'Open AI palette on selection',
        section: 'AI',
        shortcut: '⌘J',
        match: 'mod+j',
        run: () => {
          const sel = window.getSelection()?.toString() ?? '';
          openAiPalette(sel, null);
        },
      },
      {
        id: 'search.open',
        title: 'Search',
        section: 'Search',
        shortcut: '⌘K',
        match: 'mod+k',
        run: () => setSearchOpen(true),
      },
      {
        id: 'view.toggle-tab',
        title: `Toggle Inspect / Chat (${activeRightTab})`,
        section: 'View',
        shortcut: '⌘⇧I',
        match: 'mod+shift+i',
        run: () => setActiveRightTab(activeRightTab === 'inspect' ? 'chat' : 'inspect'),
      },
      {
        id: 'toggle-chat',
        title: 'Toggle Chat',
        section: 'View',
        run: () => dispatchLayoutAction('toggle-chat'),
      },
      {
        id: 'show-chat',
        title: 'Show Chat',
        section: 'View',
        run: () => dispatchLayoutAction('show-chat'),
      },
      {
        id: 'hide-chat',
        title: 'Hide Chat',
        section: 'View',
        run: () => dispatchLayoutAction('hide-chat'),
      },
      {
        id: 'toggle-canvas',
        title: 'Toggle Canvas',
        section: 'View',
        run: () => dispatchLayoutAction('toggle-canvas'),
      },
      {
        id: 'show-canvas',
        title: 'Show Canvas',
        section: 'View',
        run: () => dispatchLayoutAction('show-canvas'),
      },
      {
        id: 'hide-canvas',
        title: 'Hide Canvas',
        section: 'View',
        run: () => dispatchLayoutAction('hide-canvas'),
      },
      {
        id: 'detach-chat',
        title: 'Detach Chat to New Window',
        section: 'View',
        run: () => dispatchLayoutAction('open-chat-window'),
      },
      {
        id: 'detach-canvas',
        title: 'Detach Canvas to New Window',
        section: 'View',
        run: () => dispatchLayoutAction('open-canvas-window'),
      },
      {
        id: 'toggle-markdown',
        title: 'Toggle Markdown Editor',
        section: 'View',
        run: () => dispatchLayoutAction('toggle-markdown'),
      },
      {
        id: 'show-markdown',
        title: 'Show Markdown Editor',
        section: 'View',
        run: () => dispatchLayoutAction('show-markdown'),
      },
      {
        id: 'hide-markdown',
        title: 'Hide Markdown Editor',
        section: 'View',
        run: () => dispatchLayoutAction('hide-markdown'),
      },
      {
        id: 'show-all-panels',
        title: 'Show All Panels',
        section: 'View',
        run: () => dispatchLayoutAction('show-all-panels'),
      },
      {
        id: 'show-sidebar',
        title: 'Show Sidebar',
        section: 'View',
        run: () => dispatchLayoutAction('show-sidebar'),
      },
      {
        id: 'hide-sidebar',
        title: 'Hide Sidebar',
        section: 'View',
        run: () => dispatchLayoutAction('hide-sidebar'),
      },
      {
        id: 'toggle-sidebar',
        title: 'Toggle Sidebar',
        section: 'View',
        run: () => dispatchLayoutAction('toggle-sidebar'),
      },
      {
        id: 'view.open-chat-window',
        title: 'Open New Chat Window',
        section: 'View',
        run: () => dispatchLayoutAction('open-chat-window'),
      },
      {
        id: 'view.open-canvas-window',
        title: 'Open New Canvas Window',
        section: 'View',
        run: () => dispatchLayoutAction('open-canvas-window'),
      },
      {
        id: 'view.toggle-tabs-autohide',
        title: 'Toggle Auto-Hide Chat Tabs',
        section: 'View',
        run: () => dispatchLayoutAction('toggle-tabs-autohide'),
      },
      {
        id: 'view.theme.light',
        title: 'Theme: Light',
        section: 'View',
        when: () => theme !== 'light',
        run: () => setTheme('light'),
      },
      {
        id: 'view.theme.dark',
        title: 'Theme: Dark',
        section: 'View',
        when: () => theme !== 'dark',
        run: () => setTheme('dark'),
      },
      {
        id: 'view.theme.sepia',
        title: 'Theme: Sepia',
        section: 'View',
        when: () => theme !== 'sepia',
        run: () => setTheme('sepia'),
      },
      {
        id: 'view.theme.high-contrast',
        title: 'Theme: High contrast',
        section: 'View',
        when: () => theme !== 'high-contrast',
        run: () => setTheme('high-contrast'),
      },
      {
        id: 'view.theme.white',
        title: 'Theme: White',
        section: 'View',
        when: () => theme !== 'white',
        run: () => setTheme('white'),
      },
      {
        id: 'view.theme.violet',
        title: 'Theme: Violet',
        section: 'View',
        when: () => theme !== 'violet',
        run: () => setTheme('violet'),
      },
      {
        id: 'file.settings',
        title: 'Open Settings',
        section: 'File',
        shortcut: '⌘,',
        match: 'mod+,',
        run: () => setSettingsOpen(true),
      },
      {
        id: 'file.choose-vault',
        title: 'Choose Obsidian vault…',
        section: 'File',
        run: async () => {
          const picked = await dialog.pickFolder();
          if (picked) setObsidianVault(picked);
        },
      },
      {
        id: 'file.open-folder',
        title: 'Open Folder…',
        section: 'File',
        run: () => {
          window.dispatchEvent(new CustomEvent('mc:knowledge-choose-folder'));
        },
      },
      {
        id: 'file.toggle-incognito-unprojected',
        title: incognitoUnprojectedChats
          ? 'Incognito: save unprojected chats to Knowledge Base'
          : 'Incognito: stop saving unprojected chats to Knowledge Base',
        section: 'File',
        run: () => setIncognitoUnprojectedChats(!incognitoUnprojectedChats),
      },
      {
        id: 'file.rebuild-project-knowledge',
        title: (() => {
          const conv = lastConversationId
            ? conversations.find((c) => c.id === lastConversationId)
            : undefined;
          const projectId = conv?.projectId ?? null;
          const project = projectId
            ? useStore.getState().projects.find((p) => p.id === projectId)
            : null;
          return project
            ? `Rebuild project knowledge index — "${project.name}"`
            : 'Rebuild knowledge index — default workspace';
        })(),
        section: 'File',
        run: async () => {
          // Force-rebuilds the project's `processed/` index from
          // every file in `raw/`, bypassing the SHA-256 dedupe that
          // the implicit chat-send rebuild relies on. Surfaces
          // results through the existing `mc:knowledge-sync` toast
          // pipeline so the user gets the same UX as conversation
          // mirror feedback.
          const tag = '[knowledge-rebuild]';
          const conv = lastConversationId
            ? conversations.find((c) => c.id === lastConversationId)
            : undefined;
          const projectId = conv?.projectId ?? null;
          const project = projectId
            ? useStore.getState().projects.find((p) => p.id === projectId)
            : null;
          const label = project
            ? `project "${project.name}"`
            : 'default workspace';
          console.info(`${tag} starting force rebuild for ${label}`);
          // Optimistic toast so the user has feedback while extraction
          // grinds (PDF text extraction can take a few seconds for
          // large documents).
          window.dispatchEvent(
            new CustomEvent('mc:knowledge-sync', {
              detail: {
                written: 0,
                skipped: 0,
                errors: [],
                rebuildStarted: true,
                rebuildLabel: label,
              },
            }),
          );
          try {
            const result = await rebuildProjectKnowledge(project?.name, {
              force: true,
            });
            console.info(`${tag} done`, result);
            const errs = result.errors.length;
            const summary = `Indexed ${result.scanned} file${
              result.scanned === 1 ? '' : 's'
            } (${result.processed} re-extracted, ${result.unchanged} unchanged${
              result.deleted > 0 ? `, ${result.deleted} deleted` : ''
            }${errs > 0 ? `, ${errs} error${errs === 1 ? '' : 's'}` : ''})`;
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: {
                  written: result.processed,
                  skipped: result.unchanged,
                  errors: result.errors.map((e) => ({
                    conversationId: `knowledge:${e.sourcePath}`,
                    reason: e.error,
                  })),
                  rebuildSummary: summary,
                },
              }),
            );
          } catch (err) {
            console.error(`${tag} failed`, err);
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: {
                  error: `Rebuild failed: ${String(err)}`,
                },
              }),
            );
          }
        },
      },
      {
        id: 'file.diagnose-knowledge-base',
        title: 'Diagnose Knowledge Base mirror',
        section: 'File',
        run: async () => {
          // One-shot diagnostic: bypasses the in-memory dedupe, runs a
          // full mirror sync, and dumps the resolved root path + per-
          // conversation outcome to the devtools console under the
          // `[knowledge-mirror-diagnose]` prefix. Surfaces the most
          // common silent-failure cases:
          //   1. `markdownStorageDir` unset → mirror went to appData.
          //   2. ownership-check rejected an existing user-edited file.
          //   3. fs write threw (permission / path outside the vault).
          const tag = '[knowledge-mirror-diagnose]';
          // Synchronous log BEFORE any await so we can tell from devtools
          // whether the command-palette `run` callback even fires. If
          // this never appears, the command isn't being dispatched —
          // typical causes are HMR not having picked up the new code
          // (do a hard reload) or the bundle not having been rebuilt.
          console.info(`${tag} command dispatched`);
          // Also surface a toast immediately so the user gets visible
          // feedback even when the devtools window is closed.
          window.dispatchEvent(
            new CustomEvent('mc:knowledge-sync', {
              detail: {
                written: 0,
                skipped: 0,
                errors: [],
                diagnoseStarted: true,
              },
            }),
          );
          const s = useStore.getState();
          const configuredRoot = s.settings.markdownStorageDir;
          let resolved = '';
          try {
            resolved = await resolveMarkdownRoot(configuredRoot);
          } catch (err) {
            console.error(`${tag} resolveMarkdownRoot threw:`, err);
          }
          console.group(`${tag} starting`);
          console.info(
            `${tag} configuredRoot=${configuredRoot ?? '<unset>'}`,
          );
          console.info(`${tag} resolvedRoot=${resolved}`);
          console.info(
            `${tag} counts: conversations=${s.conversations.length} messages=${s.messages.length} nodes=${s.nodes.length} edges=${s.edges.length} projects=${s.projects.length}`,
          );
          console.info(
            `${tag} flags: incognitoUnprojectedChats=${s.settings.incognitoUnprojectedChats ?? false}`,
          );
          // Bypass the in-memory dedupe so every conversation is re-
          // emitted even if signatures match. We do *not* delete files;
          // the existing ownsFile check still protects user-authored
          // notes that share a path with the mirror.
          resetMirrorState();
          let result;
          try {
            result = await syncConversationMirror({
              conversations: s.conversations,
              messages: s.messages,
              nodes: s.nodes,
              edges: s.edges,
              projects: s.projects,
              markdownStorageDir: configuredRoot,
              incognitoUnprojectedChats: s.settings.incognitoUnprojectedChats,
            });
          } catch (err) {
            console.error(`${tag} syncConversationMirror threw:`, err);
            console.groupEnd();
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: { error: `Diagnose failed: ${String(err)}` },
              }),
            );
            return;
          }
          console.info(
            `${tag} result: rootPath=${result.rootPath} written=${result.written} nodeWritten=${result.nodeWritten} edgesWritten=${result.edgesWritten} skipped=${result.skipped} incognitoSkipped=${result.incognitoSkipped} errors=${result.errors.length}`,
          );
          if (result.errors.length > 0) {
            console.warn(`${tag} per-conversation issues:`);
            for (const e of result.errors) {
              console.warn(
                `${tag} · conversationId=${e.conversationId} reason=${e.reason}`,
              );
            }
          } else {
            console.info(`${tag} no errors reported`);
          }
          console.groupEnd();
          // Surface a structured summary toast so the user knows the
          // command actually ran. Full details are in the console.
          window.dispatchEvent(
            new CustomEvent('mc:knowledge-sync', {
              detail: {
                written: result.written,
                skipped: result.skipped,
                errors: result.errors,
                diagnose: {
                  configuredRoot,
                  resolvedRoot: result.rootPath,
                  conversations: s.conversations.length,
                  nodeWritten: result.nodeWritten,
                  edgesWritten: result.edgesWritten,
                },
              },
            }),
          );
        },
      },
      {
        id: 'file.reset-knowledge-base',
        title: 'Reset Knowledge Base (rebuild from chats)',
        section: 'File',
        run: async () => {
          if (
            !confirmDangerTwice({
              title: 'Reset the entire Knowledge Base?',
              detail:
                'This deletes every Markdown file under `default/` and `projects/` in the working folder, then rebuilds the mirror from the chat history stored in the app library. User-authored files outside those folders are not touched.',
              finalDetail:
                'Second confirmation: permanently delete all mirrored Markdown and rebuild from chats?',
            })
          ) {
            return;
          }
          try {
            const result = await resetAllKnowledgeBase();
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: {
                  written: 0,
                  skipped: 0,
                  errors: [],
                  resetCleared: result.cleared,
                },
              }),
            );
          } catch (err) {
            console.error('[knowledge-mirror] reset failed', err);
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: { error: String(err) },
              }),
            );
          }
        },
      },
      {
        id: 'file.reset-knowledge-base-current',
        title: lastConversationId
          ? (() => {
              const conv = conversations.find((c) => c.id === lastConversationId);
              const project = conv?.projectId
                ? useStore.getState().projects.find((p) => p.id === conv.projectId)
                : null;
              return project
                ? `Reset Knowledge Base — project "${project.name}"`
                : 'Reset Knowledge Base — default workspace';
            })()
          : 'Reset Knowledge Base — default workspace',
        section: 'File',
        run: async () => {
          const conv = lastConversationId
            ? conversations.find((c) => c.id === lastConversationId)
            : undefined;
          const project = conv?.projectId
            ? useStore.getState().projects.find((p) => p.id === conv.projectId) ?? null
            : null;
          const label = project
            ? `project "${project.name}"`
            : 'the default workspace';
          if (
            !confirmDangerTwice({
              title: `Reset Knowledge Base for ${label}?`,
              detail: `This deletes every Markdown file under that scope in the working folder, then rebuilds it from the chat history stored in the app library. Other projects are not touched.`,
              finalDetail:
                'Second confirmation: permanently delete this scope and rebuild from chats?',
            })
          ) {
            return;
          }
          try {
            const result = await resetProjectKnowledgeBase(project);
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: {
                  written: 0,
                  skipped: 0,
                  errors: [],
                  resetCleared: result.cleared,
                },
              }),
            );
          } catch (err) {
            console.error('[knowledge-mirror] project reset failed', err);
            window.dispatchEvent(
              new CustomEvent('mc:knowledge-sync', {
                detail: { error: String(err) },
              }),
            );
          }
        },
      },
      {
        id: 'file.export',
        title: 'Export to Markdown',
        section: 'File',
        shortcut: '⌘⇧E',
        match: 'mod+shift+e',
        when: () => Boolean(obsidianVaultPath),
        run: async () => {
          if (!obsidianVaultPath) return;
          const s = useStore.getState();
          await obsidianExporter.exportAll(obsidianVaultPath, {
            conversations: s.conversations,
            messages: s.messages,
            nodes: s.nodes,
            edges: s.edges,
            attachments: s.attachments,
          });
        },
      },
      {
        id: 'file.reveal-app-data',
        title: 'Reveal app data folder path',
        section: 'File',
        run: async () => {
          const path = await storage.baseDirPath();
          window.alert(path);
        },
      },
      {
        id: 'daily.today',
        title: "Open today's daily note",
        section: 'File',
        shortcut: '⌘D',
        match: 'mod+d',
        run: () => openTodayDailyNote(),
      },
      {
        id: 'capture.quick',
        title: 'Quick capture (Inbox)',
        section: 'File',
        shortcut: '⌘⇧Space',
        match: 'mod+shift+space',
        run: () => setQuickCaptureOpen(true),
      },
      {
        id: 'help.shortcuts',
        title: 'Keyboard shortcuts',
        section: 'Help',
        shortcut: '⌘?',
        match: 'mod+shift+/',
        run: () => setShortcutsOpen(true),
      },
      {
        id: 'help.command-palette',
        title: 'Command palette',
        section: 'Help',
        shortcut: '⌘P',
        match: 'mod+p',
        run: () => setCommandOpen(true),
      },
      {
        id: 'editor.save',
        title: 'Save current note',
        section: 'Editor',
        when: () => Boolean(getCurrentEditor()),
        run: () => {
          window.dispatchEvent(new CustomEvent('mc:editor-save'));
        },
      },
      {
        id: 'editor.close',
        title: 'Close editor / Return to canvas',
        section: 'Editor',
        when: () => Boolean(getCurrentEditor()),
        run: () => {
          window.dispatchEvent(new CustomEvent('mc:editor-close'));
        },
      },
      {
        id: 'editor.open-in-canvas',
        title: 'Open current note in canvas',
        section: 'Editor',
        when: () => Boolean(getCurrentEditor()),
        run: () => {
          const ed = getCurrentEditor();
          if (ed) void ed.openInCanvas();
        },
      },
      {
        id: 'editor.insert-wikilink',
        title: 'Insert wikilink',
        section: 'Editor',
        when: () => Boolean(getCurrentEditor()),
        run: () => {
          const ed = getCurrentEditor();
          if (!ed) return;
          const view = ed.view;
          const sel = view.state.selection.main;
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: '[[' },
            selection: { anchor: sel.from + 2 },
            userEvent: 'input.insert-wikilink',
          });
          view.focus();
        },
      },
      {
        id: 'editor.reimport',
        title: 'Re-import current Markdown to chat thread',
        section: 'Editor',
        when: () => Boolean(getCurrentEditor()),
        run: () => {
          window.dispatchEvent(new CustomEvent('mc:editor-reimport'));
        },
      },
    ];
  }, [
    activeRightTab,
    addNode,
    conversations,
    createConversation,
    canvasTool,
    canvasWheelMode,
    incognitoUnprojectedChats,
    setCanvasWheelMode,
    setIncognitoUnprojectedChats,
    setGraphImportOpen,
    flow,
    lastConversationId,
    obsidianVaultPath,
    openAiPalette,
    removeConversation,
    renameConversation,
    setActiveConversation,
    setCanvasTool,
    setActiveRightTab,
    setCommandOpen,
    setObsidianVault,
    setQuickCaptureOpen,
    setSearchOpen,
    setSettingsOpen,
    setShortcutsOpen,
    setTheme,
    setViewMode,
    theme,
    viewMode,
  ]);
}

export function isComboMatch(e: KeyboardEvent, match: string): boolean {
  const parts = match.toLowerCase().split('+');
  const expected = {
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1],
  };
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (expected.mod !== mod) return false;
  if (expected.shift !== e.shiftKey) return false;
  if (expected.alt !== e.altKey) return false;
  const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
  return key === expected.key;
}
