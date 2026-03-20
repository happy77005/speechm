import { useState, useEffect, useRef } from 'react';
import { Mic, Zap, Loader2, Globe, Sparkles } from 'lucide-react';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { useWebSpeech } from '../hooks/useWebSpeech';

const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'Telugu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'zh', label: 'Mandarin' },
  { code: 'ja', label: 'Japanese' },
  { code: 'de', label: 'German' }
];

import { Square } from 'lucide-react';

export function LiveSpeechTracker() {
  const [sourceLang, setSourceLang] = useState('te');
  const [engine, setEngine] = useState<'whisper' | 'webspeech'>('whisper');
  
  const whisper = useLiveTranscription();
  const webSpeech = useWebSpeech(sourceLang === 'te' ? 'te-IN' : 'hi-IN');
  
  const isRecording = engine === 'whisper' ? whisper.isRecording : webSpeech.isRecording;
  const transcript = engine === 'whisper' ? whisper.transcript : webSpeech.transcript;
  const energy = engine === 'whisper' ? whisper.energy : 0;
  const error = engine === 'whisper' ? whisper.error : webSpeech.error;

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as text arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleToggle = async () => {
    if (isRecording) {
      engine === 'whisper' ? whisper.stopRecording() : webSpeech.stopRecording();
    } else {
      if (engine === 'whisper') {
        await whisper.startRecording(sourceLang);
      } else {
        webSpeech.startRecording();
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-in fade-in duration-700">
      <div className="flex flex-col lg:flex-row gap-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.2)] border border-white/20 dark:border-gray-800/50 overflow-hidden min-h-[600px]">
        
        {/* Left Sidebar: Controls (1/3) */}
        <div className="lg:w-80 flex flex-col items-center gap-10 p-10 bg-gray-50/50 dark:bg-gray-800/20 border-r border-gray-100 dark:border-gray-800/50 relative">
          
          {/* Status Badge */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-700'}`} />
            <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
              {isRecording ? 'Engine Live' : 'System Standby'}
            </span>
          </div>

          {/* Proper Mic UI with Energy Halo */}
          <div className="mt-8 relative group">
            {isRecording && (
              <>
                <div 
                  className="absolute inset-0 rounded-full bg-blue-500/20 transition-all duration-100" 
                  style={{ transform: `scale(${1 + (energy / 100) * 0.5})` }}
                />
                <div className="absolute -inset-4 rounded-full border border-blue-500/10 animate-pulse" />
              </>
            )}
            <div className={`w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-700 relative z-10 ${isRecording ? 'bg-blue-600 shadow-2xl shadow-blue-500/40 rotate-0' : 'bg-white dark:bg-gray-800 shadow-xl'}`}>
              <Mic size={40} className={`transition-colors duration-500 ${isRecording ? 'text-white' : 'text-blue-600'}`} />
              {isRecording && (
                <div className="flex gap-1 mt-2">
                  <div className="w-1 h-3 bg-white/60 rounded-full animate-bounce delay-75" />
                  <div className="w-1 h-5 bg-white rounded-full animate-bounce" />
                  <div className="w-1 h-3 bg-white/60 rounded-full animate-bounce delay-150" />
                </div>
              )}
            </div>
            
            {/* Visual Energy Bar */}
            {isRecording && (
              <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-2 h-32 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="w-full bg-blue-500 transition-all duration-100 absolute bottom-0" 
                  style={{ height: `${energy}%` }}
                />
              </div>
            )}
          </div>

          <div className="w-full space-y-8 mt-4">
            {/* Language Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-center">
                <Globe size={14} className="text-blue-500" />
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Source Language</label>
              </div>
              <select 
                disabled={isRecording}
                value={sourceLang} 
                onChange={(e) => setSourceLang(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-xs font-bold text-gray-700 dark:text-white outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer shadow-sm text-center"
              >
                {SUPPORTED_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>

            {/* Action Button */}
            <button
            onClick={handleToggle}
            className={`flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-sm tracking-widest uppercase transition-all shadow-2xl hover:scale-[1.02] active:scale-95 ${
              isRecording 
              ? 'bg-rose-500 text-white shadow-rose-200 dark:shadow-rose-900/20' 
              : 'bg-blue-600 text-white shadow-blue-200 dark:shadow-blue-900/20'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-5 h-5 fill-current" />
                Stop Session
              </>
            ) : (
              <>
                <Mic size={20} className="text-white" />
                Start Session
              </>
            )}
          </button>
            {/* Engine Selector */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
               <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Engine Selection</p>
               <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-xl">
                  <button 
                      disabled={isRecording}
                      onClick={() => setEngine('whisper')}
                      className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${engine === 'whisper' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 opacity-50'}`}
                  >
                      Whisper
                  </button>
                  <button 
                      disabled={isRecording}
                      onClick={() => setEngine('webspeech')}
                      className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${engine === 'webspeech' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 opacity-50'}`}
                  >
                      Web Speech
                  </button>
               </div>
            </div>
          </div>

          {/* Footnote */}
          <div className="mt-auto opacity-30">
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">V-Pulse Engine v3</p>
          </div>
        </div>

        {/* Right Content Area: Transcription (Flexible) */}
        <div className="flex-1 flex flex-col min-h-[500px] relative">
          {/* Output Header */}
          <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800/50 flex justify-between items-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-md sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2 rounded-lg">
                <Sparkles size={16} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">Live Output Stream</h3>
                <p className="text-[9px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tight">Whisper XL Large-v3 Powered</p>
              </div>
            </div>
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-100 dark:border-blue-800 transition-opacity">
                <Loader2 className={`w-3 h-3 animate-spin text-blue-500 ${energy > 15 ? 'opacity-100' : 'opacity-20'}`} />
                <span className={`text-[9px] font-black uppercase tracking-tighter ${energy > 15 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                  {energy > 15 ? 'Detecting Speech' : 'Awaiting Speech'}
                </span>
              </div>
            )}
          </div>
          
          {/* Scrollable Transcript */}
          <div 
            ref={scrollRef}
            className="flex-1 p-10 pt-8 text-2xl font-bold text-gray-800 dark:text-gray-100 leading-relaxed overflow-y-auto max-h-[650px] scroll-smooth"
          >
            {transcript ? (
              <div className="animate-in slide-in-from-bottom-4 duration-500 mb-12">
                {transcript}
                <span className={`ml-2 w-1.5 h-7 bg-blue-500 inline-block align-middle rounded-full ${energy > 15 ? 'animate-bounce' : 'animate-pulse opacity-40'}`} /> 
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400/20 py-20">
                <Zap size={64} className="mb-6 opacity-20" />
                <p className="text-xs font-black uppercase tracking-[0.4em] text-center">Awaiting Audio Stream Input</p>
                <p className="text-[10px] text-gray-400/40 mt-2 text-center max-w-[200px] uppercase font-bold">Real-time transcription will appear in this space</p>
              </div>
            )}

            {error && (
              <div className="mt-8 p-6 bg-rose-50 dark:bg-rose-900/20 border-l-4 border-rose-500 rounded-r-2xl text-rose-600 dark:text-rose-400 text-sm font-bold shadow-sm animate-in shake duration-500">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black uppercase tracking-widest">Stream Interrupted</span>
                </div>
                {error}
              </div>
            )}
          </div>

          {/* Visual Waveform Decorator - Connected to Energy */}
          {isRecording && (
            <div className="h-8 w-full flex items-end gap-[2px] px-8 py-2 opacity-30 pointer-events-none">
              {Array.from({ length: 60 }).map((_, i) => (
                <div 
                  key={i} 
                  className="flex-1 bg-blue-500 rounded-full transition-all duration-100"
                  style={{ 
                    height: `${Math.max(10, Math.random() * energy * 0.8 + energy * 0.2)}%`,
                  }} 
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
