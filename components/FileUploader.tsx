import React, { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { FileType, UploadedFile, FileCategory } from '../types';
import { detectFileType } from '../services/fileParser';
import { db } from '../services/db';

interface FileUploaderProps {
  onFilesAdded: (files: UploadedFile[]) => void;
  isProcessing: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAdded, isProcessing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // The UI flow expects files to be "Added" to a pending state in App.tsx 
  // before being "Saved" with metadata. 
  // To support the new backend flow, we will create a temporary object here
  // but the ACTUAL upload will happen when the user clicks "Save" in App.tsx.
  // OR, better for large files: We upload now to a temp ID, then update metadata.
  // Given existing UI structure, we will return the File object to App.tsx
  // and modify App.tsx to upload on save.
  
  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles: any[] = [];
    // We just pass the native File object up to App.tsx wrapped in our structure
    // App.tsx will handle the FormData POST
    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        newFiles.push({
            id: 'temp-' + crypto.randomUUID(),
            name: file.name,
            type: detectFileType(file.name),
            content: '', // No content on client
            timestamp: Date.now(),
            category: 'Geral',
            fileObj: file // Attach native file for upload
        });
    }
    onFilesAdded(newFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files) processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".csv,.xlsx,.xls,.docx,.txt,.json,.pdf"
        onChange={handleChange}
      />
      
      <div
        className={`relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out cursor-pointer group
          ${dragActive 
            ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
            : 'border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/50'
          }
          ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="p-4 bg-slate-800 rounded-full mb-4 group-hover:scale-110 transition-transform duration-200">
            <Upload className={`w-8 h-8 text-slate-400 group-hover:text-emerald-400 transition-colors`} />
        </div>
        <p className="mb-2 text-sm text-slate-300 font-medium text-center">
            <span className="font-bold text-emerald-400">Clique para selecionar</span> ou arraste
        </p>
        <p className="text-xs text-slate-500 text-center max-w-[200px]">
            Processamento via Server-Side (Rápido)
        </p>
      </div>
    </div>
  );
};