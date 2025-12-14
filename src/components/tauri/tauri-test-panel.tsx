'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { tauriCommands, type OllamaStatus, type AppSettings } from '@/lib/tauri/commands';
import { isTauriApp } from '@/lib/utils/environment';

export function TauriTestPanel() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isTauriApp()) {
    return (
      <Card className="border-yellow-500">
        <CardHeader>
          <CardTitle>⚠️ Not Running in Tauri</CardTitle>
          <CardDescription>
            This panel only works in the Tauri desktop app. Run with{' '}
            <code className="bg-muted px-2 py-1 rounded">npm run tauri:dev</code>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleCheckOllama = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await tauriCommands.checkOllamaStatus();
      setOllamaStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check Ollama status');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOllama = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tauriCommands.startOllamaService();
      console.log('Ollama start result:', result);
      // Re-check status after starting
      setTimeout(() => handleCheckOllama(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Ollama');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await tauriCommands.loadSettings();
      setSettings(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    setLoading(true);
    setError(null);
    try {
      await tauriCommands.saveSettings(settings);
      alert('Settings saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const defaults = await tauriCommands.resetSettings();
      setSettings(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>✅ Tauri Desktop App</CardTitle>
          <CardDescription>You are running in Tauri! Test Rust commands below.</CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ollama Status</CardTitle>
          <CardDescription>Check if Ollama is running and start it if needed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleCheckOllama} disabled={loading}>
              Check Ollama Status
            </Button>
            <Button onClick={handleStartOllama} disabled={loading} variant="secondary">
              Start Ollama
            </Button>
          </div>

          {ollamaStatus && (
            <div className="bg-muted p-4 rounded-lg">
              <pre className="text-sm">{JSON.stringify(ollamaStatus, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings Management</CardTitle>
          <CardDescription>Load, save, and reset app settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleLoadSettings} disabled={loading}>
              Load Settings
            </Button>
            <Button onClick={handleSaveSettings} disabled={loading || !settings} variant="secondary">
              Save Settings
            </Button>
            <Button onClick={handleResetSettings} disabled={loading} variant="destructive">
              Reset to Defaults
            </Button>
          </div>

          {settings && (
            <div className="bg-muted p-4 rounded-lg">
              <pre className="text-sm">{JSON.stringify(settings, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
