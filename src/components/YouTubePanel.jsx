import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Download, Trash2, Plus, Loader2, Link as LinkIcon, Scissors, Clock,
  Play, Pause, Music, Film, X, Check, AlertCircle, List,
  Video, ChevronDown, ChevronUp, Search, Clipboard, FileText, History,
  Languages, ListVideo, Maximize, Minimize
} from "lucide-react";
import { Card, Button, Badge } from "./ui";

// --- Utilities ---
const formatTime = (s) => {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
    : `${m}:${String(sec).padStart(2,"0")}`;
};

const formatBytes = (b) => {
  if (!b) return "Size unavailable";
  const k = 1024, s = ["B","KB","MB","GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
};

const isValidYoutubeUrl = (url) => {
  try {
    const u = new URL(url.trim());
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(u.hostname);
  } catch {
    return false;
  }
};

// --- Local Storage History ---
const HISTORY_KEY = "yt_download_history";
const loadHistory = () => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};
const saveHistory = (history) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50))); // Keep last 50
  } catch {}
};

const extractVideoId = (url) => {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
};

// --- Global YT API Loader ---
let ytApiPromise = null;
const loadYTApi = () => {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
  return ytApiPromise;
};

// --- Trim Slider Component ---
function TrimSlider({ min, max, start, end, onChange, onBlur, videoId, thumbnail }) {
  const trackRef = useRef(null);
  const playerRef = useRef(null);
  const playerInstance = useRef(null);
  const [hoverTime, setHoverTime] = useState(null);
  const [dragging, setDragging] = useState(null);

  // Initialize YT player for scrubbing thumbnail
  useEffect(() => {
    if (!videoId) return;
    let isMounted = true;
    loadYTApi().then((YT) => {
      if (!isMounted || !playerRef.current) return;
      playerInstance.current = new YT.Player(playerRef.current, {
        videoId,
        playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, mute: 1, playsinline: 1, showinfo: 0 },
        events: {
          onReady: (e) => { e.target.mute(); }
        }
      });
    });
    return () => {
      isMounted = false;
      if (playerInstance.current?.destroy) playerInstance.current.destroy();
    };
  }, [videoId]);

  const scrubTimeout = useRef(null);
  useEffect(() => {
    if (hoverTime !== null && playerInstance.current?.seekTo) {
      // Debounce seek slightly to avoid rate-limiting iframe
      clearTimeout(scrubTimeout.current);
      scrubTimeout.current = setTimeout(() => {
        playerInstance.current.seekTo(hoverTime, true);
      }, 50);
    }
  }, [hoverTime]);

  const getValFromEvent = (e) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    let p = (e.clientX - rect.left) / rect.width;
    if (p < 0) p = 0; if (p > 1) p = 1;
    return min + p * (max - min);
  };

  const handlePointerDown = (e, type) => {
    e.preventDefault();
    setDragging(type);
    
    const handlePointerMove = (ev) => {
      const val = getValFromEvent(ev);
      setHoverTime(val);
      if (type === 'start') onChange(Math.min(val, end), end);
      else onChange(start, Math.max(val, start));
    };
    
    const handlePointerUp = () => {
      setDragging(null);
      if (onBlur) onBlur();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const pct = (val) => max > min ? ((val - min) / (max - min)) * 100 : 0;

  return (
    <div 
      className="relative h-10 mt-6 mb-2 flex items-center group cursor-pointer" 
      ref={trackRef}
      onMouseMove={e => !dragging && setHoverTime(getValFromEvent(e))}
      onMouseLeave={() => !dragging && setHoverTime(null)}
    >
      {/* Floating Thumbnail/Time Popup - Always mounted to keep iframe alive */}
      <div className={`absolute -top-[5.5rem] bg-zinc-900 text-white font-mono text-[10px] font-bold p-1.5 rounded-lg shadow-xl z-30 transform -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1.5 border border-zinc-700 transition-all duration-200 ${hoverTime !== null ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
           style={{ left: `${pct(hoverTime || start)}%` }}>
        <div className="w-24 h-14 rounded-[4px] overflow-hidden bg-black shrink-0 relative border border-zinc-800 pointer-events-none">
           {/* Fallback image underneath */}
           {thumbnail && <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
           {/* The YT player mount point scaled up to hide borders */}
           <div className="absolute inset-0 w-full h-full transform scale-[1.3] pointer-events-none">
             <div ref={playerRef} className="w-full h-full pointer-events-none" />
           </div>
        </div>
        <span>{formatTime(hoverTime || start)}</span>
        <div className="absolute -bottom-1 w-2 h-2 bg-zinc-900 border-b border-r border-zinc-700 transform rotate-45" />
      </div>
      
      {/* YouTube Style Track */}
      <div className="absolute w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
      <div className="absolute h-1.5 bg-red-500 pointer-events-none" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
      
      {/* Handles */}
      <div 
        className={`absolute w-3 h-5 bg-white border border-zinc-300 dark:border-zinc-600 rounded-sm shadow-md z-20 cursor-ew-resize transform -translate-x-1/2 -translate-y-1/2 top-1/2 transition-transform duration-100 ${dragging === 'start' ? 'scale-125 bg-zinc-100' : 'hover:scale-110'}`}
        style={{ left: `${pct(start)}%` }}
        onPointerDown={(e) => handlePointerDown(e, 'start')}
      />
      <div 
        className={`absolute w-3 h-5 bg-white border border-zinc-300 dark:border-zinc-600 rounded-sm shadow-md z-20 cursor-ew-resize transform -translate-x-1/2 -translate-y-1/2 top-1/2 transition-transform duration-100 ${dragging === 'end' ? 'scale-125 bg-zinc-100' : 'hover:scale-110'}`}
        style={{ left: `${pct(end)}%` }}
        onPointerDown={(e) => handlePointerDown(e, 'end')}
      />
    </div>
  );
}

/* ── Single Queue Item Component ─────────────────────────── */
function QueueItem({ item, onRemove, onUpdate, onDownload, onDownloadSubtitles }) {
  const [expanded, setExpanded] = useState(true);

  const pct = (val) => item.duration > 0 ? (val / item.duration) * 100 : 0;
  
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

  // Auto-correct trim logic on blur
  const handleTrimBlur = () => {
    if (item.trimStart >= (item.trimEnd || item.duration)) {
      onUpdate(item.id, { trimEnd: Math.min(item.trimStart + 1, item.duration) });
    }
  };

  const clipLength = (item.trimEnd || item.duration) - item.trimStart;

  const getEstimatedSize = () => {
    if (item.quality === 'audio') return item.audioSize || 0;
    const q = item.qualities?.find(q => q.label === item.quality);
    if (q && q.filesize) {
      // Estimate trimmed size if trimming
      if (item.trimStart > 0 || (item.trimEnd > 0 && item.trimEnd < item.duration)) {
        return (q.filesize / item.duration) * clipLength;
      }
      return q.filesize;
    }
    return 0;
  };

  return (
    <Card className="overflow-hidden animate-studio-rise">
      {item.previewMode && (
        <div className={`relative w-full bg-black flex flex-col transition-all duration-300 ${item.isFullScreen ? 'fixed inset-0 z-[100] h-screen' : 'aspect-video rounded-t-xl overflow-hidden border-b border-zinc-100 dark:border-zinc-800'}`}>
          <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none z-20 bg-gradient-to-b from-black/60 to-transparent">
             <div className="pointer-events-auto bg-black/40 backdrop-blur-md rounded-full px-3 py-1 border border-white/10 text-white/90 text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-black/20">
               Preview
             </div>
             <div className="flex gap-2 pointer-events-auto">
               <button 
                 onClick={() => onUpdate(item.id, { isFullScreen: !item.isFullScreen })} 
                 className="p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full border border-white/10 transition-all hover:scale-105 shadow-lg shadow-black/20"
               >
                 {item.isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
               </button>
               <button 
                 onClick={() => onUpdate(item.id, { previewMode: false, isFullScreen: false })} 
                 className="p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full border border-white/10 transition-all hover:scale-105 shadow-lg shadow-black/20"
               >
                 <X size={14} />
               </button>
             </div>
          </div>
          <iframe 
            src={`https://www.youtube.com/embed/${extractVideoId(item.url)}?autoplay=1&start=${Math.floor(item.trimStart)}`}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            className="w-full flex-1 border-0"
            title="Video Preview"
          />
        </div>
      )}
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        {!item.previewMode && (
          <div 
            className="relative w-28 h-[4.5rem] shrink-0 rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 cursor-pointer group"
            onClick={() => { if(item.status !== "fetching") onUpdate(item.id, { previewMode: true }); }}
            title="Click to preview video"
          >
            {item.thumbnail ? (
              <img src={item.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="w-full h-full grid place-items-center text-zinc-400">
                <Video size={24} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 grid place-items-center">
               <Play size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transform group-hover:scale-110 transition-all duration-300" fill="currentColor" />
            </div>
            {item.duration > 0 && (
              <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none">
                {formatTime(item.duration)}
              </span>
            )}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate" title={item.title}>
            {item.title || "Fetching info..."}
          </p>
          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
            {item.channel} • {item.viewCount?.toLocaleString()} views
          </p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={
              item.status === "ready" ? "success" :
              item.status === "downloading" ? "warning" :
              item.status === "done" ? "success" :
              item.status === "error" ? "error" : "default"
            }>
              {item.status === "fetching" ? "Loading..." :
               item.status === "ready" ? "Ready" :
               item.status === "downloading" ? `${item.progress || 0}%` :
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

            {item.status === "ready" && <Badge variant="default">{item.quality === 'audio' ? 'Audio' : item.quality}</Badge>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {item.status !== "fetching" && (
            <button onClick={() => setExpanded(v => !v)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-800 transition-all">
              {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
            </button>
          )}
          <button onClick={() => onRemove(item.id)}
            className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
            <Trash2 size={14}/>
          </button>
        </div>
      </div>

      {/* Download progress bar */}
      {item.status === "downloading" && (
        <div className="px-4 pb-4">
           <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-widest">
             <span className="flex items-center gap-2">
               <Loader2 size={12} className="animate-spin text-zinc-900 dark:text-white" />
               {item.stage || 'Downloading...'}
             </span>
             <span>{item.progress || 0}%</span>
           </div>
           <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden border border-zinc-200/50 dark:border-zinc-700/50 relative">
             <div className="absolute inset-y-0 left-0 bg-zinc-900 dark:bg-white transition-all duration-300 overflow-hidden"
               style={{ width: `${item.progress || 0}%` }}>
               <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[progress-stripes_1s_linear_infinite]" />
             </div>
           </div>
        </div>
      )}

      {/* Expanded: Trim + options */}
      {expanded && item.status === "ready" && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Format & Quality selector */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Quality</p>
              <select 
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                value={item.quality}
                onChange={(e) => onUpdate(item.id, { quality: e.target.value })}
              >
                <option value="best">Best Video</option>
                <option value="audio">Audio Only (MP3)</option>
                {item.qualities?.map(q => (
                  <option key={q.label} value={q.label}>{q.label} Video (~{formatBytes(q.filesize)})</option>
                ))}
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
                     {f === "mp3" && <Music size={12}/>}
                     {f !== "mp3" && <Film size={12}/>}
                     {f.toUpperCase()}
                   </Button>
                 ))}
               </div>
            </div>
          </div>

          {/* Subtitles */}
          {item.subtitleLangs && item.subtitleLangs.length > 0 && (
             <div>
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
               <div className="flex gap-2">
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
                 <Button size="sm" variant="outline" className="shrink-0"
                   onClick={() => {
                     const lang = item.selectedSubLang || item.subtitleLangs.find(l => l.lang === 'en' && !l.auto)?.lang || item.subtitleLangs[0].lang;
                     onDownloadSubtitles(item, lang, item.selectedSubFormat || 'srt');
                   }}
                   disabled={item.status === "downloading"}>
                   <Download size={14} className="mr-2" /> Download
                 </Button>
               </div>
             </div>
          )}

          {/* Trim controls */}
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
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500" />
                <span className="text-[9px] text-zinc-400 mt-0.5 block">{formatTime(item.trimStart)}</span>
              </div>
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">End (Seconds)</label>
                <input type="number" min="0" max={item.duration} step="1"
                  value={item.trimEnd || item.duration}
                  onChange={handleTrimEndChange}
                  onBlur={handleTrimBlur}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500" />
                <span className="text-[9px] text-zinc-400 mt-0.5 block">{formatTime(item.trimEnd || item.duration)}</span>
              </div>
            </div>

            {/* Interactive Trim Slider */}
            {item.duration > 0 && (
              <TrimSlider 
                min={0} max={item.duration} 
                start={item.trimStart} 
                end={item.trimEnd || item.duration} 
                videoId={extractVideoId(item.url)}
                thumbnail={item.thumbnail}
                onChange={(s, e) => {
                  onUpdate(item.id, { trimStart: s, trimEnd: e });
                }} 
              />
            )}

            <p className="text-[10px] text-zinc-500 mt-2 text-center font-mono">
              Clip duration: {formatTime(clipLength)}
            </p>
          </div>

          {/* Download this one */}
          <Button variant="primary" size="md" className="w-full" onClick={() => onDownload(item.id)}
            disabled={item.status === "downloading"} icon={Download}>
            Download Video
          </Button>
        </div>
      )}

      {/* Error message */}
      {item.status === "error" && (
        <div className="border-t border-red-200 dark:border-red-900/50 px-4 py-3 bg-red-50 dark:bg-red-950/20">
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14}/> {item.error || "Download failed"}
          </p>
        </div>
      )}

      {/* Done state */}
      {item.status === "done" && (
        <div className="border-t border-emerald-200 dark:border-emerald-900/50 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-between">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-bold">
            <Check size={14}/> Download Complete
          </p>
          <Button variant="secondary" size="sm" onClick={() => onUpdate(item.id, { status: 'ready', progress: 0 })} icon={Download}>
            Download Again
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ── Main Panel ──────────────────────────────────────────── */
export default function YouTubePanel() {
  const [queue, setQueue] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [playlistMode, setPlaylistMode] = useState(false);
  
  const [globalFormat, setGlobalFormat] = useState("mp4");
  const [isAdding, setIsAdding] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  useEffect(() => { setHistory(loadHistory()); }, []);

  const updateItem = useCallback((id, patch) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  }, []);

  const removeItem = useCallback((id) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  // Handle pasting from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error("Clipboard empty");
      setUrlInput(text);
      if (isValidYoutubeUrl(text)) {
        addSingleUrl(text);
      } else {
        window.dispatchEvent(new CustomEvent("studio-notify", {
          detail: { title: "Invalid URL", message: "Clipboard does not contain a valid YouTube link.", type: "warning" }
        }));
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Paste Failed", message: "Could not read clipboard. Please paste manually.", type: "error" }
      }));
    }
  };

  const fetchInfo = useCallback(async (url) => {
    const id = crypto.randomUUID();
    const item = {
      id, url, title: "", channel: "", thumbnail: "", duration: 0,
      trimStart: 0, trimEnd: 0, format: globalFormat, quality: 'best',
      status: "fetching", progress: 0, error: null,
      qualities: [], subtitleLangs: []
    };
    setQueue(prev => [item, ...prev]);

    try {
      const res = await fetch("/api/yt/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setQueue(prev => prev.map(q => q.id === id ? {
        ...q, title: data.title, channel: data.channel,
        thumbnail: data.thumbnail, duration: data.duration,
        trimEnd: data.duration, status: "ready",
        qualities: data.qualities, audioSize: data.audioSize,
        subtitleLangs: data.subtitleLangs, viewCount: data.viewCount
      } : q));
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === id ? {
        ...q, status: "error", error: err.message,
      } : q));
    }
  }, [globalFormat]);

  const fetchPlaylist = useCallback(async (url) => {
    try {
      const res = await fetch("/api/yt/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      
      if (!data.entries || data.entries.length === 0) throw new Error("No videos found in playlist.");

      // Fetch info for first 10 immediately to prevent overwhelming server
      const toFetch = data.entries.slice(0, 10);
      for (const entry of toFetch) {
        await fetchInfo(entry.url);
      }
      
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Playlist Added", message: `Added ${toFetch.length} videos from playlist.`, type: "success" }
      }));
    } catch (err) {
       window.dispatchEvent(new CustomEvent("studio-notify", {
         detail: { title: "Playlist Error", message: err.message, type: "error" }
       }));
    }
  }, [fetchInfo]);

  const addSingleUrl = async (overrideUrl) => {
    const url = (overrideUrl || urlInput).trim();
    if (!url) return;
    if (!isValidYoutubeUrl(url)) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Invalid URL", message: "Please enter a valid YouTube URL", type: "error" }
      }));
      return;
    }
    setIsAdding(true);
    setUrlInput("");
    if (playlistMode && (url.includes('list=') || url.includes('playlist'))) {
      await fetchPlaylist(url);
    } else {
      await fetchInfo(url);
    }
    setIsAdding(false);
  };

  const addBulkUrls = async () => {
    // Extract all URLs using regex
    const urlRegex = /(https?:\/\/[^\s<)"]+)/g;
    const matches = bulkText.match(urlRegex) || [];
    // Clean and filter uniquely valid YouTube URLs
    const urls = [...new Set(matches.map(u => u.trim()).filter(isValidYoutubeUrl))];

    if (urls.length === 0) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "No valid URLs", message: "No valid YouTube URLs found in the text", type: "error" }
      }));
      return;
    }
    setIsAdding(true);
    setBulkText("");
    setBulkMode(false);
    for (const url of urls) await fetchInfo(url);
    setIsAdding(false);
    window.dispatchEvent(new CustomEvent("studio-notify", {
      detail: { title: "Batch Added", message: `${urls.length} video(s) added to queue`, type: "success" }
    }));
  };

  // Helper to read progress from response stream
  const readProgressStream = async (res, id, safeName, ext, item) => {
    const contentLength = res.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    let loaded = 0;

    const reader = res.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      
      if (total) {
        const progress = Math.min(99, Math.round((loaded / total) * 100));
        setQueue(prev => prev.map(q => q.id === id ? { ...q, progress, stage: 'Downloading...' } : q));
      } else {
        // Indeterminate progress (just keep stage active)
        setQueue(prev => prev.map(q => q.id === id ? { ...q, stage: 'Processing & Downloading...' } : q));
      }
    }

    setQueue(prev => prev.map(q => q.id === id ? { ...q, progress: 100, stage: 'Finalizing...' } : q));

    const blob = new Blob(chunks, { type: res.headers.get('content-type') });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: "done" } : q));

    // Save to history
    const histItem = {
      id: crypto.randomUUID(), title: item.title, date: new Date().toISOString(),
      quality: item.quality, format: ext, length: (item.trimEnd || item.duration) - item.trimStart
    };
    const newHist = [histItem, ...history];
    setHistory(newHist);
    saveHistory(newHist);

    window.dispatchEvent(new CustomEvent("studio-notify", {
      detail: { title: "Download Complete", message: safeName, type: "success" }
    }));
  };

  const downloadItem = useCallback(async (id) => {
    const item = queue.find(q => q.id === id);
    if (!item) return;

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: "downloading", progress: 0, stage: 'Preparing...' } : q));

    try {
      const res = await fetch("/api/yt/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: item.url,
          start: item.trimStart > 0 ? item.trimStart : undefined,
          end: item.trimEnd > 0 && item.trimEnd < item.duration ? item.trimEnd : undefined,
          format: item.quality === "audio" ? "mp3" : item.format,
          quality: item.quality,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = "Download failed";
        try { errMsg = JSON.parse(text).error; } catch {}
        throw new Error(errMsg);
      }

      const ext = item.quality === 'audio' || item.format === 'mp3' ? 'mp3' : item.format;
      const safeName = (item.title || "video").replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60);

      await readProgressStream(res, id, safeName, ext, item);

    } catch (err) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: "error", error: err.message } : q));
    }
  }, [queue, history]);

  const downloadSubtitles = async (item, lang, format) => {
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "downloading", progress: 50, stage: 'Fetching Subtitles' } : q));
    try {
      const res = await fetch("/api/yt/subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, lang, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Subtitle download failed");
      }
      const blob = await res.blob();
      const safeName = (item.title || "video").replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}_${lang}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "ready", progress: 0 } : q));
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Subtitles Downloaded", message: `${lang} subtitles saved.`, type: "success" }
      }));
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", error: err.message } : q));
    }
  };

  const downloadAll = async () => {
    const ready = queue.filter(q => q.status === "ready" || q.status === "done");
    for (const item of ready) await downloadItem(item.id);
  };

  const clearDone = () => setQueue(prev => prev.filter(q => q.status !== "done" && q.status !== "error"));
  const clearHistory = () => { setHistory([]); saveHistory([]); };

  const readyCount = queue.filter(q => q.status === "ready").length;
  const downloadingCount = queue.filter(q => q.status === "downloading").length;
  const doneCount = queue.filter(q => q.status === "done").length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start">
      {/* ── Left: Config ─────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="p-6 flex flex-col gap-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">YouTube</p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Video Grabber
            </h2>
          </div>

          {/* Add URL input */}
          <div>
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-3 text-zinc-500">
                <LinkIcon size={16}/> <h3 className="font-bold text-[10px] uppercase tracking-widest">Add Links</h3>
              </div>
              <button 
                onClick={() => setPlaylistMode(!playlistMode)}
                className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-colors ${playlistMode ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                <ListVideo size={10} className="inline mr-1" /> Playlist Mode
              </button>
            </div>

            {!bulkMode ? (
              <div className="space-y-3">
                <div className="relative flex items-center">
                  <input type="url" placeholder="Paste YouTube URL..."
                    value={urlInput} onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSingleUrl()}
                    className="w-full pl-10 pr-12 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:border-zinc-500 focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:focus:ring-white/5 font-medium" />
                  <Search size={15} className="absolute left-3.5 text-zinc-400" />
                  <button onClick={handlePaste} aria-label="Paste" title="Paste from clipboard"
                    className="absolute right-3 p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <Clipboard size={16} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => addSingleUrl()}
                    disabled={isAdding || !urlInput.trim()} icon={isAdding ? Loader2 : Plus}>
                    {isAdding ? "Fetching..." : "Fetch Info"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBulkMode(true)} icon={List}>
                    Bulk
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea rows={5} placeholder="Paste multiple YouTube URLs (one per line)..."
                  value={bulkText} onChange={e => setBulkText(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:border-zinc-500 focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:focus:ring-white/5 font-mono resize-none" />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" className="flex-1" onClick={addBulkUrls}
                    disabled={isAdding} icon={isAdding ? Loader2 : Plus}>
                    Add All
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBulkMode(false)} icon={X}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Batch actions */}
          {queue.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="primary" size="lg" className="w-full"
                disabled={readyCount === 0 || downloadingCount > 0}
                onClick={downloadAll} icon={downloadingCount > 0 ? Loader2 : Download}>
                {downloadingCount > 0 ? "Downloading..." : `Download All (${readyCount})`}
              </Button>
              {doneCount > 0 && (
                <Button variant="ghost" size="sm" className="w-full" onClick={clearDone} icon={Trash2}>
                  Clear Finished ({doneCount})
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* History Section */}
        {history.length > 0 && (
          <Card className="p-5 bg-zinc-50 dark:bg-zinc-800/50">
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
                     <span>{h.quality} • {h.format.toUpperCase()} • {formatTime(h.length)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </aside>

      {/* ── Right: Queue ─────────────────────────────────── */}
      <section className="grid content-start gap-5 panel-enter-main">
        <div className="flex justify-between items-center px-2">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${queue.length > 0 ? "bg-zinc-900 dark:bg-zinc-100 animate-pulse" : "bg-zinc-300 dark:bg-zinc-700"}`} />
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              Download Queue <Badge variant="default">{queue.length}</Badge>
            </h3>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="h-[400px] border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center space-y-6 border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/30">
            <div className="w-20 h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800 grid place-items-center text-zinc-400">
              <Video size={36} className="icon-float" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-black tracking-tight uppercase text-zinc-900 dark:text-zinc-100">
                No Videos Yet
              </p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">
                Paste YouTube URLs to fetch metadata
              </p>
              <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">
                Supports quality selection, trimming, playlists, and subtitles.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {queue.map(item => (
              <QueueItem key={item.id} item={item}
                onRemove={removeItem} onUpdate={updateItem} onDownload={downloadItem} onDownloadSubtitles={downloadSubtitles} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
