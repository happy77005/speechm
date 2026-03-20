import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudioDirect, TranscriptionResponse } from '../services/api';

export interface LiveTranscriptionResult {
    isRecording: boolean;
    transcript: string;
    startRecording: (language: string) => Promise<void>;
    stopRecording: () => void;
    clearTranscript: () => void;
    energy: number; // Real-time volume level (0-100)
    error: string | null;
}

export function useLiveTranscription(): LiveTranscriptionResult {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [energy, setEnergy] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const intervalRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const energyIntervalRef = useRef<number | null>(null);
    
    const seqIdRef = useRef(0);
    const nextExpectedSeqRef = useRef(0);
    const reorderBufferRef = useRef<Map<number, string>>(new Map());
    const abortControllersRef = useRef<AbortController[]>([]);
    
    // TRACKER: Did we hear any speech in the current 4-second window?
    const hasSpeechInCurrentWindow = useRef(false);

    const processChunk = useCallback(async (audioBlob: Blob, seqId: number, language: string) => {
        // IF no speech was detected in this window, skip the API call entirely
        if (!hasSpeechInCurrentWindow.current) {
            console.log(`[LiveStream] Skipping silent chunk ${seqId}`);
            reorderBufferRef.current.set(seqId, '');
            nextExpectedSeqRef.current++; // Direct increment since we know it's empty
            return;
        }

        const controller = new AbortController();
        abortControllersRef.current.push(controller);

        try {
            console.log(`[LiveStream] Processing voiced chunk ${seqId} (${audioBlob.size} bytes)`);
            const result: TranscriptionResponse = await transcribeAudioDirect(
                audioBlob,
                language,
                controller.signal,
                '', // prompt
                seqId
            );

            const text = result.text?.trim() || '';
            reorderBufferRef.current.set(seqId, text);
            
            // Process the buffer in order
            let newText = '';
            while (reorderBufferRef.current.has(nextExpectedSeqRef.current)) {
                const chunkText = reorderBufferRef.current.get(nextExpectedSeqRef.current);
                if (chunkText) {
                    newText += (newText || transcript ? ' ' : '') + chunkText;
                }
                reorderBufferRef.current.delete(nextExpectedSeqRef.current);
                nextExpectedSeqRef.current++;
            }

            if (newText) {
                setTranscript(prev => prev + (prev ? ' ' : '') + newText);
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error(`[LiveStream] Error chunk ${seqId}:`, err);
                reorderBufferRef.current.set(seqId, ''); 
            }
        } finally {
            abortControllersRef.current = abortControllersRef.current.filter(c => c !== controller);
        }
    }, [transcript]);

    const startRecording = useCallback(async (language: string) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // SETUP AUDIO ANALYSER FOR VAD
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            setError(null);
            setIsRecording(true);
            seqIdRef.current = 0;
            nextExpectedSeqRef.current = 0;
            reorderBufferRef.current.clear();
            setTranscript('');
            hasSpeechInCurrentWindow.current = false;

            // Start energy monitoring
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            energyIntervalRef.current = window.setInterval(() => {
                if (analyserRef.current) {
                    analyserRef.current.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                    }
                    const avg = sum / bufferLength;
                    setEnergy(Math.min(100, Math.round((avg / 128) * 100)));
                    
                    // IF average energy is above threshold (e.g., 5 out of 100), mark as voiced
                    if (avg > 15) {
                        hasSpeechInCurrentWindow.current = true;
                    }
                }
            }, 100);

            const createRecorder = () => {
                const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                
                recorder.ondataavailable = (event) => {
                    if (event.data.size > 500) {
                        const chunkSeqId = seqIdRef.current++;
                        processChunk(event.data, chunkSeqId, language);
                        // Reset speech tracker for the NEXT window
                        hasSpeechInCurrentWindow.current = false;
                    }
                };

                recorder.start();
                return recorder;
            };

            mediaRecorderRef.current = createRecorder();

            intervalRef.current = window.setInterval(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    mediaRecorderRef.current = createRecorder();
                }
            }, 4000); 

        } catch (err: any) {
            console.error('[LiveStream] Start failed:', err);
            setError(err.message || 'Failed to start recording');
            setIsRecording(false);
        }
    }, [processChunk]);

    const stopRecording = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (energyIntervalRef.current) {
            clearInterval(energyIntervalRef.current);
            energyIntervalRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (mediaRecorderRef.current) {
            if (mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            mediaRecorderRef.current = null;
        }

        setIsRecording(false);
        setEnergy(0);
    }, []);

    const clearTranscript = useCallback(() => {
        setTranscript('');
    }, []);

    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (energyIntervalRef.current) clearInterval(energyIntervalRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
            abortControllersRef.current.forEach(c => c.abort());
        };
    }, []);

    return {
        isRecording,
        transcript,
        energy,
        startRecording,
        stopRecording,
        clearTranscript,
        error
    };
}
