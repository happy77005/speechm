import { useState } from 'react';
import { History, Mic2, Sparkles, Settings, Moon, Sun, X } from 'lucide-react';
import { useServerStatus } from '../hooks/useServerStatus';

interface TopBarProps {
    currentView: 'dictation' | 'live' | 'live-translation' | 'history';
    onViewChange: (view: 'dictation' | 'live' | 'live-translation' | 'history') => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

export function TopBar({ currentView, onViewChange, isDarkMode, toggleDarkMode }: TopBarProps) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { status: serverStatus } = useServerStatus();

    return (
        <nav className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 shadow-sm transition-colors duration-300">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                {/* Branding */}
                <div
                    className="flex items-center gap-2 cursor-pointer group"
                    onClick={() => onViewChange('dictation')}
                >
                    <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-100 dark:shadow-blue-900/20 group-hover:scale-110 transition-transform">
                        <Sparkles size={18} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-gray-900 dark:text-white tracking-tight">SpeechM</span>
                            
                            {/* Server Status LED */}
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                    serverStatus === 'ready' ? 'bg-green-500' : 
                                    serverStatus === 'warming-up' ? 'bg-amber-500' : 'bg-gray-400'
                                }`} />
                                <span className={`text-[8px] font-black uppercase tracking-widest ${
                                    serverStatus === 'ready' ? 'text-green-600 dark:text-green-400' : 
                                    serverStatus === 'warming-up' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'
                                }`}>
                                    Server: {serverStatus === 'ready' ? 'Running' : serverStatus === 'warming-up' ? 'Sleeping...' : 'Offline'}
                                </span>
                            </div>
                        </div>
                        <span className="text-[10px] block font-bold text-gray-400 dark:text-gray-500 -mt-1 uppercase tracking-tighter">v1.0 Pro</span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                    <button
                        onClick={() => onViewChange('dictation')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'dictation'
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                            }`}
                    >
                        <Mic2 size={14} />
                        Dictation
                    </button>
                    <button
                        onClick={() => onViewChange('live')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'live'
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                            }`}
                    >
                        <Mic2 size={14} />
                        Live Speech
                    </button>
                    <button
                        onClick={() => onViewChange('live-translation')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'live-translation'
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                            }`}
                    >
                        <Sparkles size={14} />
                        Live Translation
                    </button>
                    <button
                        onClick={() => onViewChange('history')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'history'
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
                            }`}
                    >
                        <History size={14} />
                        Saved scripts
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className={`p-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 ${isSettingsOpen
                            ? 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400'
                            : 'bg-white border-gray-100 text-gray-500 hover:text-gray-900 hover:border-gray-200 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:text-white'
                            }`}
                    >
                        <Settings size={20} className={isSettingsOpen ? 'animate-spin-slow' : ''} />
                    </button>

                    {/* Settings Dropdown/Popover */}
                    {isSettingsOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-40 bg-transparent"
                                onClick={() => setIsSettingsOpen(false)}
                            />
                            <div className="absolute top-[70px] right-4 w-72 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-2xl z-50 p-6 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Settings</h3>
                                    <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    {/* Dark Mode Toggle */}
                                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 shadow-sm'}`}>
                                                {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-900 dark:text-white">Appearance</p>
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={toggleDarkMode}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isDarkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}
                                            />
                                        </button>
                                    </div>

                                    {/* Other settings can go here */}
                                    <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20">
                                        <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">Account</p>
                                        <p className="text-[11px] font-medium text-blue-800 dark:text-blue-300">Basic Plan User</p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
