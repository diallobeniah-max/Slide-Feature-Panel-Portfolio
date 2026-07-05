import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Brush,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Eraser,
  ExternalLink,
  Film,
  FolderOpen,
  Hand,
  Image as ImageIcon,
  Maximize,
  Minimize,
  MousePointer2,
  Palette,
  PenTool,
  Redo2,
  Square,
  TextCursorInput,
  Undo2,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { Badge, Button, RangeSlider } from "../ui.jsx";
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPointerPercent(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

function normalizeBox(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
  };
}

function boxStyle(box) {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showZoomSlider, setShowZoomSlider] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTool, setEditTool] = useState("select");
  const [editColor, setEditColor] = useState("#ffffff");
  const [annotationsById, setAnnotationsById] = useState({});
  const [cropById, setCropById] = useState({});
  const [pendingCropById, setPendingCropById] = useState({});
  const [editHistoryById, setEditHistoryById] = useState({});
  const [editRedoById, setEditRedoById] = useState({});
  const [draftEdit, setDraftEdit] = useState(null);
  const [mediaSizeById, setMediaSizeById] = useState({});
  const zoomHoldTimerRef = useRef(null);
  const panStartRef = useRef(null);
  const draftEditRef = useRef(null);
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
  const activeAnnotations = annotationsById[item?.id] || [];
  const activeCrop = cropById[item?.id] || null;
  const pendingCrop = pendingCropById[item?.id] || null;
  const cropPreview = pendingCrop;
  const activeHistory = editHistoryById[item?.id] || [];
  const activeRedo = editRedoById[item?.id] || [];
  const canPanImage = canPreviewImage && zoom > 1 && !editorOpen;
  const transformStyle = {
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
  };

  const limitedThumbnails = useMemo(() => {
    const start = Math.max(0, Math.min(index - 8, items.length - 16));
    return items.slice(start, start + 16).map((thumbnailItem, offset) => ({
      item: thumbnailItem,
      index: start + offset,
    }));
  }, [index, items]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    setShowZoomSlider(false);
    setEditorOpen(false);
    setEditTool("select");
    setDraft(null);
  }, [item?.id]);

  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  useEffect(() => {
    return () => window.clearTimeout(zoomHoldTimerRef.current);
  }, []);

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

  const setDraft = (nextDraft) => {
    draftEditRef.current = nextDraft;
    setDraftEdit(nextDraft);
  };

  const getEditSnapshot = () => ({
    annotations: activeAnnotations,
    crop: activeCrop,
  });

  const pushEditHistory = () => {
    const snapshot = getEditSnapshot();
    setEditHistoryById((current) => ({
      ...current,
      [item.id]: [...(current[item.id] || []), snapshot].slice(-60),
    }));
    setEditRedoById((current) => ({ ...current, [item.id]: [] }));
  };

  const restoreEditSnapshot = (snapshot) => {
    setAnnotationsById((current) => ({
      ...current,
      [item.id]: snapshot?.annotations || [],
    }));
    setCropById((current) => {
      const next = { ...current };
      if (snapshot?.crop) next[item.id] = snapshot.crop;
      else delete next[item.id];
      return next;
    });
    setPendingCropById((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setDraft(null);
  };

  const changeZoom = (delta) => {
    setZoom((value) => clamp(Number((value + delta).toFixed(2)), 0.5, 3));
  };

  const startZoomHold = () => {
    window.clearTimeout(zoomHoldTimerRef.current);
    zoomHoldTimerRef.current = window.setTimeout(() => setShowZoomSlider(true), 320);
  };

  const endZoomHold = () => {
    window.clearTimeout(zoomHoldTimerRef.current);
  };

  const updateCrop = (nextCrop) => {
    pushEditHistory();
    setCropById((current) => ({
      ...current,
      [item.id]: nextCrop,
    }));
  };

  const addAnnotation = (annotation) => {
    pushEditHistory();
    setAnnotationsById((current) => ({
      ...current,
      [item.id]: [...(current[item.id] || []), { id: `${Date.now()}-${Math.random()}`, ...annotation }],
    }));
  };

  const undoEdit = () => {
    if (!activeHistory.length) return;
    const previous = activeHistory[activeHistory.length - 1];
    setEditHistoryById((current) => ({
      ...current,
      [item.id]: (current[item.id] || []).slice(0, -1),
    }));
    setEditRedoById((current) => ({
      ...current,
      [item.id]: [getEditSnapshot(), ...(current[item.id] || [])].slice(0, 60),
    }));
    restoreEditSnapshot(previous);
  };

  const redoEdit = () => {
    if (!activeRedo.length) return;
    const nextSnapshot = activeRedo[0];
    setEditRedoById((current) => ({
      ...current,
      [item.id]: (current[item.id] || []).slice(1),
    }));
    setEditHistoryById((current) => ({
      ...current,
      [item.id]: [...(current[item.id] || []), getEditSnapshot()].slice(-60),
    }));
    restoreEditSnapshot(nextSnapshot);
  };

  const applyEdit = () => {
    if (pendingCrop) updateCrop(pendingCrop);
    setPendingCropById((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setDraft(null);
  };

  const clearEdits = () => {
    if (!activeAnnotations.length && !activeCrop && !pendingCrop) return;
    pushEditHistory();
    setAnnotationsById((current) => ({ ...current, [item.id]: [] }));
    setCropById((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setPendingCropById((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setDraft(null);
  };

  const handlePreviewPointerDown = (event) => {
    if (!canPanImage || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pan,
    };
  };

  const handlePreviewPointerMove = (event) => {
    if (!isPanning || !panStartRef.current) return;
    const start = panStartRef.current;
    setPan({
      x: start.pan.x + event.clientX - start.clientX,
      y: start.pan.y + event.clientY - start.clientY,
    });
  };

  const endPreviewPointer = () => {
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleEditorPointerDown = (event) => {
    if (!editorOpen || !canPreviewImage || editTool === "select" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPointerPercent(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (editTool === "text") {
      const text = window.prompt("Add text");
      if (text?.trim()) addAnnotation({ type: "text", text: text.trim(), x: point.x, y: point.y, color: editColor });
      return;
    }

    if (editTool === "pen") {
      setDraft({ type: "pen", points: [point], color: editColor });
      return;
    }

    if (editTool === "shape" || editTool === "crop") {
      setDraft({ type: editTool, start: point, end: point, color: editColor });
    }
  };

  const handleEditorPointerMove = (event) => {
    const currentDraft = draftEditRef.current;
    if (!currentDraft) return;
    event.preventDefault();
    const point = getPointerPercent(event);
    if (currentDraft.type === "pen") {
      setDraft({
        ...currentDraft,
        points: [...(currentDraft.points || []), point],
      });
      return;
    }
    setDraft({ ...currentDraft, end: point });
  };

  const handleEditorPointerUp = () => {
    const currentDraft = draftEditRef.current;
    if (!currentDraft) return;
    if (currentDraft.type === "pen" && currentDraft.points?.length > 1) {
      addAnnotation({ type: "pen", points: currentDraft.points, color: currentDraft.color });
    }
    if (currentDraft.type === "shape") {
      addAnnotation({ type: "shape", box: normalizeBox(currentDraft.start, currentDraft.end), color: currentDraft.color });
    }
    if (currentDraft.type === "crop") {
      setPendingCropById((current) => ({
        ...current,
        [item.id]: normalizeBox(currentDraft.start, currentDraft.end),
      }));
    }
    setDraft(null);
  };

  const renderAnnotation = (annotation) => {
    if (annotation.type === "text") {
      return (
        <div
          key={annotation.id}
          className="absolute -translate-y-1/2 rounded-lg bg-black/45 px-2 py-1 text-lg font-black shadow-lg backdrop-blur"
          style={{ left: `${annotation.x}%`, top: `${annotation.y}%`, color: annotation.color }}
        >
          {annotation.text}
        </div>
      );
    }
    if (annotation.type === "shape") {
      return (
        <div
          key={annotation.id}
          className="absolute rounded-lg border-4 bg-transparent"
          style={{ ...boxStyle(annotation.box), borderColor: annotation.color }}
        />
      );
    }
    if (annotation.type === "pen") {
      const points = annotation.points.map((point) => `${point.x},${point.y}`).join(" ");
      return (
        <svg key={annotation.id} className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke={annotation.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
        </svg>
      );
    }
    return null;
  };

  const draftBox = draftEdit?.start && draftEdit?.end ? normalizeBox(draftEdit.start, draftEdit.end) : null;
  const draftPenPoints = draftEdit?.type === "pen" ? draftEdit.points.map((point) => `${point.x},${point.y}`).join(" ") : "";
  const cropViewBox =
    activeCrop && activeSize.width && activeSize.height
      ? {
          x: (activeCrop.x / 100) * activeSize.width,
          y: (activeCrop.y / 100) * activeSize.height,
          width: Math.max(1, (activeCrop.width / 100) * activeSize.width),
          height: Math.max(1, (activeCrop.height / 100) * activeSize.height),
        }
      : null;

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
              <div className="relative flex items-center rounded-2xl border border-zinc-700 bg-zinc-950/70 p-1 shadow-inner">
                <Button
                  icon={ZoomOut}
                  size="icon"
                  variant="ghost"
                  onPointerDown={startZoomHold}
                  onPointerUp={endZoomHold}
                  onPointerLeave={endZoomHold}
                  onClick={() => changeZoom(-0.25)}
                  aria-label="Zoom out"
                  title="Zoom out"
                />
                <button
                  type="button"
                  onClick={() => setShowZoomSlider((value) => !value)}
                  className="min-w-14 rounded-xl px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-zinc-200 transition hover:bg-white/10"
                  aria-label="Show zoom slider"
                  title="Show zoom slider"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button
                  icon={ZoomIn}
                  size="icon"
                  variant="ghost"
                  onPointerDown={startZoomHold}
                  onPointerUp={endZoomHold}
                  onPointerLeave={endZoomHold}
                  onClick={() => changeZoom(0.25)}
                  aria-label="Zoom in"
                  title="Zoom in"
                />
                {showZoomSlider && (
                  <div className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-64 rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
                    <RangeSlider
                      label="Zoom"
                      min={50}
                      max={300}
                      step={5}
                      value={Math.round(zoom * 100)}
                      valueLabel={`${Math.round(zoom * 100)}%`}
                      onChange={(event) => setZoom(clamp(Number(event.target.value) / 100, 0.5, 3))}
                    />
                  </div>
                )}
              </div>
            )}
            {canPreviewImage && zoom > 1 && (
              <Button
                icon={Hand}
                size="icon"
                variant={canPanImage ? "primary" : "secondary"}
                onClick={() => setEditorOpen(false)}
                aria-label="Move zoomed image"
                title="Move zoomed image"
              />
            )}
            {canPreviewImage && (
              <Button
                icon={PenTool}
                size="icon"
                variant={editorOpen ? "primary" : "secondary"}
                onClick={() => {
                  setEditorOpen((value) => !value);
                  setEditTool("select");
                }}
                aria-label="Open image editor"
                title="Open image editor"
              />
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
            className={`group/preview relative flex min-h-0 items-center justify-center overflow-hidden bg-black p-4 ${
              canPanImage ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
            }`}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={endPreviewPointer}
            onPointerCancel={endPreviewPointer}
            onPointerLeave={endPreviewPointer}
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
              <div className="relative max-h-full max-w-full select-none" style={transformStyle}>
                {cropViewBox ? (
                  <svg
                    className="block max-h-[calc(100vh-18rem)] max-w-full rounded-2xl shadow-2xl"
                    viewBox={`${cropViewBox.x} ${cropViewBox.y} ${cropViewBox.width} ${cropViewBox.height}`}
                    style={{ aspectRatio: `${cropViewBox.width} / ${cropViewBox.height}`, height: "min(100%, calc(100vh - 18rem))" }}
                    aria-label={item.name}
                  >
                    <image
                      href={item.url}
                      x="0"
                      y="0"
                      width={activeSize.width}
                      height={activeSize.height}
                      preserveAspectRatio="none"
                    />
                  </svg>
                ) : (
                  <img
                    key={item.id}
                    src={item.url}
                    alt={item.name}
                    decoding="async"
                    draggable={canDragIndexedFile() && zoom <= 1 && !editorOpen}
                    onDragStart={(event) => startIndexedFileDrag(event, sourceKind, item)}
                    onLoad={(event) =>
                      rememberMediaSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                    }
                    className="block max-h-[calc(100vh-18rem)] max-w-full rounded-2xl object-contain shadow-2xl"
                  />
                )}
                {cropViewBox && (
                  <img
                    src={item.url}
                    alt=""
                    decoding="async"
                    className="pointer-events-none absolute h-px w-px opacity-0"
                    onLoad={(event) =>
                      rememberMediaSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                    }
                  />
                )}
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
                >
                  {activeAnnotations.map(renderAnnotation)}
                </div>
                {cropPreview && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/35">
                    <div className="absolute rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={boxStyle(cropPreview)} />
                  </div>
                )}
                {editorOpen && (
                  <div
                    className={`absolute inset-0 z-10 rounded-2xl ${
                      editTool === "pen" ? "cursor-crosshair" : editTool !== "select" ? "cursor-cell" : "pointer-events-none"
                    }`}
                    onPointerDown={handleEditorPointerDown}
                    onPointerMove={handleEditorPointerMove}
                    onPointerUp={handleEditorPointerUp}
                    onPointerCancel={() => setDraft(null)}
                  >
                    {draftBox && (
                      <div
                        className={`absolute rounded-xl border-2 ${draftEdit.type === "crop" ? "border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" : ""}`}
                        style={{ ...boxStyle(draftBox), borderColor: draftEdit.type === "shape" ? draftEdit.color : undefined }}
                      />
                    )}
                    {draftPenPoints && (
                      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polyline points={draftPenPoints} fill="none" stroke={draftEdit.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
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

            {canPreviewImage && zoom > 1 && !editorOpen && (
              <div className="pointer-events-none absolute right-5 top-5 z-20 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl backdrop-blur-md">
                <Hand size={14} />
                Move
              </div>
            )}

            {editorOpen && canPreviewImage && (
              <>
                <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/10 bg-zinc-950/85 p-2 shadow-2xl backdrop-blur-xl">
                  {[
                    { value: "select", icon: MousePointer2, label: "Select" },
                    { value: "crop", icon: Crop, label: "Crop" },
                    { value: "text", icon: TextCursorInput, label: "Text" },
                    { value: "shape", icon: Square, label: "Shape" },
                    { value: "pen", icon: Brush, label: "Pen" },
                  ].map((tool) => (
                    <Button
                      key={tool.value}
                      icon={tool.icon}
                      size="icon"
                      variant={editTool === tool.value ? "primary" : "ghost"}
                      onClick={() => setEditTool(tool.value)}
                      aria-label={tool.label}
                      title={tool.label}
                    />
                  ))}
                  <label className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white" title="Color">
                    <Palette size={16} />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(event) => setEditColor(event.target.value)}
                      className="sr-only"
                      aria-label="Editor color"
                    />
                  </label>
                  <Button icon={Undo2} size="icon" variant="ghost" onClick={undoEdit} aria-label="Undo edit" title="Undo" />
                  <Button icon={Redo2} size="icon" variant="ghost" onClick={redoEdit} aria-label="Redo edit" title="Redo" />
                  <Button icon={Check} size="icon" variant="primary" onClick={applyEdit} aria-label="Apply edit" title="Apply" />
                  <Button icon={Eraser} size="icon" variant="ghost" onClick={clearEdits} aria-label="Clear edits" title="Clear edits" />
                </div>
              </>
            )}
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
                onClick={() => window.flowFiles?.openExternal?.(sourceKind, item.id)}
              >
                Open Externally
              </Button>
              <Button
                icon={FolderOpen}
                variant="secondary"
                onClick={() => window.flowFiles?.reveal?.(sourceKind, item.id)}
              >
                Reveal in Folder
              </Button>
              <Button
                icon={Copy}
                variant="secondary"
                onClick={() => window.flowFiles?.copySelected?.(sourceKind, [item.id])}
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
