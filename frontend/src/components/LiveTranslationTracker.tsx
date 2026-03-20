import { useState, useEffect, useRef } from 'react';
import { 
    Languages, 
    Zap, 
    Globe, 
    Trash2,
    CheckCircle2,
    Activity,
    ArrowRight,
    Play,
    Square
} from 'lucide-react';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { useWebSpeech } from '../hooks/useWebSpeech';

type STTEngine = 'whisper' | 'webspeech';
type TranslationEngine = 'nllb' | 'sarvam';

const SUPPORTED_LANGS = [
    { code: 'te', label: 'Telugu', nllb: 'tel_Telu', bcp47: 'te-IN' },
    { code: 'hi', label: 'Hindi', nllb: 'hin_Deva', bcp47: 'hi-IN' },
    { code: 'ta', label: 'Tamil', nllb: 'tam_Taml', bcp47: 'ta-IN' },
    { code: 'kn', label: 'Kannada', nllb: 'kan_Knda', bcp47: 'kn-IN' },
    { code: 'ml', label: 'Malayalam', nllb: 'mal_Mlym', bcp47: 'ml-IN' },
    { code: 'en', label: 'English', nllb: 'eng_Latn', bcp47: 'en-US' },
    { code: 'zh', label: 'Mandarin', nllb: 'zho_Hans', bcp47: 'zh-CN' },
    { code: 'ja', label: 'Japanese', nllb: 'jpn_Jpan', bcp47: 'ja-JP' },
    { code: 'de', label: 'German', nllb: 'deu_Latn', bcp47: 'de-DE' },
];


export function LiveTranslationTracker() {
    const [sttEngine, setSttEngine] = useState<STTEngine>('whisper');
    const [translationEngine, setTranslationEngine] = useState<TranslationEngine>('nllb');
    const [sourceLang, setSourceLang] = useState('te');
    const [targetLang, setTargetLang] = useState('en');
    
    // Hooks for different engines
    const whisper = useLiveTranscription();
    const webSpeech = useWebSpeech(SUPPORTED_LANGS.find(l => l.code === sourceLang)?.bcp47 || 'te-IN');
    
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
        // If text is same as last translated, or is empty, or not recording, skip
        if (!textToTranslate || textToTranslate === lastTranslatedRef.current || !isRecording) return;

        const timeoutId = setTimeout(async () => {
            setIsTranslating(true);
            try {
                const srcInfo = SUPPORTED_LANGS.find(l => l.code === sourceLang);
                const tgtInfo = SUPPORTED_LANGS.find(l => l.code === targetLang);

                const endpoint = translationEngine === 'sarvam' ? '/api/translate/sarvam' : '/api/translate';
                const payload = {
                    text: textToTranslate,
                    src_lang: translationEngine === 'sarvam' ? srcInfo?.code : srcInfo?.nllb,
                    tgt_lang: translationEngine === 'sarvam' ? tgtInfo?.code : tgtInfo?.nllb
                };

                const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:7860'}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();
                    if (typeof data === 'string') {
                        setTranslatedText(data);
                    } else if (data.job_id) {
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
        }, 800); // Debounce translation requests

        return () => clearTimeout(timeoutId);
    }, [currentTranscript, isRecording, translationEngine, sourceLang, targetLang]);

    const pollTranslation = async (jobId: string) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:7860'}/api/status/${jobId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'done') {
                    setTranslatedText(data.result);
                } else if (data.status === 'running' || data.status === 'queued') {
                    setTimeout(() => pollTranslation(jobId), 500); // Faster polling for live feel
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
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                    <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
                                    {isRecording ? 'Engine Active' : 'Standby'}
                                </div>
                            </div>
                        </div>

                        {/* Engine Selectors */}
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest px-1">STT Engine</span>
                                <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setSttEngine('whisper')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${sttEngine === 'whisper' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}`}
                                    >
                                        Whisper
                                    </button>
                                    <button 
                                        onClick={() => setSttEngine('webspeech')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${sttEngine === 'webspeech' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}`}
                                    >
                                        Web Speech
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest px-1">Translator</span>
                                <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setTranslationEngine('nllb')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${translationEngine === 'nllb' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500'}`}
                                    >
                                        NLLB
                                    </button>
                                    <button 
                                        onClick={() => setTranslationEngine('sarvam')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${translationEngine === 'sarvam' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500'}`}
                                    >
                                        Sarvam
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Language Routing Bar */}
                <div className="px-8 py-3 bg-blue-600/5 dark:bg-blue-600/10 border-b border-gray-100 dark:border-gray-800 flex items-center justify-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Source</span>
                        <select 
                            value={sourceLang}
                            onChange={(e) => setSourceLang(e.target.value)}
                            disabled={isRecording}
                            className="bg-white dark:bg-gray-800 text-xs font-bold px-4 py-2 rounded-xl outline-none border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 shadow-sm"
                        >
                            {SUPPORTED_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                    </div>

                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                        <ArrowRight size={14} />
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Target</span>
                        <select 
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="bg-white dark:bg-gray-800 text-xs font-bold px-4 py-2 rounded-xl outline-none border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 shadow-sm"
                        >
                            {SUPPORTED_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Main Content Areas */}
                <div className="grid grid-cols-1 lg:grid-cols-2">
                    {/* Transcript Side */}
                    <div className="p-8 lg:border-r border-gray-100 dark:border-gray-800 flex flex-col group">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
                                <Activity size={12} className="text-blue-500" />
                                {SUPPORTED_LANGS.find(l => l.code === sourceLang)?.label} Transcript
                            </span>
                            {sttEngine === 'whisper' && isRecording && (
                                <div className="h-1.5 w-24 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-150"
                                        style={{ width: `${Math.min(whisper.energy * 2, 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 min-h-[350px] max-h-[500px] overflow-y-auto text-2xl font-medium text-gray-900 dark:text-white leading-relaxed space-y-4 pr-4 custom-scrollbar">
                            {currentTranscript || (
                                <p className="text-gray-300 dark:text-gray-700 italic">
                                    {isRecording ? 'Listening...' : 'Ready to start...'}
                                </p>
                            )}
                            {currentInterim && (
                                <span className="text-blue-500 opacity-60 ml-2 animate-pulse">{currentInterim}...</span>
                            )}
                        </div>
                    </div>

                    {/* Translation Side */}
                    <div className="p-8 bg-blue-50/20 dark:bg-blue-900/5 flex flex-col relative">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2 bg-blue-100/50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
                                <Globe size={12} />
                                {SUPPORTED_LANGS.find(l => l.code === targetLang)?.label} Translation
                            </span>
                            {isTranslating && (
                                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 animate-pulse">
                                    <Zap size={10} className="fill-current" />
                                    AI Translating...
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 min-h-[350px] max-h-[500px] overflow-y-auto text-2xl font-bold text-blue-600 dark:text-blue-400 leading-relaxed pr-4 custom-scrollbar">
                            {translatedText || (
                                <p className="text-blue-200 dark:text-blue-900/20 italic">
                                    Translation stream will appear here...
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-8 bg-gray-50 dark:bg-gray-950/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleRecording}
                            className={`flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-sm tracking-widest uppercase transition-all shadow-2xl hover:scale-[1.02] active:scale-95 ${
                                isRecording 
                                ? 'bg-rose-500 text-white shadow-rose-200 dark:shadow-rose-900/20' 
                                : 'bg-blue-600 text-white shadow-blue-200 dark:shadow-blue-900/20'
                            }`}
                        >
                            {isRecording ? (
                                <>
                                    <Square className="w-5 h-5 fill-current" />
                                    Stop Translation
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5 fill-current" />
                                    Start Translation
                                </>
                            )}
                        </button>

                        
                        <button
                            onClick={clearAll}
                            title="Clear all text"
                            className="p-5 rounded-2xl bg-white dark:bg-gray-800 text-gray-400 hover:text-rose-500 border border-gray-100 dark:border-gray-700 transition-all shadow-sm hover:shadow-md"
                        >
                            <Trash2 size={22} />
                        </button>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-gray-400">
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Active Pipeline</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-900 dark:text-gray-300">
                                {sttEngine} + {translationEngine}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-gray-200 dark:bg-gray-800" />
                        <div className="flex items-center gap-2.5 text-green-500 bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-xl">
                            <CheckCircle2 size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">System Ready</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

