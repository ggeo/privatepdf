/**
 * Automatic Ollama Service Starter
 * Attempts to start Ollama service automatically based on platform (Windows/Linux)
 */

export class OllamaAutoStart {
  /**
   * Try to automatically start Ollama service
   * Returns true if we initiated the start command
   */
  async tryAutoStart(): Promise<boolean> {
    const platform = this.detectPlatform();

    try {
      switch (platform) {
        case 'windows':
          // On Windows, Ollama usually auto-starts, but we can try to trigger it
          return await this.startWindows();

        case 'linux':
          // On Linux, we need to run ollama serve
          // We can't directly execute shell commands from browser
          // But we can try to use a custom protocol if registered
          return await this.startLinux();

        default:
          return false;
      }
    } catch (error) {
      console.error('Failed to auto-start Ollama:', error);
      return false;
    }
  }

  private detectPlatform(): 'windows' | 'linux' | 'unknown' {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (platform.includes('win') || userAgent.includes('windows')) {
      return 'windows';
    }
    if (platform.includes('linux') || userAgent.includes('linux')) {
      return 'linux';
    }
    return 'unknown';
  }

  private async startWindows(): Promise<boolean> {
    // Windows often auto-starts Ollama on boot
    // Attempting custom protocols can trigger security dialogs
    // For now, disable auto-start to avoid unwanted dialogs
    return false;
  }

  private async startLinux(): Promise<boolean> {
    // On Linux, we can't directly start the service from browser
    // Don't attempt custom protocols as they trigger xdg-open dialogs
    // Linux users must manually start the service with 'ollama serve'
    return false;
  }

  /**
   * Get manual start instructions for when auto-start fails
   */
  getManualInstructions(): { command: string; steps: string[] } {
    const platform = this.detectPlatform();

    switch (platform) {
      case 'windows':
        return {
          command: 'ollama serve',
          steps: [
            'Open Command Prompt (cmd) or PowerShell',
            'Type: ollama serve',
            'Press Enter',
            'Keep the window open'
          ]
        };

      case 'linux':
        return {
          command: 'ollama serve',
          steps: [
            'Open a terminal',
            'Type: ollama serve',
            'Press Enter',
            'Keep the terminal open'
          ]
        };

      default:
        return {
          command: 'Start Ollama service',
          steps: ['Start the Ollama service for your operating system']
        };
    }
  }
}

export const ollamaAutoStart = new OllamaAutoStart();
