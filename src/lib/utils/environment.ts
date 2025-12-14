/**
 * Environment Detection Utilities
 *
 * Detects whether the app is running in Tauri (desktop) or web browser.
 * Used to conditionally load Tauri-specific features.
 */

/**
 * Check if the app is running in Tauri desktop environment
 */
export function isTauriApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Tauri adds __TAURI__ to the window object
  return '__TAURI__' in window;
}

/**
 * Check if the app is running in a web browser
 */
export function isWebApp(): boolean {
  return !isTauriApp();
}

/**
 * Get the current environment name
 */
export function getEnvironment(): 'tauri' | 'web' {
  return isTauriApp() ? 'tauri' : 'web';
}

/**
 * Execute function only if running in Tauri
 */
export async function whenTauri<T>(fn: () => T | Promise<T>): Promise<T | null> {
  if (isTauriApp()) {
    return await fn();
  }
  return null;
}

/**
 * Execute function only if running in web browser
 */
export async function whenWeb<T>(fn: () => T | Promise<T>): Promise<T | null> {
  if (isWebApp()) {
    return await fn();
  }
  return null;
}
