'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertCircle, Loader2, WifiOff } from 'lucide-react';
import { useOllamaStore } from '@/stores/ollama-store';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusIndicator({
  className,
  showText = true,
  size = 'md'
}: StatusIndicatorProps) {
  const { initialized, initializationStep, modelsReady, downloadInProgress } = useOllamaStore();

  const getStatusIcon = () => {
    const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6';

    if (!initialized || downloadInProgress) {
      return <Loader2 className={cn(iconSize, 'text-blue-400 animate-spin')} />;
    }
    if (modelsReady) {
      return <Zap className={cn(iconSize, 'text-green-400')} />;
    }
    return <AlertCircle className={cn(iconSize, 'text-red-400')} />;
  };

  const getStatusColor = () => {
    if (!initialized || downloadInProgress) return 'bg-blue-400';
    if (modelsReady) return 'bg-green-400';
    return 'bg-red-400';
  };

  const getStatusText = () => {
    if (!initialized) return 'Initializing...';
    if (downloadInProgress) return initializationStep;
    if (modelsReady) return 'Ollama Ready';
    return 'Ollama Not Ready';
  };

  const pulseSize = size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <div className={cn(
      'flex items-center gap-2',
      className
    )}>
      <div className="relative flex items-center">
        {/* Status Icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={initializationStep}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {getStatusIcon()}
          </motion.div>
        </AnimatePresence>

        {/* Pulse indicator for connected state */}
        {modelsReady && (
          <span className="absolute -top-1 -right-1 flex">
            <span className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              getStatusColor()
            )} />
            <span className={cn(
              'relative inline-flex rounded-full',
              pulseSize,
              getStatusColor()
            )} />
          </span>
        )}
      </div>

      {/* Status Text */}
      {showText && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            'font-medium',
            size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base',
            modelsReady
              ? 'text-green-400'
              : 'text-yellow-400'
          )}
        >
          {getStatusText()}
        </motion.span>
      )}
    </div>
  );
}