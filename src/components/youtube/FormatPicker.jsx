import React from 'react';
import { Film, Music } from 'lucide-react';
import { Button } from '../ui';

export default function FormatPicker({ item, onUpdate }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Quality</p>
        <select 
          className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
          value={item.quality}
          onChange={(e) => {
            const q = e.target.value;
            onUpdate(item.id, { 
              quality: q, 
              format: q === 'audio' ? 'mp3' : (item.format === 'mp3' ? 'mp4' : item.format) 
            });
          }}
          disabled={item.status === "downloading"}
        >
          <option value="best">Best Video</option>
          {item.qualities?.filter(q => !q.label.includes('audio')).map(q => (
            <option key={q.label} value={q.label}>{q.label} {q.fps ? `(${q.fps}fps)` : ''}</option>
          ))}
          <option value="audio">Audio Only</option>
        </select>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Format container</p>
        <div className="flex gap-2">
          {["mp4","webm","mp3"].map(f => (
            <Button key={f} size="sm" className="flex-1"
              variant={item.format === f ? "primary" : "outline"}
              onClick={() => onUpdate(item.id, { format: f })}
              disabled={item.quality === 'audio' && f !== 'mp3'}
            >
              {f === "mp3" && <Music size={12} className="mr-1"/>}
              {f !== "mp3" && <Film size={12} className="mr-1"/>}
              {f.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

