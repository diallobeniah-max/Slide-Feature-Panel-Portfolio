import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Image as ImageIcon, RefreshCw, Upload, X, Zap } from "lucide-react";
import { Badge, Button, Card } from "../ui.jsx";
import GalleryEmptyState from "./GalleryEmptyState.jsx";
import GalleryHome from "./GalleryHome.jsx";
import GalleryProgress from "./GalleryProgress.jsx";
import GalleryToolbar from "./GalleryToolbar.jsx";
import GalleryViewer from "./GalleryViewer.jsx";
import VirtualizedGalleryLibrary from "./VirtualizedGalleryLibrary.jsx";
import { getMediaMonthKey, groupMediaByMonth, sortGalleryItems } from "../../utils/galleryGrouping.js";
import { clearLocalGalleryTags, getLocalMediaTags, saveLocalMediaTags } from "../../utils/galleryCache.js";
import { isImageMedia, isVideoMedia } from "../../utils/mediaTypes.js";

const GALLERY_SHELL_CLASS =
  "flow-page grid w-full max-w-[1536px] min-w-0 gap-5 overflow-x-hidden";
const LARGE_FOLDER_THRESHOLD = 500;
const LIBRARY_BATCH_SIZE = 20;
const PREVIEW_BATCH_SIZE = 20;
const GALLERY_VIEW_STATE_KEY = "flow-gallery-view-state-v1";

const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );

function getGalleryApi() {
  return window.flowGallery || null;
}

function mergeTags(items, tagsById) {
  return items.map((item) => ({
    ...item,
    tags: tagsById?.[item.id] || item.tags || [],
  }));
}

function countMedia(items) {
  return {
    total: items.length,
    images: items.filter(isImageMedia).length,
    videos: items.filter(isVideoMedia).length,
  };
}

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function loadGalleryViewState() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_VIEW_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function isAcceptedDropFile(file) {
  return file?.type?.startsWith("image/") || file?.type?.startsWith("video/");
}

function hasExternalFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function DroppedMediaPreview({ items, selectedIndex, onSelect, onClose }) {
  const active = items[selectedIndex] || items[0];
  const isVideo = active?.type?.startsWith("video/");

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-xl" onClick={onClose} />
      <div className="relative flex h-[min(88vh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-900 text-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Placement Preview
            </p>
            <h3 className="mt-1 truncate text-base font-black tracking-tight">{active.name}</h3>
            <p className="mt-1 truncate text-[11px] font-semibold text-zinc-500" title={active.path || active.name}>
              {active.path || active.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default">
              {String(selectedIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </Badge>
            <Button icon={X} size="icon" variant="secondary" onClick={onClose} aria-label="Close preview" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 bg-zinc-950 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative grid min-h-0 place-items-center overflow-hidden bg-black p-5">
            {isVideo ? (
              <video src={active.url} controls playsInline className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
            ) : (
              <img src={active.url} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
            )}
          </div>
          <aside className="grid min-h-0 content-start gap-4 border-t border-zinc-800 bg-zinc-900 p-5 lg:border-l lg:border-t-0">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Place In
              </p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-zinc-950">
                    <Check size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-black">Current gallery</p>
                    <p className="text-[11px] font-semibold text-zinc-500">
                      Preview before adding to your collection.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/30 p-3 text-[11px] font-semibold leading-relaxed text-zinc-500">
                  The original file is untouched. Choose a folder from the gallery controls when you want this saved into a specific collection.
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 p-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(index)}
                className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-zinc-950 transition ${
                  index === selectedIndex ? "border-white shadow-lg" : "border-transparent opacity-65 hover:opacity-100"
                }`}
                aria-label={`Preview ${item.name}`}
              >
                {item.type.startsWith("video/") ? (
                  <video src={item.url} className="h-full w-full object-cover" muted />
                ) : (
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LocalGallery() {
  const savedViewState = useMemo(loadGalleryViewState, []);
  const [folderPath, setFolderPath] = useState(savedViewState.folderPath || "");
  const [items, setItems] = useState([]);
  const [tagsById, setTagsById] = useState({});
  const [filter, setFilter] = useState(savedViewState.filter || "all");
  const [sortMode, setSortMode] = useState(savedViewState.sortMode || "newest");
  const [query, setQuery] = useState(savedViewState.query || "");
  const [tagFilter, setTagFilter] = useState(savedViewState.tagFilter || "");
  const [monthFilter, setMonthFilter] = useState(savedViewState.monthFilter || "");
  const [pinnedMonthKeys, setPinnedMonthKeys] = useState(savedViewState.pinnedMonthKeys || []);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [scanCounts, setScanCounts] = useState({ total: 0, images: 0, videos: 0 });
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [viewerItems, setViewerItems] = useState([]);
  const [galleryView, setGalleryView] = useState(savedViewState.galleryView || "collections");
  const [navBackStack, setNavBackStack] = useState([]);
  const [navForwardStack, setNavForwardStack] = useState([]);
  const [libraryLimit, setLibraryLimit] = useState(LIBRARY_BATCH_SIZE);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [dropArmed, setDropArmed] = useState(false);
  const [droppedItems, setDroppedItems] = useState([]);
  const [droppedIndex, setDroppedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const debouncedQuery = useDebouncedValue(query);
  const searchRef = useRef(null);
  const restoreAttemptedRef = useRef(false);
  const galleryApi = getGalleryApi();
  const isElectron = Boolean(galleryApi);
  const isExternalDragActive = dragDepth > 0;

  useEffect(() => {
    if (!galleryApi) {
      setTagsById(getLocalMediaTags());
      return undefined;
    }

    let cancelled = false;
    Promise.all([
      galleryApi.getLastFolder(),
      galleryApi.getLastScan?.(),
      galleryApi.getMediaTags(),
    ]).then(([lastFolder, lastScan, nextTags]) => {
      if (cancelled) return;
      setFolderPath(lastFolder || "");
      setTagsById(nextTags || {});
      if (lastScan?.items?.length) {
        setItems(lastScan.items);
        setScanCounts(lastScan.counts || countMedia(lastScan.items));
        setError(lastScan.error || "");
      }
    });
    const removeProgress = galleryApi.onProgress((payload) => {
      setProgress(payload);
    });

    return () => {
      cancelled = true;
      removeProgress?.();
    };
  }, [galleryApi]);

  useEffect(() => {
    return () => {
      droppedItems.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [droppedItems]);

  useEffect(() => {
    localStorage.setItem(
      GALLERY_VIEW_STATE_KEY,
      JSON.stringify({
        folderPath,
        filter,
        sortMode,
        query,
        tagFilter,
        monthFilter,
        galleryView,
        pinnedMonthKeys,
      }),
    );
  }, [filter, folderPath, galleryView, monthFilter, pinnedMonthKeys, query, sortMode, tagFilter]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        selectFolder();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const itemsWithTags = useMemo(() => mergeTags(items, tagsById), [items, tagsById]);

  const availableTags = useMemo(() => {
    const allTags = new Set();
    itemsWithTags.forEach((item) => item.tags?.forEach((tag) => allTags.add(tag)));
    return [...allTags].sort((a, b) => a.localeCompare(b));
  }, [itemsWithTags]);

  const filteredItems = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const filtered = itemsWithTags.filter((item) => {
      if (filter === "images" && !isImageMedia(item)) return false;
      if (filter === "videos" && !isVideoMedia(item)) return false;
      if (q && !String(item.name || "").toLowerCase().includes(q)) return false;
      if (tagFilter && !item.tags?.includes(tagFilter)) return false;
      if (monthFilter && getMediaMonthKey(item) !== monthFilter) return false;
      return true;
    });
    return sortGalleryItems(filtered, sortMode);
  }, [debouncedQuery, filter, itemsWithTags, monthFilter, sortMode, tagFilter]);

  const monthFilterTitle = useMemo(() => {
    if (!monthFilter) return "";
    return groupMediaByMonth(itemsWithTags).find((group) => group.key === monthFilter)?.title || "";
  }, [itemsWithTags, monthFilter]);

  const counts = useMemo(
    () => (items.length ? { ...scanCounts, ...countMedia(items) } : scanCounts),
    [items, scanCounts],
  );
  const libraryItems = useMemo(
    () => filteredItems.slice(0, Math.min(libraryLimit, filteredItems.length)),
    [filteredItems, libraryLimit],
  );
  const duplicateGroupCount = useMemo(() => {
    const groupsByIdentity = new Map();
    items.forEach((item) => {
      const key = `${String(item.name || "").toLowerCase()}:${item.size || 0}`;
      groupsByIdentity.set(key, (groupsByIdentity.get(key) || 0) + 1);
    });
    return [...groupsByIdentity.values()].filter((count) => count > 1).length;
  }, [items]);

  function snapshotGalleryState(overrides = {}) {
    return {
      galleryView,
      filter,
      sortMode,
      query,
      tagFilter,
      monthFilter,
      viewerIndex,
      ...overrides,
    };
  }

  function applyGalleryState(state) {
    if (!state) return;
    if (Object.hasOwn(state, "galleryView")) setGalleryView(state.galleryView || "collections");
    if (Object.hasOwn(state, "filter")) setFilter(state.filter || "all");
    if (Object.hasOwn(state, "sortMode")) setSortMode(state.sortMode || "newest");
    if (Object.hasOwn(state, "query")) setQuery(state.query || "");
    if (Object.hasOwn(state, "tagFilter")) setTagFilter(state.tagFilter || "");
    if (Object.hasOwn(state, "monthFilter")) setMonthFilter(state.monthFilter || "");
    if (Object.hasOwn(state, "viewerIndex")) {
      setViewerIndex(Number.isFinite(state.viewerIndex) ? state.viewerIndex : -1);
    }
  }

  function pushNavigation(nextState) {
    setNavBackStack((stack) => [...stack.slice(-24), snapshotGalleryState()]);
    setNavForwardStack([]);
    applyGalleryState(nextState);
  }

  function handleBack() {
    setNavBackStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setNavForwardStack((forward) => [snapshotGalleryState(), ...forward.slice(0, 24)]);
      applyGalleryState(previous);
      return stack.slice(0, -1);
    });
  }

  function handleForward() {
    setNavForwardStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[0];
      setNavBackStack((back) => [...back.slice(-24), snapshotGalleryState()]);
      applyGalleryState(next);
      return stack.slice(1);
    });
  }

  function changeGalleryView(nextView) {
    if (nextView === galleryView) return;
    if (nextView === "library") {
      setLibraryLimit(LIBRARY_BATCH_SIZE);
      galleryApi?.pauseThumbnailCache?.();
    }
    pushNavigation({ galleryView: nextView, viewerIndex: -1 });
  }

  useEffect(() => {
    if (galleryView === "library") return undefined;
    galleryApi?.pauseThumbnailCache?.();
    return () => {
      galleryApi?.pauseThumbnailCache?.();
    };
  }, [galleryApi, galleryView]);

  useEffect(() => {
    setLibraryLimit(LIBRARY_BATCH_SIZE);
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [debouncedQuery, filter, sortMode, tagFilter]);

  useEffect(() => {
    if (!galleryApi?.onThumbnailProgress) return undefined;
    return galleryApi.onThumbnailProgress((payload) => setCacheStatus(payload));
  }, [galleryApi]);

  useEffect(() => {
    if (
      !galleryApi ||
      !folderPath ||
      items.length > 0 ||
      loading ||
      restoreAttemptedRef.current
    ) {
      return;
    }
    restoreAttemptedRef.current = true;
    scanFolder(folderPath);
  }, [folderPath, galleryApi, items.length, loading]);

  async function scanFolder(targetFolder = folderPath) {
    if (!galleryApi) return;
    if (!targetFolder) {
      await selectFolder();
      return;
    }

    setLoading(true);
    setError("");
    setProgress({
      phase: "starting",
      found: 0,
      images: 0,
      videos: 0,
      skipped: 0,
      scannedFiles: 0,
      discoveredFiles: 0,
      scannedFolders: 0,
    });
    setViewerIndex(-1);
    setViewerItems([]);
    setNavBackStack([]);
    setNavForwardStack([]);
    setLibraryLimit(LIBRARY_BATCH_SIZE);
    setCacheStatus(null);
    setMonthFilter("");

    const result = await galleryApi.scanFolder(targetFolder);
    setLoading(false);

    if (result.canceled) {
      setProgress(null);
      setScanCounts(result.counts || scanCounts);
      notify("Gallery Scan Cancelled", "The folder scan was stopped cleanly.", "error");
      return;
    }

    if (result.errors?.length) {
      setError(result.errors[0].message || "Some files could not be read.");
    }

    const nextTags = (await galleryApi.getMediaTags()) || {};
    setTagsById(nextTags);
    setFolderPath(result.folderPath || targetFolder);
    setItems(result.items || []);
    setScanCounts(result.counts || countMedia(result.items || []));
    setGalleryView("collections");
    setProgress(null);
    galleryApi.pauseThumbnailCache?.();
    notify(
      "Gallery Ready",
      `${result.counts?.total || result.items?.length || 0} media file${
        (result.counts?.total || result.items?.length || 0) === 1 ? "" : "s"
      } loaded.`,
    );
  }

  async function selectFolder() {
    if (!galleryApi) return;
    const selected = await galleryApi.selectFolder();
    if (selected.canceled || !selected.folderPath) return;
    setFolderPath(selected.folderPath);
    await scanFolder(selected.folderPath);
  }

  async function cancelScan() {
    await galleryApi?.cancelScan();
    setLoading(false);
    setProgress(null);
  }

  async function saveTags(mediaId, tags) {
    const cleanTags = galleryApi
      ? await galleryApi.saveMediaTags(mediaId, tags)
      : saveLocalMediaTags(mediaId, tags);
    setTagsById((current) => ({ ...current, [mediaId]: cleanTags }));
  }

  async function clearTags() {
    if (galleryApi) {
      await galleryApi.clearLocalTags();
    } else {
      clearLocalGalleryTags();
    }
    setTagsById({});
    notify("Tags Cleared", "Local gallery tags were cleared.");
  }

  function openMonth(monthKey) {
    pushNavigation({
      galleryView: "library",
      filter: "all",
      tagFilter: "",
      monthFilter: monthKey,
      viewerIndex: -1,
    });
  }

  function togglePinnedMonth(monthKey) {
    if (!monthKey) return;
    const monthTitle =
      groupMediaByMonth(itemsWithTags).find((group) => group.key === monthKey)?.title || "Month";
    setPinnedMonthKeys((current) => {
      const alreadyPinned = current.includes(monthKey);
      const next = alreadyPinned
        ? current.filter((key) => key !== monthKey)
        : [monthKey, ...current].slice(0, 24);
      notify(
        alreadyPinned ? "Month Unpinned" : "Month Pinned",
        `${monthTitle} ${alreadyPinned ? "was removed from pinned months." : "will stay in pinned months."}`,
      );
      return next;
    });
  }

  function getPreviewSource(item, sourceItems = filteredItems) {
    const source = sourceItems.length ? sourceItems : filteredItems;
    const index = source.findIndex((candidate) => candidate.id === item.id);
    if (index < 0) return { source: [], index: -1 };
    const half = Math.floor(PREVIEW_BATCH_SIZE / 2);
    const start = Math.max(0, Math.min(index - half, source.length - PREVIEW_BATCH_SIZE));
    const batch = source.slice(start, start + PREVIEW_BATCH_SIZE);
    return { source: batch, index: batch.findIndex((candidate) => candidate.id === item.id) };
  }

  function openItem(item, sourceItems = filteredItems) {
    const { source, index } = getPreviewSource(item, sourceItems);
    if (index < 0) return;
    setViewerItems(source);
    pushNavigation({ galleryView, viewerIndex: index });
  }

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getDragItems(item) {
    if (!selectedIds.has(item.id)) return item;
    const selected = libraryItems.filter((candidate) => selectedIds.has(candidate.id));
    return selected.length ? selected : item;
  }

  function handleDragEnter(event) {
    if (!hasExternalFiles(event)) return;
    event.preventDefault();
    setDragDepth((value) => value + 1);
    setDropArmed(false);
  }

  function handleDragOver(event) {
    if (!hasExternalFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropArmed(true);
  }

  function handleDragLeave(event) {
    if (!hasExternalFiles(event)) return;
    event.preventDefault();
    setDragDepth((value) => Math.max(0, value - 1));
    setDropArmed(false);
  }

  function handleDrop(event) {
    if (!hasExternalFiles(event)) return;
    event.preventDefault();
    setDragDepth(0);
    setDropArmed(false);

    const files = Array.from(event.dataTransfer.files || []).filter(isAcceptedDropFile);
    if (!files.length) {
      notify("Drop Skipped", "Drop image or video files to preview them in the gallery.", "error");
      return;
    }

    setDroppedItems((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return files.map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        name: file.name,
        path: file.path || file.name,
        type: file.type || "image",
        size: file.size,
        url: URL.createObjectURL(file),
      }));
    });
    setDroppedIndex(0);
    notify("Drop Ready", `${files.length} file${files.length === 1 ? "" : "s"} ready to preview.`);
  }

  function closeDroppedPreview() {
    setDroppedItems((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setDroppedIndex(0);
  }

  if (!isElectron) {
    return (
      <main className={GALLERY_SHELL_CLASS}>
        <GalleryEmptyState isElectron={false} />
      </main>
    );
  }

  return (
    <main
      className={`${GALLERY_SHELL_CLASS} relative`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isExternalDragActive && (
        <div className="pointer-events-none fixed inset-0 z-[8000] grid place-items-center bg-zinc-950/90 text-white backdrop-blur-xl">
          <div className="grid max-w-sm place-items-center gap-4 rounded-[32px] border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white text-zinc-950">
              <Upload size={28} />
            </span>
            <div>
              <p className="text-2xl font-black tracking-tight">
                {dropArmed ? "Drop to preview" : "Add pictures to Gallery"}
              </p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-white/60">
                Drop image or video files here to preview where they will sit before adding them.
              </p>
            </div>
          </div>
        </div>
      )}
      <GalleryToolbar
        counts={counts}
        folderPath={folderPath}
        filter={filter}
        setFilter={setFilter}
        sortMode={sortMode}
        setSortMode={setSortMode}
        query={query}
        setQuery={setQuery}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        availableTags={availableTags}
        onSelectFolder={selectFolder}
        onRefresh={() => scanFolder(folderPath)}
        searchRef={searchRef}
        galleryView={galleryView}
        setGalleryView={changeGalleryView}
        loading={loading}
        canGoBack={navBackStack.length > 0 || viewerIndex >= 0}
        canGoForward={navForwardStack.length > 0}
        onBack={viewerIndex >= 0 ? () => setViewerIndex(-1) : handleBack}
        onForward={handleForward}
      />

      {loading && <GalleryProgress progress={progress} onCancel={cancelScan} />}

      {error && (
        <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-black text-zinc-950 dark:text-white">
              Gallery scan needs attention
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-500">{error}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
              Flow keeps scanning read-only and skips unreadable files.
            </p>
          </div>
          </div>
          <Button size="sm" variant="outline" icon={RefreshCw} onClick={() => scanFolder(folderPath)}>
            Retry Scan
          </Button>
        </Card>
      )}

      {!loading && !folderPath && (
        <GalleryEmptyState isElectron onSelectFolder={selectFolder} />
      )}

      {!loading && folderPath && items.length === 0 && (
        <Card className="grid min-h-[22rem] place-items-center p-8 text-center">
          <div>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
              <ImageIcon size={25} />
            </div>
            <h2 className="text-xl font-black tracking-tight text-zinc-950 dark:text-white">
              No media found
            </h2>
            <p className="mt-2 text-sm font-medium text-zinc-500">
              This folder did not contain supported images or videos. Subfolders were checked too.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="outline" icon={RefreshCw} onClick={() => scanFolder(folderPath)}>
                Refresh
              </Button>
              <Button icon={ImageIcon} onClick={selectFolder}>
                Choose Another Folder
              </Button>
            </div>
          </div>
        </Card>
      )}

      {items.length > 0 && galleryView === "library" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">
              Showing {libraryItems.length} of {filteredItems.length}
            </Badge>
            {tagFilter && <Badge variant="warning">Tag {tagFilter}</Badge>}
            {monthFilterTitle && <Badge variant="warning">Month {monthFilterTitle}</Badge>}
            {duplicateGroupCount > 0 && (
              <Badge variant="warning">{duplicateGroupCount} possible duplicate groups</Badge>
            )}
            {filteredItems.length >= LARGE_FOLDER_THRESHOLD && (
              <Badge variant="success">Large folder mode</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {monthFilter && (
              <Button size="sm" variant="outline" onClick={() => setMonthFilter("")}>
                Clear Month
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={clearTags}>
              Clear Local Tags
            </Button>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                Clear Selection
              </Button>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && galleryView === "library" && filteredItems.length >= LARGE_FOLDER_THRESHOLD && (
        <Card className="flex items-start gap-3 p-4">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
            <Zap size={17} />
          </div>
          <div>
            <p className="text-sm font-black text-zinc-950 dark:text-white">
              Large folder detected. Loading in optimized batches.
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              Flow starts with a small batch. Use Load More when you are ready for the next group.
            </p>
          </div>
        </Card>
      )}

      {items.length > 0 && galleryView === "library" && cacheStatus?.total > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
              Generating thumbnails
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Cached thumbnails: {cacheStatus.done || 0} / {cacheStatus.total || 0}
            </p>
          </div>
          <Badge variant={cacheStatus.phase === "done" ? "success" : "default"}>
            {cacheStatus.phase === "done" ? "Cache ready" : "Background"}
          </Badge>
        </Card>
      )}

      {items.length > 0 && galleryView === "collections" && (
        <GalleryHome
          items={itemsWithTags}
          availableTags={availableTags}
          folderPath={folderPath}
          pinnedMonthKeys={pinnedMonthKeys}
          onOpenItem={(item) => openItem(item, itemsWithTags)}
          onShowLibrary={() => changeGalleryView("library")}
          onSetFilter={setFilter}
          onSetTagFilter={setTagFilter}
          onOpenMonth={openMonth}
          onTogglePinnedMonth={togglePinnedMonth}
        />
      )}

      {filteredItems.length > 0 && galleryView === "library" && (
        <VirtualizedGalleryLibrary
          items={libraryItems}
          onOpen={openItem}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
          getDragItems={getDragItems}
        />
      )}

      {galleryView === "library" && libraryLimit < filteredItems.length && (
        <Card className="grid place-items-center gap-3 p-5 text-center">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
              Optimized Library batch
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Showing {libraryItems.length} of {filteredItems.length}. Load the next {LIBRARY_BATCH_SIZE} items only when needed.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setLibraryLimit((value) =>
                Math.min(filteredItems.length, value + LIBRARY_BATCH_SIZE),
              )
            }
          >
            Load More
          </Button>
        </Card>
      )}

      {viewerIndex >= 0 && (
          <GalleryViewer
          items={viewerItems.length ? viewerItems : filteredItems}
          index={viewerIndex}
          onClose={() => setViewerIndex(-1)}
          onNavigate={setViewerIndex}
          onTagsChange={saveTags}
        />
      )}

      {droppedItems.length > 0 && (
        <DroppedMediaPreview
          items={droppedItems}
          selectedIndex={droppedIndex}
          onSelect={setDroppedIndex}
          onClose={closeDroppedPreview}
        />
      )}
    </main>
  );
}
