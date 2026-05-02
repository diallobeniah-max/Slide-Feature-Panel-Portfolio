import React from 'react';
import { Languages, Download } from 'lucide-react';
import { Button } from '../ui';

export default function SubtitleOptions({ item, onUpdate, onDownloadSubtitles }) {
  if (!item.subtitleLangs || item.subtitleLangs.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex justify-between items-center">
        <span><Languages size={10} className="inline mr-1"/> Subtitles</span>
        <select 
          className="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px] focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={item.selectedSubFormat || 'srt'}
          onChange={(e) => onUpdate(item.id, { selectedSubFormat: e.target.value })}
        >
          <option value="srt">SRT</option>
          <option value="vtt">VTT</option>
        </select>
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select 
          className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
          value={item.selectedSubLang || item.subtitleLangs.find(l => l.lang === 'en' && !l.auto)?.lang || item.subtitleLangs[0].lang}
          onChange={(e) => onUpdate(item.id, { selectedSubLang: e.target.value })}
        >
          {item.subtitleLangs.map(sub => {
            let name = sub.lang;
            try { name = new Intl.DisplayNames(['en'], { type: 'language' }).of(sub.lang.split('-')[0]) || sub.lang; } catch {}
            return <option key={sub.label} value={sub.lang}>{name} {sub.auto ? '(Auto-generated)' : ''}</option>;
          })}
        </select>
        <Button size="sm" variant="outline" className="shrink-0 w-full sm:w-auto justify-center"
          onClick={() => {
            const lang = item.selectedSubLang || item.subtitleLangs.find(l => l.lang === 'en' && !l.auto)?.lang || item.subtitleLangs[0].lang;
            onDownloadSubtitles(item, lang, item.selectedSubFormat || 'srt');
          }}
          disabled={item.status === "downloading"}>
          <Download size={14} className="mr-1 inline-block" /> Download
        </Button>
      </div>
    </div>
  );
}

