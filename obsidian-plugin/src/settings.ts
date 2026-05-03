import { App, PluginSettingTab, Setting } from 'obsidian';
import type HypratiaPlugin from './main';

export type HypratiaSettings = {
  /** Vault-relative subfolder Hypratia owns. Default `Hypratia`. */
  hypratiaFolder: string;
  /** Show last-sync time in the status bar. */
  showStatusBar: boolean;
};

export const DEFAULT_SETTINGS: HypratiaSettings = {
  hypratiaFolder: 'Hypratia',
  showStatusBar: true,
};

export class HypratiaSettingTab extends PluginSettingTab {
  plugin: HypratiaPlugin;

  constructor(app: App, plugin: HypratiaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Hypratia companion' });

    new Setting(containerEl)
      .setName('Hypratia folder')
      .setDesc(
        'Vault-relative folder Hypratia writes into. Match the value in Hypratia’s vault settings.',
      )
      .addText((text) =>
        text
          .setPlaceholder('Hypratia')
          .setValue(this.plugin.settings.hypratiaFolder)
          .onChange(async (value) => {
            this.plugin.settings.hypratiaFolder = value.trim() || 'Hypratia';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Show status bar')
      .setDesc('Display the last Hypratia sync time at the bottom of Obsidian.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusBar)
          .onChange(async (value) => {
            this.plugin.settings.showStatusBar = value;
            await this.plugin.saveSettings();
            this.plugin.refreshStatusBar();
          }),
      );

    containerEl.createEl('p', {
      text:
        'Commands: Hypratia: Send selection → writes the active selection to the Hypratia mailbox. Hypratia: Refresh canvas geometry → re-applies the sidecar layout to the active canvas. Hypratia: Open in Hypratia → launches Hypratia at the active canvas.',
      cls: 'setting-item-description',
    });
  }
}
