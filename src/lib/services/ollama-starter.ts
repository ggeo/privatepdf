/**
 * Ollama Service Starter
 * Provides platform-specific commands to start Ollama service (Windows/Linux)
 */

export interface StartCommand {
  platform: 'windows' | 'linux';
  command: string;
  instructions: string[];
  requiresTerminal: boolean;
}

class OllamaStarter {
  /**
   * Detect the user's operating system (Windows or Linux only)
   */
  detectPlatform(): 'windows' | 'linux' | 'unknown' {
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

  /**
   * Get the command to start Ollama service
   */
  getStartCommand(platform?: string): StartCommand {
    const detectedPlatform = platform || this.detectPlatform();

    switch (detectedPlatform) {
      case 'windows':
        return {
          platform: 'windows',
          command: 'ollama serve',
          instructions: [
            '🚀 Ollama should start automatically on Windows',
            '💻 If not running, open Command Prompt or PowerShell',
            '📝 Type: ollama serve',
            '✅ Look for Ollama icon in system tray (bottom-right)',
            '⚠️ Keep the terminal window open',
          ],
          requiresTerminal: true,
        };

      case 'linux':
        return {
          platform: 'linux',
          command: 'ollama serve',
          instructions: [
            '💻 Open a terminal window',
            '📝 Type: ollama serve',
            '⚠️ Keep the terminal window open',
            '✅ Ollama will start listening on port 11434',
            '💡 Consider running as a systemd service for auto-start',
          ],
          requiresTerminal: true,
        };

      default:
        return {
          platform: 'linux',
          command: 'ollama serve',
          instructions: [
            '💻 Open a terminal or command prompt',
            '📝 Run the Ollama service command for your OS',
            '⚠️ Keep the terminal window open',
          ],
          requiresTerminal: true,
        };
    }
  }

  /**
   * Try to start Ollama automatically
   * Note: Browser cannot directly start system services
   */
  async tryAutoStart(): Promise<boolean> {
    // For both Windows and Linux, we can't automatically start the service from the browser
    return false;
  }

  /**
   * Get systemd service setup instructions for Linux
   */
  getSystemdInstructions(): string[] {
    return [
      '# Create systemd service (run as root):',
      'sudo tee /etc/systemd/system/ollama.service <<EOF',
      '[Unit]',
      'Description=Ollama Service',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'User=$USER',
      'ExecStart=/usr/local/bin/ollama serve',
      'Restart=on-failure',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      '',
      '# Enable and start the service:',
      'sudo systemctl daemon-reload',
      'sudo systemctl enable ollama',
      'sudo systemctl start ollama',
    ];
  }

  /**
   * Check if Ollama is responding
   */
  async isRunning(): Promise<boolean> {
    try {
      // Use Tauri HTTP client
      const { checkOllamaStatus } = await import('@/lib/tauri/ollama-client');
      const status = await checkOllamaStatus();
      return !!status.models; // If models array exists, Ollama is running
    } catch {
      return false;
    }
  }

  /**
   * Wait for Ollama to start (with timeout)
   */
  async waitForStart(timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isRunning()) {
        return true;
      }
      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return false;
  }
}

// Export singleton instance
export const ollamaStarter = new OllamaStarter();
