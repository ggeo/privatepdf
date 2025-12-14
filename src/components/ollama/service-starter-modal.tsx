'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power, Terminal, Copy, CheckCircle2, XCircle, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { ollamaStarter } from '@/lib/services/ollama-starter';
import { ollamaAutoStart } from '@/lib/services/ollama-auto-start';
import type { StartCommand } from '@/lib/services/ollama-starter';

interface ServiceStarterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStarted: () => void;
}

export function ServiceStarterModal({ isOpen, onClose, onStarted }: ServiceStarterModalProps) {
  const [startCommand, setStartCommand] = useState<StartCommand | null>(null);
  const [copied, setCopied] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isAutoStarting, setIsAutoStarting] = useState(false);
  const [autoStartFailed, setAutoStartFailed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const command = ollamaStarter.getStartCommand();
      setStartCommand(command);
      // Try to auto-start when modal opens
      attemptAutoStart();
    }
  }, [isOpen]);

  const attemptAutoStart = async () => {
    setIsAutoStarting(true);
    setAutoStartFailed(false);

    try {
      // Try browser-based auto-start
      const started = await ollamaAutoStart.tryAutoStart();

      if (started) {
        // Give it some time to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if it's running
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          const isRunning = await ollamaStarter.isRunning();
          if (isRunning) {
            onStarted();
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      }
    } catch (error) {
      console.error('Auto-start error:', error);
    }

    // If we get here, auto-start failed
    setIsAutoStarting(false);
    setAutoStartFailed(true);
  };

  const copyCommand = async () => {
    if (startCommand) {
      await navigator.clipboard.writeText(startCommand.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };


  const checkIfRunning = async () => {
    setIsChecking(true);
    const isRunning = await ollamaStarter.isRunning();
    setIsChecking(false);

    if (isRunning) {
      onStarted();
    }
  };

  const getPlatformIcon = () => {
    if (!startCommand) return '💻';

    switch (startCommand.platform) {
      case 'windows':
        return '🪟';
      case 'mac':
        return '🍎';
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
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-green-500/20 blur-3xl" />

              {/* Content */}
              <div className="relative p-8">
                {isAutoStarting ? (
                  <div className="flex flex-col items-center py-12">
                    <Sparkles className="w-12 h-12 text-blue-500 mb-4 animate-pulse" />
                    <h3 className="text-xl font-semibold text-white mb-2">Auto-starting Ollama...</h3>
                    <p className="text-white/70">Please wait while we start the service automatically</p>
                    <div className="mt-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-3xl font-bold text-white mb-2">
                          Start Ollama Service {getPlatformIcon()}
                        </h2>
                        <p className="text-white/70">
                          Ollama service is not running. Let's start it!
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <XCircle className="w-6 h-6 text-white/50" />
                      </button>
                    </div>

                    {/* Alert */}
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-orange-200">
                        <p className="font-semibold mb-1">Ollama is installed but not running</p>
                        <p className="text-orange-200/80">Follow the instructions below to start the service</p>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 mb-6">
                      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <Terminal className="w-5 h-5" />
                        How to Start Ollama
                      </h3>
                      <ol className="space-y-3">
                        {startCommand?.instructions.map((instruction, index) => (
                          <li key={index} className="flex items-start gap-3">
                            {!instruction.startsWith('🚀') &&
                             !instruction.startsWith('💻') &&
                             !instruction.startsWith('📝') &&
                             !instruction.startsWith('✅') &&
                             !instruction.startsWith('⚠️') &&
                             !instruction.startsWith('💡') &&
                             !instruction.startsWith('🍎') ? (
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm flex items-center justify-center font-semibold">
                                {index + 1}
                              </span>
                            ) : (
                              <span className="flex-shrink-0 w-6" />
                            )}
                            <span className={`text-sm ${instruction.includes('⚠️') ? 'text-yellow-400' : 'text-white/80'}`}>
                              {instruction}
                            </span>
                          </li>
                        ))}
                      </ol>

                      {/* Command Box */}
                      {startCommand?.requiresTerminal && (
                        <div className="mt-4 flex items-center gap-2 bg-black/30 rounded-lg p-3">
                          <code className="flex-1 text-sm text-blue-400 font-mono">
                            {startCommand.command}
                          </code>
                          <button
                            onClick={copyCommand}
                            className="p-2 hover:bg-white/10 rounded transition-colors"
                            title="Copy command"
                          >
                            {copied ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-white/50" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                      <button
                        onClick={() => attemptAutoStart()}
                        className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                      >
                        <Power className="w-5 h-5" />
                        Try Auto-Start Again
                      </button>
                      <button
                        onClick={checkIfRunning}
                        disabled={isChecking}
                        className="flex-1 bg-white/10 text-white font-semibold py-3 px-6 rounded-xl hover:bg-white/20 transition-colors border border-white/10 flex items-center justify-center gap-2"
                      >
                        {isChecking ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-5 h-5" />
                            Check Status
                          </>
                        )}
                      </button>
                      <button
                        onClick={onClose}
                        className="px-6 py-3 bg-white/5 text-white/70 font-semibold rounded-xl hover:bg-white/10 transition-colors border border-white/10"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Help Text */}
                    <p className="text-center text-white/50 text-sm mt-6">
                      After starting Ollama, click "Check Status" to continue
                    </p>

                    {/* Linux Systemd Service Tip */}
                    {startCommand?.platform === 'linux' && (
                      <details className="mt-6 bg-white/5 rounded-lg p-4 border border-white/10">
                        <summary className="text-sm text-white/70 cursor-pointer hover:text-white/90">
                          💡 Set up Ollama as a system service (auto-start)
                        </summary>
                        <div className="mt-3 text-xs text-white/60 font-mono bg-black/30 rounded p-3 overflow-x-auto">
                          <pre>{ollamaStarter.getSystemdInstructions().join('\n')}</pre>
                        </div>
                      </details>
                    )}
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