import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, CheckCircle2, WifiOff } from 'lucide-react';
import { useServerStatus, ServerStatus } from '../hooks/useServerStatus';

export function ServerStatusBanner() {
  const { status, details } = useServerStatus();
  const [showReady, setShowReady] = useState(false);

  useEffect(() => {
    if (status === 'ready') {
      setShowReady(true);
      const timer = setTimeout(() => setShowReady(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (status === 'ready' && !showReady) return null;

  const config: Record<ServerStatus, { icon: any; text: string; color: string }> = {
    'initializing': { icon: Loader2, text: 'Connecting to translation server...', color: 'bg-blue-500' },
    'warming-up': { icon: Loader2, text: 'Server is warming up (loading AI models, 2-3 min)...', color: 'bg-amber-500' },
    'ready': { icon: CheckCircle2, text: 'System Ready! All translation engines online.', color: 'bg-emerald-500' },
    'error': { icon: AlertCircle, text: 'Server error. Translation may be unavailable.', color: 'bg-red-500' },
    'offline': { icon: WifiOff, text: 'Server offline. Please ensure the backend is running.', color: 'bg-slate-700' }
  };

  const current = config[status];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 text-white font-medium ${current.color}`}
      >
        <Icon className={`w-5 h-5 ${status === 'warming-up' || status === 'initializing' ? 'animate-spin' : ''}`} />
        <span>{current.text}</span>
        {status === 'warming-up' && details && (
          <div className="flex gap-1 ml-2">
            {!details.whisper.loaded && <span className="text-[10px] bg-white/20 px-1.5 rounded">Whisper...</span>}
            {!details.translation.is_ready && <span className="text-[10px] bg-white/20 px-1.5 rounded">Translation...</span>}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
