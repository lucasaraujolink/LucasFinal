import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, Sparkles } from 'lucide-react';
import { Message } from '../types';
import { ChartRenderer } from './ChartRenderer';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div 
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-1 shadow-md
          ${isUser 
            ? 'bg-gradient-to-br from-blue-600 to-blue-700' 
            : 'bg-gradient-to-br from-emerald-600 to-teal-700'}`}
        >
          {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
        </div>

        {/* Bubble */}
        <div 
          className={`flex flex-col p-4 md:p-5 rounded-2xl text-sm leading-relaxed shadow-sm
          ${isUser 
            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-50 rounded-tr-none' 
            : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
          }`}
        >
          {message.isLoading ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <Sparkles size={16} className="animate-pulse" />
              <span className="animate-pulse font-medium">Gonçalinho está analisando...</span>
            </div>
          ) : (
            <>
              <div className="prose prose-invert prose-sm max-w-none break-words">
                <ReactMarkdown>{message.text}</ReactMarkdown>
              </div>
              
              {message.chartData && (
                <div className="mt-4">
                  <ChartRenderer data={message.chartData} />
                </div>
              )}
            </>
          )}
          
          <span className="text-[10px] opacity-40 mt-2 self-end font-medium">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};