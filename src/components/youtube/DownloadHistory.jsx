import React, { useMemo, useState } from 'react';
import { History, Download, ExternalLink, Video, RefreshCw, Play, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import { Card } from '../ui';
import { formatTime, extractVideoId } from './youtubeUtils';

function getThumbnailUrl(item) {
  // If we already have a stored thumbnail, use it
  if (item.thumbnail) return item.thumbnail;
  // Fallback: derive from the YouTube URL
  if (item.url) {
    const videoId = extractVideoId(item.url);
    if (videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }
  return null;
}

export default function DownloadHistory({ history, clearHistory, onReDownload, onDownloadSelected }) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedItems = useMemo(
    () => history.filter((item, index) => selectedIds.includes(item.id || String(index))),
    [history, selectedIds],
  );

  if (!history || history.length === 0) return null;

  const toggleSelected = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const downloadSelected = () => {
    if (!selectedItems.length) return;
    onDownloadSelected?.(selectedItems);
    setOpen(false);
  };

  return (
    <Card className="p-0 overflow-hidden bg-white/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex items-center gap-2 text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
          >
            <History size={14} className="opacity-70" />
            <h3 className="font-black text-[10px] uppercase tracking-widest">Recent Downloads</h3>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <div className="flex items-center gap-2">
            {open && (
              <button
                type="button"
                disabled={!selectedItems.length}
                onClick={downloadSelected}
                className="rounded-lg bg-zinc-950 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white transition disabled:opacity-35 dark:bg-white dark:text-zinc-950"
              >
                Download {selectedItems.length || ""}
              </button>
            )}
            <button
              onClick={clearHistory}
              className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {open && <div className="px-5 pb-5 space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
        {history.map((h, i) => {
          const itemId = h.id || String(i);
          const isSelected = selectedIds.includes(itemId);
          const isExpanded = expandedId === itemId;
          const thumbUrl = getThumbnailUrl(h);

          return (
            <div 
              key={h.id || i} 
              className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 overflow-hidden transition-all duration-200 hover:border-zinc-200 dark:hover:border-zinc-700"
            >
              <div 
                className="flex gap-3 items-center p-2.5 cursor-pointer group"
                onClick={() => setExpandedId(isExpanded ? null : itemId)}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleSelected(itemId); }}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors ${
                    isSelected
                      ? "text-zinc-950 dark:text-white"
                      : "text-zinc-400 hover:bg-white dark:hover:bg-zinc-700"
                  }`}
                  aria-label={isSelected ? "Remove from selected downloads" : "Select recent download"}
                  title={isSelected ? "Selected" : "Select"}
                >
                  {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
                {/* Thumbnail */}
                <div className="relative w-[72px] h-[42px] shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700">
                  {thumbUrl ? (
                    <img 
                      src={thumbUrl} 
                      alt="" 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                    />
                  ) : null}
                  <div 
                    className="w-full h-full items-center justify-center text-zinc-400 absolute inset-0"
                    style={{ display: thumbUrl ? 'none' : 'flex' }}
                  >
                    <Video size={16} />
                  </div>
                  {/* Play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <Play size={10} className="text-white ml-0.5" fill="white" />
                    </div>
                  </div>
                  {/* Duration badge */}
                  {h.length > 0 && (
                    <div className="absolute bottom-0.5 right-0.5 bg-black/80 backdrop-blur-sm text-white text-[7px] font-black px-1 py-px rounded pointer-events-none">
                      {formatTime(h.length)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 truncate group-hover:text-zinc-950 dark:group-hover:text-white transition-colors leading-tight" title={h.title}>
                    {h.title || 'Untitled Video'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-[9px] font-medium text-zinc-400">
                      {new Date(h.date).toLocaleDateString()}
                    </p>
                    {h.quality && h.format && (
                      <>
                        <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        <p className="text-[9px] font-bold text-zinc-500 uppercase">
                          {h.quality} • {h.format.toUpperCase()}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded actions */}
              {isExpanded && h.url && (
                <div className="flex gap-2 px-2.5 pb-2.5 animate-studio-rise">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onReDownload(h.url); }}
                    className="flex-1 py-2 rounded-xl bg-white dark:bg-zinc-700/50 hover:bg-zinc-100 dark:hover:bg-zinc-600/50 text-[9px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300 transition-all flex items-center justify-center gap-1.5 border border-zinc-200 dark:border-zinc-700"
                  >
                    <RefreshCw size={10} /> Re-Load
                  </button>
                  <a 
                    href={h.url} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 py-2 rounded-xl bg-white dark:bg-zinc-700/50 hover:bg-zinc-100 dark:hover:bg-zinc-600/50 text-[9px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300 transition-all flex items-center justify-center gap-1.5 border border-zinc-200 dark:border-zinc-700"
                  >
                    <ExternalLink size={10} /> Visit
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </Card>
  );
}
