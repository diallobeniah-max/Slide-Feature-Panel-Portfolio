import React from 'react';
import { Film, Music } from 'lucide-react';
import { Button } from '../ui';
import ModernSelect from '../ui/ModernSelect';
import { formatBytes } from './youtubeUtils';

export default function FormatPicker({ item, onUpdate }) {
  const qualityOptions = [
    { value: "best", label: "Highest Available" },
    ...(item.qualities || [])
      .filter((q) => !q.label.includes("audio"))
      .map((q) => ({
        value: q.label,
        label: `${q.label}${q.fps ? ` (${q.fps}fps)` : ""}${q.filesize ? ` - ${formatBytes(q.filesize)}` : ""}`,
      })),
    { value: "audio", label: `Audio Only${item.audioSize ? ` - ${formatBytes(item.audioSize)}` : ""}` },
  ];
  const expectedFormat = item.quality === "audio" ? "MP3 audio" : `${item.format.toUpperCase()} video`;
  const isLocked = item.status === "downloading" || item.status === "paused";

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Quality</p>
        <ModernSelect
          ariaLabel="Video quality"
          value={item.quality}
          options={qualityOptions}
          disabled={isLocked}
          onChange={(q) => {
            onUpdate(item.id, { 
              quality: q, 
              format: q === 'audio' ? 'mp3' : (item.format === 'mp3' ? 'mp4' : item.format) 
            });
          }}
        />
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Format container</p>
        <div className="flex gap-2">
          {["mp4","webm","mp3"].map(f => (
            <Button key={f} size="sm" className="flex-1"
              variant={item.format === f ? "primary" : "outline"}
              onClick={() => onUpdate(item.id, { format: f })}
              disabled={isLocked || (item.quality === 'audio' && f !== 'mp3')}
            >
              {f === "mp3" && <Music size={12} className="mr-1"/>}
              {f !== "mp3" && <Film size={12} className="mr-1"/>}
              {f.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-white/70 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
        <p className="font-black uppercase tracking-widest text-zinc-500">Download preview</p>
        <p className="mt-1">
          This will save as <span className="font-bold text-zinc-950 dark:text-white">{expectedFormat}</span>.
          {item.quality === "best" ? " The highest resolution Facebook makes available will be selected automatically." : ""}
          {item.format === "mp4" && item.quality !== "audio"
            ? " MP4 is the best option for WhatsApp, phones, and social media."
            : " For the widest social-media support, use MP4 video or MP3 audio."}
        </p>
      </div>
    </div>
  );
}

