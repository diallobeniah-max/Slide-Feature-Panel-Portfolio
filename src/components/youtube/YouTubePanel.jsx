import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Download, Trash2, Plus, Loader2, Link as LinkIcon, 
  X, List, Video, Search, Clipboard, ListVideo, Pause, Play
} from "lucide-react";
import { Card, Button, Badge } from "../ui";
import {
  getWebDownloadFolderHandle,
  getWebDownloadFolderPreferences,
  saveBlobToWebDownloadFolder,
} from "../../utils/downloadFolders.js";

import { getVideoPlatformLabel, isSupportedVideoUrl, isYoutubeUrl, loadHistory, saveHistory } from "./youtubeUtils";
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
  const queueRef = useRef(queue);
  const activeDownloadsRef = useRef(new Map());
  const [desktopPrefs, setDesktopPrefs] = useState(() =>
    window.contentFlow?.desktop?.getPreferences ? null : getWebDownloadFolderPreferences(),
  );

  // History state
  const [history, setHistory] = useState([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => {
    const loadPrefs = () => {
      if (window.contentFlow?.desktop?.getPreferences) {
        window.contentFlow.desktop.getPreferences().then((prefs) => setDesktopPrefs(prefs || null)).catch(() => {});
      } else {
        setDesktopPrefs(getWebDownloadFolderPreferences());
      }
    };
    loadPrefs();
    window.addEventListener("contentflow-download-folders-changed", loadPrefs);
    return () => window.removeEventListener("contentflow-download-folders-changed", loadPrefs);
  }, []);

  const updateItem = useCallback((id, patch) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      setHistory(prev => {
        const updated = prev.map(h => {
          const item = queue.find(q => q.id === id);
          return item && h.url === item.url ? { ...h, title: patch.title } : h;
        });
        saveHistory(updated);
        return updated;
      });
    }
  }, [queue]);

  const removeItem = useCallback((id) => {
    activeDownloadsRef.current.get(id)?.controller.abort();
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  // Handle pasting from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error("Clipboard empty");
      setUrlInput(text);
      if (isSupportedVideoUrl(text)) {
        addSingleUrl(text);
      } else {
        window.dispatchEvent(new CustomEvent("studio-notify", {
          detail: { title: "Invalid URL", message: "Clipboard does not contain a supported video link.", type: "warning" }
        }));
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Paste Failed", message: "Could not read clipboard. Please paste manually.", type: "error" }
      }));
    }
  };

  const fetchInfo = useCallback(async (url, options = {}) => {
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
        ...q, title: options.title || data.title, channel: data.channel,
        thumbnail: data.thumbnail, duration: data.duration,
        trimEnd: data.duration, status: "ready",
        platform: data.platform, platformLabel: getVideoPlatformLabel(data.platform),
        qualities: data.qualities, bestSize: data.bestSize, audioSize: data.audioSize,
        subtitleLangs: data.subtitleLangs, viewCount: data.viewCount
      } : q));
      const readyItem = {
        ...item,
        title: options.title || data.title,
        channel: data.channel,
        thumbnail: data.thumbnail,
        duration: data.duration,
        trimEnd: data.duration,
        status: "ready",
        platform: data.platform,
        platformLabel: getVideoPlatformLabel(data.platform),
        qualities: data.qualities,
        bestSize: data.bestSize,
        audioSize: data.audioSize,
        subtitleLangs: data.subtitleLangs,
        viewCount: data.viewCount,
      };

      // Add to history immediately upon successful fetch
      setHistory(prev => {
        const filtered = prev.filter(h => h.url !== url);
        const histItem = {
          id: crypto.randomUUID(), 
          title: options.title || data.title,
          date: new Date().toISOString(),
          url: url, 
          thumbnail: data.thumbnail,
          length: data.duration,
          platform: data.platform,
          platformLabel: getVideoPlatformLabel(data.platform),
          isYouTube: data.platform === "youtube"
        };
        const newHist = [histItem, ...filtered].slice(0, 50);
        saveHistory(newHist);
        return newHist;
      });
      if (options.autoDownload) {
        await startDownloadForItem(readyItem);
      }
      return readyItem;
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === id ? {
        ...q, status: "error", error: err.message,
      } : q));
      return null;
    }
  }, [globalFormat, desktopPrefs]);

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
    if (!isSupportedVideoUrl(url)) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Invalid URL", message: "Please enter a YouTube, Facebook, or Instagram link.", type: "error" }
      }));
      return;
    }
    setIsAdding(true);
    setUrlInput("");
    if (playlistMode && isYoutubeUrl(url) && (url.includes('list=') || url.includes('playlist'))) {
      await fetchPlaylist(url);
    } else {
      await fetchInfo(url);
    }
    setIsAdding(false);
  };

  const addBulkUrls = async () => {
    const rawUrls = bulkText.split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean);
    const urls = [...new Set(rawUrls)].filter(isSupportedVideoUrl);

    if (urls.length === 0) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "No valid URLs", message: "No supported YouTube, Facebook, or Instagram links found in the text.", type: "error" }
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
  const readProgressStream = async (res, id, safeName, ext, item, directoryHandle = null) => {
    const contentLength = res.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    let loaded = 0;
    const streamStartedAt = Date.now();

    const formatEta = (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return "Almost done";
      if (seconds < 60) return `${Math.ceil(seconds)}s left`;
      return `${Math.ceil(seconds / 60)}m left`;
    };

    const reader = res.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      
      if (total) {
        const progress = Math.min(99, Math.round((loaded / total) * 100));
        const elapsed = Math.max(0.5, (Date.now() - streamStartedAt) / 1000);
        const speed = loaded / elapsed;
        const eta = speed > 0 ? formatEta((total - loaded) / speed) : "";
        setQueue(prev => prev.map(q => q.id === id ? { ...q, progress, eta, stage: 'Downloading...' } : q));
      } else {
        // Indeterminate progress (just keep stage active)
        setQueue(prev => prev.map(q => q.id === id ? { ...q, stage: 'Processing & Downloading...', eta: 'Working...' } : q));
      }
    }

    setQueue(prev => prev.map(q => q.id === id ? { ...q, progress: 100, eta: 'Almost done', stage: 'Finalizing...' } : q));

    const blob = new Blob(chunks, { type: res.headers.get('content-type') });
    const disposition = res.headers.get("content-disposition") || "";
    const headerName = disposition.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i)?.[1];
    const fileName = headerName ? decodeURIComponent(headerName.replace(/^"|"$/g, "")) : `${safeName}.${ext}`;
    if (directoryHandle) {
      await saveBlobToWebDownloadFolder(directoryHandle, fileName, blob);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: "done", downloadKind: null, eta: "", progress: 100 } : q));

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
      detail: { title: "Download Complete", message: directoryHandle ? `${fileName} saved to your default folder.` : fileName, type: "success" }
    }));
  };

  const getVideoGrabberFolder = useCallback(() => {
    const folders = desktopPrefs?.downloadFolders || {};
    return folders.useVideoGrabberForAll ? folders.videoGrabber : folders.videoGrabber;
  }, [desktopPrefs]);

  const markHistoryDownloaded = useCallback((item) => {
    setHistory(prev => {
      const updated = prev.map(h => {
        if (h.url === item.url) {
          return {
            ...h,
            title: item.title,
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
  }, []);

  const startDownloadForItem = useCallback(async (item, controller) => {
    if (!item) return;
    const id = item.id;
    const downloadSessionId = item.downloadSessionId || crypto.randomUUID();
    const startingProgress = item.status === "paused" ? (item.progress || 0) : 0;

    setQueue(prev => prev.map(q => q.id === id ? {
      ...q,
      status: "downloading",
      downloadKind: "video",
      downloadSessionId,
      progress: startingProgress,
      eta: "Calculating...",
      stage: startingProgress > 0 ? "Resuming..." : "Preparing...",
      error: null,
    } : q));

    const startedAt = Date.now();
    const estimatedSeconds = Math.max(18, Math.min(240, (item.duration || 120) / 5));
    const formatEta = (seconds) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return "Almost done";
      if (seconds < 60) return `${Math.ceil(seconds)}s left`;
      return `${Math.ceil(seconds / 60)}m left`;
    };
    const preparingProgress = window.setInterval(() => {
      setQueue(prev => prev.map(q => {
        if (q.id !== id || q.status !== "downloading") return q;
        const elapsed = (Date.now() - startedAt) / 1000;
        const current = q.progress || 0;
        const planned = Math.round((elapsed / estimatedSeconds) * 92);
        const drift = elapsed > estimatedSeconds ? Math.min(98, current + 1) : planned;
        const progress = Math.min(98, Math.max(current, drift));
        return {
          ...q,
          progress,
          eta: formatEta(Math.max(1, estimatedSeconds - elapsed)),
          stage: progress < 8 ? "Preparing..." : "Processing video...",
        };
      }));
    }, 900);

    try {
      let webDirectoryHandle = null;
      if (!window.contentFlow?.platform?.isElectron && desktopPrefs?.downloadFolders?.videoGrabber) {
        try {
          webDirectoryHandle = await getWebDownloadFolderHandle("videoGrabber", true);
        } catch {
          window.dispatchEvent(new CustomEvent("studio-notify", {
            detail: { title: "Folder Permission Needed", message: "The download will use your browser's normal download location this time.", type: "warning" },
          }));
        }
      }
      const res = await fetch("/api/yt/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: item.url,
          start: item.trimStart > 0 ? item.trimStart : undefined,
          end: item.trimEnd > 0 && item.trimEnd < item.duration ? item.trimEnd : undefined,
          format: item.quality === "audio" ? "mp3" : item.format,
          quality: item.quality,
          folderPath: getVideoGrabberFolder() || undefined,
          fileName: item.title || undefined,
          downloadId: downloadSessionId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = "Download failed";
        try { errMsg = JSON.parse(text).error; } catch {}
        throw new Error(errMsg);
      }

      const ext = item.quality === 'audio' || item.format === 'mp3' ? 'mp3' : item.format;
      const safeName = (item.title || "video").replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60);

      window.clearInterval(preparingProgress);
      if ((res.headers.get("content-type") || "").includes("application/json")) {
        const data = await res.json();
        setQueue(prev => prev.map(q => q.id === id ? {
          ...q,
          status: "done",
          progress: 100,
          eta: "",
          stage: "Saved",
          downloadKind: null,
          savedPath: data.path || "",
        } : q));
        markHistoryDownloaded(item);
        window.dispatchEvent(new CustomEvent("studio-notify", {
          detail: { title: "Download Saved", message: data.filename || safeName, type: "success" }
        }));
      } else {
        await readProgressStream(res, id, safeName, ext, item, webDirectoryHandle);
      }

    } catch (err) {
      window.clearInterval(preparingProgress);
      if (err?.name === "AbortError") {
        setQueue(prev => prev.map(q => q.id === id ? {
          ...q,
          status: "paused",
          eta: "",
          stage: "Paused",
          error: null,
        } : q));
        return;
      }
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: "error", downloadKind: null, eta: "", error: err.message } : q));
    }
  }, [getVideoGrabberFolder, markHistoryDownloaded, readProgressStream]);

  const downloadItem = useCallback(async (id) => {
    const existing = activeDownloadsRef.current.get(id);
    if (existing) await existing.promise;
    const item = queueRef.current.find(q => q.id === id);
    if (!item) return;
    const controller = new AbortController();
    const promise = startDownloadForItem(item, controller).finally(() => {
      const current = activeDownloadsRef.current.get(id);
      if (current?.controller === controller) activeDownloadsRef.current.delete(id);
    });
    activeDownloadsRef.current.set(id, { controller, promise });
    await promise;
  }, [startDownloadForItem]);

  const pauseDownload = useCallback((id) => {
    activeDownloadsRef.current.get(id)?.controller.abort();
    setQueue(prev => prev.map(item => item.id === id && item.status === "downloading"
      ? { ...item, status: "paused", eta: "", stage: "Paused" }
      : item));
  }, []);

  const pauseAllDownloads = useCallback(() => {
    for (const { controller } of activeDownloadsRef.current.values()) controller.abort();
    setQueue(prev => prev.map(item => item.status === "downloading" && item.downloadKind === "video"
      ? { ...item, status: "paused", eta: "", stage: "Paused" }
      : item));
  }, []);

  const resumeAllDownloads = useCallback(async () => {
    const pausedIds = queueRef.current.filter(item => item.status === "paused").map(item => item.id);
    await Promise.allSettled(pausedIds.map(downloadItem));
  }, [downloadItem]);

  const downloadSubtitles = async (item, lang, format) => {
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "downloading", downloadKind: "subtitles", progress: 50, stage: 'Fetching Subtitles' } : q));
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
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "ready", downloadKind: null, progress: 0 } : q));
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Subtitles Downloaded", message: `${lang} subtitles saved.`, type: "success" }
      }));
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", error: err.message } : q));
    }
  };

  const downloadAll = async () => {
    const ready = queue.filter(q => q.status === "ready");
    await Promise.allSettled(ready.map(item => downloadItem(item.id)));
  };

  const downloadSelectedHistory = async (items) => {
    for (const item of items) {
      await fetchInfo(item.url, {
        autoDownload: true,
        title: item.title,
      });
    }
  };

  const clearDone = () => setQueue(prev => prev.filter(q => q.status !== "done" && q.status !== "error"));
  const clearHistory = () => { setHistory([]); saveHistory([]); };

  const readyCount = queue.filter(q => q.status === "ready").length;
  const downloadingCount = queue.filter(q => q.status === "downloading").length;
  const activeVideoCount = queue.filter(q => q.status === "downloading" && q.downloadKind === "video").length;
  const pausedCount = queue.filter(q => q.status === "paused").length;
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
            <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              YouTube, Facebook, and Instagram links.
            </p>
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
                  <input type="url" placeholder="Paste YouTube, Facebook, or Instagram URL..."
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
                <textarea rows={5} placeholder="Paste multiple YouTube, Facebook, or Instagram URLs here..."
                  value={bulkText} onChange={e => setBulkText(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:border-zinc-500 focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:focus:ring-white/5 font-mono resize-none shadow-inner-sm min-h-[120px]" />
              )}

              {bulkMode && bulkText.trim().length > 0 && (() => {
                const urls = bulkText.split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean);
                const uniqueUrls = [...new Set(urls)];
                const parsedUrls = uniqueUrls.map(url => ({
                  url,
                  valid: isSupportedVideoUrl(url)
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
              {activeVideoCount > 0 && (
                <Button variant="outline" size="md" className="w-full justify-center" onClick={pauseAllDownloads}>
                  <Pause size={17} className="mr-2" /> Pause All ({activeVideoCount})
                </Button>
              )}
              {activeVideoCount === 0 && pausedCount > 0 && (
                <Button variant="primary" size="md" className="w-full justify-center" onClick={resumeAllDownloads}>
                  <Play size={17} className="mr-2" /> Resume All ({pausedCount})
                </Button>
              )}
              {doneCount > 0 && (
                <Button variant="ghost" size="sm" className="w-full justify-center" onClick={clearDone}>
                  <Trash2 size={16} className="mr-2" /> Clear Finished ({doneCount})
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* History Section */}
        <DownloadHistory
          history={history}
          clearHistory={clearHistory}
          onReDownload={addSingleUrl}
          onDownloadSelected={downloadSelectedHistory}
        />
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
                Paste YouTube, Facebook, or Instagram links to fetch metadata
              </p>
              <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">
                Supports quality selection, trimming, YouTube playlists, and subtitles when available.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {queue.map(item => (
              <QueueItem key={item.id} item={item}
                onRemove={removeItem} onUpdate={updateItem} onDownload={downloadItem}
                onPause={pauseDownload} onResume={downloadItem} onDownloadSubtitles={downloadSubtitles} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
