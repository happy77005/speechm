import React, { useRef, useState } from 'react';
import { Upload, X, FileAudio, FileVideo } from 'lucide-react';

interface FileUploaderProps {
    onFileSelect: (file: File) => void;
    disabled: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, disabled }) => {
    const [dragActive, setDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFiles(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFiles(e.target.files[0]);
        }
    };

    const handleFiles = (file: File) => {
        const validExtensions = ['.mp3', '.mp4', '.wav', '.flac', '.m4a', '.webm', '.mkv', '.mov', '.avi'];
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();

        if (validExtensions.includes(ext)) {
            setSelectedFile(file);
            onFileSelect(file);
        } else {
            alert("Invalid file type. Please upload an audio or video file.");
        }
    };

    const clearFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const isVideo = selectedFile?.type.startsWith('video/') || selectedFile?.name.endsWith('.mkv') || selectedFile?.name.endsWith('.avi');

    return (
        <div className="w-full max-w-sm">
            <div
                className={`relative p-4 border-2 border-dashed rounded-xl transition-all ${dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !disabled && inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept=".mp3,.mp4,.wav,.flac,.m4a,.webm,.mkv,.mov,.avi"
                    onChange={handleChange}
                    disabled={disabled}
                />

                <div className="flex flex-col items-center justify-center gap-2">
                    {selectedFile ? (
                        <div className="flex items-center gap-3 w-full">
                            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400">
                                {isVideo ? <FileVideo size={18} /> : <FileAudio size={18} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{selectedFile.name}</p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                            </div>
                            <button
                                onClick={clearFile}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
                                title="Clear"
                            >
                                <X size={14} className="text-gray-500 dark:text-gray-400" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 py-1">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-500 dark:text-blue-400">
                                <Upload size={18} />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Drop or click to upload</p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">Audio/Video up to 25MB</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
