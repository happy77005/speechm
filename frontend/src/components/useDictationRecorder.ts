// Custom hook for managing dictation recording
// Supports both Web Speech API (Native) and MediaRecorder (AI Engines)

import { useState, useRef, useCallback } from 'react';
import { saveRecording, RecordingData } from '../lib/indexedDB';

// Declare SpeechRecognition types for TypeScript
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

export type EngineType = 'local' | 'azure' | 'sarvam' | 'native' | 'Hugging Face';

export interface RecordingResult {
  transcript: string;
  durationMs: number;
  wordCount: number;
  timestamp: string;
  blob?: Blob;
}

interface UseDictationRecorderReturn {
  isRecording: boolean;
  transcript: string;
  durationMs: number;
  error: string | null;
  isSupported: boolean;
  startRecording: (engine: EngineType, language?: string) => void;
  stopRecording: () => void;
  toggleRecording: (engine: EngineType, language?: string) => void;
  clearTranscript: () => void;
  setTranscript: (text: string) => void;
}

export function useDictationRecorder(
  onRecordingComplete?: (result: RecordingResult) => void
): UseDictationRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscriptState] = useState('');
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const activeEngineRef = useRef<EngineType>('native');

  const SpeechRecognitionAPI =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const isSupported = !!SpeechRecognitionAPI;

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerIntervalRef.current = window.setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscriptState('');
    setDurationMs(0);
    setError(null);
    audioChunksRef.current = [];
  }, []);

  const setTranscript = useCallback((text: string) => {
    setTranscriptState(text);
  }, []);

  const startNativeRecording = useCallback((language: string = 'en-US') => {
    if (!SpeechRecognitionAPI) return;

    try {
      const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
      recognition.continuous = true;
      recognition.interimResults = true;

      // Experiment: Map project language codes to Web Speech API locales
      let locale = language;
      if (language === 'hi') locale = 'hi-IN';
      if (language === 'ta') locale = 'ta-IN';
      if (language === 'te') locale = 'te-IN';
      if (language === 'kn') locale = 'kn-IN';
      if (language === 'ml') locale = 'ml-IN';
      if (language === 'en') locale = 'en-US';

      recognition.lang = locale;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            setTranscriptState(prev => prev + event.results[i][0].transcript + ' ');
          }
        }
      };

      recognition.onstart = () => {
        setIsRecording(true);
        startTimer();
      };

      recognition.onend = () => {
        setIsRecording(false);
        stopTimer();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setError(`Native STT Error: ${event.error}`);
        setIsRecording(false);
        stopTimer();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError('Failed to start native recording');
    }
  }, [SpeechRecognitionAPI, startTimer, stopTimer]);

  const startAIRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        startTimer();
      };

      mediaRecorder.onstop = () => {
        setIsRecording(false);
        stopTimer();
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
    } catch (err) {
      setError('Microphone access denied or error');
    }
  }, [startTimer, stopTimer]);

  const startRecording = useCallback((engine: EngineType, language?: string) => {
    setError(null);
    activeEngineRef.current = engine;

    if (engine === 'native') {
      startNativeRecording(language);
    } else {
      startAIRecording();
    }
  }, [startAIRecording, startNativeRecording]);

  const stopRecording = useCallback(async () => {
    if (activeEngineRef.current === 'native' && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Wait a bit for the final data if AI mode
    if (activeEngineRef.current !== 'native') {
      setTimeout(async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const finalTranscript = transcript.trim();
        const duration = Date.now() - startTimeRef.current;

        const result: RecordingResult = {
          transcript: finalTranscript,
          durationMs: duration,
          wordCount: finalTranscript.split(/\s+/).filter(w => w.length > 0).length,
          timestamp: new Date().toISOString(),
          blob: audioBlob
        };

        if (onRecordingComplete) onRecordingComplete(result);
      }, 200);
    } else {
      const finalTranscript = transcript.trim();
      const result: RecordingResult = {
        transcript: finalTranscript,
        durationMs: Date.now() - startTimeRef.current,
        wordCount: finalTranscript.split(/\s+/).filter(w => w.length > 0).length,
        timestamp: new Date().toISOString()
      };
      if (onRecordingComplete) onRecordingComplete(result);
    }
  }, [transcript, onRecordingComplete]);

  const toggleRecording = useCallback((engine: EngineType, language?: string) => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording(engine, language);
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    transcript,
    durationMs,
    error,
    isSupported,
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
    setTranscript
  };
}
