'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Zap, Gauge, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { CHAT_MODELS, EMBEDDING_MODEL } from '@/lib/services/ollama-service';
import { ollamaService } from '@/lib/services/ollama-service';
import { useSettingsStore, type ModelTier } from '@/stores/settings-store';
import { useOllamaStore } from '@/stores/ollama-store';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelSelected: (modelName: string) => void;
}

export function ModelSelectorModal({ isOpen, onClose, onModelSelected }: ModelSelectorModalProps) {
  const { selectedTier, setSelectedTier } = useSettingsStore();
  const { downloadModels, downloadProgress, downloadError, modelsReady, availableModels, downloadModel } = useOllamaStore();

  const [selectedTierLocal, setSelectedTierLocal] = useState<ModelTier>(selectedTier);
  const [error, setError] = useState<string | null>(null);

  // Update local state if selectedTier changes externally
  useEffect(() => {
    setSelectedTierLocal(selectedTier);
  }, [selectedTier]);

  const handleDownload = async () => {
    setError(null);
    const selectedModelName = CHAT_MODELS[selectedTierLocal].name;

    try {
      // Download the selected chat model
      await downloadModels(selectedModelName);

      // Also ensure embedding model is downloaded
      await downloadModels(EMBEDDING_MODEL);

      // If both are ready, update tier and notify parent
      if (modelsReady) {
        setSelectedTier(selectedTierLocal);
        onModelSelected(selectedModelName);
      } else {
        setError('Models are not ready after download. Please check Ollama status.');
      }
    } catch (err: any) {
      console.error('Failed to download models:', err);
      setError(err.message || 'Failed to download models. Please try again.');
    }
  };

  const getModelIcon = (tier: ModelTier) => {
    switch (tier) {
      case 'LIGHT':
        return <Zap className="w-6 h-6" />;
      case 'MEDIUM':
        return <Gauge className="w-6 h-6" />;
      case 'LARGE':
        return <Sparkles className="w-6 h-6" />;
      default:
        return null;
    }
  };

  const getModelColor = (tier: ModelTier) => {
    switch (tier) {
      case 'LIGHT':
        return 'from-green-500 to-emerald-600';
      case 'MEDIUM':
        return 'from-blue-500 to-blue-600';
      case 'LARGE':
        return 'from-purple-500 to-purple-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const isDownloadingAnyModel = downloadProgress.embedding?.status === 'downloading' || downloadProgress.llm?.status === 'downloading';
  const currentDownloadProgress = downloadProgress.llm?.progress || downloadProgress.embedding?.progress || 0;
  const currentDownloadMessage = downloadProgress.llm?.message || downloadProgress.embedding?.message || '';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="w-full max-w-4xl"
          >
            {/* Glassmorphic Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
              {/* Gradient Orb Background */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-purple-500/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-blue-500/20 blur-3xl" />

              {/* Content */}
              <div className="relative p-8">
                {/* Header */}
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Choose Your AI Model
                  </h2>
                  <p className="text-white/70">
                    Select the model that best fits your needs
                  </p>
                </div>

                {/* Model Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {(Object.keys(CHAT_MODELS) as ModelTier[]).map((tier) => {
                    const modelConfig = CHAT_MODELS[tier];
                    const modelName = modelConfig.name;
                    const isSelected = selectedTierLocal === tier;
                    const isDownloadingThisModel = downloadModel === modelName;
                    const isAvailable = availableModels.includes(modelName);

                    return (
                      <button
                        key={tier}
                        onClick={() => setSelectedTierLocal(tier)}
                        disabled={isDownloadingAnyModel}
                        className={`relative p-6 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-white/50 bg-white/10 scale-105'
                            : 'border-white/20 bg-white/5 hover:bg-white/10'
                        } ${isDownloadingAnyModel ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {/* Icon */}
                        <div
                          className={`w-12 h-12 rounded-lg bg-gradient-to-r ${getModelColor(
                            tier
                          )} flex items-center justify-center text-white mb-4 mx-auto`}
                        >
                          {isDownloadingThisModel ? (
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            getModelIcon(tier)
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="text-white font-semibold text-lg mb-1">
                          {modelConfig.displayName}
                        </h3>

                        {/* Size */}
                        <p className="text-white/50 text-sm mb-3">{modelConfig.size}</p>

                        {/* Description */}
                        <p className="text-white/70 text-sm">{modelConfig.description}</p>

                        {/* Selected Indicator */}
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-green-400" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Download Progress */}
                {isDownloadingAnyModel && (
                  <div className="mb-6 bg-white/10 rounded-xl p-4 border border-white/20">
                    <div className="flex items-center gap-3 mb-3">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                      <p className="text-white font-medium">{currentDownloadMessage}</p>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300"
                        style={{ width: `${currentDownloadProgress}%` }}
                      />
                    </div>
                    <p className="text-white/50 text-xs mt-2">
                      This may take a few minutes depending on your internet speed
                    </p>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-red-200 text-sm">{error}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isDownloadingAnyModel}
                    className="flex-1 bg-white/10 text-white font-semibold py-3 px-6 rounded-xl hover:bg-white/20 transition-colors border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={isDownloadingAnyModel}
                    className={`flex-1 bg-gradient-to-r ${getModelColor(
                      selectedTierLocal
                    )} text-white font-semibold py-3 px-6 rounded-xl hover:opacity-90 transition-all duration-200 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isDownloadingAnyModel ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Download {CHAT_MODELS[selectedTierLocal].displayName}
                      </>
                    )}
                  </button>
                </div>

                {/* Info Text */}
                <p className="text-center text-white/50 text-xs mt-4">
                  Models are downloaded once and stored locally. You can change models later in settings.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
