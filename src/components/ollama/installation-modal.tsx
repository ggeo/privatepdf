'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, CheckCircle2, XCircle, Loader2, Terminal, Copy, ExternalLink } from 'lucide-react';
import { ollamaInstaller } from '@/lib/services/ollama-installer';
import type { InstallationStatus } from '@/lib/services/ollama-installer';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface InstallationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstalled: () => void;
}

export function InstallationModal({ isOpen, onClose, onInstalled }: InstallationModalProps) {
  const [status, setStatus] = useState<InstallationStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  // New states for Windows automatic installation
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState<string>('');
  const [installError, setInstallError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      checkInstallation();

      // Set up event listeners for download progress
      const setupListeners = async () => {
        const unlistenProgress = await listen('ollama_download_progress', (event: any) => {
          setDownloadProgress(event.payload.percent || 0);
        });

        const unlistenExtraction = await listen('ollama_extraction_progress', (event: any) => {
          setExtractionProgress(event.payload.percent || 0);
        });

        const unlistenStatus = await listen('ollama_download_status', (event: any) => {
          setInstallStatus(event.payload.message || '');
        });

        return () => {
          unlistenProgress();
          unlistenExtraction();
          unlistenStatus();
        };
      };

      setupListeners();
    }
  }, [isOpen]);

  const checkInstallation = async () => {
    setIsChecking(true);
    try {
      const installStatus = await ollamaInstaller.getInstallationStatus();
      setStatus(installStatus);

      if (installStatus.isInstalled) {
        setTimeout(() => {
          onInstalled();
        }, 1500);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!status) return;

    // Windows: Use automatic ZIP installation
    if (status.platform === 'windows') {
      setIsInstalling(true);
      setInstallError('');
      setDownloadProgress(0);
      setExtractionProgress(0);
      setInstallStatus('Detecting GPU...');

      try {
        // Detect AMD GPU
        const isAMD = await ollamaInstaller.detectAMDGpu();
        const version = isAMD ? 'AMD version (359MB)' : 'standard version (1.9GB)';
        setInstallStatus(`Downloading ${version}...`);

        // Call Tauri command to download and install
        const result = await invoke('download_ollama_zip', { isAmdGpu: isAMD });
        console.log('Installation result:', result);

        setInstallStatus('Installation complete!');

        // Wait a bit then check and close
        setTimeout(async () => {
          setIsInstalling(false);
          const newStatus = await ollamaInstaller.getInstallationStatus();
          setStatus(newStatus);

          // Auto-close modal after successful installation
          setTimeout(() => {
            onInstalled();
            onClose();
          }, 1500);
        }, 1000);
      } catch (error: any) {
        console.error('Installation failed:', error);
        setInstallError(error?.toString() || 'Installation failed');
        setIsInstalling(false);
      }
    } else {
      // Linux: Use browser download method
      ollamaInstaller.downloadInstaller(status.platform);
      // Start checking for installation every 5 seconds
      const checkInterval = setInterval(async () => {
        const newStatus = await ollamaInstaller.getInstallationStatus();
        if (newStatus.isInstalled) {
          clearInterval(checkInterval);
          setStatus(newStatus);
          setTimeout(() => {
            onInstalled();
          }, 1500);
        }
      }, 5000);
    }
  };

  const copyCommand = async () => {
    if (status?.platform === 'linux') {
      await navigator.clipboard.writeText(ollamaInstaller.getLinuxCommand());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getPlatformIcon = () => {
    if (!status) return null;

    switch (status.platform) {
      case 'windows':
        return '🪟';
      case 'linux':
        return '🐧';
      default:
        return '💻';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="w-full max-w-2xl"
          >
            {/* Glassmorphic Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
              {/* Gradient Orb Background */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-orange-500/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-purple-500/20 blur-3xl" />

              {/* Content */}
              <div className="relative p-8">
                {isChecking ? (
                  <div className="flex flex-col items-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-500 mb-4" />
                    <p className="text-white/70">Checking Ollama status...</p>
                  </div>
                ) : status?.isInstalled ? (
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="flex flex-col items-center py-12"
                  >
                    <CheckCircle2 className="w-20 h-20 text-green-400 mb-4" />
                    <h2 className="text-3xl font-bold text-white mb-2">Ollama is Ready!</h2>
                    <p className="text-white/70">Your AI models are ready to use</p>
                  </motion.div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-3xl font-bold text-white mb-2">
                          Install Ollama {getPlatformIcon()}
                        </h2>
                        <p className="text-white/70">
                          One-time setup to enable AI features locally
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <XCircle className="w-6 h-6 text-white/50" />
                      </button>
                    </div>

                    {/* Benefits */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="text-2xl mb-2">🔒</div>
                        <h3 className="text-white font-semibold mb-1">100% Private</h3>
                        <p className="text-white/60 text-sm">Everything runs locally</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="text-2xl mb-2">⚡</div>
                        <h3 className="text-white font-semibold mb-1">Ultra Fast</h3>
                        <p className="text-white/60 text-sm">100x faster than browser</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <div className="text-2xl mb-2">🎯</div>
                        <h3 className="text-white font-semibold mb-1">Easy Setup</h3>
                        <p className="text-white/60 text-sm">{status && ollamaInstaller.getEstimatedTime(status.platform)}</p>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 mb-6">
                      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <Terminal className="w-5 h-5" />
                        Installation Steps
                      </h3>
                      <ol className="space-y-3">
                        {status?.instructions.map((instruction, index) => {
                          const isStartCommand = instruction.includes('🚀');
                          const isWarning = instruction.includes('⚠️');
                          return (
                            <li key={index} className="flex items-start gap-3">
                              {!instruction.startsWith('📥') && !instruction.startsWith('💾') &&
                               !instruction.startsWith('📁') && !instruction.startsWith('🚀') &&
                               !instruction.startsWith('✅') && !instruction.startsWith('🔄') &&
                               !instruction.startsWith('💻') && !instruction.startsWith('⚠️') ? (
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-sm flex items-center justify-center font-semibold">
                                  {index + 1}
                                </span>
                              ) : (
                                <span className="flex-shrink-0 w-6" />
                              )}
                              <span className={`text-sm ${isStartCommand ? 'text-orange-400 font-semibold' : isWarning ? 'text-yellow-400' : 'text-white/80'}`}>
                                {instruction}
                                {status.platform === 'linux' && instruction.includes('curl') && (
                                <div className="mt-2 flex items-center gap-2">
                                  <code className="bg-black/30 px-3 py-1 rounded text-xs text-orange-400 font-mono">
                                    {ollamaInstaller.getLinuxCommand()}
                                  </code>
                                  <button
                                    onClick={copyCommand}
                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                  >
                                    {copied ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                                    ) : (
                                      <Copy className="w-4 h-4 text-white/50" />
                                    )}
                                  </button>
                                </div>
                                )}
                                {status.platform === 'linux' && instruction.includes('ollama serve') && (
                                  <div className="mt-2">
                                    <code className="bg-black/30 px-3 py-1 rounded text-xs text-orange-400 font-mono">
                                      ollama serve
                                    </code>
                                  </div>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>

                    {/* Windows Installation Progress */}
                    {status?.platform === 'windows' && isInstalling && (
                      <div className="bg-white/5 rounded-xl p-6 border border-white/10 mb-6">
                        <h3 className="text-white font-semibold mb-4">Installing Ollama...</h3>

                        {/* Download Progress */}
                        {downloadProgress > 0 && downloadProgress < 100 && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm text-white/70 mb-2">
                              <span>Downloading...</span>
                              <span>{downloadProgress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                              <motion.div
                                className="h-full bg-gradient-to-r from-orange-500 to-orange-600"
                                initial={{ width: 0 }}
                                animate={{ width: `${downloadProgress}%` }}
                                transition={{ duration: 0.3 }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Extraction Progress */}
                        {extractionProgress > 0 && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm text-white/70 mb-2">
                              <span>Extracting files...</span>
                              <span>{extractionProgress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                              <motion.div
                                className="h-full bg-gradient-to-r from-purple-500 to-purple-600"
                                initial={{ width: 0 }}
                                animate={{ width: `${extractionProgress}%` }}
                                transition={{ duration: 0.3 }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Status Message */}
                        {installStatus && (
                          <p className="text-white/70 text-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {installStatus}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Installation Error */}
                    {installError && (
                      <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 mb-6">
                        <p className="text-red-400 text-sm">{installError}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                      {status?.platform === 'linux' ? (
                        <button
                          onClick={() => window.open('https://ollama.com/download/linux', '_blank')}
                          className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-5 h-5" />
                          View Installation Guide
                        </button>
                      ) : (
                        <button
                          onClick={handleDownload}
                          disabled={isInstalling}
                          className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isInstalling ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Installing...
                            </>
                          ) : (
                            <>
                              <Download className="w-5 h-5" />
                              {status?.platform === 'windows' ? 'Install Ollama' : 'Download Ollama'}
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Help Text */}
                    <p className="text-center text-white/50 text-sm mt-6">
                      After installation, this modal will automatically detect Ollama and continue
                    </p>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}