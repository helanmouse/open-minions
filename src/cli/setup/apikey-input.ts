// src/cli/setup/apikey-input.ts
import { Container, TextEditor, type TextEditorConfig } from '@mariozechner/pi-tui';

export class ApiKeyInput extends Container {
  private editor: TextEditor;
  private mockValue?: string;
  private resolve?: (value: string) => void;
  private reject?: (error: Error) => void;
  private provider: string;

  constructor(provider: string) {
    super();
    this.provider = provider;

    const config: TextEditorConfig = {};
    this.editor = new TextEditor(config);
    this.editor.onSubmit = (text: string) => this.handleSubmit(text);
    this.editor.onChange = (text: string) => this.handleChange(text);

    this.addChild(this.editor);
  }

  /**
   * Set a mock value for testing purposes
   * When set, getInput() will return this value instead of waiting for user input
   */
  setMockValue(value: string): void {
    this.mockValue = value;
  }

  /**
   * Get the provider associated with this input
   */
  getProvider(): string {
    return this.provider;
  }

  /**
   * Get the API key input from user
   * Returns a Promise that resolves with the API key when submitted
   * @throws Error if API key is empty
   */
  async getInput(): Promise<string> {
    if (this.mockValue !== undefined) {
      const trimmed = this.mockValue.trim();
      if (!trimmed) {
        throw new Error('API key cannot be empty');
      }
      return trimmed;
    }

    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  private handleSubmit(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      if (this.reject) {
        this.reject(new Error('API key cannot be empty'));
      }
      return;
    }

    if (this.resolve) {
      this.resolve(trimmed);
    }
  }

  private handleChange(_text: string): void {
    // Handle text changes if needed for validation feedback
  }

  /**
   * Handle keyboard input
   * Delegates to the internal TextEditor component
   */
  handleInput(keyData: string): void {
    this.editor.handleInput(keyData);
  }

  /**
   * Get the current value from the editor
   */
  getValue(): string {
    return this.editor.getText();
  }
}
