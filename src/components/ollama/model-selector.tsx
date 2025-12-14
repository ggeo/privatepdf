'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Zap, Gauge, Sparkles, Download } from 'lucide-react';
import { CHAT_MODELS } from '@/lib/services/ollama-service';
import { ollamaService } from '@/lib/services/ollama-service';
import { useSettingsStore, type ModelTier } from '@/stores/settings-store';
import { useOllamaStore } from '@/stores/ollama-store';

export function ModelSelector() {
  const { selectedTier, setSelectedTier } = useSettingsStore();
  const { downloadModels, refreshAvailableModels } = useOllamaStore();

  const [isOpen, setIsOpen] = useState(false);
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [progressUnlisten, setProgressUnlisten] = useState<(() => void) | null>(null);

  // Map tier to actual model name
  const currentModelName = CHAT_MODELS[selectedTier].name;

  useEffect(() => {
    // Check which models are available from Ollama
    const fetchOllamaModels = async () => {
      const status = await ollamaService.checkStatus();
      if (status.isRunning) {
        setAvailableOllamaModels(status.models);
      }
    };
    fetchOllamaModels();

    // Refresh available models in the store
    refreshAvailableModels();
  }, [refreshAvailableModels]);

  // Cleanup progress listener on unmount
  useEffect(() => {
    return () => {
      if (progressUnlisten) {
        progressUnlisten();
      }
    };
  }, [progressUnlisten]);

  const getModelIcon = (tier: ModelTier) => {
    switch (tier) {
      case 'LIGHT':
        return <Zap className="w-4 h-4" />;
      case 'MEDIUM':
        return <Gauge className="w-4 h-4" />;
      case 'LARGE':
        return <Sparkles className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getTierDisplayName = (tier: ModelTier): string => {
    return CHAT_MODELS[tier].displayName.split(' ')[0] || tier; // "Light (Gemma 3 1B)" -> "Light"
  };

  const isModelAvailableInOllama = (modelName: string) => {
    return availableOllamaModels.some(m => m === modelName || m === `${modelName}:latest`);
  };

  const handleTierSelect = async (tier: ModelTier) => {
    const modelName = CHAT_MODELS[tier].name;
    const available = isModelAvailableInOllama(modelName);

    if (available) {
      // Model already downloaded - switch to it
      setSelectedTier(tier);
      setIsOpen(false);
      console.log(`Switching to ${tier} tier (${modelName})`);
    } else {
      // Model not downloaded - download it
      await startDownload(tier);
    }
  };

  const startDownload = async (tier: ModelTier) => {
    const modelName = CHAT_MODELS[tier].name;
    console.log(`Starting download for ${tier} tier (${modelName})`);

    setDownloadingModel(modelName);
    setDownloadProgress(0);

    try {
      // Check if running on Windows (WebView2 blocks fetch)
      const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

      if (isWindows) {
        // Use Tauri command on Windows
        const { invoke } = await import('@tauri-apps/api/core');

        // Check current models first
        const status = await invoke<{ running: boolean; models_available: boolean; models: string[] }>('check_ollama_status');

        const hasChatModel = status.models?.some((m: string) => m === modelName || m === `${modelName}:latest`);
        const hasEmbedding = status.models?.some((m: string) => m.startsWith('nomic-embed-text'));

        // Listen for download progress events (new event name from streaming Rust command)
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen('model_download_progress', (event: any) => {
          const data = event.payload;
          // Use pre-calculated percent from Rust, or calculate from completed/total
          if (data.percent !== undefined) {
            setDownloadProgress(Math.round(data.percent));
          } else if (data.completed && data.total) {
            const percent = Math.round((data.completed / data.total) * 100);
            setDownloadProgress(percent);
          }
        });
        setProgressUnlisten(() => unlisten);

        try {
          // Download embedding model FIRST (required for PDF upload)
          if (!hasEmbedding) {
            setDownloadProgress(0);
            await invoke('download_ollama_model', { modelName: 'nomic-embed-text' });
          }

          // Download chat model second
          if (!hasChatModel) {
            setDownloadProgress(0);
            await invoke('download_ollama_model', { modelName });
          }
        } finally {
          // Clean up listener
          unlisten();
          setProgressUnlisten(null);
        }
      } else {
        // Use fetch on Linux/Mac
        await ollamaService.pullModel(modelName, (progress) => {
          console.log(`Download progress for ${modelName}:`, progress);
          setDownloadProgress(progress.percent || 0);
        });

        // Also download embedding model if not present
        const status = await ollamaService.checkStatus();
        const hasEmbedding = status.models?.some((m: string) => m.startsWith('nomic-embed-text'));

        if (!hasEmbedding) {
          await ollamaService.pullModel('nomic-embed-text', () => {});
        }
      }

      // Download complete - refresh available models
      // On Windows, use Tauri command; on Linux/Mac use fetch
      if (isWindows) {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = await invoke<{ running: boolean; models_available: boolean; models: string[] }>('check_ollama_status');
        setAvailableOllamaModels(status.models || []);
      } else {
        const status = await ollamaService.checkStatus();
        if (status.isRunning) {
          setAvailableOllamaModels(status.models);
        }
      }
      refreshAvailableModels();

      // Switch to the newly downloaded tier
      setSelectedTier(tier);
      setDownloadingModel(null);
      setDownloadProgress(0);
      setIsOpen(false);

      console.log(`Successfully downloaded and switched to ${tier} tier (${modelName})`);
    } catch (error) {
      console.error(`Failed to download ${tier} tier (${modelName}):`, error);
      setDownloadingModel(null);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="relative">
      {/* Current Model Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground border border-border rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        {getModelIcon(selectedTier)}
        <span>{getTierDisplayName(selectedTier)}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[100]"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 w-64 bg-popover border border-border rounded-xl shadow-lg z-[101] overflow-hidden">
            <div className="p-2 space-y-1">
              {(Object.keys(CHAT_MODELS) as ModelTier[]).map((tier) => {
                const modelConfig = CHAT_MODELS[tier];
                const modelName = modelConfig.name;
                const available = isModelAvailableInOllama(modelName);
                const active = selectedTier === tier;

                const isDownloading = downloadingModel === modelName;

                return (
                  <button
                    key={tier}
                    onClick={() => handleTierSelect(tier)}
                    disabled={isDownloading}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : isDownloading
                        ? 'opacity-70 cursor-wait'
                        : 'hover:bg-accent text-popover-foreground'
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      active ? 'bg-primary/20' : 'bg-muted'
                    }`}>
                      {isDownloading ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        getModelIcon(tier)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{getTierDisplayName(tier)}</div>
                      <div className="text-xs opacity-70">
                        {isDownloading
                          ? `Downloading ${Math.round(downloadProgress)}%`
                          : `${modelConfig.size} • ${modelConfig.params}`}
                      </div>
                    </div>
                    {active && !isDownloading && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                    {!available && !isDownloading && (
                      <Download className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
