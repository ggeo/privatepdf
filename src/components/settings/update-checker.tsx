'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

interface UpdateStatus {
  checking: boolean;
  available: boolean;
  version?: string;
  currentVersion: string;
  downloading: boolean;
  error?: string;
}

export function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    currentVersion: 'Loading...',
    downloading: false,
  });

  // Load current version on mount
  useEffect(() => {
    getVersion().then(version => {
      setStatus(prev => ({ ...prev, currentVersion: version }));
    }).catch(error => {
      console.error('Failed to get version:', error);
      setStatus(prev => ({ ...prev, currentVersion: '1.0.0' }));
    });
  }, []);

  const checkForUpdates = async () => {
    try {
      setStatus(prev => ({ ...prev, checking: true, error: undefined }));

      const update = await check();

      if (update?.available) {
        setStatus(prev => ({
          ...prev,
          checking: false,
          available: true,
          version: update.version,
        }));
      } else {
        setStatus(prev => ({
          ...prev,
          checking: false,
          available: false,
        }));
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setStatus(prev => ({
        ...prev,
        checking: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      }));
    }
  };

  const downloadAndInstall = async () => {
    try {
      setStatus(prev => ({ ...prev, downloading: true, error: undefined }));

      const update = await check();

      if (update?.available) {
        // Download and install the update
        await update.downloadAndInstall();

        // Relaunch the app to apply the update
        await relaunch();
      }
    } catch (error) {
      console.error('Failed to install update:', error);
      setStatus(prev => ({
        ...prev,
        downloading: false,
        error: error instanceof Error ? error.message : 'Failed to install update',
      }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Version */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="font-medium text-foreground">Current Version</h3>
          <p className="text-sm text-muted-foreground">v{status.currentVersion}</p>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={status.checking || status.downloading}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${status.checking ? 'animate-spin' : ''}`} />
          {status.checking ? 'Checking...' : 'Check for Updates'}
        </button>
      </div>

      {/* Update Available */}
      {status.available && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
          <div className="flex items-start gap-3">
            <Download className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <h3 className="font-medium text-green-500">Update Available</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {status.version} is ready to install
              </p>
              <button
                onClick={downloadAndInstall}
                disabled={status.downloading}
                className="mt-3 flex items-center gap-2 rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
              >
                {status.downloading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Install Update
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Up to Date */}
      {!status.available && !status.checking && !status.error && status.currentVersion && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <h3 className="font-medium text-green-500">You're up to date</h3>
              <p className="text-sm text-muted-foreground">
                You have the latest version installed
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {status.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <h3 className="font-medium text-destructive">Update Check Failed</h3>
              <p className="mt-1 text-sm text-muted-foreground">{status.error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Make sure you're connected to the internet and try again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <h3 className="font-medium text-foreground">About Updates</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>• Click "Check for Updates" to see if a new version is available</li>
          <li>• Updates are free for all users</li>
          <li>• Your data is preserved during updates</li>
          <li>• Updates require an internet connection to download</li>
        </ul>
      </div>
    </div>
  );
}
