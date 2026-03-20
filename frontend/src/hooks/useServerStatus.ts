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
      if (!response.ok) throw new Error('Server returned non-200 status');
      
      const data: HealthResponse = await response.json();
      setDetails(data);

      if (data.is_ready) {
        setStatus('ready');
      } else {
        setStatus('warming-up');
      }
    } catch (error) {
      setStatus('offline');
      setDetails(null);
    }
  }, [apiUrl]);

  useEffect(() => {
    // Initial check
    checkStatus();

    // Set up polling
    const intervalId = setInterval(() => {
      // Poll faster if warming up, slower if ready or offline
      checkStatus();
    }, status === 'warming-up' ? 5000 : 15000);

    return () => clearInterval(intervalId);
  }, [checkStatus, status]);

  return { status, details, refresh: checkStatus };
}
