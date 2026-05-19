import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { Badge, Button } from "../ui.jsx";
import { formatBytes } from "../../utils/media.js";
import { formatMediaDate } from "../../utils/galleryGrouping.js";
import { formatShortPath, isImageMedia, isVideoMedia } from "../../utils/mediaTypes.js";
import { canDragIndexedFile, startIndexedFileDrag } from "../../utils/fileDrag.js";

function greatestCommonDivisor(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    const next = right;
    right = left % right;
    left = next;
  }
  return left || 1;
}

function formatAspectRatio(width, height) {
  if (!width || !height) return "Aspect ratio";

  const value = width / height;
  const commonRatios = [
    { label: "1:1", value: 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "9:16", value: 9 / 16 },
    { label: "16:9", value: 16 / 9 },
    { label: "3:4", value: 3 / 4 },
    { label: "4:3", value: 4 / 3 },
    { label: "2:3", value: 2 / 3 },
    { label: "3:2", value: 3 / 2 },
  ];
  const closeMatch = commonRatios.find((ratio) => Math.abs(value - ratio.value) <= 0.015);
  if (closeMatch) return closeMatch.label;

  const divisor = greatestCommonDivisor(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function getPreviewUrl(item) {
  return item?.thumbnailUrl || item?.url || "";
}

export default function GalleryViewer({
  items,
  index,
  onClose,
  onNavigate,
  onTagsChange,
  sourceKind = "gallery",
}) {
  const item = items[index];
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mediaSizeById, setMediaSizeById] = useState({});
  const isVideo = isVideoMedia(item);
  const canPreviewImage =
    isImageMedia(item) && !["tif", "tiff", "svg"].includes(String(item?.extension || "").toLowerCase());
  const canGoPrevious = index > 0;
  const canGoNext = index < items.length - 1;
  const activeSize = mediaSizeById[item?.id] || {};
  const aspectRatio = formatAspectRatio(activeSize.width, activeSize.height);
  const sizeLabel =
    activeSize.width && activeSize.height ? `${activeSize.width} x ${activeSize.height}` : "Original media";
  const fullPath = item?.path || [item?.folderPath, item?.name].filter(Boolean).join("\\");

  const limitedThumbnails = useMemo(() => {
    const start = Math.max(0, Math.min(index - 8, items.length - 16));
    return items.slice(start, start + 16).map((thumbnailItem, offset) => ({
      item: thumbnailItem,
      index: start + offset,
    }));
  }, [index, items]);

  useEffect(() => {
    setZoom(1);
  }, [item?.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (editing) return;

      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && canGoPrevious) onNavigate(index - 1);
      if (event.key === "ArrowRight" && canGoNext) onNavigate(index + 1);
      if ((event.key === "+" || event.key === "=") && canPreviewImage) {
        event.preventDefault();
        setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))));
      }
      if (event.key === "-" && canPreviewImage) {
        event.preventDefault();
        setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoNext, canGoPrevious, canPreviewImage, index, onClose, onNavigate]);

  if (!item || typeof document === "undefined") return null;

  const rememberMediaSize = (width, height) => {
    if (!width || !height) return;
    setMediaSizeById((current) => ({
      ...current,
      [item.id]: { width, height },
    }));
  };

  return createPortal(
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden ${isFullscreen ? "p-0" : "p-4 sm:p-8"}`}>
      <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-xl" onClick={onClose} />
      <div
        className={`relative flex flex-col overflow-hidden border border-zinc-800 bg-zinc-900 text-white shadow-2xl transition-all duration-500 ${
          isFullscreen ? "h-full w-full rounded-none border-0" : "h-[min(90vh,860px)] w-full max-w-6xl rounded-[32px]"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900 px-5 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Expanded Preview
            </p>
            <h3 className="mt-1 truncate text-base font-black tracking-tight text-zinc-50">
              {item.name}
            </h3>
            {fullPath && (
              <p className="mt-1 truncate text-[11px] font-semibold text-zinc-500" title={fullPath}>
                {fullPath}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isVideo ? "warning" : "default"}>
              {String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </Badge>
            {canPreviewImage && (
              <>
                <Button
                  icon={ZoomOut}
                  size="icon"
                  variant="secondary"
                  onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
                  aria-label="Zoom out"
                  title="Zoom out"
                />
                <Badge variant="default">{Math.round(zoom * 100)}%</Badge>
                <Button
                  icon={ZoomIn}
                  size="icon"
                  variant="secondary"
                  onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
                  aria-label="Zoom in"
                  title="Zoom in"
                />
              </>
            )}
            <Button
              icon={isFullscreen ? Minimize : Maximize}
              size="icon"
              variant={isFullscreen ? "primary" : "secondary"}
              onClick={() => setIsFullscreen((value) => !value)}
              aria-label={isFullscreen ? "Exit full screen" : "Open full screen"}
              title={isFullscreen ? "Exit full screen" : "Open full screen"}
            />
            <Button
              icon={X}
              size="icon"
              variant="secondary"
              onClick={onClose}
              aria-label="Close preview"
              title="Close preview"
            />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 bg-zinc-950 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div
            className="group/preview relative flex min-h-0 items-center justify-center overflow-hidden bg-black p-4"
          >
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={!canGoPrevious}
                  onClick={() => onNavigate(index - 1)}
                  className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-white/90 text-zinc-950 shadow-xl transition hover:bg-white disabled:opacity-25"
                  aria-label="Previous media"
                  title="Previous media"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => onNavigate(index + 1)}
                  className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-white/90 text-zinc-950 shadow-xl transition hover:bg-white disabled:opacity-25"
                  aria-label="Next media"
                  title="Next media"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {isVideo ? (
              <video
                key={item.id}
                src={item.url}
                controls
                autoPlay
                playsInline
                onLoadedMetadata={(event) =>
                  rememberMediaSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)
                }
                className="max-h-full max-w-full rounded-2xl bg-black object-contain shadow-2xl"
              />
            ) : canPreviewImage ? (
              <img
                key={item.id}
                src={item.url}
                alt={item.name}
                decoding="async"
                draggable={canDragIndexedFile()}
                onDragStart={(event) => startIndexedFileDrag(event, sourceKind, item)}
                onLoad={(event) =>
                  rememberMediaSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                }
                style={{ transform: `scale(${zoom})` }}
                className="max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl"
              />
            ) : (
              <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-xl">
                <p className="text-lg font-black italic">Preview not available</p>
                <p className="mt-2 text-sm font-medium text-white/55">
                  This file type was indexed safely. Use Open Externally or Reveal in Folder.
                </p>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs font-black uppercase tracking-widest text-white opacity-0 shadow-2xl backdrop-blur-md transition duration-200 group-hover/preview:opacity-100">
              {aspectRatio}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-zinc-800 bg-zinc-900 p-5 lg:border-l lg:border-t-0">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Media Details
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-zinc-950/70 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Size</p>
                  <p className="mt-1 font-mono text-sm font-black text-zinc-100">{sizeLabel}</p>
                </div>
                <div className="rounded-2xl bg-zinc-950/70 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">File</p>
                  <p className="mt-1 font-mono text-sm font-black uppercase text-zinc-100">
                    {item.extension || item.type}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                File Info
              </p>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Date</p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">{formatMediaDate(item)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Storage</p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">{formatBytes(item.size)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Folder</p>
                <p className="mt-1 break-words text-sm font-semibold text-zinc-200">
                  {formatShortPath(item.folderPath || "")}
                </p>
              </div>
            </div>

            <div className="mt-auto grid gap-2">
              <Button
                icon={ExternalLink}
                variant="secondary"
                onClick={() => window.contentFlowFiles?.openExternal?.(sourceKind, item.id)}
              >
                Open Externally
              </Button>
              <Button
                icon={FolderOpen}
                variant="secondary"
                onClick={() => window.contentFlowFiles?.reveal?.(sourceKind, item.id)}
              >
                Reveal in Folder
              </Button>
              <Button
                icon={Copy}
                variant="secondary"
                onClick={() => window.contentFlowFiles?.copySelected?.(sourceKind, [item.id])}
              >
                Copy Media
              </Button>
            </div>
          </aside>
        </div>

        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 p-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {limitedThumbnails.map(({ item: thumbnailItem, index: thumbnailIndex }) => (
              <button
                key={thumbnailItem.id}
                type="button"
                onClick={() => onNavigate(thumbnailIndex)}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-zinc-950 transition ${
                  thumbnailIndex === index
                    ? "border-white shadow-lg"
                    : "border-transparent opacity-65 hover:opacity-100"
                }`}
                aria-label={`View ${thumbnailItem.name}`}
                title={thumbnailItem.name}
              >
                {getPreviewUrl(thumbnailItem) ? (
                  <img
                    src={getPreviewUrl(thumbnailItem)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-zinc-500">
                    {isVideoMedia(thumbnailItem) ? <Film size={18} /> : <ImageIcon size={18} />}
                  </span>
                )}
                {isVideoMedia(thumbnailItem) && (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-black/70 text-white">
                    <Film size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
