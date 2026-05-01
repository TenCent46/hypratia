# 27 — Editor Plugin API (Stub)

## Why

A real plugin / extension API — sandboxed, manifest-driven, capable of
loading remote code — is its own multi-quarter engineering project.
Shipping nothing leaves the rest of the codebase without a clear hook
point for first-party features that will eventually want to live behind
the plugin contract. This spec ships an in-process stub that the rest of
the app can target now, while we defer the sandboxed runtime.

## What ships

`src/services/editor-plugins/index.ts` exposes:

```ts
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
  extensions?: Extension[];        // CodeMirror 6 extensions added on mount
  commands?: EditorPluginCommand[]; // surfaced in the slash palette later
  onload?: (ctx) => void;
  onunload?: (ctx) => void;
};

registerEditorPlugin(plugin) → unregister fn
listEditorPlugins()
pluginExtensions()
pluginCommands()
subscribeEditorPlugins(cb) → unsubscribe
fireEditorPluginsOnload(ctx)
fireEditorPluginsOnunload(ctx)
```

`MarkdownEditorView` calls `pluginExtensions()` when constructing the
state and fires the load / unload hooks at mount / unmount. Phase 1 has
no built-in plugins; the registry is empty unless code calls
`registerEditorPlugin`.

## What does NOT ship

- No dynamic loading of remote / sandboxed code.
- No manifest format, no plugin folder discovery, no install UI.
- No security boundary — the API is in-process. It is for first-party
  trusted code only.
- No version compatibility checks.

These are all flagged as future work in the README of the next major
phase. Calling out the omission is the point: you can build against the
stub knowing it will exist when the real system arrives.

## Acceptance

1. `registerEditorPlugin({ id, name, extensions: [...], commands: [...] })`
   adds the extensions to every subsequently mounted editor view.
2. The unregister function returned by `registerEditorPlugin` removes
   the plugin and is no-op if the plugin was already replaced.
3. `onload` fires when the editor mounts; `onunload` fires on unmount.
4. The registry survives hot-module-reload during development —
   plugins re-register themselves on reload via top-level side effects.
