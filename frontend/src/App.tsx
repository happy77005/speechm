import { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { DictationRecorder } from './components/DictationRecorder';
import { SavedTranscriptions } from './components/SavedTranscriptions';
import { LiveSpeechTracker } from './components/LiveSpeechTracker';
import { LiveTranslationTracker } from './components/LiveTranslationTracker';
import { ServerStatusBanner } from './components/ServerStatusBanner';

export default function App() {
  const [view, setView] = useState<'dictation' | 'live' | 'live-translation' | 'history'>('dictation');
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col transition-colors duration-300">
      <ServerStatusBanner />
      <TopBar
        currentView={view}
        onViewChange={setView}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />

      <main className="flex-1 pt-2 pb-8">
        <div className={view === 'dictation' ? "" : "hidden"}>
          <DictationRecorder
            onSave={() => setRefreshHistory(prev => prev + 1)}
          />
        </div>
        <div className={view === 'live' ? "" : "hidden"}>
          <LiveSpeechTracker />
        </div>
        <div className={view === 'live-translation' ? "" : "hidden"}>
          <LiveTranslationTracker />
        </div>
        <div className={view === 'history' ? "" : "hidden"}>
          <SavedTranscriptions refreshTrigger={refreshHistory} />
        </div>
      </main>
    </div>
  );
}
