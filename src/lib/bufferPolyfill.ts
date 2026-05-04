/**
 * Minimal `Buffer` shim for the WKWebView (Tauri 2 / macOS) runtime.
 *
 * Why this exists: `gray-matter` 4.x's parse pipeline routes every
 * input through `lib/to-file.js`, which calls
 * `Buffer.from(file.content)` to stash a debug copy on `file.orig`.
 * Node ships `Buffer` as a global; browsers do not, and Tauri's
 * webview is a browser. Without this shim, every `matter(text)` call
 * — which means every Force Re-sync sidecar write, every Refresh
 * from Vault scan, every wikilink identity lookup — throws
 * `ReferenceError: Can't find variable: Buffer` and silently breaks
 * the pipeline.
 *
 * The shim covers only what gray-matter actually invokes:
 *
 *   - `Buffer.from(string)` — returns an opaque object that round-
 *     trips back to the original string via `String(value)`. The
 *     result is only stored on `file.orig` as a non-enumerable debug
 *     stash; gray-matter's `toString(file.content)` operates on the
 *     original string input, not on the buffer.
 *
 * This is NOT a full Buffer polyfill and should not be used as one.
 * If a future caller needs real binary semantics, install the
 * `buffer` package and replace this file.
 *
 * Import this module **first** at every JS entry point (main.tsx,
 * demo/main.tsx, landing/main.tsx) so the global lands before any
 * gray-matter import resolves.
 */

type BufferGlobal = {
  Buffer?: { from(input: unknown): unknown };
};

const target = globalThis as unknown as BufferGlobal;

if (typeof target.Buffer === 'undefined') {
  target.Buffer = {
    from(input: unknown) {
      // gray-matter only calls `Buffer.from(string)`; treat anything
      // else as already-wrapped and pass it through. The returned
      // object answers `String(value)` with the original text so any
      // downstream code that does `String(buf)` keeps working.
      const text = typeof input === 'string' ? input : String(input);
      return Object.freeze({
        toString() {
          return text;
        },
        get length() {
          return text.length;
        },
      });
    },
  };
}

export {};
