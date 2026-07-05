import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Eye,
  FileArchive,
  Film,
  FolderPlus,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Layers,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge, Button, Card, Input, RangeSlider } from "./ui.jsx";
import { createAssetFromFile, downloadBlob, formatBytes, processAsset, QUALITY_PRESETS } from "../utils/media.js";
import { saveBlobToPreferredFolder } from "../utils/downloadFolders.js";

const TOOLS_PRESETS_KEY = "flow-tools-presets-v1";
const PAGE_SIZE = 20;
const IMPORT_CHUNK_SIZE = 20;
const SUPPORTED_MEDIA_TYPES = ["image/", "video/"];
const BatchStudioPanel = lazy(() => import("./BatchStudio.jsx"));

const notify = (title, message, type = "success") =>
  window.dispatchEvent(new CustomEvent("studio-notify", { detail: { title, message, type } }));

function readPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOOLS_PRESETS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function cleanName(name = "file") {
  return String(name || "file")
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";
}

async function runPool(items, limit, task) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function isSupportedMediaFile(file) {
  return Boolean(file?.type && SUPPORTED_MEDIA_TYPES.some((type) => file.type.startsWith(type)));
}

function createAssetFromGalleryItem(item) {
  return {
    id: `gallery-${item.id}-${crypto.randomUUID()}`,
    galleryId: item.id,
    source: "gallery",
    file: null,
    type: item.type === "video" ? "video" : "image",
    name: item.name,
    size: Number(item.size || 0),
    objectUrl: item.url,
    thumbnailUrl: item.thumbnailUrl || item.url,
    trimStart: 0,
    trimEnd: null,
    optimizedUrl: null,
    optimizedBlob: null,
    optimizedMimeType: "",
    optimizedName: "",
    status: "queued",
    progress: 0,
    duration: 0,
  };
}

function fileFromGalleryPayload(payload, fallback) {
  const bytes = payload?.data?.type === "Buffer" ? new Uint8Array(payload.data.data) : payload?.data;
  if (!bytes) return null;
  return new File([bytes], payload.name || fallback.name, { type: payload.type || (fallback.type === "video" ? "video/mp4" : "image/jpeg") });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image compression failed.")), type, quality);
  });
}

async function decodeImageAsset(asset) {
  try {
    const bitmap = await createImageBitmap(asset.file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() };
  } catch {
    const temporaryUrl = asset.objectUrl || URL.createObjectURL(asset.file);
    const image = new Image();
    image.decoding = "async";
    image.src = temporaryUrl;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => { if (!asset.objectUrl) URL.revokeObjectURL(temporaryUrl); },
    };
  }
}

async function optimizeAsset(asset, quality, resizePercent, onProgress) {
  if (asset.type !== "image") {
    return processAsset(asset, { quality, outputMode: "video" }, onProgress);
  }
  onProgress(10);
  const decoded = await decodeImageAsset(asset);
  const scale = Math.max(0.1, Math.min(1, resizePercent / 100));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(decoded.width * scale));
  canvas.height = Math.max(1, Math.round(decoded.height * scale));
  canvas.getContext("2d", { alpha: true }).drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  decoded.cleanup();
  onProgress(70);
  const blob = await canvasBlob(canvas, "image/webp", Math.max(0.4, quality / 100));
  onProgress(100);
  return { blob, optimizedName: `${cleanName(asset.name)}.webp`, mimeType: "image/webp" };
}

async function optimizePreviewAsset(asset, quality, resizePercent, onProgress) {
  if (asset.type !== "image") return optimizeAsset(asset, quality, resizePercent, onProgress);
  onProgress(10);
  const decoded = await decodeImageAsset(asset);
  const scale = Math.max(0.1, Math.min(1, resizePercent / 100));
  const maxPreviewEdge = 1200;
  const edgeScale = Math.min(1, maxPreviewEdge / Math.max(decoded.width, decoded.height));
  const finalScale = scale * edgeScale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(decoded.width * finalScale));
  canvas.height = Math.max(1, Math.round(decoded.height * finalScale));
  canvas.getContext("2d", { alpha: true }).drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  decoded.cleanup();
  onProgress(75);
  const blob = await canvasBlob(canvas, "image/webp", Math.max(0.4, quality / 100));
  onProgress(100);
  return { blob, optimizedName: `${cleanName(asset.name)}.webp`, mimeType: "image/webp" };
}

function MediaPreview({ asset, src, label, size }) {
  const isVideo = asset?.type === "video";
  return (
    <figure className="grid min-h-40 grid-rows-[1fr_auto] overflow-hidden rounded-xl bg-zinc-950 p-3 text-white">
      {isVideo ? (
        <video src={src} controls playsInline className="m-auto max-h-40 max-w-full object-contain" />
      ) : (
        <img src={src} alt={label} className="m-auto max-h-40 max-w-full object-contain" />
      )}
      <figcaption className="mt-3 flex items-center justify-between gap-3 text-xs font-bold">
        <span>{label}</span><span>{formatBytes(size)}</span>
      </figcaption>
    </figure>
  );
}

function GalleryPicker({ open, items, selectedIds, onClose, onImport, onToggle }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visible = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-xl font-black text-zinc-950 dark:text-white">Import From Gallery</h3>
            <p className="text-xs font-semibold text-zinc-500">{selectedIds.size} selected of {items.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" icon={Plus} onClick={onImport} disabled={!selectedIds.size}>Import Selected</Button>
            <Button size="icon" variant="secondary" icon={X} onClick={onClose} aria-label="Close gallery picker" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <span className="font-mono text-xs font-bold text-zinc-500">{page + 1} / {pageCount}</span>
          <Button size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</Button>
          <Button size="sm" variant="secondary" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={`relative overflow-hidden rounded-xl border bg-zinc-950 text-left ${selectedIds.has(item.id) ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-zinc-800"}`}
              >
                {item.type === "video" ? (
                  <span className="grid aspect-square place-items-center text-white"><Film size={28} /></span>
                ) : (
                  <img src={item.thumbnailUrl || item.url} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                )}
                <span className="block truncate px-2 py-2 text-[11px] font-black text-white">{item.name}</span>
                {selectedIds.has(item.id) && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white"><Check size={14} /></span>}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function ToolsPanel() {
  const [activeToolSection, setActiveToolSection] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const pending = sessionStorage.getItem("flow-tools-section");
    if (pending) sessionStorage.removeItem("flow-tools-section");
    return params.get("workspace") === "batch" || params.get("toolsSection") === "batch" || pending === "batch" ? "batch" : "badge";
  });
  const [assets, setAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState("");
  const [quality, setQuality] = useState(76);
  const [resizePercent, setResizePercent] = useState(100);
  const [archiveFormat, setArchiveFormat] = useState("zip");
  const [archiveName, setArchiveName] = useState("flow-tools-export");
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState(readPresets);
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState([]);
  const [gallerySelected, setGallerySelected] = useState(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const cancelRef = useRef(false);
  const objectUrlsRef = useRef(new Set());
  const isDesktop = Boolean(window.flow?.desktop?.startArchive);

  const selectedAssets = useMemo(() => assets.filter((asset) => selectedIds.has(asset.id)), [assets, selectedIds]);
  const active = assets.find((asset) => asset.id === activeId) || assets[0] || null;
  const totalBytes = selectedAssets.reduce((sum, asset) => sum + asset.size, 0);
  const estimatedBytes = totalBytes * (resizePercent / 100) ** 2 * (0.2 + quality / 100 * 0.68);
  const visibleAssets = assets.slice(0, visibleCount);
  const hiddenAssetCount = Math.max(0, assets.length - visibleAssets.length);
  const toolSections = [
    { value: "badge", label: "Badge", icon: BadgeCheck },
    { value: "assist", label: "Assist", icon: Sparkles },
    { value: "batch", label: "Batch", icon: Layers },
  ];

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    const handleToolsSection = (event) => {
      const section = event.detail?.section;
      if (["badge", "assist", "batch"].includes(section)) setActiveToolSection(section);
    };
    window.addEventListener("flow-tools-section", handleToolsSection);
    return () => window.removeEventListener("flow-tools-section", handleToolsSection);
  }, []);

  async function addFiles(files, label = "files") {
    const list = Array.from(files || []).filter(isSupportedMediaFile);
    if (!list.length) {
      notify("No Media Found", "Import images or videos only.", "error");
      return;
    }

    setJob({ label: `Importing ${list.length} ${label}`, progress: 1 });
    let imported = 0;
    try {
      for (let index = 0; index < list.length; index += IMPORT_CHUNK_SIZE) {
        const chunk = list.slice(index, index + IMPORT_CHUNK_SIZE).map(createAssetFromFile);
        chunk.forEach((asset) => objectUrlsRef.current.add(asset.objectUrl));
        setAssets((current) => [...current, ...chunk]);
        setSelectedIds((current) => {
          const selected = new Set(current);
          chunk.forEach((asset) => selected.add(asset.id));
          return selected;
        });
        setActiveId((current) => current || chunk[0]?.id || "");
        imported += chunk.length;
        setJob({ label: `Importing ${imported}/${list.length}`, progress: Math.max(3, Math.round((imported / list.length) * 100)) });
        await waitForPaint();
      }
      setVisibleCount((current) => Math.max(PAGE_SIZE, current));
      notify("Tools Import Ready", `${list.length} file${list.length === 1 ? "" : "s"} imported.`);
    } finally {
      setJob(null);
    }
  }

  async function openGallery() {
    const api = window.flowGallery;
    if (!api) return;
    setJob({ label: "Opening Gallery", progress: 15 });
    try {
      let scan = await api.getLastScan?.();
      if (!scan?.items?.length && api.selectFolder) {
        const selected = await api.selectFolder();
        if (selected?.folderPath) scan = await api.scanFolder?.(selected.folderPath);
      }
      const media = (scan?.items || []).filter((item) => item.type === "image" || item.type === "video");
      setGalleryItems(media);
      setGallerySelected(new Set());
      setGalleryOpen(true);
      if (!media.length) notify("Gallery Empty", "Choose a Gallery folder with pictures or videos first.", "error");
    } catch (error) {
      notify("Gallery Failed", error?.message || "Gallery media could not be opened.", "error");
    } finally {
      setJob(null);
    }
  }

  function toggleGallery(id) {
    setGallerySelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function importGallerySelected() {
    const chosen = galleryItems.filter((item) => gallerySelected.has(item.id));
    if (!chosen.length) return;
    const next = chosen.map(createAssetFromGalleryItem);
    setAssets((current) => [...current, ...next]);
    setSelectedIds((current) => {
      const selected = new Set(current);
      next.forEach((asset) => selected.add(asset.id));
      return selected;
    });
    setActiveId((current) => current || next[0]?.id || "");
    setVisibleCount((current) => Math.max(PAGE_SIZE, current));
    setGalleryOpen(false);
    notify("Gallery Import Ready", `${next.length} Gallery item${next.length === 1 ? "" : "s"} linked instantly.`);
  }

  async function withReadyAsset(asset, task) {
    if (asset.file) return task(asset);
    if (!asset.galleryId || !window.flowGallery?.readMediaFile) {
      throw new Error(`${asset.name} needs to be re-imported before it can be processed.`);
    }
    const payload = await window.flowGallery.readMediaFile(asset.galleryId);
    const file = fileFromGalleryPayload(payload, asset);
    if (!file) throw new Error(`Could not load ${asset.name}.`);
    const objectUrl = URL.createObjectURL(file);
    try {
      return await task({ ...asset, file, name: file.name || asset.name, size: file.size || asset.size, objectUrl });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function removeSelected() {
    const removing = selectedIds;
    assets.filter((asset) => removing.has(asset.id)).forEach((asset) => {
      if (objectUrlsRef.current.has(asset.objectUrl)) {
        URL.revokeObjectURL(asset.objectUrl);
        objectUrlsRef.current.delete(asset.objectUrl);
      }
    });
    const remaining = assets.filter((asset) => !removing.has(asset.id));
    setAssets(remaining);
    setSelectedIds(new Set());
    setActiveId(remaining[0]?.id || "");
  }

  async function buildPreview() {
    if (!active) return;
    setJob({ label: "Building preview", progress: 0 });
    try {
      const result = await withReadyAsset(active, (readyAsset) =>
        optimizePreviewAsset(readyAsset, quality, resizePercent, (progress) => setJob({ label: "Building preview", progress })),
      );
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ assetId: active.id, url: URL.createObjectURL(result.blob), blob: result.blob, name: result.optimizedName });
    } catch (error) {
      notify("Preview Failed", error.message || "The compressed preview could not be created.", "error");
    } finally {
      setJob(null);
    }
  }

  function savePreset() {
    const name = presetName.trim() || `Quality ${quality}`;
    const preset = { id: crypto.randomUUID(), name, quality, resizePercent };
    const next = [preset, ...savedPresets].slice(0, 30);
    setSavedPresets(next);
    localStorage.setItem(TOOLS_PRESETS_KEY, JSON.stringify(next));
    setPresetName("");
  }

  async function exportArchive() {
    if (!selectedAssets.length) return;
    if (archiveFormat === "7z" && !isDesktop) {
      notify("7z Requires Desktop", "Use the laptop app for true 7z exports. ZIP remains available on the website.", "error");
      return;
    }
    cancelRef.current = false;
    let session = null;
    try {
      setJob({ label: "Preparing archive", progress: 1 });
      if (isDesktop) session = await window.flow.desktop.startArchive("tools", archiveFormat, archiveName);
      const webChunks = [];
      const chunkSize = 500;
      const chunkCount = Math.ceil(selectedAssets.length / chunkSize);
      let completed = 0;
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const chunk = selectedAssets.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
        const zip = isDesktop ? null : new (await import("jszip")).default();
        const concurrency = chunk.some((asset) => asset.type === "video") ? 1 : 3;
        await runPool(chunk, concurrency, async (asset, localIndex) => {
          if (cancelRef.current) throw new Error("Export cancelled.");
          const result = await withReadyAsset(asset, (readyAsset) => optimizeAsset(readyAsset, quality, resizePercent, () => {}));
          const outputIndex = chunkIndex * chunkSize + localIndex + 1;
          const outputName = `${String(outputIndex).padStart(5, "0")}_${result.optimizedName}`;
          if (session) {
            await window.flow.desktop.addArchiveFile(session.id, outputName, await result.blob.arrayBuffer());
          } else {
            zip.file(outputName, result.blob);
          }
          completed += 1;
          setJob({ label: `Processing ${completed}/${selectedAssets.length}`, progress: Math.round(completed / selectedAssets.length * 88) });
          if (completed % 8 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        if (zip) webChunks.push(await zip.generateAsync({ type: "blob", compression: "STORE" }));
      }
      if (session) {
        setJob({ label: `Building ${archiveFormat.toUpperCase()}`, progress: 94 });
        const result = await window.flow.desktop.finishArchive(session.id, Math.round(quality / 12));
        session = null;
        notify("Archive Saved", result.path || `${archiveName}.${archiveFormat}`);
      } else {
        for (const [index, blob] of webChunks.entries()) {
          const suffix = webChunks.length > 1 ? `-part-${String(index + 1).padStart(2, "0")}` : "";
          const fileName = `${cleanName(archiveName)}${suffix}.zip`;
          if (!(await saveBlobToPreferredFolder("tools", fileName, blob))) downloadBlob(blob, fileName, { skipPreferredFolder: true });
        }
        notify("ZIP Exported", `${selectedAssets.length} processed files exported.`);
      }
      setJob({ label: "Archive ready", progress: 100 });
    } catch (error) {
      if (session) await window.flow.desktop.cancelArchive(session.id).catch(() => {});
      notify("Archive Failed", error.message || "The archive could not be created.", "error");
    } finally {
      setJob(null);
    }
  }

  return (
    <main className="flow-page grid gap-4">
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { void addFiles(event.target.files, "files"); event.target.value = ""; }} />
      <input ref={folderInputRef} type="file" accept="image/*,video/*" multiple webkitdirectory="" directory="" className="hidden" onChange={(event) => { void addFiles(event.target.files, "folder files"); event.target.value = ""; }} />
      <div className="flow-segmented-shell tools-segmented-shell">
        <div className="flow-segmented-inner" role="tablist" aria-label="Tools sections">
          {toolSections.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeToolSection === value}
              onClick={() => setActiveToolSection(value)}
              className={`flow-segmented-button ${activeToolSection === value ? "is-active" : ""}`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeToolSection !== "batch" && (
      <Card className="tools-command-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button icon={Upload} onClick={() => fileInputRef.current?.click()}>Import Files</Button>
            <Button icon={FolderPlus} variant="secondary" onClick={() => folderInputRef.current?.click()}>Import Folder</Button>
            <Button icon={FolderOpen} variant="secondary" onClick={openGallery} disabled={!window.flowGallery}>From Gallery</Button>
          </div>
          <Button icon={Trash2} variant="outline" onClick={removeSelected} disabled={!selectedIds.size}>Remove ({selectedIds.size})</Button>
        </div>
      </Card>
      )}

      {activeToolSection === "batch" ? (
        <Suspense fallback={<Card className="p-5 text-sm font-bold text-[var(--flow-muted)]">Loading Batch...</Card>}>
          <BatchStudioPanel embedded />
        </Suspense>
      ) : activeToolSection === "assist" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--flow-muted)]">Assist</p>
                <h2 className="mt-1 text-xl font-black text-[var(--flow-text)]">Prepare media faster</h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--flow-muted)]">
                  Import a folder, compare one file, then export selected media as ZIP or 7z.
                </p>
              </div>
              <Badge variant="success">{assets.length} loaded</Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Import", "Files, folders, or Gallery media."],
                ["2", "Compare", "Preview quality before export."],
                ["3", "Archive", "Save selected media in one package."],
              ].map(([step, title, copy]) => (
                <div key={step} className="rounded-2xl border border-[var(--flow-border)] bg-[var(--flow-soft)] p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--pumpkin-700)] text-xs font-black text-white">{step}</span>
                  <p className="mt-3 text-sm font-black text-[var(--flow-text)]">{title}</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--flow-muted)]">{copy}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-black text-[var(--flow-text)]">Current batch</h3>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black">
              <div className="rounded-2xl bg-[var(--flow-soft)] p-3"><span className="block text-[var(--flow-muted)]">Files</span>{assets.length}</div>
              <div className="rounded-2xl bg-[var(--flow-soft)] p-3"><span className="block text-[var(--flow-muted)]">Selected</span>{selectedAssets.length}</div>
              <div className="col-span-2 rounded-2xl bg-[var(--flow-soft)] p-3"><span className="block text-[var(--flow-muted)]">Estimated</span>{formatBytes(estimatedBytes)}</div>
            </div>
          </Card>
        </div>
      ) : (
      <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="grid gap-5">
          <Card className="p-5">
            <div className="flex items-center justify-between"><h3 className="text-sm font-black">Quality Presets</h3><Badge variant="default">{selectedAssets.length} selected</Badge></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {QUALITY_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => setQuality(preset.quality)} className={`rounded-xl border p-3 text-left ${quality === preset.quality ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <span className="block text-xs font-black">{preset.name}</span><span className="text-[10px] font-bold opacity-60">{preset.quality}%</span>
                </button>
              ))}
            </div>
            <RangeSlider className="mt-4" label="Quality" valueLabel={`${quality}%`} min={40} max={100} step={2} value={quality} onChange={(event) => setQuality(Number(event.target.value))} />
            <label className="mt-4 grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">Picture size<select value={resizePercent} onChange={(event) => setResizePercent(Number(event.target.value))} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold dark:border-zinc-700 dark:bg-zinc-950"><option value="100">Original</option><option value="75">75%</option><option value="50">50%</option><option value="25">25%</option></select></label>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-3 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800"><span>Before<strong className="block text-xs text-zinc-900 dark:text-white">{formatBytes(totalBytes)}</strong></span><span>Estimated<strong className="block text-xs text-emerald-600">{formatBytes(estimatedBytes)}</strong></span></div>
            <Input className="mt-4" label="Save preset as" value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            <Button className="mt-2 w-full" size="sm" icon={Save} variant="secondary" onClick={savePreset}>Save Preset</Button>
            {savedPresets.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{savedPresets.map((preset) => <button key={preset.id} type="button" onClick={() => { setQuality(preset.quality); setResizePercent(preset.resizePercent); }} className="shrink-0 rounded-lg bg-zinc-100 px-3 py-2 text-[10px] font-black dark:bg-zinc-800">{preset.name}</button>)}</div>}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-black">Archive Export</h3>
            <Input className="mt-3" label="File name" value={archiveName} onChange={(event) => setArchiveName(event.target.value)} />
            <div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" variant={archiveFormat === "zip" ? "primary" : "outline"} onClick={() => setArchiveFormat("zip")}>ZIP</Button><Button size="sm" variant={archiveFormat === "7z" ? "primary" : "outline"} onClick={() => setArchiveFormat("7z")} disabled={!isDesktop}>7z</Button></div>
            <Button className="mt-3 w-full" icon={FileArchive} onClick={exportArchive} disabled={!selectedAssets.length || Boolean(job)}>Export {archiveFormat.toUpperCase()}</Button>
            {job && <div className="mt-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"><div className="flex items-center justify-between text-xs font-bold"><span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={14} />{job.label}</span><span>{job.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"><div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${job.progress}%` }} /></div></div>}
          </Card>
        </aside>

        <section className="grid gap-5">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black">Preview</h3><p className="text-xs font-semibold text-zinc-500">{active?.name || "Select a picture or video"}</p></div><Button size="sm" icon={Eye} onClick={buildPreview} disabled={!active || Boolean(job)}>Compare</Button></div>
            {active ? <div className="mt-4 grid gap-3 lg:grid-cols-2"><MediaPreview asset={active} src={active.objectUrl} label="Original" size={active.size} />{preview?.assetId === active.id ? <MediaPreview asset={active} src={preview.url} label="Compressed" size={preview.blob.size} /> : <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-zinc-300 text-sm font-semibold text-zinc-500 dark:border-zinc-700">Create a compressed preview</div>}</div> : <div className="mt-4 grid min-h-40 place-items-center rounded-xl border border-dashed border-zinc-300 text-center text-zinc-500 dark:border-zinc-700"><div><ImageIcon className="mx-auto" size={32} /><p className="mt-3 text-sm font-black">Import media to begin</p></div></div>}
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black">Selected Files</h3><p className="mt-0.5 text-xs font-semibold text-zinc-500">Showing {visibleAssets.length} of {assets.length}. More files keep importing in the background.</p></div>{hiddenAssetCount > 0 && <Badge variant="default">{hiddenAssetCount} hidden</Badge>}</div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 xl:grid-cols-10">{visibleAssets.map((asset) => <button key={asset.id} type="button" onClick={() => setActiveId(asset.id)} className={`group relative overflow-hidden rounded-lg border bg-zinc-950 text-left transition duration-200 hover:-translate-y-0.5 hover:border-zinc-500 ${active?.id === asset.id ? "border-white ring-2 ring-zinc-950/20" : "border-zinc-800"}`}><span className="block aspect-square overflow-hidden bg-zinc-900">{asset.type === "video" ? <span className="grid h-full place-items-center text-white"><Film size={20} /></span> : <img src={asset.thumbnailUrl || asset.objectUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}</span><span className="block truncate px-1.5 py-1.5 text-[9px] font-black text-white">{asset.name}</span><span role="checkbox" aria-checked={selectedIds.has(asset.id)} onClick={(event) => { event.stopPropagation(); toggleSelected(asset.id); }} className={`absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-md transition ${selectedIds.has(asset.id) ? "bg-emerald-500 text-white" : "bg-black/60 text-white group-hover:bg-white group-hover:text-zinc-950"}`}>{selectedIds.has(asset.id) ? <Check size={11} /> : <Plus size={11} />}</span></button>)}</div>
            {!assets.length && <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 grid min-h-44 w-full place-items-center rounded-xl border border-dashed border-zinc-300 text-sm font-bold text-zinc-500 transition hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-950"><span><Images className="mx-auto mb-2" size={28} />Import files or a folder to start</span></button>}
            {hiddenAssetCount > 0 && <div className="mt-4 flex justify-end"><Button size="sm" variant="secondary" onClick={() => setVisibleCount((value) => Math.min(assets.length, value + PAGE_SIZE))}>Show More ({Math.min(PAGE_SIZE, hiddenAssetCount)})</Button></div>}
          </Card>
        </section>
      </div>
      )}

      <GalleryPicker open={galleryOpen} items={galleryItems} selectedIds={gallerySelected} onClose={() => setGalleryOpen(false)} onImport={importGallerySelected} onToggle={toggleGallery} />
    </main>
  );
}
