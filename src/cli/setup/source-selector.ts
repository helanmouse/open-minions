/**
 * Source selection TUI component
 * Handles provider source selection with custom URL input support
 */

import { TUI, SelectList, Container, TextComponent, InputText, ProcessTerminal } from '@mariozechner/pi-tui';
import type { SelectItem } from '@mariozechner/pi-tui';
import type { ProviderSources, Source } from './sources.js';
import { validateCustomUrl, type ValidationResult } from './url-validator.js';
import type { SourceSelectionResult } from './types.js';

export class SourceSelector {
  private terminal: ProcessTerminal;
  private ui: TUI;
  private container: Container;

  constructor() {
    this.terminal = new ProcessTerminal();
    this.ui = new TUI(this.terminal);
    this.container = new Container();
  }

  /**
   * Run source selection for a provider
   * Returns selected source ID and base URL
   */
  async selectSource(providerSources: ProviderSources): Promise<SourceSelectionResult> {
    const sources = providerSources.sources;
    const items: SelectItem[] = sources.map(source => ({
      value: source.id,
      label: source.name,
      description: source.isCustom ? '(Enter your own URL)' : source.url,
    }));

    return new Promise((resolve, reject) => {
      // Add title
      this.container.addChild(new TextComponent(
        `${providerSources.displayName} - Select Source`,
        { bottom: 1, top: 0 }
      ));

      // Create select list
      const maxVisible = Math.min(items.length, 10);
      const selectList = new SelectList(items, maxVisible);

      selectList.onSelect = async (item: SelectItem) => {
        const selectedSource = sources.find(s => s.id === item.value);
        if (!selectedSource) {
          this.cleanup();
          reject(new Error(`Source ${item.value} not found`));
          return;
        }

        // Handle custom source
        if (selectedSource.isCustom) {
          try {
            const customUrl = await this.promptCustomUrl();
            this.cleanup();
            resolve({
              sourceId: selectedSource.id,
              baseUrl: customUrl
            });
          } catch (error) {
            // User cancelled - return to source selection
            return;
          }
        } else {
          // Official source
          this.cleanup();
          resolve({
            sourceId: selectedSource.id,
            baseUrl: selectedSource.url
          });
        }
      };

      selectList.onCancel = () => {
        this.cleanup();
        reject(new Error('Source selection cancelled'));
      };

      this.container.addChild(selectList);
      this.ui.addChild(this.container);
      this.ui.setFocus(selectList);

      console.error('Starting source selection...');
      this.ui.start();
    });
  }

  /**
   * Prompt user for custom API URL
   */
  private async promptCustomUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Clear container
      this.container.clear();

      // Add prompt text
      this.container.addChild(new TextComponent(
        'Enter Custom API URL',
        { bottom: 1, top: 0 }
      ));
      this.container.addChild(new TextComponent(
        'Press Enter to confirm, Esc to cancel',
        { bottom: 0, top: 1 }
      ));

      // Create input field
      const input = new InputText(60);
      input.setPlaceholder('https://');

      input.onSubmit = () => {
        const url = input.getValue();
        const validation = validateCustomUrl(url);

        if (!validation.valid) {
          // Show error and keep input
          console.error(`\nError: ${validation.error}`);
          console.error('Press Esc to cancel or enter a valid URL');
          return;
        }

        resolve(url);
      };

      input.onCancel = () => {
        reject(new Error('Custom URL input cancelled'));
      };

      this.container.addChild(input);
      this.ui.setFocus(input);
    });
  }

  private cleanup(): void {
    this.ui.stop();
  }
}
