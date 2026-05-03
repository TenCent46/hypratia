import { ask, open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import type { AskOptions, Dialog, PickFileOptions } from './Dialog';

export class TauriDialog implements Dialog {
  async pickFolder(): Promise<string | null> {
    const result = await open({ directory: true, multiple: false });
    return typeof result === 'string' ? result : null;
  }

  async pickFile(options: PickFileOptions = {}): Promise<string | null> {
    const result = await open({
      directory: false,
      multiple: false,
      filters: options.filters,
      defaultPath: options.defaultPath,
    });
    return typeof result === 'string' ? result : null;
  }

  async readTextFile(absPath: string): Promise<string> {
    return readTextFile(absPath);
  }

  async revealInFinder(absPath: string): Promise<void> {
    await revealItemInDir(absPath);
  }

  async openWithSystem(absPath: string): Promise<void> {
    await openPath(absPath);
  }

  async ask(message: string, options: AskOptions = {}): Promise<boolean> {
    return await ask(message, {
      title: options.title,
      kind: options.kind,
      okLabel: options.okLabel,
      cancelLabel: options.cancelLabel,
    });
  }
}
