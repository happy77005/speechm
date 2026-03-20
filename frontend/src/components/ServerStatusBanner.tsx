import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, CheckCircle2, WifiOff, X } from 'lucide-react';
import { useServerStatus, ServerStatus } from '../hooks/useServerStatus';

export function ServerStatusBanner() {
  const { status, details } = useServerStatus();
  const [showReady, setShowReady] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset dismissal when server goes "offline" or starts "warming-up" 
  // so the user sees the important status change.
  useEffect(() => {
    if (status !== 'ready') {
      setIsDismissed(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'ready') {
      setShowReady(true);
      const timer = setTimeout(() => setShowReady(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // If user dismissed it, or system is ready and the "Ready" burst finished, don't show.
  if (isDismissed) return null;
  if (status === 'ready' && !showReady) return null;

  const config: Record<ServerStatus, { icon: any; text: string; color: string }> = {
    'initializing': { icon: Loader2, text: 'Connecting to translation server...', color: 'bg-blue-600' },
    'warming-up': { icon: Loader2, text: 'AI models loading (2-3 min)...', color: 'bg-amber-500' },
    'ready': { icon: CheckCircle2, text: 'System Ready! Engines online.', color: 'bg-emerald-500' },
    'error': { icon: AlertCircle, text: 'Server error detected.', color: 'bg-red-500' },
    'offline': { icon: WifiOff, text: 'Server offline / Sleeping...', color: 'bg-slate-700' }
  };

  const current = config[status];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -50, opacity: 0, x: '-50%' }}
        animate={{ y: 0, opacity: 1, x: '-50%' }}
        exit={{ y: -50, opacity: 0, x: '-50%' }}
        className={`fixed top-4 left-1/2 z-[100] px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-white font-bold text-sm backdrop-blur-md border border-white/20 ${current.color}`}
      >
        <Icon className={`w-4 h-4 ${status === 'warming-up' || status === 'initializing' ? 'animate-spin' : ''}`} />
        <span>{current.text}</span>
        
        {status === 'warming-up' && details && (
          <div className="flex gap-1.5 ml-1">
            {!details.whisper?.loaded && (
              <span className="text-[9px] bg-black/20 px-2 py-0.5 rounded-lg">Whisper...</span>
            )}
            {details.translation && !details.translation.is_ready && (
              <span className="text-[9px] bg-black/20 px-2 py-0.5 rounded-lg">Translation...</span>
            )}
          </div>
        )}

        <button 
          onClick={() => setIsDismissed(true)}
          className="ml-4 p-1 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
