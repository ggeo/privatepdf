'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CHAT_MODELS } from '@/lib/services/ollama-service';
import { useOllamaStore } from '@/stores/ollama-store';
import { useSettingsStore } from '@/stores/settings-store';
import { InstallationModal } from './installation-modal';

interface OllamaSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OllamaSetupModal({ isOpen, onClose }: OllamaSetupModalProps) {
  const { downloadModels, downloadProgress, downloadError } = useOllamaStore();
  const { selectedTier } = useSettingsStore();

  const [showInstallationModal, setShowInstallationModal] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const handleDownloadRecommendedModel = async () => {
    setInstallError(null);
    try {
      const modelName = CHAT_MODELS[selectedTier].name;
      await downloadModels(modelName);
      onClose(); // Close modal after initiating download
    } catch (error: any) {
      setInstallError(error.message || 'Failed to download model.');
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
            className="w-full max-w-md rounded-xl bg-card border border-border shadow-2xl p-6 relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <h2 className="text-2xl font-bold mb-4 text-center">Ollama Setup</h2>

            <div className="space-y-4">
              <p className="text-muted-foreground text-center">
                To use PrivatePDF, you need to have Ollama installed and running on your computer.
              </p>

              {/* Ollama Installation Button */}
              <div className="flex justify-center">
                <Button onClick={() => setShowInstallationModal(true)}>
                  Install Ollama
                </Button>
              </div>

              <p className="text-muted-foreground text-center text-sm">
                After installing, ensure Ollama is running and then download the recommended model.
              </p>

              {/* Installation Modal */}
              <InstallationModal
                isOpen={showInstallationModal}
                onClose={() => setShowInstallationModal(false)}
                onInstalled={() => {
                  setShowInstallationModal(false);
                  // Close the setup modal after successful installation
                  onClose();
                }}
              />

              {/* Download Progress */}
              {isDownloadingAnyModel && (
                <div className="bg-muted rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <p className="text-foreground font-medium">{currentDownloadMessage}</p>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${currentDownloadProgress}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs mt-2">
                    This may take a few minutes depending on your internet speed.
                  </p>
                </div>
              )}

              {/* Error Display */}
              {(installError || downloadError) && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-destructive text-sm">{installError || downloadError}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-center">
                <Button
                  onClick={handleDownloadRecommendedModel}
                  disabled={isDownloadingAnyModel}
                  className="flex items-center gap-2"
                >
                  {isDownloadingAnyModel ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Download Recommended Model
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
