import { useState, useEffect } from 'react';
import { Copy, Download, Trash2, Check, Clock, Search, FileText } from 'lucide-react';
import { SavedTranscription, getAllTranscriptions, deleteTranscription } from '../lib/db';
import { exportToPDF } from '../services/api';

interface SavedTranscriptionsProps {
  refreshTrigger?: number;
}

export function SavedTranscriptions({ refreshTrigger }: SavedTranscriptionsProps) {
  const [transcriptions, setTranscriptions] = useState<SavedTranscription[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadTranscriptions = async () => {
    const data = await getAllTranscriptions();
    setTranscriptions(data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  };

  useEffect(() => {
    loadTranscriptions();
  }, [refreshTrigger]);

  const handleCopy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      alert('Failed to copy');
    }
  };

  const handleDownloadPDF = async (transcription: SavedTranscription) => {
    try {
      const filename = `${transcription.name.replace(/\s+/g, '_')}.pdf`;
      
      // Simple heuristic for language detection to choose the right font
      let lang = 'en';
      if (/[\u0c00-\u0c7f]/.test(transcription.text)) lang = 'te_Telu';
      else if (/[\u0900-\u097f]/.test(transcription.text)) lang = 'hi_Deva';
      else if (/[\u0b80-\u0bff]/.test(transcription.text)) lang = 'ta_Taml';
      else if (/[\u0c80-\u0cff]/.test(transcription.text)) lang = 'kn_Knda';
      else if (/[\u0d00-\u0d7f]/.test(transcription.text)) lang = 'ml_Mlym';

      await exportToPDF(
        transcription.text,
        null, // No separate translation field in DB currently
        lang,
        null,
        filename
      );
    } catch (err) {
      console.error('PDF Export failed:', err);
      alert('Failed to export PDF');
    }
  };

  const handleDownloadJSON = (transcription: SavedTranscription) => {
    const data = {
      transcript_date: transcription.createdAt.toISOString(),
      original: transcription.original || "",
      refined_original: transcription.refined_original || transcription.text || "",
      translate: transcription.translate || "",
      refined_translate: transcription.refined_translate || transcription.translate || ""
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${transcription.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this transcription forever?')) {
      await deleteTranscription(id);
      loadTranscriptions();
    }
  };

  const filtered = transcriptions.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
        <div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Saved History</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Browse and export your previous sessions</p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search saved text..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 outline-none focus:border-blue-200 dark:focus:border-blue-800 transition-all shadow-sm transition-colors"
          />
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl p-20 text-center space-y-4 transition-colors">
          <div className="bg-gray-50 dark:bg-gray-800 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-gray-300 dark:text-gray-600">
            <FileText size={32} />
          </div>
          <div className="max-w-xs mx-auto">
            <h3 className="text-lg font-black text-gray-900 dark:text-white">No sessions found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{searchTerm ? 'Try a different search term' : 'Go record something to see it here!'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col h-[320px]">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-xl text-blue-600 dark:text-blue-400">
                  <Clock size={18} />
                </div>
                <button
                  onClick={() => handleDelete(item.id!)}
                  className="p-2 text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-hidden">
                <h3 className="text-lg font-black text-gray-900 dark:text-white line-clamp-1">{item.name}</h3>
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{item.wordCount || 0} words</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 h-32 overflow-hidden relative transition-colors">
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium line-clamp-5 whitespace-pre-wrap">
                    {item.text}
                  </p>
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-50 dark:from-gray-800/10 to-transparent" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-6">
                <button
                  onClick={() => handleCopy(item.id!, item.text)}
                  className={`flex items-center justify-center gap-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${copiedId === item.id ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                  {copiedId === item.id ? 'DONE' : 'COPY'}
                </button>
                <button
                  onClick={() => handleDownloadPDF(item)}
                  className="flex items-center justify-center gap-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  <Download size={14} /> PDF
                </button>
                <button
                  onClick={() => handleDownloadJSON(item)}
                  className="flex items-center justify-center gap-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all font-mono"
                >
                  <FileText size={14} /> JSON
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
