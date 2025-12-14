/**
 * Ollama Installer Service
 * Handles detection and installation of Ollama for Windows and Linux
 */

export interface InstallationStatus {
  isInstalled: boolean;
  platform: 'windows' | 'linux' | 'unknown';
  installerUrl: string;
  instructions: string[];
}

class OllamaInstaller {
  /**
   * Detect the user's operating system (Windows or Linux only)
   */
  detectPlatform(): InstallationStatus['platform'] {
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
   * Get the appropriate installer URL for the platform
   */
  getInstallerUrl(platform: InstallationStatus['platform']): string {
    switch (platform) {
      case 'windows':
        return 'https://ollama.com/download/OllamaSetup.exe';
      case 'linux':
        // Linux users typically use curl command
        return 'https://ollama.com/install.sh';
      default:
        return 'https://ollama.com/download';
    }
  }

  /**
   * Get installation instructions for the platform
   */
  getInstructions(platform: InstallationStatus['platform']): string[] {
    switch (platform) {
      case 'windows':
        return [
          '📥 Click the download button below to get the installer',
          '💾 Run OllamaSetup.exe and follow the installation wizard',
          '🚀 Ollama will start automatically after installation',
          '✅ You\'ll see an Ollama icon in your system tray (bottom-right)',
          '🔄 Return to this page and refresh - AI models will download automatically',
        ];
      case 'linux':
        return [
          '💻 Open your terminal',
          '📥 Run the following command to install:',
          'curl -fsSL https://ollama.com/install.sh | sh',
          '🚀 After installation, start Ollama service:',
          'ollama serve',
          '⚠️ Keep the terminal open with Ollama running',
          '🔄 Return to this page and refresh - AI models will download automatically',
        ];
      default:
        return [
          '🌐 Visit https://ollama.com/download',
          '📥 Download Ollama for your system',
          '🚀 After installation, make sure to start the Ollama service',
          '🔄 Return to this page once Ollama is running',
        ];
    }
  }

  /**
   * Check if Ollama is installed and running
   */
  async checkInstallation(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        // Short timeout to quickly detect if not running
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get full installation status
   */
  async getInstallationStatus(): Promise<InstallationStatus> {
    const isInstalled = await this.checkInstallation();
    const platform = this.detectPlatform();
    const installerUrl = this.getInstallerUrl(platform);
    const instructions = this.getInstructions(platform);

    return {
      isInstalled,
      platform,
      installerUrl,
      instructions,
    };
  }

  /**
   * Open installer download in new tab
   */
  downloadInstaller(platform?: InstallationStatus['platform']): void {
    const detectedPlatform = platform || this.detectPlatform();
    const url = this.getInstallerUrl(detectedPlatform);
    window.open(url, '_blank');
  }

  /**
   * Get Linux install command for copying
   */
  getLinuxCommand(): string {
    return 'curl -fsSL https://ollama.com/install.sh | sh';
  }

  /**
   * Get estimated installation time
   */
  getEstimatedTime(platform: InstallationStatus['platform']): string {
    switch (platform) {
      case 'windows':
        return '2-3 minutes';
      case 'linux':
        return '1-2 minutes';
      default:
        return '2-3 minutes';
    }
  }

  /**
   * Detect if user has AMD GPU (for Windows ZIP selection)
   * Uses WebGL to detect GPU renderer
   */
  async detectAMDGpu(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;

    try {
      // WebGL-based GPU detection
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;

      if (!gl) return false;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return false;

      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;

      // Check for AMD/ATI in renderer string
      const isAMD = renderer.toLowerCase().includes('amd') ||
             renderer.toLowerCase().includes('ati') ||
             renderer.toLowerCase().includes('radeon');

      console.log('GPU detected:', renderer, 'AMD:', isAMD);

      return isAMD;
    } catch (error) {
      console.warn('GPU detection failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const ollamaInstaller = new OllamaInstaller();
