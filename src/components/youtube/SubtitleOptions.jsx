import React, { useMemo } from 'react';
import { Download, Languages } from 'lucide-react';
import { Button } from '../ui';
import ModernSelect from '../ui/ModernSelect';

function subtitleName(sub) {
  let name = sub.lang;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(sub.lang.split('-')[0]) || sub.lang;
  } catch {
    name = sub.lang;
  }
  return `${name} ${sub.auto ? '(Auto-generated)' : ''}`;
}

export default function SubtitleOptions({ item, onUpdate, onDownloadSubtitles }) {
  const subtitleLangs = item.subtitleLangs || [];
  const languageOptions = useMemo(
    () => subtitleLangs.map((sub) => ({ value: sub.lang, label: subtitleName(sub) })),
    [subtitleLangs],
  );
  const preferredLang = item.selectedSubLang || subtitleLangs.find((lang) => lang.lang === 'en' && !lang.auto)?.lang || subtitleLangs[0]?.lang;
  const selectedFormat = item.selectedSubFormat || 'srt';

  if (!subtitleLangs.length) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
          <Languages size={10} className="mr-1 inline" /> Subtitles
        </p>
        <ModernSelect
          compact
          ariaLabel="Subtitle format"
          value={selectedFormat}
          options={[
            { value: 'srt', label: 'SRT' },
            { value: 'vtt', label: 'VTT' },
          ]}
          onChange={(value) => onUpdate(item.id, { selectedSubFormat: value })}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <ModernSelect
          ariaLabel="Subtitle language"
          value={preferredLang}
          options={languageOptions}
          onChange={(value) => onUpdate(item.id, { selectedSubLang: value })}
        />
        <Button
          size="sm"
          variant="outline"
          className="w-full shrink-0 justify-center sm:w-auto"
          onClick={() => onDownloadSubtitles(item, preferredLang, selectedFormat)}
          disabled={item.status === 'downloading'}
        >
          <Download size={14} className="mr-1 inline-block" /> Download
        </Button>
      </div>
    </div>
  );
}
