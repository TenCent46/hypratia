import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  Platform,
} from 'obsidian';
import { DEFAULT_SETTINGS, HypratiaSettings, HypratiaSettingTab } from './settings';
import type {
  GeometrySidecar,
  IndexFile,
  JsonCanvas,
  MailboxPayload,
} from './types';

/**
 * Plan v1.2 / 53 — Obsidian companion for Hypratia.
 *
 * Communicates with Hypratia exclusively through the vault filesystem so it
 * works whether or not Hypratia is running. Three commands:
 *
 *  - **Refresh canvas geometry from sidecar** — re-applies positions from
 *    `Hypratia/canvases/{name}.hypratia.json` to the active `.canvas`.
 *    Lets users rewind a canvas to Hypratia's last-known layout after
 *    moving things around in Obsidian.
 *  - **Send selection to Hypratia** — writes the active selection (or whole
 *    file when nothing is selected) to `Hypratia/.mailbox/incoming/{nano}.json`.
 *    Hypratia's MailboxWatcher picks it up and feeds it through the Capture
 *    Preview pipeline.
 *  - **Open in Hypratia** — launches the `hypratia://` URI for the active
 *    Hypratia-owned note (resolved by `hypratia_id` frontmatter).
 *
 * No localhost RPC, no plugin-to-app socket. Plain files only.
 */
export default class HypratiaPlugin extends Plugin {
  settings: HypratiaSettings = DEFAULT_SETTINGS;
  private statusBarEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'hypratia-refresh-canvas-geometry',
      name: 'Refresh canvas geometry from Hypratia sidecar',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.endsWith('.canvas')) return false;
        if (checking) return true;
        void this.refreshCanvasGeometry(file);
        return true;
      },
    });

    this.addCommand({
      id: 'hypratia-send-selection',
      name: 'Send selection to Hypratia',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        void this.sendSelectionToMailbox(editor, view);
      },
    });

    this.addCommand({
      id: 'hypratia-send-active-file',
      name: 'Send active file to Hypratia',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (checking) return true;
        void this.sendActiveFileToMailbox(file);
        return true;
      },
    });

    this.addCommand({
      id: 'hypratia-open-in-hypratia',
      name: 'Open active note in Hypratia',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (checking) return true;
        void this.openInHypratia(file);
        return true;
      },
    });

    this.addSettingTab(new HypratiaSettingTab(this.app, this));

    if (this.settings.showStatusBar) {
      this.statusBarEl = this.addStatusBarItem();
      this.refreshStatusBar();
      // Re-read the manifest periodically so the status freshens after a
      // Hypratia sync. Cheap; a one-shot file read every 30 s.
      this.registerInterval(
        window.setInterval(() => this.refreshStatusBar(), 30_000),
      );
    }
  }

  onunload() {
    this.statusBarEl = null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshStatusBar() {
    if (!this.statusBarEl) {
      if (this.settings.showStatusBar) {
        this.statusBarEl = this.addStatusBarItem();
      } else {
        return;
      }
    }
    void (async () => {
      const idx = await this.readIndex();
      if (!this.statusBarEl) return;
      if (!idx) {
        this.statusBarEl.setText('Hypratia: not synced');
        return;
      }
      const ago = friendlyAgo(idx.syncedAt);
      this.statusBarEl.setText(`Hypratia: synced ${ago}`);
    })();
  }

  // ------- index / sidecar reads -------

  private indexPath(): string {
    return `${this.settings.hypratiaFolder}/_index.json`;
  }

  private async readIndex(): Promise<IndexFile | null> {
    try {
      const raw = await this.app.vault.adapter.read(this.indexPath());
      return JSON.parse(raw) as IndexFile;
    } catch {
      return null;
    }
  }

  private sidecarPathFor(canvasPath: string): string {
    return canvasPath.replace(/\.canvas$/i, '.hypratia.json');
  }

  // ------- commands -------

  /**
   * Re-apply positions from the geometry sidecar (if present) to the active
   * `.canvas`. Body / labels are not touched.
   */
  async refreshCanvasGeometry(canvasFile: TFile) {
    let canvasJson: JsonCanvas;
    try {
      canvasJson = JSON.parse(await this.app.vault.read(canvasFile)) as JsonCanvas;
    } catch (err) {
      new Notice('Hypratia: could not parse the active canvas');
      console.error(err);
      return;
    }
    const sidecarPath = this.sidecarPathFor(canvasFile.path);
    let sidecar: GeometrySidecar;
    try {
      const raw = await this.app.vault.adapter.read(sidecarPath);
      sidecar = JSON.parse(raw) as GeometrySidecar;
    } catch {
      new Notice('Hypratia: no geometry sidecar found for this canvas');
      return;
    }
    let touched = 0;
    for (const node of canvasJson.nodes) {
      const p = sidecar.positions?.[node.id];
      if (!p) continue;
      node.x = p.x;
      node.y = p.y;
      node.width = p.width;
      node.height = p.height;
      touched += 1;
    }
    if (touched === 0) {
      new Notice('Hypratia: sidecar contained no matching nodes');
      return;
    }
    await this.app.vault.modify(canvasFile, JSON.stringify(canvasJson, null, 2));
    new Notice(`Hypratia: refreshed ${touched} node position${touched === 1 ? '' : 's'}`);
  }

  async sendSelectionToMailbox(editor: Editor, view: MarkdownView) {
    const selection = editor.getSelection();
    if (!selection.trim()) {
      // Fall through to active-file path so the command is forgiving.
      const file = view.file;
      if (file) await this.sendActiveFileToMailbox(file);
      else new Notice('Hypratia: nothing selected and no active file');
      return;
    }
    const sourceFile = view.file?.path ?? '(unknown)';
    const payload: MailboxPayload = {
      kind: 'send-selection',
      sentAt: new Date().toISOString(),
      sourceFile,
      text: selection,
      title: deriveTitle(selection),
    };
    await this.writeMailbox(payload);
  }

  async sendActiveFileToMailbox(file: TFile) {
    const content = await this.app.vault.read(file);
    const payload: MailboxPayload = {
      kind: 'send-file',
      sentAt: new Date().toISOString(),
      sourceFile: file.path,
      title: file.basename,
      content,
    };
    await this.writeMailbox(payload);
  }

  private async writeMailbox(payload: MailboxPayload) {
    const dir = `${this.settings.hypratiaFolder}/.mailbox/incoming`;
    try {
      await this.ensureFolder(dir);
      const fname = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}.json`;
      const path = `${dir}/${fname}`;
      await this.app.vault.adapter.write(path, JSON.stringify(payload, null, 2));
      new Notice('Hypratia: sent to mailbox');
    } catch (err) {
      console.error('[hypratia] mailbox write failed', err);
      new Notice('Hypratia: mailbox write failed (see console)');
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const exists = await this.app.vault.adapter.exists(path);
    if (!exists) {
      await this.app.vault.adapter.mkdir(path);
    }
  }

  /**
   * Open the active file in Hypratia via the `hypratia://` URL scheme.
   * Hypratia registers the scheme on install; if it's not registered the
   * platform shows its usual "no app to handle URL" dialog. We resolve the
   * id from `hypratia_id` frontmatter so the URL targets the right entity.
   */
  async openInHypratia(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fmId = (cache?.frontmatter?.['hypratia_id'] as string | undefined) ?? '';
    const url = fmId
      ? `hypratia://open?id=${encodeURIComponent(fmId)}`
      : `hypratia://open?path=${encodeURIComponent(file.path)}`;
    if (Platform.isDesktopApp) {
      try {
        // electron is bundled with Obsidian; we route through window.open
        // so we don't need an electron import at build time.
        window.open(url, '_blank');
        new Notice('Hypratia: opening…');
      } catch (err) {
        console.error('[hypratia] openInHypratia failed', err);
        new Notice('Hypratia: could not launch (is Hypratia installed?)');
      }
    } else {
      new Notice('Hypratia: desktop only');
    }
  }
}

function deriveTitle(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  return firstLine.replace(/^#+\s+/, '').slice(0, 80) || 'Selection';
}

function friendlyAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'recently';
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
