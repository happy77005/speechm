import { useState, useEffect, useRef } from 'react';
import { 
    Mic2, 
    Languages, 
    Zap, 
    Globe, 
    Trash2, 
    Settings2,
    CheckCircle2,
    Activity
} from 'lucide-react';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { useWebSpeech } from '../hooks/useWebSpeech';

type STTEngine = 'whisper' | 'webspeech';
type TranslationEngine = 'nllb' | 'sarvam';

export function LiveTranslationTracker() {
    const [sttEngine, setSttEngine] = useState<STTEngine>('whisper');
    const [translationEngine, setTranslationEngine] = useState<TranslationEngine>('nllb');
    const [targetLang] = useState('en');
    const [sourceLang, setSourceLang] = useState('te');
    
    // Hooks for different engines
    const whisper = useLiveTranscription();
    const webSpeech = useWebSpeech(sourceLang === 'te' ? 'te-IN' : 'hi-IN');
    
    const [translatedText, setTranslatedText] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const lastTranslatedRef = useRef('');

    // Active STT state
    const isRecording = sttEngine === 'whisper' ? whisper.isRecording : webSpeech.isRecording;
    const currentTranscript = sttEngine === 'whisper' ? whisper.transcript : webSpeech.transcript;
    const currentInterim = sttEngine === 'whisper' ? "" : webSpeech.interimTranscript;

    // Translation logic
    useEffect(() => {
        const textToTranslate = currentTranscript.trim();
        if (textToTranslate && textToTranslate !== lastTranslatedRef.current && isRecording) {
            const timeoutId = setTimeout(async () => {
                setIsTranslating(true);
                try {
                    const endpoint = translationEngine === 'sarvam' ? '/api/translate/sarvam' : '/api/translate';
                    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:7860'}${endpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: textToTranslate,
                            src_lang: sourceLang === 'te' ? 'tel_Telu' : 'hin_Deva',
                            tgt_lang: targetLang === 'en' ? 'eng_Latn' : 'hin_Deva'
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        // Handle both job-based (NLLB) and direct (Sarvam) responses
                        if (typeof data === 'string') {
                            setTranslatedText(data);
                        } else if (data.job_id) {
                            // Simple poll for NLLB (demo simplified)
                            pollTranslation(data.job_id);
                        } else if (data.translated_text) {
                            setTranslatedText(data.translated_text);
                        }
                        lastTranslatedRef.current = textToTranslate;
                    }
                } catch (e) {
                    console.error("Translation fail:", e);
                } finally {
                    setIsTranslating(false);
                }
            }, 1500); // Debounce translation requests

            return () => clearTimeout(timeoutId);
        }
    }, [currentTranscript, isRecording, translationEngine, targetLang]);

    const pollTranslation = async (jobId: string) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:7860'}/api/status/${jobId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'done') {
                    setTranslatedText(data.result);
                } else if (data.status === 'running' || data.status === 'queued') {
                    setTimeout(() => pollTranslation(jobId), 1000);
                }
            }
        } catch (e) {
            console.error("Polling error:", e);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            sttEngine === 'whisper' ? whisper.stopRecording() : webSpeech.stopRecording();
        } else {
            sttEngine === 'whisper' ? whisper.startRecording(sourceLang) : webSpeech.startRecording();
        }
    };

    const clearAll = () => {
        whisper.clearTranscript();
        webSpeech.clearTranscript();
        setTranslatedText('');
        lastTranslatedRef.current = '';
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-2xl overflow-hidden transition-all duration-500">
                {/* Header Section */}
                <div className="p-8 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/40">
                                <Languages size={24} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Live Translation</h1>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">
                                        {isRecording ? 'Streaming Active' : 'Standby Mode'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Engine Selectors */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* STT Engine Select */}
                            <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-xl">
                                <button 
                                    onClick={() => setSttEngine('whisper')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${sttEngine === 'whisper' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500'}`}
                                >
                                    Whisper
                                </button>
                                <button 
                                    onClick={() => setSttEngine('webspeech')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${sttEngine === 'webspeech' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500'}`}
                                >
                                    Web Speech
                                </button>
                            </div>

                            {/* Translator Select */}
                            <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-xl">
                                <button 
                                    onClick={() => setTranslationEngine('nllb')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${translationEngine === 'nllb' ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500'}`}
                                >
                                    NLLB
                                </button>
                                <button 
                                    onClick={() => setTranslationEngine('sarvam')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${translationEngine === 'sarvam' ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500'}`}
                                >
                                    Sarvam AI
                                </button>
                            </div>

                            {/* Lang Select */}
                            <select 
                                value={sourceLang}
                                onChange={(e) => setSourceLang(e.target.value)}
                                className="bg-gray-200/50 dark:bg-gray-800 text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-xl outline-none border-none text-gray-700 dark:text-gray-300"
                            >
                                <option value="te">Telugu</option>
                                <option value="hi">Hindi</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Main Content Areas */}
                <div className="grid grid-cols-1 lg:grid-cols-2">
                    {/* Transcript Side */}
                    <div className="p-8 lg:border-r border-gray-100 dark:border-gray-800 relative group">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Activity size={12} className="text-blue-500" />
                                Live Transcription
                            </span>
                            {sttEngine === 'whisper' && (
                                <div className="h-1.5 w-24 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-150"
                                        style={{ width: `${Math.min(whisper.energy * 2, 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="min-h-[300px] max-h-[500px] overflow-y-auto text-xl font-medium text-gray-900 dark:text-white leading-relaxed space-y-4 pr-2 custom-scrollbar">
                            {currentTranscript || (
                                <p className="text-gray-300 dark:text-gray-700 italic">
                                    {isRecording ? 'Listening for speech...' : 'Press Start to begin transcribing...'}
                                </p>
                            )}
                            {currentInterim && (
                                <span className="text-blue-500 opacity-60 ml-2">{currentInterim}...</span>
                            )}
                            {isRecording && <span className="inline-block w-2 h-6 bg-blue-500 ml-1 animate-pulse rounded-full" />}
                        </div>
                    </div>

                    {/* Translation Side */}
                    <div className="p-8 bg-blue-50/10 dark:bg-blue-900/5 relative">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                <Globe size={12} />
                                Translated Output (English)
                            </span>
                            {isTranslating && (
                                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 animate-pulse">
                                    <Zap size={10} className="fill-current" />
                                    AI Processing...
                                </div>
                            )}
                        </div>
                        
                        <div className="min-h-[300px] max-h-[500px] overflow-y-auto text-xl font-bold text-blue-600 dark:text-blue-400 leading-relaxed pr-2 custom-scrollbar">
                            {translatedText || (
                                <p className="text-blue-200 dark:text-blue-900/30 italic">
                                    Translation will appear here in real-time...
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-8 bg-gray-50 dark:bg-gray-950/50 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleRecording}
                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm transition-all shadow-xl hover:scale-105 active:scale-95 ${
                                isRecording 
                                ? 'bg-red-500 text-white shadow-red-200 dark:shadow-red-900/20' 
                                : 'bg-blue-600 text-white shadow-blue-200 dark:shadow-blue-900/20'
                            }`}
                        >
                            {isRecording ? (
                                <>
                                    <div className="w-3 h-3 bg-white rounded-[2px] animate-pulse" />
                                    Stop Session
                                </>
                            ) : (
                                <>
                                    <Mic2 size={18} />
                                    Start Live Stream
                                </>
                            )}
                        </button>
                        
                        <button
                            onClick={clearAll}
                            className="p-4 rounded-2xl bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 border border-gray-100 dark:border-gray-700 transition-all hover:border-red-100"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-6 text-gray-400">
                        <div className="flex items-center gap-2">
                            <Settings2 size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                                {sttEngine} + {translationEngine}
                            </span>
                        </div>
                        <div className="h-4 w-px bg-gray-200 dark:bg-gray-800" />
                        <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 text-green-500">
                            <CheckCircle2 size={12} />
                            System Ready
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

