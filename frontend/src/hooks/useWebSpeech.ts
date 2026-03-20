import { useState, useEffect, useRef, useCallback } from 'react';

interface UseWebSpeechReturn {
    isRecording: boolean;
    transcript: string;
    interimTranscript: string;
    startRecording: () => void;
    stopRecording: () => void;
    clearTranscript: () => void;
    error: string | null;
}

export function useWebSpeech(language: string = 'te-IN'): UseWebSpeechReturn {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    
    const recognitionRef = useRef<any>(null);
    const isManuallyStopped = useRef(false);

    const initRecognition = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            setError("Web Speech API not supported in this browser.");
            return null;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let currentInterim = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    currentInterim += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                setTranscript(prev => prev + (prev ? ' ' : '') + finalTranscript);
            }
            setInterimTranscript(currentInterim);
        };

        recognition.onerror = (event: any) => {
            console.error("WebSpeech Error:", event.error);
            if (event.error !== 'no-speech') {
                setError(event.error);
            }
        };

        recognition.onend = () => {
            if (!isManuallyStopped.current) {
                recognition.start(); // Auto-restart for continuous flow
            } else {
                setIsRecording(false);
            }
        };

        return recognition;
    }, [language]);

    useEffect(() => {
        recognitionRef.current = initRecognition();
        return () => {
            if (recognitionRef.current) {
                isManuallyStopped.current = true;
                recognitionRef.current.stop();
            }
        };
    }, [initRecognition]);

    const startRecording = () => {
        if (!recognitionRef.current) {
            recognitionRef.current = initRecognition();
        }
        
        if (recognitionRef.current) {
            setError(null);
            isManuallyStopped.current = false;
            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch (e) {
                console.error("Start error:", e);
            }
        }
    };

    const stopRecording = () => {
        if (recognitionRef.current) {
            isManuallyStopped.current = true;
            recognitionRef.current.stop();
            setIsRecording(false);
        }
    };

    const clearTranscript = () => {
        setTranscript('');
        setInterimTranscript('');
    };

    return {
        isRecording,
        transcript,
        interimTranscript,
        startRecording,
        stopRecording,
        clearTranscript,
        error
    };
}
