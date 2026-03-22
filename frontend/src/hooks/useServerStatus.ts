import { useState, useEffect, useCallback } from 'react';

export type ServerStatus = 'initializing' | 'warming-up' | 'ready' | 'error' | 'offline';

export interface HealthResponse {
  status: string;
  is_ready: boolean;
  whisper: { loaded: boolean };
  translation: { is_ready: boolean; status: string };
}

export function useServerStatus(apiUrl: string = import.meta.env.VITE_API_URL || 'http://localhost:7860') {
  const [status, setStatus] = useState<ServerStatus>('initializing');
  const [details, setDetails] = useState<HealthResponse | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) throw new Error('Server offline');
      
      const data: HealthResponse = await response.json();
      setDetails(data);

      if (data.status === 'alive' || data.is_ready) {
        setStatus('ready');
        return true; // Signal to stop polling
      } else {
        setStatus('warming-up');
        return false;
      }
    } catch (error) {
      setStatus('offline');
      setDetails(null);
      return false;
    }
  }, [apiUrl]);

  useEffect(() => {
    let intervalId: any = null;

    const startPolling = async () => {
      const isReady = await checkStatus();
      if (isReady) return;

      intervalId = setInterval(async () => {
        const finished = await checkStatus();
        if (finished) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 5000);
    };

    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [checkStatus]);

  return { status, details, refresh: checkStatus };
}
