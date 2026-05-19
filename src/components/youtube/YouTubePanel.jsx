import React, { useState, useCallback, useEffect } from "react";
import {
  Download, Trash2, Plus, Loader2, Link as LinkIcon, 
  X, List, Video, Search, Clipboard, ListVideo
} from "lucide-react";
import { Card, Button, Badge } from "../ui";

import { isValidYoutubeUrl, loadHistory, saveHistory } from "./youtubeUtils";
import QueueItem from "./QueueItem";
import DownloadHistory from "./DownloadHistory";

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

      // Add to history immediately upon successful fetch
      setHistory(prev => {
        const filtered = prev.filter(h => h.url !== url);
        const histItem = {
          id: crypto.randomUUID(), 
          title: data.title, 
          date: new Date().toISOString(),
          url: url, 
          thumbnail: data.thumbnail,
          length: data.duration,
          isYouTube: true
        };
        const newHist = [histItem, ...filtered].slice(0, 50);
        saveHistory(newHist);
        return newHist;
      });
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
    const rawUrls = bulkText.split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean);
    const urls = [...new Set(rawUrls)].filter(isValidYoutubeUrl);

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

    // Update history with quality and format after successful download
    setHistory(prev => {
      const updated = prev.map(h => {
        if (h.url === item.url) {
          return {
            ...h,
            quality: item.quality,
            format: item.format,
            date: new Date().toISOString()
          };
        }
        return h;
      });
      saveHistory(updated);
      return updated;
    });

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
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start w-full">
      {/* ── Left: Config ─────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside w-full">
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
                className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-colors flex items-center ${playlistMode ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white/60 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                <ListVideo size={10} className="mr-1" /> <span className="hidden sm:inline">Playlist Mode</span><span className="sm:hidden">Playlist</span>
              </button>
            </div>

            <div className="space-y-3 relative transition-all duration-300">
              {!bulkMode ? (
                <div className="relative flex items-center w-full">
                  <input type="url" placeholder="Paste YouTube URL..."
                    value={urlInput} onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSingleUrl()}
                    className="w-full pl-10 pr-12 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:border-zinc-500 focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:focus:ring-white/5 font-medium shadow-inner-sm" />
                  <Search size={15} className="absolute left-3.5 text-zinc-400" />
                  <button onClick={handlePaste} aria-label="Paste" title="Paste from clipboard"
                    className="absolute right-3 p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <Clipboard size={16} />
                  </button>
                </div>
              ) : (
                <textarea rows={5} placeholder="Paste multiple YouTube URLs here (newlines, commas, or spaces)..."
                  value={bulkText} onChange={e => setBulkText(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:border-zinc-500 focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:focus:ring-white/5 font-mono resize-none shadow-inner-sm min-h-[120px]" />
              )}

              {bulkMode && bulkText.trim().length > 0 && (() => {
                const urls = bulkText.split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean);
                const uniqueUrls = [...new Set(urls)];
                const parsedUrls = uniqueUrls.map(url => ({
                  url,
                  valid: isValidYoutubeUrl(url)
                }));
                const validCount = parsedUrls.filter(p => p.valid).length;
                const invalidUrls = parsedUrls.filter(p => !p.valid).map(p => p.url);

                return (
                  <div className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      <span>{parsedUrls.length} total</span>
                      <div className="flex gap-3">
                        <span className="text-emerald-600 dark:text-emerald-400">{validCount} valid</span>
                        {invalidUrls.length > 0 && <span className="text-red-600 dark:text-red-400">{invalidUrls.length} invalid</span>}
                      </div>
                    </div>
                    {invalidUrls.length > 0 && (
                      <div className="text-xs text-red-500 font-mono overflow-y-auto max-h-24 pr-1 custom-scrollbar">
                        <p className="font-bold mb-1 uppercase tracking-widest text-[9px]">Invalid links:</p>
                        {invalidUrls.map((url, i) => (
                          <div key={i} className="truncate line-through opacity-70 mb-0.5">{url}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="primary" size="sm" className="flex-1 w-full justify-center" 
                  onClick={() => {
                    if (bulkMode) {
                      addBulkUrls();
                      setBulkMode(false);
                    } else {
                      addSingleUrl();
                    }
                  }}
                  disabled={(!bulkMode && (!urlInput.trim() || isAdding)) || (bulkMode && (!bulkText.trim() || isAdding))}>
                  {isAdding ? <><Loader2 size={16} className="mr-2 animate-spin"/> {bulkMode ? 'Processing...' : 'Fetching...'}</> : <><Plus size={16} className="mr-2"/> {bulkMode ? 'Add All' : 'Fetch Info'}</>}
                </Button>
                <Button variant={bulkMode ? "primary" : "outline"} size="sm" className="w-full sm:w-auto justify-center" onClick={() => setBulkMode(!bulkMode)}>
                  {bulkMode ? 'Single Link' : <><List size={16} className="mr-2" /> Bulk</>}
                </Button>
              </div>
            </div>
          </div>

          {/* Batch actions */}
          {queue.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="primary" size="lg" className="w-full justify-center"
                disabled={readyCount === 0 || downloadingCount > 0}
                onClick={downloadAll}>
                {downloadingCount > 0 ? <><Loader2 size={18} className="mr-2 animate-spin"/> Downloading...</> : <><Download size={18} className="mr-2"/> Download All ({readyCount})</>}
              </Button>
              {doneCount > 0 && (
                <Button variant="ghost" size="sm" className="w-full justify-center" onClick={clearDone}>
                  <Trash2 size={16} className="mr-2" /> Clear Finished ({doneCount})
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* History Section */}
        <DownloadHistory history={history} clearHistory={clearHistory} onReDownload={addSingleUrl} />
      </aside>

      {/* ── Right: Queue ─────────────────────────────────── */}
      <section className="grid content-start gap-5 panel-enter-main w-full">
        <div className="flex justify-between items-center px-2">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${queue.length > 0 ? "bg-zinc-900 dark:bg-white/60 animate-pulse" : "bg-zinc-300 dark:bg-zinc-700"}`} />
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              Download Queue <Badge variant="default">{queue.length}</Badge>
            </h3>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="h-[400px] border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center space-y-6 border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/30 w-full px-4 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/60 dark:bg-zinc-800 grid place-items-center text-zinc-400">
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
          <div className="space-y-4 w-full">
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

