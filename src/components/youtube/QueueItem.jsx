import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Download, Scissors, Check, AlertCircle, Pencil, X, Pause, Play, FolderOpen, ExternalLink, RotateCcw } from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { formatTime, formatBytes, extractVideoId, getVideoPlatformLabel } from './youtubeUtils';
import VideoPreview from './VideoPreview';
import FormatPicker from './FormatPicker';
import SubtitleOptions from './SubtitleOptions';
import DownloadProgress from './DownloadProgress';
import TrimTimeline from './TrimTimeline';

export default function QueueItem({ item, onRemove, onUpdate, onDownload, onPause, onResume, onDownloadSubtitles, onOpenVideo, onOpenFolder, layout = "horizontal", previewScale = 100 }) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title || "");

  const startTitleEdit = () => {
    setDraftTitle(item.title || "");
    setEditingTitle(true);
  };

  const cancelTitleEdit = () => {
    setDraftTitle(item.title || "");
    setEditingTitle(false);
  };

  const saveTitleEdit = () => {
    const nextTitle = draftTitle.trim() || item.title || "Untitled Video";
    onUpdate(item.id, { title: nextTitle });
    setDraftTitle(nextTitle);
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') saveTitleEdit();
    if (e.key === 'Escape') cancelTitleEdit();
  };

  const handleTrimStartChange = (e) => {
    let val = parseFloat(e.target.value) || 0;
    if (val < 0) val = 0;
    onUpdate(item.id, { trimStart: val });
  };

  const handleTrimEndChange = (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = item.duration;
    if (val > item.duration) val = item.duration;
    onUpdate(item.id, { trimEnd: val });
  };

  const handleTrimBlur = () => {
    if (item.trimStart >= (item.trimEnd || item.duration)) {
      onUpdate(item.id, { trimEnd: Math.min(item.trimStart + 1, item.duration) });
    }
  };

  const clipLength = (item.trimEnd || item.duration) - item.trimStart;
  const providerLabel = item.platformLabel || getVideoPlatformLabel(item.platform || item.url);
  const canConfigure = item.status !== "fetching" && item.status !== "error";
  const hasSavedActions = item.status === "done" && item.savedPath;
  const metaText = [
    item.channel,
    item.viewCount ? `${item.viewCount.toLocaleString()} views` : null,
  ].filter(Boolean).join(" • ") || providerLabel;

  const boxed = false;

  const getEstimatedSize = () => {
    if (item.quality === 'audio') return item.audioSize || 0;
    if (item.quality === 'best') return item.bestSize || item.qualities?.[0]?.filesize || 0;
    const q = item.qualities?.find(q => q.label === item.quality);
    if (q && q.filesize) {
      if (item.trimStart > 0 || (item.trimEnd > 0 && item.trimEnd < item.duration)) {
        return (q.filesize / item.duration) * clipLength;
      }
      return q.filesize;
    }
    return 0;
  };

  return (
    <Card className="relative overflow-hidden animate-studio-rise card-hover">
      {item.previewMode ? (
        <VideoPreview item={item} onUpdate={onUpdate} layout={layout} previewScale={previewScale} />
      ) : (
        <div className={boxed ? "grid gap-3 p-3" : "flex items-start gap-4 p-4"}>
          <VideoPreview item={item} onUpdate={onUpdate} layout={layout} previewScale={previewScale} />

          <div className="flex-1 min-w-0 pt-1">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  aria-label="Edit video name"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-900 outline-none transition-all focus:border-zinc-500 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-white/5"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={saveTitleEdit}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  aria-label="Save video name"
                  title="Save video name"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  onClick={cancelTitleEdit}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
                  aria-label="Cancel video name edit"
                  title="Cancel"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2" title={item.title}>
                {item.title || "Fetching info..."}
                </p>
                {item.status !== "fetching" && (
                  <div className="flex shrink-0 items-center gap-1 rounded-2xl border border-zinc-200/70 bg-white/50 p-1 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <button
                      type="button"
                      onClick={startTitleEdit}
                      className="grid h-8 w-8 place-items-center rounded-xl text-zinc-400 transition-colors hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
                      aria-label="Edit video name"
                      title="Edit video name"
                    >
                      <Pencil size={14} />
                    </button>
                    {hasSavedActions && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenVideo?.(item.savedPath)}
                          className="grid h-8 w-8 place-items-center rounded-xl text-zinc-400 transition-colors hover:bg-white hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-300"
                          aria-label="Open saved video"
                          title="Open saved video"
                        >
                          <ExternalLink size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFolder?.(item.savedPath)}
                          className="grid h-8 w-8 place-items-center rounded-xl text-zinc-400 transition-colors hover:bg-white hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-300"
                          aria-label="Open containing folder"
                          title="Open containing folder"
                        >
                          <FolderOpen size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdate(item.id, { status: 'ready', progress: 0 })}
                          className="grid h-8 w-8 place-items-center rounded-xl text-zinc-400 transition-colors hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
                          aria-label="Download again"
                          title="Download again"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
            {metaText}
            </p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={
              item.status === "ready" ? "success" :
              item.status === "downloading" ? "warning" :
              item.status === "paused" ? "warning" :
              item.status === "done" ? "success" :
              item.status === "error" ? "error" : "default"
            }>
              {item.status === "fetching" ? "Loading..." :
               item.status === "ready" ? "Ready" :
               item.status === "downloading" ? `${item.progress || 0}%` :
               item.status === "paused" ? "Paused" :
               item.status === "done" ? "Done" :
               item.status === "error" ? "Error" : "Pending"}
            </Badge>

            {item.status === "ready" && (
              <Badge variant="default">~{formatBytes(getEstimatedSize())}</Badge>
            )}

            {(item.trimStart > 0 || (item.trimEnd > 0 && item.trimEnd < item.duration)) && (
              <Badge variant="warning">
                <Scissors size={9} className="mr-1 inline" />
                {formatTime(item.trimStart)} → {formatTime(item.trimEnd || item.duration)}
              </Badge>
            )}

            {item.status === "ready" && <Badge variant="default">{item.quality === 'audio' ? 'Audio' : item.quality === 'best' ? 'Highest' : item.quality}</Badge>}
            {item.status === "ready" && providerLabel && <Badge variant="default">{providerLabel}</Badge>}
          </div>
        </div>

        <div className={boxed ? "absolute right-3 top-3 flex shrink-0 flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/45 p-1 backdrop-blur-md" : "flex flex-col gap-1.5 shrink-0"}>
          {item.status === "downloading" && item.downloadKind === "video" && (
            <button
              type="button"
              onClick={() => onPause(item.id)}
              aria-label="Pause download"
              title="Pause download"
              className="p-2 rounded-xl text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-all"
            >
              <Pause size={16} />
            </button>
          )}
          {item.status === "paused" && (
            <button
              type="button"
              onClick={() => onResume(item.id)}
              aria-label="Resume download"
              title="Resume download"
              className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 transition-all"
            >
              <Play size={16} />
            </button>
          )}
          {canConfigure && (
            <button onClick={() => setExpanded(v => !v)}
              aria-label={expanded ? "Hide video options" : "Show video options"}
              title={expanded ? "Hide video options" : "Show video options"}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-white/60 dark:hover:text-white dark:hover:bg-zinc-800 transition-all">
              {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
            </button>
          )}
          <button onClick={() => onRemove(item.id)}
            className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
            <Trash2 size={14}/>
          </button>
        </div>
        </div>
      )}

      <DownloadProgress item={item} />

      {expanded && canConfigure && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 space-y-4 bg-white/50 dark:bg-zinc-900/50">
          <FormatPicker item={item} onUpdate={onUpdate} />
          
          <SubtitleOptions item={item} onUpdate={onUpdate} onDownloadSubtitles={onDownloadSubtitles} />

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
              <Scissors size={10} className="inline mr-1"/> Trim Clip
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Start (Seconds)</label>
                <input type="number" min="0" max={item.duration} step="1"
                  value={item.trimStart}
                  onChange={handleTrimStartChange}
                  onBlur={handleTrimBlur}
                  disabled={item.status === "downloading" || item.status === "paused"}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500" />
                <span className="text-[9px] text-zinc-400 mt-0.5 block">{formatTime(item.trimStart)}</span>
              </div>
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">End (Seconds)</label>
                <input type="number" min="0" max={item.duration} step="1"
                  value={item.trimEnd || item.duration}
                  onChange={handleTrimEndChange}
                  onBlur={handleTrimBlur}
                  disabled={item.status === "downloading" || item.status === "paused"}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500" />
                <span className="text-[9px] text-zinc-400 mt-0.5 block">{formatTime(item.trimEnd || item.duration)}</span>
              </div>
            </div>

            {item.duration > 0 && (
              <TrimTimeline 
                min={0} max={item.duration} 
                start={item.trimStart} 
                end={item.trimEnd || item.duration} 
                videoId={extractVideoId(item.url)}
                thumbnail={item.thumbnail}
                onChange={(s, e) => onUpdate(item.id, { trimStart: s, trimEnd: e })} 
              />
            )}

            <p className="text-[10px] text-zinc-500 mt-2 text-center font-mono">
              Clip duration: {formatTime(clipLength)}
            </p>
          </div>

          {item.status === "downloading" ? (
            <Button variant="outline" size="md" className="w-full justify-center flex items-center" onClick={() => onPause(item.id)}>
              <Pause size={16} className="mr-2" /> Pause Download
            </Button>
          ) : item.status === "paused" ? (
            <Button variant="primary" size="md" className="w-full justify-center flex items-center" onClick={() => onResume(item.id)}>
              <Play size={16} className="mr-2" /> Resume Download
            </Button>
          ) : (
            <Button variant="primary" size="md" className="w-full justify-center flex items-center" onClick={() => onDownload(item.id)}>
              <Download size={16} className="mr-2" /> Download Video
            </Button>
          )}
        </div>
      )}

      {item.status === "error" && (
        <div className="border-t border-red-200 dark:border-red-900/50 px-4 py-3 bg-red-50 dark:bg-red-950/20">
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14}/> {item.error || "Download failed"}
          </p>
        </div>
      )}

      {item.status === "done" && (
        <div className="border-t border-emerald-400/20 bg-[linear-gradient(90deg,rgba(16,185,129,0.13),rgba(16,185,129,0.04))] px-4 py-2.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/25">
                <Check size={13}/>
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Saved video</p>
                <p className="truncate text-[11px] font-bold text-emerald-50/90" title={item.savedFilename || item.title}>
                  {item.savedFilename || item.title || "Download complete"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 md:justify-end">
            {item.savedPath && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenVideo?.(item.savedPath)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/15"
                >
                  <ExternalLink size={13} /> Open video
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFolder?.(item.savedPath)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/15"
                >
                  <FolderOpen size={13} /> Open folder
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onUpdate(item.id, { status: 'ready', progress: 0 })}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/15"
            >
              <RotateCcw size={13} /> Again
            </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

