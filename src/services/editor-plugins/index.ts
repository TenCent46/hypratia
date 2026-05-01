import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Stub plugin API for the Knowledge Base Markdown editor.
 *
 * Phase 1 of the plugin API does not load remote / sandboxed code. It
 * exposes an in-process registry that other parts of this codebase (and
 * eventually trusted first-party plugins shipped alongside the app) can
 * call to extend the editor. The shape mirrors a subset of Obsidian's
 * plugin contract: install / uninstall hooks, an `onload` per editor
 * instance, and a way to contribute CodeMirror extensions or commands.
 *
 * No dynamic loading of arbitrary user code is performed. A real
 * sandboxed plugin runtime is its own project and is deliberately out
 * of scope here.
 */

export type EditorPluginCommand = {
  id: string;
  title: string;
  run: (view: EditorView) => void | Promise<void>;
};

export type EditorPluginContext = {
  view: EditorView;
  filePath: string;
  rootPath: string;
};

export type EditorPlugin = {
  id: string;
  name: string;
  description?: string;
  /** Extensions that are added to every new editor instance. */
  extensions?: Extension[];
  /** Commands added to the slash command palette. */
  commands?: EditorPluginCommand[];
  /** Lifecycle hook fired when the editor mounts. */
  onload?: (ctx: EditorPluginContext) => void;
  /** Lifecycle hook fired when the editor unmounts. */
  onunload?: (ctx: EditorPluginContext) => void;
};

const plugins = new Map<string, EditorPlugin>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function registerEditorPlugin(plugin: EditorPlugin): () => void {
  if (plugins.has(plugin.id)) {
    console.warn(`Editor plugin "${plugin.id}" already registered; replacing.`);
  }
  plugins.set(plugin.id, plugin);
  emit();
  return () => {
    if (plugins.get(plugin.id) === plugin) {
      plugins.delete(plugin.id);
      emit();
    }
  };
}

export function listEditorPlugins(): EditorPlugin[] {
  return Array.from(plugins.values());
}

export function pluginExtensions(): Extension[] {
  const out: Extension[] = [];
  for (const p of plugins.values()) {
    if (p.extensions) out.push(...p.extensions);
  }
  return out;
}

export function pluginCommands(): EditorPluginCommand[] {
  const out: EditorPluginCommand[] = [];
  for (const p of plugins.values()) {
    if (p.commands) out.push(...p.commands);
  }
  return out;
}

export function subscribeEditorPlugins(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function fireEditorPluginsOnload(ctx: EditorPluginContext): void {
  for (const p of plugins.values()) {
    try {
      p.onload?.(ctx);
    } catch (err) {
      console.warn(`plugin ${p.id} onload threw`, err);
    }
  }
}

export function fireEditorPluginsOnunload(ctx: EditorPluginContext): void {
  for (const p of plugins.values()) {
    try {
      p.onunload?.(ctx);
    } catch (err) {
      console.warn(`plugin ${p.id} onunload threw`, err);
    }
  }
}
