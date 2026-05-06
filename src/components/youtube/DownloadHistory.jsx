import React, { useState } from 'react';
import { History, Download, ExternalLink, Video } from 'lucide-react';
import { Card } from '../ui';
import { formatTime } from './youtubeUtils';

export default function DownloadHistory({ history, clearHistory, onReDownload }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!history || history.length === 0) return null;

  return (
    <Card className="p-5 bg-white/50 dark:bg-zinc-800/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-zinc-500">
          <History size={16} />
          <h3 className="font-bold text-[10px] uppercase tracking-widest">Recent Downloads</h3>
        </div>
        <button onClick={clearHistory} className="text-[10px] text-zinc-400 hover:text-red-500 uppercase font-bold tracking-widest">
          Clear
        </button>
      </div>
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {history.map((h, i) => {
          const isExpanded = expandedId === (h.id || i);
          return (
            <div key={h.id || i} className="flex flex-col gap-2 pb-3 border-b border-zinc-200/50 dark:border-zinc-700/50 last:border-0 last:pb-0">
              
              <div 
                className="flex gap-3 items-start cursor-pointer group"
                onClick={() => setExpandedId(isExpanded ? null : (h.id || i))}
              >
                {/* Thumbnail / Video Wrapper */}
                <div className="relative w-16 h-10 md:w-20 md:h-12 shrink-0 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                  {h.thumbnail ? (
                    <img src={h.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-zinc-400">
                      <Video size={14} />
                    </div>
                  )}
                  {h.length > 0 && (
                    <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[8px] font-bold px-1 rounded-sm pointer-events-none">
                      {formatTime(h.length)}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors" title={h.title}>{h.title}</p>
                  <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 mt-1">
                     <span>{new Date(h.date).toLocaleDateString()}</span>
                     <span>{h.quality} • {h.format?.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Expanded actions */}
              {isExpanded && h.url && (
                <div className="flex gap-2 mt-1 animate-studio-rise">
                  <button 
                    onClick={() => onReDownload(h.url)}
                    className="flex-1 py-1.5 px-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download size={12} /> Re-Download
                  </button>
                  <a 
                    href={h.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-1.5 px-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink size={12} /> Open Link
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

