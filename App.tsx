import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Plus, BarChart3, Database, MessageSquare, ArrowLeft, Save, Upload, Info, Tag, Lock, X, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { ChatMessage } from './components/ChatMessage';
import { UploadedFile, Message, FileType, FileCategory } from './types';
import { streamResponse } from './services/geminiService';
import { db } from './services/db';

type ViewState = 'chat' | 'upload';

const CATEGORIES: FileCategory[] = [
  'Finanças',
  'Educação',
  'Desenvolvimento Social',
  'Infraestrutura',
  'Planejamento',
  'Esporte cultura e lazer',
  'Saúde',
  'Gabinete',
  'Agricultura',
  'Geral'
];

const ACCESS_PASSWORD = "iVYU-/m69hZjoTGqobWx";

function App() {
  const [view, setView] = useState<ViewState>('chat');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');

  // --- Upload Form State ---
  const [pendingFile, setPendingFile] = useState<UploadedFile | null>(null);
  const [metadataForm, setMetadataForm] = useState<{
    description: string;
    source: string;
    period: string;
    caseName: string;
    category: FileCategory;
  }>({
    description: '',
    source: '',
    period: '',
    caseName: '',
    category: 'Geral'
  });

  // Load initial data from Server
  useEffect(() => {
    const loadData = async () => {
      try {
        const loadedFiles = await db.getAllFiles();
        setFiles(loadedFiles);
        
        const welcomeMsg: Message = {
          id: 'welcome',
          role: 'model',
          text: 'Olá! Sou o **Gonçalinho**, seu especialista em indicadores.\n\nMeus dados são processados em nuvem para maior velocidade. Como posso ajudar?',
          timestamp: Date.now()
        };
        setMessages([welcomeMsg]);
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };
    loadData();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, view]);

  const handleDataViewClick = () => {
    if (isAuthenticated) {
      setView('upload');
    } else {
      setShowAuthModal(true);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authPassword === ACCESS_PASSWORD) {
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setAuthPassword('');
      setView('upload');
    } else {
      alert("Senha incorreta!");
    }
  };

  const handleFileSelected = (newFiles: UploadedFile[]) => {
    if (newFiles.length > 0) {
      setPendingFile(newFiles[0]); // Only take the first one for metadata entry
      setMetadataForm({
        description: '',
        source: '',
        period: '',
        caseName: '',
        category: 'Geral'
      });
    }
  };

  const savePendingFile = async () => {
    if (!pendingFile || !pendingFile.fileObj) return;

    setIsUploading(true);
    try {
      // Upload actual file to server
      const savedFile = await db.uploadFile(pendingFile.fileObj, metadataForm);
      
      setFiles(prev => [...prev, savedFile]);
      setPendingFile(null); 
    } catch (error) {
      console.error("Failed to save file:", error);
      alert("Erro ao enviar arquivo para o servidor.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = async (id: string) => {
    try {
      await db.deleteFile(id);
      setFiles(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  // --- STREAMING CHAT ---
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: inputValue,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);
    
    // Create placeholder for model response
    const loadingId = crypto.randomUUID();
    const loadingMsg: Message = {
      id: loadingId,
      role: 'model',
      text: '', // Starts empty
      isLoading: true,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, loadingMsg]);

    try {
      // Call streaming service
      const historyForAI = [...messages, userMsg];
      
      let accumulatedText = "";

      const result = await streamResponse(historyForAI, userMsg.text, (chunk) => {
        accumulatedText += chunk;
        
        // Update UI with current text chunk
        setMessages(prev => prev.map(m => {
          if (m.id === loadingId) {
            return { ...m, text: accumulatedText, isLoading: false }; // Turn off loading as soon as first token arrives
          }
          return m;
        }));
      });
      
      // Final update with charts if present
      setMessages(prev => prev.map(m => {
        if (m.id === loadingId) {
          return { 
            ...m, 
            text: result.text, 
            chartData: result.chartData, 
            isLoading: false 
          };
        }
        return m;
      }));

    } catch (error) {
       const errorMsg: Message = {
        id: loadingId,
        role: 'model',
        text: "⚠️ Erro na comunicação com o servidor.",
        timestamp: Date.now()
      };
      setMessages(prev => prev.map(m => m.id === loadingId ? errorMsg : m));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getFileIcon = (type: FileType) => {
    // ... same as before
    switch (type) {
      case FileType.CSV:
      case FileType.XLSX: return <BarChart3 size={18} className="text-emerald-500" />;
      case FileType.DOCX:
      case FileType.TXT:
      case FileType.PDF: return <Loader2 size={18} className="text-sky-500" />;
      default: return <Database size={18} className="text-slate-400" />;
    }
  };

  const getCategoryColor = (cat: FileCategory) => {
     // ... same as before
    switch(cat) {
        case 'Saúde': return 'text-red-400 bg-red-400/10 border-red-400/20';
        case 'Finanças': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        case 'Educação': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        case 'Infraestrutura': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        case 'Agricultura': return 'text-lime-400 bg-lime-400/10 border-lime-400/20';
        default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden text-slate-100 font-sans">
      
      {/* Top Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-6 shrink-0 relative z-10 shadow-md">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 flex items-center justify-center">
            <img src="/brasao.png" alt="Brasão" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
          </div>
          <h1 className="font-bold text-xl tracking-tight text-white">Gonçalinho</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setView('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm ${view === 'chat' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <MessageSquare size={16} /> <span className="hidden md:inline">Conversa</span>
          </button>
          
          <button 
            onClick={handleDataViewClick}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm ${view === 'upload' ? 'bg-sky-600/20 text-sky-400 border border-sky-600/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            {isAuthenticated ? <Database size={16} /> : <Lock size={16} />}
            <span className="hidden md:inline">Dados</span>
            {files.length > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm animate-pulse"></span>}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* --- CHAT VIEW --- */}
        <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ${view === 'chat' ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth pb-8">
            <div className="max-w-4xl mx-auto">
              {files.length === 0 && messages.length < 2 && (
                <div className="mt-8 mb-8 p-8 bg-slate-900/50 border border-slate-800 rounded-2xl text-center">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Database className="w-8 h-8 text-slate-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-200">Bem-vindo ao Gonçalinho!</h3>
                  <p className="text-slate-400 mt-2 mb-6 max-w-md mx-auto">
                    Centralize e analise seus dados. Carregue seus arquivos para começar.
                  </p>
                  <button onClick={handleDataViewClick} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium inline-flex items-center gap-2 transition-all">
                    <Upload size={18} /> Carregar Arquivos
                  </button>
                </div>
              )}
              {messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="p-4 bg-slate-950 border-t border-slate-800">
            <div className="max-w-4xl mx-auto relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={files.length === 0 ? "Adicione arquivos para começar..." : "Pergunte sobre os indicadores..."}
                disabled={files.length === 0}
                className="w-full bg-slate-900 text-slate-200 placeholder-slate-500 rounded-2xl border border-slate-700 p-4 pr-14 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none h-14 min-h-[56px] max-h-40 shadow-xl disabled:opacity-50 transition-all"
                rows={1}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isProcessing || files.length === 0}
                className={`absolute right-2 top-2 p-2.5 rounded-xl transition-all ${inputValue.trim() && !isProcessing ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
              >
                <Send size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between px-2 mt-2">
               <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <Info size={10} /> <span>IA sujeita a erros. Verifique os dados.</span>
               </div>
               <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border border-emerald-900 bg-emerald-950/50 text-emerald-500">
                  <Cloud size={10} /> <span className="font-semibold">Servidor Conectado</span>
               </div>
            </div>
          </div>
        </div>

        {/* --- UPLOAD VIEW --- */}
        <div className={`absolute inset-0 bg-slate-950 overflow-y-auto transition-transform duration-300 ${view === 'upload' ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="max-w-5xl mx-auto p-6 md:p-10">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Central de Dados</h2>
                <p className="text-slate-400">Arquivos são processados e armazenados no servidor.</p>
              </div>
              <button onClick={() => setView('chat')} className="text-sm font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-emerald-950/30 transition-colors">
                <ArrowLeft size={16} /> Voltar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                  <h3 className="text-lg font-semibold mb-5 flex items-center gap-2 text-slate-200">
                    <div className="p-1.5 bg-sky-500/10 rounded-lg"><Plus className="text-sky-400" size={18} /></div>
                    Novo Arquivo
                  </h3>
                  
                  {!pendingFile ? (
                    <FileUploader onFilesAdded={handleFileSelected} isProcessing={false} />
                  ) : (
                    <div className="animate-in fade-in zoom-in duration-300">
                      <div className="flex items-center gap-3 p-4 bg-slate-800 rounded-xl mb-6 border border-slate-700/50">
                        <div className="p-2 bg-slate-700/50 rounded-lg">{getFileIcon(pendingFile.type)}</div>
                        <div className="overflow-hidden">
                          <p className="font-medium text-slate-200 truncate">{pendingFile.name}</p>
                        </div>
                        <button onClick={() => setPendingFile(null)} className="ml-auto p-2 text-slate-500 hover:text-red-400 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="space-y-5">
                        
                        <div>
                          <label className="block text-xs font-semibold text-sky-400 mb-1.5 uppercase tracking-wider flex items-center gap-1"><Tag size={12} /> Categoria</label>
                          <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:border-sky-500 outline-none text-slate-200" value={metadataForm.category} onChange={e => setMetadataForm({...metadataForm, category: e.target.value as FileCategory})}>
                            {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-amber-400 mb-1.5 uppercase tracking-wider">Indicador</label>
                                <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm outline-none placeholder-slate-600" placeholder="Ex: PIB" value={metadataForm.caseName} onChange={e => setMetadataForm({...metadataForm, caseName: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Período</label>
                                <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm outline-none placeholder-slate-600" placeholder="Ex: 2023" value={metadataForm.period} onChange={e => setMetadataForm({...metadataForm, period: e.target.value})} />
                            </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Descrição</label>
                          <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:border-sky-500 outline-none placeholder-slate-600" placeholder="Ex: Tabela de casos 2024" value={metadataForm.description} onChange={e => setMetadataForm({...metadataForm, description: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Fonte de Dados</label>
                            <input type="text" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:border-sky-500 outline-none placeholder-slate-600" placeholder="Ex: IBGE, Secretaria de Saúde..." value={metadataForm.source} onChange={e => setMetadataForm({...metadataForm, source: e.target.value})} />
                        </div>

                        <button 
                          onClick={savePendingFile}
                          disabled={!metadataForm.description || !metadataForm.caseName || isUploading}
                          className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                        >
                          {isUploading ? <Loader2 size={18} className="animate-spin"/> : <Save size={18} />}
                          {isUploading ? "Processando no Servidor..." : "Salvar Arquivo"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: List */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2 px-1">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg"><Database className="text-emerald-400" size={18} /></div>
                  Arquivos na Nuvem ({files.length})
                </h3>
                
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {files.map(file => (
                    <div key={file.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all group shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-800 rounded-lg">{getFileIcon(file.type)}</div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-slate-200 block">{file.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getCategoryColor(file.category)}`}>{file.category}</span>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">{file.caseName}</span>
                          </div>
                        </div>
                        <button onClick={() => removeFile(file.id)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                          <div><span className="text-slate-500 font-medium">Período:</span> {file.period}</div>
                          <div><span className="text-slate-500 font-medium">Fonte:</span> {file.source || '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Auth Modal */}
        {showAuthModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl"><Lock className="w-6 h-6 text-emerald-500" /></div>
                  <div><h3 className="text-xl font-bold text-white">Acesso Restrito</h3></div>
                </div>
                <button onClick={() => setShowAuthModal(false)} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800"><X size={20} /></button>
              </div>
              <form onSubmit={handleAuthSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
                  <input type="password" autoFocus value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:border-emerald-500 outline-none" />
                </div>
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl shadow-lg">Acessar Dados</button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
