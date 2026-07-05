import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  History,
  Maximize2,
  PanelRightOpen,
  Play,
  RefreshCw,
  Search,
  Square,
  Video,
  X,
} from 'lucide-react';
import { Card } from '../ui';
import { extractVideoId, formatTime } from './youtubeUtils';

function getThumbnailUrl(item) {
  if (item.thumbnail) return item.thumbnail;
  const videoId = extractVideoId(item.url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null;
}

function matchesQuery(item, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    item.title,
    item.url,
    item.platformLabel,
    item.platform,
    item.quality,
    item.format,
  ].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

export default function DownloadHistory({ history, clearHistory, onReDownload, onDownloadSelected }) {
  const [open, setOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [activePreviewId, setActivePreviewId] = useState(null);

  const filteredHistory = useMemo(
    () => (history || []).filter((item) => matchesQuery(item, query)),
    [history, query],
  );
  const selectedItems = useMemo(
    () => (history || []).filter((item, index) => selectedIds.includes(item.id || String(index))),
    [history, selectedIds],
  );
  const activePreviewItem = useMemo(() => {
    const list = filteredHistory.length ? filteredHistory : history || [];
    return list.find((item, index) => (item.id || String(index)) === activePreviewId) || list[0] || null;
  }, [activePreviewId, filteredHistory, history]);

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

  const renderHistoryItem = (h, i, compact = false) => {
    const itemId = h.id || String(i);
    const isSelected = selectedIds.includes(itemId);
    const isExpanded = expandedId === itemId;
    const thumbUrl = getThumbnailUrl(h);
    const isActivePreview = activePreviewItem === h;

    return (
      <div
        key={h.id || i}
        className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
          isActivePreview && popupOpen
            ? 'border-emerald-400/70 bg-emerald-50/80 dark:border-emerald-500/50 dark:bg-emerald-950/20'
            : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200 dark:border-zinc-800/60 dark:bg-zinc-800/40 dark:hover:border-zinc-700'
        }`}
      >
        <div
          className={`group flex cursor-pointer items-center gap-3 ${compact ? 'p-2' : 'p-2.5'}`}
          onClick={() => {
            setExpandedId(isExpanded ? null : itemId);
            setActivePreviewId(itemId);
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelected(itemId);
            }}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${
              isSelected
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                : 'text-zinc-400 hover:bg-white dark:hover:bg-zinc-700'
            }`}
            aria-label={isSelected ? 'Remove from selected downloads' : 'Select recent download'}
            title={isSelected ? 'Selected' : 'Select'}
          >
            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>

          <div className="relative h-[44px] w-[76px] shrink-0 overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-700">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="absolute inset-0 items-center justify-center text-zinc-400"
              style={{ display: thumbUrl ? 'none' : 'flex' }}
            >
              <Video size={16} />
            </div>
            <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm">
                <Play size={11} fill="white" />
              </div>
            </div>
            {h.length > 0 && (
              <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px text-[7px] font-black text-white backdrop-blur-sm">
                {formatTime(h.length)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-black leading-tight text-zinc-800 transition-colors group-hover:text-zinc-950 dark:text-zinc-200 dark:group-hover:text-white" title={h.title}>
              {h.title || 'Untitled Video'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-medium text-zinc-400">{new Date(h.date).toLocaleDateString()}</span>
              {h.quality && h.format && (
                <>
                  <span className="h-0.5 w-0.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <span className="text-[9px] font-bold uppercase text-zinc-500">{h.quality} / {h.format.toUpperCase()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {isExpanded && h.url && (
          <div className="grid grid-cols-2 gap-2 px-2.5 pb-2.5 animate-studio-rise">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReDownload(h.url);
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2 text-[9px] font-black uppercase tracking-widest text-zinc-600 transition-all hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300 dark:hover:bg-zinc-600/50"
            >
              <RefreshCw size={11} /> Re-Load
            </button>
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2 text-[9px] font-black uppercase tracking-widest text-zinc-600 transition-all hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300 dark:hover:bg-zinc-600/50"
            >
              <ExternalLink size={11} /> Visit
            </a>
          </div>
        )}
      </div>
    );
  };

  const renderPreviewPane = () => {
    if (!activePreviewItem) {
      return (
        <div className="grid h-full min-h-[260px] place-items-center rounded-3xl border border-dashed border-zinc-800 text-zinc-500">
          <div className="text-center">
            <Video size={26} className="mx-auto mb-3" />
            <p className="text-xs font-bold uppercase tracking-widest">No recent video selected</p>
          </div>
        </div>
      );
    }

    const videoId = extractVideoId(activePreviewItem.url);
    const thumbUrl = getThumbnailUrl(activePreviewItem);

    return (
      <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-[22px] border border-zinc-800 bg-black">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{activePreviewItem.title || 'Untitled Video'}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-white/45">
              {activePreviewItem.platformLabel || activePreviewItem.platform || 'Recent video'}
            </p>
          </div>
          {activePreviewItem.url && (
            <a href={activePreviewItem.url} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white" title="Visit source" aria-label="Visit source">
              <ExternalLink size={15} />
            </a>
          )}
        </div>
        {videoId ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            allow="encrypted-media; fullscreen"
            allowFullScreen
            className="min-h-0 flex-1 border-0"
            title="Recent video preview"
          />
        ) : (
          <div className="relative min-h-0 flex-1">
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <div className="grid h-full place-items-center text-white/35">
                <Video size={42} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
              <p className="text-xs font-semibold text-white/75">Preview opens here when the source supports embedded playback.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden border border-zinc-200 bg-white/50 p-0 dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="space-y-3 p-5 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex min-w-0 items-center gap-2 text-left text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
          >
            <History size={14} className="opacity-70" />
            <h3 className="font-black text-[10px] uppercase tracking-widest">Recent Downloads</h3>
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[9px] font-black text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{history?.length || 0}</span>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {open && (
              <button
                type="button"
                disabled={!selectedItems.length}
                onClick={downloadSelected}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white transition disabled:opacity-35 dark:bg-white dark:text-zinc-950"
              >
                <Download size={12} /> {selectedItems.length ? `Download ${selectedItems.length}` : 'Download'}
              </button>
            )}
            {open && (
              <button
                type="button"
                onClick={() => setPopupOpen(true)}
                className="grid h-8 w-8 place-items-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-white"
                aria-label="Expand recent downloads"
                title="Expand recent downloads"
              >
                <Maximize2 size={13} />
              </button>
            )}
            <button
              onClick={clearHistory}
              disabled={!history?.length}
              className="rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
            >
              Clear
            </button>
          </div>
        </div>
        {open && (
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recent downloads..."
              className="w-full rounded-2xl border border-zinc-200 bg-white/75 py-2.5 pl-9 pr-3 text-xs font-semibold text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:focus:ring-white/5"
            />
          </div>
        )}
      </div>

      {open && (
        <div className="max-h-[500px] space-y-2 overflow-y-auto px-5 pb-5 custom-scrollbar">
          {filteredHistory.length ? filteredHistory.map((h, i) => renderHistoryItem(h, i)) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center text-xs font-semibold text-zinc-500 dark:border-zinc-800">
              {history?.length ? "No recent downloads match your search." : "Recent downloads will appear here after you fetch or download a video."}
            </div>
          )}
        </div>
      )}

      {popupOpen && createPortal((
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 p-4 backdrop-blur-md sm:p-6" onClick={() => setPopupOpen(false)}>
          <div className="grid h-[min(82vh,760px)] w-[min(1120px,calc(100vw-2rem))] grid-rows-[auto_1fr] overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/95 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-zinc-950">
                  <PanelRightOpen size={17} />
                </span>
                <div>
                  <p className="text-sm font-black text-white">Recent Downloads</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{filteredHistory.length} shown / {history.length} total</p>
                </div>
              </div>
              <button type="button" onClick={() => setPopupOpen(false)} className="grid h-10 w-10 place-items-center rounded-2xl text-zinc-400 transition hover:bg-zinc-900 hover:text-white" aria-label="Close recent downloads popup" title="Close">
                <X size={17} />
              </button>
            </div>
            <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col gap-3 rounded-[22px] border border-zinc-800 bg-zinc-900/55 p-3">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search titles, links, quality..."
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 py-3 pl-9 pr-3 text-xs font-semibold text-white outline-none transition focus:border-zinc-500 focus:ring-4 focus:ring-white/5"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    disabled={!selectedItems.length}
                    onClick={downloadSelected}
                    className="flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-950 transition disabled:opacity-35"
                  >
                    <Download size={13} /> <span className="truncate">Download {selectedItems.length || ''}</span>
                  </button>
                  <button type="button" onClick={clearHistory} className="rounded-2xl border border-zinc-800 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-red-950/30 hover:text-red-300">
                    Clear
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {filteredHistory.length ? filteredHistory.map((h, i) => renderHistoryItem(h, i, true)) : (
                    <div className="rounded-2xl border border-dashed border-zinc-800 p-5 text-center text-xs font-semibold text-zinc-500">
                      No matches.
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0">{renderPreviewPane()}</div>
            </div>
          </div>
        </div>
      ), document.body)}
    </Card>
  );
}
