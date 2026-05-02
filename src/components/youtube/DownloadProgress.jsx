import React from 'react';
import { Loader2 } from 'lucide-react';

export default function DownloadProgress({ item }) {
  if (item.status !== "downloading") return null;

  return (
    <div className="px-4 pb-4">
      <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-widest">
        <span className="flex items-center gap-2">
          <Loader2 size={12} className="animate-spin text-zinc-900 dark:text-white" />
          {item.stage || 'Downloading...'}
        </span>
        <span>{item.progress || 0}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/60 dark:bg-zinc-800 overflow-hidden border border-zinc-200/50 dark:border-zinc-700/50 relative">
        <div className="absolute inset-y-0 left-0 bg-zinc-900 dark:bg-white transition-all duration-300 overflow-hidden"
          style={{ width: `${item.progress || 0}%` }}>
          <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[progress-stripes_1s_linear_infinite]" />
        </div>
      </div>
    </div>
  );
}

