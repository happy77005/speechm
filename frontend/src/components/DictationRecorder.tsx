import { useState, useRef, useEffect } from 'react';
import { Mic, Download, Trash2, Globe, Loader2, Save, Languages, Edit3, Lock, Zap, Copy } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { NOTO_HI_BASE64, NOTO_REGULAR_BASE64 } from '../lib/fonts';
import { useDictationRecorder, type EngineType, type RecordingResult } from './useDictationRecorder';
import { saveTranscription, updateTranscription, type SavedTranscription } from '../lib/db';
import { FileUploader } from './FileUploader';
import {
  transcribeAudioDirect,
  transcribeAudioAzure,
  transcribeAudioSarvam,
  translateTextDirect,
  translateTextSarvam,
  NLLB_TO_SARVAM
} from '../services/api';

const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'Telugu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' }
];

const TARGET_LANGS = [
  { code: 'eng_Latn', label: 'English' },
  { code: 'hin_Deva', label: 'Hindi' },
  { code: 'tel_Telu', label: 'Telugu' },
  { code: 'tam_Taml', label: 'Tamil' },
  { code: 'kan_Knda', label: 'Kannada' },
  { code: 'mal_Mlym', label: 'Malayalam' },
  { code: 'ben_Beng', label: 'Bengali' },
  { code: 'mar_Deva', label: 'Marathi' },
  { code: 'guj_Gujr', label: 'Gujarati' },
  { code: 'pan_Guru', label: 'Punjabi' }
];

interface DictationRecorderProps {
  onSave?: () => void;
}

export function DictationRecorder({ onSave }: DictationRecorderProps) {
  const [engine, setEngine] = useState<EngineType>('native');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('hin_Deva');
  const [mode, setMode] = useState<'record' | 'upload'>('record');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');

  // Workflow States
  const [workflowStep, setWorkflowStep] = useState<'transcribe' | 'edit-transcript' | 'translate' | 'review'>('transcribe');
  const [translationEngine, setTranslationEngine] = useState<'nllb' | 'sarvam'>('nllb');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [editedTranslation, setEditedTranslation] = useState('');
  const [floatingMicPos, setFloatingMicPos] = useState({ x: 0, y: 0 });
  const [showFloatingMic, setShowFloatingMic] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // When source language changes, default back to Native engine as requested
  useEffect(() => {
    setEngine('native');
  }, [sourceLang]);

  const onRecordingComplete = async (result: RecordingResult) => {
    if (result.transcript) {
      setTranscript(result.transcript);
      setEditedTranscript(result.transcript);
      if (engine === 'native') setWorkflowStep('edit-transcript');
    }

    if (engine === 'native') return;
    if (result.blob) await processAudio(result.blob);
  };

  const {
    isRecording,
    transcript,
    durationMs,
    toggleRecording,
    clearTranscript,
    setTranscript
  } = useDictationRecorder(onRecordingComplete);

  // Secondary recorder for Stage 2 Editorial Voice Insertion
  const onEditorRecordingComplete = (result: RecordingResult) => {
    if (result.transcript && textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      const text = editedTranscript;
      const newText = text.substring(0, selectionStart) + result.transcript + text.substring(selectionEnd);
      setEditedTranscript(newText);
      editorRecorder.clearTranscript();
    }
  };

  const editorRecorder = useDictationRecorder(onEditorRecordingComplete);

  const engineList = [
    { id: 'Hugging Face' as const, label: 'Whisper AI' },
    { id: 'native' as const, label: `${SUPPORTED_LANGS.find(l => l.code === sourceLang)?.label} Live` },
    { id: 'azure' as const, label: 'Azure AI' },
    { id: 'sarvam' as const, label: 'Sarvam AI' }
  ];

  const handleEditorInteraction = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (textareaRef.current && 'clientX' in e) {
      const rect = textareaRef.current.getBoundingClientRect();
      setFloatingMicPos({
        x: (e as React.MouseEvent).clientX - rect.left + 10,
        y: (e as React.MouseEvent).clientY - rect.top - 20
      });
      setShowFloatingMic(true);
    }
  };

  const handleAutoSave = async () => {
    if (!transcript && !editedTranscript) return;

    setSaveStatus('syncing');
    try {
      const finalSource = editedTranscript || transcript;
      const finalTranslation = editedTranslation || translation;

      const combinedText = (finalSource && finalTranslation)
        ? `${finalSource}\n\n---\n\n${finalTranslation}`
        : (finalTranslation || finalSource || "");

      const data: Partial<SavedTranscription> = {
        original: "",
        refined_original: finalSource,
        translate: translation || "",
        refined_translate: editedTranslation || "",
        text: combinedText,
        wordCount: combinedText.split(/\s+/).filter(w => w.length > 0).length,
      };

      if (sessionId) {
        await updateTranscription(sessionId, data);
      } else {
        const id = await saveTranscription(data.text || "New Session", undefined, durationMs, data);
        setSessionId(id);
      }
      setSaveStatus('saved');
      onSave?.();
    } catch (err) {
      console.error('Auto-save failed:', err);
      setSaveStatus('error');
    }
  };

  useEffect(() => {
    if (!transcript && !editedTranscript) return;
    const timer = setTimeout(() => {
      handleAutoSave();
    }, 2000);
    return () => clearTimeout(timer);
  }, [transcript, editedTranscript, translation, editedTranslation]);

  const downloadJSON = () => {
    const data = {
      transcript_date: new Date().toISOString(),
      original: "",
      refined_original: editedTranscript || transcript,
      translate: translation || "",
      refined_translate: editedTranslation || translation || ""
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `translation_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      let data;
      if (engine === 'azure') data = await transcribeAudioAzure(blob, sourceLang, controller.signal);
      else if (engine === 'sarvam') data = await transcribeAudioSarvam(blob, sourceLang, controller.signal);
      else if (engine === 'local' || engine === 'Hugging Face') data = await transcribeAudioDirect(blob, sourceLang, controller.signal);

      if (data && data.text) {
        setTranscript(data.text);
        setEditedTranscript(data.text);
        setWorkflowStep('edit-transcript');
      }
    } catch (err: any) {
      console.error('Transcription failed:', err);
      alert(`Transcription failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleTranslate = async () => {
    const textToTranslate = editedTranscript || transcript;
    if (!textToTranslate) return;

    setIsTranslating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      let result: string;
      if (translationEngine === 'sarvam') {
        const sarvamTgt = NLLB_TO_SARVAM[targetLang] || 'en';
        result = await translateTextSarvam(textToTranslate, sourceLang, sarvamTgt, controller.signal);
      } else {
        result = await translateTextDirect(textToTranslate, sourceLang, targetLang, controller.signal);
      }
      setTranslation(result);
      setEditedTranslation(result);
      setWorkflowStep('review');
    } catch (err: any) {
      console.error('Translation failed:', err);
      alert(`Translation failed: ${err.message}`);
    } finally {
      setIsTranslating(false);
      abortControllerRef.current = null;
    }
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const downloadPDF = () => {
    const finalTranscript = editedTranscript || transcript;
    const finalTranslation = editedTranslation || translation;
    if (!finalTranscript) return;

    const doc = new jsPDF();
    doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_REGULAR_BASE64);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFileToVFS('NotoSansDevanagari-Regular.ttf', NOTO_HI_BASE64);
    doc.addFont('NotoSansDevanagari-Regular.ttf', 'NotoSansDevanagari', 'normal');

    const hasDevanagari = (text: string) => /[\u0900-\u097F]/.test(text);

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(18);
    doc.text('Transcription & Translation', 20, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleString()}`, 20, 30);
    doc.text(`Engine: ${engine.toUpperCase()}`, 20, 36);

    doc.setFontSize(12);
    doc.text('Original Transcript:', 20, 50);

    if (hasDevanagari(finalTranscript)) doc.setFont('NotoSansDevanagari', 'normal');
    else doc.setFont('NotoSans', 'normal');

    const transcriptLines = doc.splitTextToSize(finalTranscript, 170);
    doc.text(transcriptLines, 20, 56);

    if (finalTranslation) {
      let yPos = 56 + (transcriptLines.length * 7) + 10;
      doc.setFont('NotoSans', 'normal');
      doc.text('Translation:', 20, yPos);
      if (hasDevanagari(finalTranslation)) doc.setFont('NotoSansDevanagari', 'normal');
      else doc.setFont('NotoSans', 'normal');
      const translationLines = doc.splitTextToSize(finalTranslation, 170);
      doc.text(translationLines, 20, yPos + 6);
    }
    doc.save(`transcript_${Date.now()}.pdf`);
  };

  const handleClear = () => {
    if (confirm('Clear everything and reset workflow?')) {
      clearTranscript();
      setTranslation(null);
      setEditedTranscript('');
      setEditedTranslation('');
      setSessionId(null);
      setSaveStatus('idle');
      setWorkflowStep('transcribe');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'INPUT' &&
        workflowStep === 'transcribe' &&
        mode === 'record') {
        e.preventDefault();
        toggleRecording(engine, sourceLang);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleRecording, engine, sourceLang, workflowStep, mode]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-4">
      {/* Sticky Workflow Header */}
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl p-2 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 sticky top-2 z-20 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-1 px-2">
          {/* Left Spacer to balance centering of buttons */}
          <div className="hidden lg:flex flex-1" />

          <div className="flex flex-wrap items-center justify-center gap-1 flex-1 lg:flex-none">
            {[
              { id: 'transcribe', label: '1. Transcribe', icon: Mic },
              { id: 'edit-transcript', label: '2. Edit', icon: Edit3 },
              { id: 'translate', label: '3. Translate', icon: Languages },
              { id: 'review', label: '4. Review & Export', icon: Globe }
            ].map((step) => {
              const Icon = step.icon;
              const isDisabled = (!transcript && !editedTranscript) && step.id !== 'transcribe';
              const isActive = workflowStep === step.id;

              return (
                <button
                  key={step.id}
                  onClick={() => !isDisabled && setWorkflowStep(step.id as any)}
                  disabled={isDisabled}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${isActive
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-md border border-gray-100 dark:border-gray-700 scale-105'
                    : isDisabled
                      ? 'text-gray-400 cursor-not-allowed bg-gray-50/30 dark:bg-gray-800/20'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                >
                  {isDisabled ? <Lock size={12} className="opacity-60" /> : <Icon size={14} />}
                  {step.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 flex-1">
            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all animate-in fade-in slide-in-from-right-2 duration-300 ${saveStatus === 'saved' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800/50' :
                saveStatus === 'syncing' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50' :
                  'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50'}`}>
                {saveStatus === 'syncing' ? <Loader2 size={12} className="animate-spin" /> : saveStatus === 'saved' ? <Save size={12} /> : null}
                {saveStatus === 'syncing' ? 'SYNCING...' : saveStatus === 'saved' ? 'ALL SAVED' : 'SAVE ERROR'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col min-h-[500px] relative z-10 transition-colors">
        <div className="flex-1 flex flex-col">
          {workflowStep === 'transcribe' && (
            <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-8 animate-in fade-in duration-300">
              <div className="space-y-6">
                <div className="space-y-4 bg-gray-50/50 dark:bg-gray-800/30 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Input Mode</label>
                    <div className="flex bg-white dark:bg-gray-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                      <button onClick={() => setMode('record')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${mode === 'record' ? 'bg-gray-900 dark:bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>RECORD</button>
                      <button onClick={() => setMode('upload')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${mode === 'upload' ? 'bg-gray-900 dark:bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>UPLOAD</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Language</label>
                    <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 outline-none focus:border-blue-200">
                      {SUPPORTED_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Engine</label>
                    <div className="flex flex-col gap-2">
                      {engineList.map((eng) => (
                        <button
                          key={eng.id}
                          onClick={() => setEngine(eng.id as EngineType)}
                          className={`w-full px-4 py-3 rounded-xl text-[10px] font-black transition-all text-left border-2 uppercase tracking-widest ${engine === eng.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                            : 'border-transparent bg-gray-50 dark:bg-gray-800/50 text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                            }`}
                        >
                          {eng.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 flex flex-col min-h-0">
                {mode === 'record' ? (
                  <div className="flex items-center gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20 shadow-sm shrink-0">
                    <div className={`p-3 rounded-full shrink-0 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white'}`}>
                      <Mic size={20} />
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1">
                        <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 tracking-tight">{isRecording ? 'Listening...' : isProcessing ? 'Processing...' : 'Voice Recognition'}</h3>
                        <p className="text-[8px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-tighter opacity-60">{engine === 'native' ? 'WEB SPEECH API' : `${engine.toUpperCase()} CLOUD`}</p>
                      </div>
                      <div className="flex items-center gap-3 bg-gray-900 dark:bg-gray-800 text-white px-4 py-2 rounded-xl shadow-lg">
                        <div className="flex items-center gap-2">
                          {isRecording ? <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> : <div className="w-2 h-2 bg-gray-600 rounded-full" />}
                          <span className="text-sm font-mono font-black tracking-tight text-white">{formatDuration(durationMs)}</span>
                        </div>
                      </div>
                      <button onClick={() => toggleRecording(engine, sourceLang)} disabled={isProcessing} className={`px-8 py-2.5 rounded-xl font-black text-xs transition-all shrink-0 ${isRecording ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'}`}>
                        {isRecording ? 'STOP' : 'START'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-gray-50/50 dark:bg-gray-800/20 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 shrink-0">
                    <FileUploader onFileSelect={(file) => processAudio(file)} disabled={isProcessing} />
                  </div>
                )}
                <div className="space-y-3 flex-1 flex flex-col min-h-0">
                  <div className="flex justify-between items-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm py-1 px-2 rounded-lg border border-gray-100/50 dark:border-gray-800 shrink-0">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Output Buffer</label>
                    {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                  </div>
                  <div className="p-6 bg-gray-50/30 dark:bg-gray-800/10 rounded-2xl border border-gray-100 dark:border-gray-800 flex-1 overflow-y-auto shadow-inner min-h-[150px] transition-colors">
                    {transcript ? (
                      <p className="text-gray-800 dark:text-gray-200 leading-relaxed font-medium text-base">{transcript}</p>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10 opacity-30">
                        <Mic size={32} className="mb-3" />
                        <p className="italic font-bold uppercase tracking-widest text-[10px]">Ready for voice input</p>
                      </div>
                    )}
                  </div>
                  {(transcript || editedTranscript) && !isRecording && (
                    <button
                      onClick={() => {
                        // Always ensure current transcript is in the editor if editor is empty or if we've got fresh transcript
                        if (!editedTranscript || confirm('Update editor with fresh transcription? This will overwrite your current edits.')) {
                          setEditedTranscript(transcript);
                        }
                        setWorkflowStep('edit-transcript');
                      }}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-xl active:scale-[0.98] mt-2 uppercase tracking-widest shrink-0"
                    >
                      Next: Start Editing →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {workflowStep === 'edit-transcript' && (
            <div className="flex-1 flex flex-col space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stage 2: Editorial Review (MANUALLY REFINE THE TRANSCRIPTION SIDE-BY-SIDE WITH SOURCE)</label>
                </div>
                <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-black rounded-lg border border-amber-100 dark:border-amber-800/50">DRAFTING</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                <div className="flex flex-col space-y-3">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest opacity-60">Raw Output (Reference)</label>
                  <div className="flex-1 p-6 bg-gray-50/50 dark:bg-gray-800/20 rounded-2xl border border-gray-100 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400 font-medium overflow-y-auto max-h-[400px] leading-relaxed italic">
                    {transcript}
                  </div>
                </div>
                <div className="flex flex-col space-y-3 relative">
                  <label className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Active Editor</label>
                  <textarea
                    ref={textareaRef}
                    value={editedTranscript}
                    onClick={handleEditorInteraction}
                    onKeyUp={handleEditorInteraction}
                    onChange={(e) => { setEditedTranscript(e.target.value); setShowFloatingMic(false); }}
                    className="flex-1 w-full min-h-[400px] p-8 bg-white dark:bg-gray-800/50 rounded-3xl border-2 border-blue-50 dark:border-blue-900/20 text-gray-800 dark:text-gray-100 leading-relaxed font-medium text-lg outline-none focus:border-blue-400 transition-all resize-none shadow-sm"
                    placeholder="Start typing to correct the transcript..."
                  />
                  {showFloatingMic && (
                    <button
                      onClick={() => editorRecorder.toggleRecording('native', sourceLang)}
                      style={{ left: `${floatingMicPos.x}px`, top: `${floatingMicPos.y}px` }}
                      className={`absolute z-10 p-2 rounded-full transition-all shadow-xl flex items-center gap-2 ${editorRecorder.isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      <Mic size={14} />
                      {editorRecorder.isRecording && <span className="text-[8px] font-black pr-1">REC</span>}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setWorkflowStep('transcribe')} className="px-8 py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all uppercase tracking-widest">← BACK</button>
                <button onClick={() => setWorkflowStep('translate')} className="flex-1 py-4 bg-gray-900 dark:bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-black transition-all shadow-2xl active:scale-[0.98] uppercase tracking-widest">PROCEED TO TRANSLATION →</button>
              </div>
            </div>
          )}

          {workflowStep === 'translate' && (
            <div className="flex-1 flex flex-col space-y-8 animate-in zoom-in-95 duration-500">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stage 3: AI Translation Hub (PREPARE AND START MULTILINGUAL CONVERSION)</label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest opacity-60">Source Input (Refined)</label>
                  <div className="p-6 bg-white dark:bg-gray-800/50 rounded-3xl border border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 leading-relaxed italic shadow-sm max-h-[300px] overflow-y-auto">
                    "{editedTranscript}"
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-gray-50/80 dark:bg-gray-800/30 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Translation Engine</label>
                      <div className="flex bg-white dark:bg-gray-900 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                        <button onClick={() => setTranslationEngine('nllb')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${translationEngine === 'nllb' ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Meta NLLB</button>
                        <button onClick={() => setTranslationEngine('sarvam')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${translationEngine === 'sarvam' ? 'bg-orange-600 dark:bg-orange-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Sarvam AI</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Source</label>
                        <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200">
                          {SUPPORTED_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Target</label>
                        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-blue-100 dark:border-blue-900 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-900 dark:text-white">
                          {TARGET_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <button onClick={handleTranslate} disabled={isTranslating} className="w-full py-5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest">
                      {isTranslating ? <Loader2 size={24} className="animate-spin" /> : <Zap size={20} className="fill-current" />}
                      {isTranslating ? 'TRANSLATING...' : 'START AI TRANSLATION'}
                    </button>
                  </div>
                  {translation && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Translation Result</label>
                        <button onClick={() => { navigator.clipboard.writeText(translation); }} className="flex items-center gap-2 px-3 py-1 bg-white border border-gray-100 rounded-lg text-[10px] font-black text-gray-400 hover:text-blue-600 transition-all shadow-sm">
                          <Copy size={12} /> COPY
                        </button>
                      </div>
                      <div className="p-6 bg-blue-50/10 dark:bg-blue-900/10 border-2 border-blue-50 dark:border-blue-900/20 rounded-3xl text-gray-800 dark:text-gray-100 leading-relaxed font-bold text-lg min-h-[150px] transition-colors">{translation}</div>
                      <button onClick={() => setWorkflowStep('review')} className="w-full py-4 bg-gray-900 dark:bg-blue-600 text-white rounded-2xl font-black text-xs hover:bg-black transition-all shadow-2xl active:scale-[0.98] uppercase tracking-widest mt-2">PROCEED TO REVIEW & SAVE →</button>
                    </div>
                  )}
                  {!translation && (
                    <button onClick={() => setWorkflowStep('edit-transcript')} className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all uppercase tracking-widest">← EDIT SOURCE</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {workflowStep === 'review' && (
            <div className="flex-1 flex flex-col space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-400">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stage 4: Final Quality Check (SIDE-BY-SIDE COMPARISON & POLISHING)</label>
                </div>
                <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-[10px] font-black rounded-lg border border-green-100 dark:border-green-800/50 uppercase tracking-widest">REVIEW READY</span>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1">
                <div className="flex flex-col space-y-3">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest opacity-60">Source Transcript</label>
                  <div className="flex-1 p-8 bg-gray-50/50 dark:bg-gray-800/20 rounded-3xl border border-gray-100 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400 font-medium overflow-y-auto max-h-[400px] leading-relaxed transition-colors">{editedTranscript}</div>
                </div>
                <div className="flex flex-col space-y-3">
                  <label className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">AI Translation (Final Edit)</label>
                  <textarea value={editedTranslation} onChange={(e) => setEditedTranslation(e.target.value)} className="flex-1 w-full min-h-[400px] p-8 bg-blue-50/10 dark:bg-blue-900/10 rounded-3xl border-2 border-blue-100 dark:border-blue-900/40 text-gray-800 dark:text-gray-100 leading-relaxed font-bold text-lg outline-none focus:border-blue-400 transition-all resize-none shadow-sm transition-colors" />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-50 dark:border-gray-800">
                <button onClick={() => setWorkflowStep('translate')} className="px-8 py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all uppercase tracking-widest">← RE-TRANSLATE</button>
                <div className="flex-1" />
                <button onClick={handleClear} className="px-8 py-4 bg-gray-900 dark:bg-blue-600 text-white rounded-2xl font-black text-xs hover:bg-black transition-all uppercase tracking-widest whitespace-nowrap">EXPORT AND START NEW SESSION</button>
              </div>
            </div>
          )}
        </div>

        {/* Global Bottom Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 pt-8 border-t border-gray-100 dark:border-gray-800">
          <button onClick={downloadPDF} disabled={(!transcript && !editedTranscript)} className="flex items-center justify-center gap-3 py-4 bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl font-black text-[10px] hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all uppercase tracking-widest shadow-sm">
            <Download size={16} /> EXPORT AS PDF
          </button>
          <button onClick={handleClear} className="flex items-center justify-center gap-3 py-4 bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 text-red-500 rounded-2xl font-black text-[10px] hover:border-red-100 hover:bg-red-50 transition-all uppercase tracking-widest shadow-sm">
            <Trash2 size={16} /> START NEW SESSION
          </button>
        </div>
      </div>
    </div>
  );
}
