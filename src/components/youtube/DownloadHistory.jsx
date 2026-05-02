import React from 'react';
import { History } from 'lucide-react';
import { Card } from '../ui';
import { formatTime } from './youtubeUtils';

export default function DownloadHistory({ history, clearHistory }) {
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
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {history.map((h, i) => (
          <div key={h.id || i} className="flex flex-col gap-1 pb-3 border-b border-zinc-200/50 dark:border-zinc-700/50 last:border-0 last:pb-0">
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{h.title}</p>
            <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
               <span>{new Date(h.date).toLocaleDateString()}</span>
               <span>{h.quality} • {h.format?.toUpperCase()} • {formatTime(h.length)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

