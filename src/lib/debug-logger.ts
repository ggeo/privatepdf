/**
 * Simple debug logger that writes to /tmp/privatepdf-debug.log
 * View with: tail -f /tmp/privatepdf-debug.log
 */

const MAX_LOGS = 100;
const LOG_KEY = 'debug_logs';

export function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;

  console.log(logLine);

  // Write to file using fetch (works in Tauri)
  if (typeof window !== 'undefined') {
    try {
      // Use Tauri's writeTextFile
      import('@tauri-apps/plugin-fs').then(({ writeTextFile, BaseDirectory }) => {
        writeTextFile('privatepdf-debug.log', logLine + '\n', {
          baseDir: BaseDirectory.Temp,
          append: true
        }).catch((e) => console.error('Failed to write log file:', e));
      });
    } catch (e) {
      // Ignore
    }
  }

  // Also write to localStorage (only in browser)
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      logs.push({
        time: timestamp,
        message,
      });

      // Keep only last MAX_LOGS entries
      if (logs.length > MAX_LOGS) {
        logs.shift();
      }

      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      // Ignore storage errors
    }
  }
}

export function getDebugLogs(): Array<{ time: string; message: string }> {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  return [];
}

export function clearDebugLogs() {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(LOG_KEY);
  }
}
