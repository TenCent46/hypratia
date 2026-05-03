export type AskOptions = {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
};

export type PickFileOptions = {
  /** File-extension filter, e.g. `[{ name: 'Markdown', extensions: ['md'] }]`. */
  filters?: { name: string; extensions: string[] }[];
  /** Initial directory. Optional. */
  defaultPath?: string;
};

export interface Dialog {
  pickFolder(): Promise<string | null>;
  /** Native open-file dialog (single file). Returns absolute path or null. */
  pickFile(options?: PickFileOptions): Promise<string | null>;
  /** Read a UTF-8 text file at an absolute path. Used for "add note from vault". */
  readTextFile(absPath: string): Promise<string>;
  /** Reveal a file or folder in the OS file manager (Finder on macOS). */
  revealInFinder(absPath: string): Promise<void>;
  /** Open a file with the system default app. */
  openWithSystem(absPath: string): Promise<void>;
  /** Native OK/Cancel dialog. Resolves true when the user confirms. */
  ask(message: string, options?: AskOptions): Promise<boolean>;
}
