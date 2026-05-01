export interface Dialog {
  pickFolder(): Promise<string | null>;
  /** Reveal a file or folder in the OS file manager (Finder on macOS). */
  revealInFinder(absPath: string): Promise<void>;
  /** Open a file with the system default app. */
  openWithSystem(absPath: string): Promise<void>;
}
