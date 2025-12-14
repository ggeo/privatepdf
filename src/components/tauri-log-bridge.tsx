'use client';

import { useEffect, useRef } from 'react';

/**
 * Bridges the browser console to the Tauri log plugin so we can persist
 * frontend logs to the app log directory without opening devtools.
 */
export function TauriLogBridge() {
  const attachedRef = useRef(false);

  useEffect(() => {
    let restoreConsole: (() => void) | null = null;

    async function setup() {
      if (attachedRef.current || typeof window === 'undefined') {
        return;
      }

      if (!(window as any).__TAURI__) {
        return;
      }

      try {
        const { info, warn, error, debug } = await import('@tauri-apps/plugin-log');

        const originalConsole = {
          log: console.log,
          info: console.info,
          warn: console.warn,
          error: console.error,
          debug: console.debug,
        };

        const formatArgs = (args: unknown[]): string =>
          args
            .map((arg) => {
              if (typeof arg === 'string') return arg;
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            })
            .join(' ');

        console.log = (...args: unknown[]) => {
          originalConsole.log(...args);
          void info(formatArgs(args));
        };

        console.info = (...args: unknown[]) => {
          originalConsole.info(...args);
          void info(formatArgs(args));
        };

        console.warn = (...args: unknown[]) => {
          originalConsole.warn(...args);
          void warn(formatArgs(args));
        };

        console.error = (...args: unknown[]) => {
          originalConsole.error(...args);
          void error(formatArgs(args));
        };

        console.debug = (...args: unknown[]) => {
          originalConsole.debug(...args);
          void debug(formatArgs(args));
        };

        restoreConsole = () => {
          console.log = originalConsole.log;
          console.info = originalConsole.info;
          console.warn = originalConsole.warn;
          console.error = originalConsole.error;
          console.debug = originalConsole.debug;
        };

        attachedRef.current = true;
        originalConsole.debug('[TauriLogBridge] Console hooked into tauri-plugin-log');
      } catch (hookError) {
        console.warn('Failed to initialise tauri-plugin-log bridge', hookError);
      }
    }

    void setup();

    return () => {
      restoreConsole?.();
      attachedRef.current = false;
    };
  }, []);

  return null;
}
