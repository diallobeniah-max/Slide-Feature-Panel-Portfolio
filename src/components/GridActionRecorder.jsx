import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  FileArchive,
  FolderPlus,
  ImagePlus,
  Layers,
  LoaderCircle,
  Move,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Button, Card, Input, RangeSlider } from "./ui.jsx";
import { downloadBlob } from "../utils/media.js";
import { saveBlobToPreferredFolder } from "../utils/downloadFolders.js";

const ACTIONS_KEY = "flow-grid-actions-v1";
const SAVED_LOGO_KEY = "flow-grid-saved-logo-v1";
const DEFAULT_LAYER_WIDTH = 24;
const IMAGE_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg";
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "svg"]);
const RECORDING_COLORS = ["#18181b", "#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ec4899"];
const PICTURE_PAGE_SIZE = 96;
const COMMON_RATIOS = [
  ["1:1", 1],
  ["4:5", 4 / 5],
  ["5:4", 5 / 4],
  ["3:4", 3 / 4],
  ["4:3", 4 / 3],
  ["2:3", 2 / 3],
  ["3:2", 3 / 2],
  ["9:16", 9 / 16],
  ["16:9", 16 / 9],
];
const POSITION_PRESETS = [
  { id: "top-left", label: "Top left", column: 0, row: 0 },
  { id: "top-center", label: "Top center", column: 1, row: 0 },
  { id: "top-right", label: "Top right", column: 2, row: 0 },
  { id: "middle-left", label: "Middle left", column: 0, row: 1 },
  { id: "middle-center", label: "Middle center", column: 1, row: 1 },
  { id: "middle-right", label: "Middle right", column: 2, row: 1 },
  { id: "bottom-left", label: "Bottom left", column: 0, row: 2 },
  { id: "bottom-center", label: "Bottom center", column: 1, row: 2 },
  { id: "bottom-right", label: "Bottom right", column: 2, row: 2 },
];
const imageCache = new Map();

const notify = (title, message, type = "success") =>
  window.dispatchEvent(new CustomEvent("studio-notify", { detail: { title, message, type } }));

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function readRecordings() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIONS_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.map((recording, index) => ({
          ...recording,
          color: recording.color || RECORDING_COLORS[index % RECORDING_COLORS.length],
        }))
      : [];
  } catch {
    return [];
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRatioInfo(image) {
  const width = Math.max(1, Number(image?.width) || 1);
  const height = Math.max(1, Number(image?.height) || 1);
  const value = width / height;
  const common = COMMON_RATIOS.find(([, ratio]) => Math.abs(value - ratio) <= 0.006);
  if (common) return { key: common[0], label: common[0], value: common[1] };
  const rounded = Number(value.toFixed(3));
  return {
    key: `ratio-${rounded}`,
    label: value >= 1 ? `${rounded}:1` : `1:${Number((1 / value).toFixed(2))}`,
    value: rounded,
  };
}

function groupPicturesByRatio(backgrounds) {
  const groups = new Map();
  backgrounds.forEach((image) => {
    const ratio = getRatioInfo(image);
    const group = groups.get(ratio.key) || { ...ratio, ids: [], count: 0 };
    group.ids.push(image.id);
    group.count += 1;
    groups.set(ratio.key, group);
  });
  return [...groups.values()].sort((a, b) => b.count - a.count || a.value - b.value);
}

function positionLayers(layers, background, positionId) {
  const position = POSITION_PRESETS.find((item) => item.id === positionId) || POSITION_PRESETS[8];
  return layers.map((layer) => {
    const contained = containLayer(layer, background);
    const canvasAspect = Math.max(0.05, Number(background?.width) / Number(background?.height) || 1);
    const layerHeight = contained.width * canvasAspect / Math.max(0.05, contained.aspect || 1);
    const gap = 4;
    const x = position.column === 0 ? gap : position.column === 1 ? (100 - contained.width) / 2 : 100 - contained.width - gap;
    const y = position.row === 0 ? gap : position.row === 1 ? (100 - layerHeight) / 2 : 100 - layerHeight - gap;
    return containLayer({ ...contained, x, y }, background);
  });
}

async function readImageDimensions(file, src, extension) {
  if (extension === "svg" || file.type === "image/svg+xml") {
    const root = new DOMParser().parseFromString(await file.text(), "image/svg+xml").documentElement;
    const viewBox = String(root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    const width = Number.parseFloat(root.getAttribute("width")) || viewBox[2];
    const height = Number.parseFloat(root.getAttribute("height")) || viewBox[3];
    if (width > 0 && height > 0) return { width, height };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width || 1, height: bitmap.height || 1 };
    bitmap.close?.();
    return dimensions;
  } catch {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
      image.onerror = () => reject(new Error(`${file.name || "Image"} could not be opened.`));
      image.src = src;
    });
  }
}

async function loadImageFile(file) {
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (!file?.type?.startsWith("image/") && !IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Choose image files.");
  }
  const src = URL.createObjectURL(file);
  try {
    const dimensions = await readImageDimensions(file, src, extension);
    return {
      id: createId("image"),
      name: file.name || "Image",
      src,
      width: dimensions.width,
      height: dimensions.height,
      size: Number(file.size) || 0,
      type: file.type || "image",
      lastModified: Number(file.lastModified) || 0,
    };
  } catch (error) {
    URL.revokeObjectURL(src);
    throw error;
  }
}

function cleanExportName(name = "placement") {
  return (
    String(name || "placement")
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64) || "placement"
  );
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / 1024 ** unit;
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function readSavedLogo() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_LOGO_KEY) || "null");
  } catch {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Logo could not be saved."));
    reader.readAsDataURL(blob);
  });
}

function buildExportName(image, index, pattern, extension, total = 1) {
  const base = cleanExportName(image?.name || `picture-${index + 1}`);
  const ratio = getRatioInfo(image).label.replace(":", "x");
  const resolved = String(pattern || "{name}_placement")
    .replaceAll("{name}", base)
    .replaceAll("{index}", String(index + 1).padStart(4, "0"))
    .replaceAll("{ratio}", ratio);
  const unique = total > 1 && !String(pattern || "").includes("{index}")
    ? `${resolved}_${String(index + 1).padStart(4, "0")}`
    : resolved;
  return `${cleanExportName(unique)}.${extension}`;
}

function loadSourceImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An exported image could not be rendered."));
    image.src = src;
  });
  imageCache.set(src, pending);
  pending.catch(() => imageCache.delete(src));
  return pending;
}

async function drawPlacementCanvas(background, layers, options = {}) {
  if (!background) throw new Error("Import a canvas picture first.");
  const canvas = document.createElement("canvas");
  const resizeScale = clamp(Number(options.resizePercent) || 100, 10, 100) / 100;
  canvas.width = Math.max(1, Math.round((background.width || 1) * resizeScale));
  canvas.height = Math.max(1, Math.round((background.height || 1) * resizeScale));
  const context = canvas.getContext("2d", { alpha: true });
  const backgroundImage = await loadSourceImage(background.src);
  context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);

  for (const layer of layers) {
    const layerImage = await loadSourceImage(layer.src);
    const aspect = Math.max(0.05, Number(layer.aspect) || layerImage.naturalWidth / layerImage.naturalHeight || 1);
    let width = (clamp(Number(layer.width) || DEFAULT_LAYER_WIDTH, 1, 100) / 100) * canvas.width;
    let height = width / aspect;
    const fitScale = Math.min(1, canvas.width / width, canvas.height / height);
    width *= fitScale;
    height *= fitScale;
    const left = clamp((clamp(Number(layer.x) || 0, 0, 100) / 100) * canvas.width, 0, Math.max(0, canvas.width - width));
    const top = clamp((clamp(Number(layer.y) || 0, 0, 100) / 100) * canvas.height, 0, Math.max(0, canvas.height - height));
    context.drawImage(
      layerImage,
      left,
      top,
      width,
      height,
    );
  }
  return canvas;
}

function canvasBlob(canvas, type = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed."))), type, clamp(quality, 0.1, 1));
  });
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function canvasToPsdBlob(canvas) {
  const context = canvas.getContext("2d");
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixelCount = canvas.width * canvas.height;
  const channelCount = 4;
  const headerBytes = 26;
  const sectionBytes = 12;
  const compressionBytes = 2;
  const buffer = new ArrayBuffer(headerBytes + sectionBytes + compressionBytes + pixelCount * channelCount);
  const view = new DataView(buffer);
  let offset = 0;

  writeAscii(view, offset, "8BPS");
  offset += 4;
  view.setUint16(offset, 1);
  offset += 8;
  view.setUint16(offset, channelCount);
  offset += 2;
  view.setUint32(offset, canvas.height);
  offset += 4;
  view.setUint32(offset, canvas.width);
  offset += 4;
  view.setUint16(offset, 8);
  offset += 2;
  view.setUint16(offset, 3);
  offset += 2;
  view.setUint32(offset, 0);
  offset += 4;
  view.setUint32(offset, 0);
  offset += 4;
  view.setUint32(offset, 0);
  offset += 4;
  view.setUint16(offset, 0);
  offset += 2;

  const bytes = new Uint8Array(buffer);
  for (let channel = 0; channel < channelCount; channel += 1) {
    const channelOffset = offset + channel * pixelCount;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      bytes[channelOffset + pixel] = rgba[pixel * channelCount + channel];
    }
  }
  return new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
}

async function loadImageFiles(files, onProgress) {
  const list = Array.from(files || []);
  const loaded = new Array(list.length);
  const progressStep = Math.max(1, Math.ceil(list.length / 40));
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      try {
        loaded[index] = await loadImageFile(list[index]);
      } catch {
        loaded[index] = null;
      }
      completed += 1;
      if (completed === list.length || completed % progressStep === 0) {
        onProgress?.(completed, list.length);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
  return loaded.filter(Boolean);
}

async function runWithConcurrency(items, limit, task) {
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

function getAxisPlacement(start, size, total, minimumDimension) {
  const center = start + size / 2;
  if (center <= total * 0.4) {
    return { anchor: "start", offset: (start / minimumDimension) * 100 };
  }
  if (center >= total * 0.6) {
    return { anchor: "end", offset: ((total - start - size) / minimumDimension) * 100 };
  }
  return { anchor: "center", offset: ((center - total / 2) / minimumDimension) * 100 };
}

function createResponsivePlacement(layer, background) {
  if (!background) return null;
  const canvasWidth = Math.max(1, Number(background.width) || 1);
  const canvasHeight = Math.max(1, Number(background.height) || 1);
  const minimumDimension = Math.min(canvasWidth, canvasHeight);
  const aspect = Math.max(0.05, Number(layer.aspect) || 1);
  const width = (clamp(Number(layer.width) || DEFAULT_LAYER_WIDTH, 1, 100) / 100) * canvasWidth;
  const height = width / aspect;
  const left = (clamp(Number(layer.x) || 0, 0, 100) / 100) * canvasWidth;
  const top = (clamp(Number(layer.y) || 0, 0, 100) / 100) * canvasHeight;
  const horizontal = getAxisPlacement(left, width, canvasWidth, minimumDimension);
  const vertical = getAxisPlacement(top, height, canvasHeight, minimumDimension);

  return {
    version: 2,
    size: (width / minimumDimension) * 100,
    xAnchor: horizontal.anchor,
    xOffset: horizontal.offset,
    yAnchor: vertical.anchor,
    yOffset: vertical.offset,
  };
}

function snapshotLayer(layer, background) {
  return {
    name: layer.name,
    x: Number(layer.x) || 0,
    y: Number(layer.y) || 0,
    width: Number(layer.width) || DEFAULT_LAYER_WIDTH,
    aspect: Number(layer.aspect) || 1,
    responsive: createResponsivePlacement(layer, background),
  };
}

function resolveAxisStart(anchor, offset, itemSize, total, minimumDimension) {
  const inset = (Number(offset) || 0) * minimumDimension / 100;
  if (anchor === "end") return total - itemSize - inset;
  if (anchor === "center") return total / 2 - itemSize / 2 + inset;
  return inset;
}

function placeResponsiveLayer(sourceLayer, placement, targetBackground, fallbackBackground) {
  const aspect = Math.max(0.05, Number(sourceLayer.aspect) || Number(placement.aspect) || 1);
  const responsive = placement.responsive || createResponsivePlacement(placement, fallbackBackground);
  if (!responsive || !targetBackground) {
    const width = clamp(Number(placement.width) || DEFAULT_LAYER_WIDTH, 4, 96);
    return containLayer({
      ...sourceLayer,
      x: clamp(Number(placement.x) || 0, 0, Math.max(0, 100 - width)),
      y: clamp(Number(placement.y) || 0, 0, 96),
      width,
      aspect,
    }, targetBackground);
  }

  const canvasWidth = Math.max(1, Number(targetBackground.width) || 1);
  const canvasHeight = Math.max(1, Number(targetBackground.height) || 1);
  const minimumDimension = Math.min(canvasWidth, canvasHeight);
  let width = Math.max(1, (Number(responsive.size) || DEFAULT_LAYER_WIDTH) * minimumDimension / 100);
  let height = width / aspect;
  const fitScale = Math.min(1, canvasWidth / width, canvasHeight / height);
  width *= fitScale;
  height *= fitScale;
  const left = clamp(
    resolveAxisStart(responsive.xAnchor, responsive.xOffset, width, canvasWidth, minimumDimension),
    0,
    Math.max(0, canvasWidth - width),
  );
  const top = clamp(
    resolveAxisStart(responsive.yAnchor, responsive.yOffset, height, canvasHeight, minimumDimension),
    0,
    Math.max(0, canvasHeight - height),
  );

  return {
    ...sourceLayer,
    x: (left / canvasWidth) * 100,
    y: (top / canvasHeight) * 100,
    width: (width / canvasWidth) * 100,
    aspect,
  };
}

function actionToLayers(action, sourceLayers, targetBackground = null) {
  return sourceLayers.map((sourceLayer, index) => {
    const placement =
      (action.layers || []).find((layer) => layer.name === sourceLayer.name) ||
      action.layers?.[index];
    if (!placement) return sourceLayer;

    return placeResponsiveLayer(sourceLayer, placement, targetBackground, action.sourceBackground);
  });
}

function adaptLayersToBackground(sourceLayers, sourceBackground, targetBackground) {
  if (!sourceBackground || !targetBackground || sourceBackground.id === targetBackground.id) return sourceLayers;
  return actionToLayers(
    {
      sourceBackground: { width: sourceBackground.width, height: sourceBackground.height },
      layers: sourceLayers.map((layer) => snapshotLayer(layer, sourceBackground)),
    },
    sourceLayers,
    targetBackground,
  );
}

function containLayer(layer, background) {
  if (!background) return layer;
  const aspect = Math.max(0.05, Number(layer.aspect) || 1);
  const canvasAspect = Math.max(0.05, Number(background.width) / Number(background.height) || 1);
  const maxWidthForHeight = 100 * aspect / canvasAspect;
  const width = clamp(Number(layer.width) || DEFAULT_LAYER_WIDTH, 1, Math.min(100, maxWidthForHeight));
  const height = width * canvasAspect / aspect;
  return {
    ...layer,
    width,
    x: clamp(Number(layer.x) || 0, 0, Math.max(0, 100 - width)),
    y: clamp(Number(layer.y) || 0, 0, Math.max(0, 100 - height)),
  };
}

function LayerStage({ background, layers, selectedLayerId, resizeMode, expanded = false, previewSize = "medium", readOnly = false, onChoosePicture, onSelect, onChange }) {
  const stageRef = useRef(null);
  const gestureRef = useRef(null);

  function readPoint(event) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function startGesture(event, layer, mode) {
    if (readOnly) return;
    if (event.button !== 0) return;
    const point = readPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onSelect(layer.id);
    gestureRef.current = {
      id: layer.id,
      mode,
      point,
      layer: { ...layer },
    };
  }

  function moveGesture(event) {
    const gesture = gestureRef.current;
    const point = readPoint(event);
    if (!gesture || !point) return;
    event.preventDefault();
    const deltaX = point.x - gesture.point.x;
    const deltaY = point.y - gesture.point.y;
    if (gesture.mode === "resize") {
      onChange(gesture.id, {
        width: clamp(gesture.layer.width + deltaX, 4, Math.max(4, 100 - gesture.layer.x)),
      });
      return;
    }

    // Calculate the layer's height as a percentage of canvas height
    // This accounts for the layer's aspect ratio and the canvas aspect ratio
    const canvasAspectRatio = background ? background.width / background.height : 1;
    const layerAspect = gesture.layer.aspect || 1;
    const layerHeightPercent = (gesture.layer.width * canvasAspectRatio) / layerAspect;
    const maxY = Math.max(0, 100 - layerHeightPercent);

    onChange(gesture.id, {
      x: clamp(gesture.layer.x + deltaX, 0, Math.max(0, 100 - gesture.layer.width)),
      y: clamp(gesture.layer.y + deltaY, 0, maxY),
    });
  }

  function endGesture() {
    gestureRef.current = null;
  }

  const aspect = background ? `${background.width} / ${background.height}` : "4 / 5";
  const ratio = background ? background.width / background.height : 0.8;
  const expandedHeight = previewSize === "small" ? "30vh" : previewSize === "large" ? "50vh" : "40vh";

  return (
    <div
      ref={stageRef}
      className="relative mx-auto touch-none overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      style={{
        aspectRatio: aspect,
        width: background
          ? expanded
            ? `min(100%, calc(min(${expandedHeight}, 38rem) * ${ratio}))`
            : `min(100%, calc(min(36vh, 25rem) * ${ratio}))`
          : expanded
            ? "min(100%, 28rem)"
            : "min(100%, 16rem)",
      }}
      onPointerMove={readOnly ? undefined : moveGesture}
      onPointerUp={readOnly ? undefined : endGesture}
      onPointerCancel={readOnly ? undefined : endGesture}
    >
      {background ? (
        <img src={background.src} alt={background.name} decoding="async" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
      ) : (
        <button
          type="button"
          onClick={onChoosePicture}
          className="absolute inset-0 grid place-items-center bg-white p-6 text-center text-zinc-500 transition hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
          aria-label="Import canvas pictures"
        >
          <div>
            <ImagePlus className="mx-auto" size={34} />
            <p className="mt-3 text-sm font-black text-zinc-950 dark:text-white">Import a picture</p>
            <p className="mt-1 text-xs font-semibold">The canvas appears here for recorded placements.</p>
          </div>
        </button>
      )}
      {layers.map((layer) => {
        const selected = layer.id === selectedLayerId;
        return (
          <div
            key={layer.id}
            role={readOnly ? undefined : "button"}
            tabIndex={readOnly ? undefined : 0}
            aria-label={`Place ${layer.name}`}
            onPointerDown={readOnly ? undefined : (event) => startGesture(event, layer, "move")}
            onClick={readOnly ? undefined : () => onSelect(layer.id)}
            className={`absolute select-none ${readOnly ? "pointer-events-none" : "cursor-grab active:cursor-grabbing"} ${
              selected ? "z-20" : "z-10"
            }`}
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              width: `${layer.width}%`,
            }}
          >
            <img
              src={layer.src}
              alt={layer.name}
              decoding="async"
              draggable={false}
              className={`block h-auto w-full object-contain transition ${
                selected ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : "opacity-95"
              }`}
            />
            {!readOnly && selected && resizeMode && (
              <button
                type="button"
                aria-label={`Resize ${layer.name}`}
                onPointerDown={(event) => startGesture(event, layer, "resize")}
                className="absolute -bottom-3 -right-3 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-lg border-2 border-white bg-zinc-950 text-white shadow-xl"
              >
                <Square size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PicturePickerDialog({
  open,
  backgrounds,
  selectedBackgroundId,
  selectedIds,
  onAdd,
  onClose,
  onRemoveSelected,
  onSelect,
  onToggleSelected,
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return search ? backgrounds.filter((image) => image.name.toLowerCase().includes(search)) : backgrounds;
  }, [backgrounds, deferredQuery]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PICTURE_PAGE_SIZE));
  const visible = filtered.slice(page * PICTURE_PAGE_SIZE, (page + 1) * PICTURE_PAGE_SIZE);

  useEffect(() => {
    if (!open) return;
    setPage(0);
  }, [deferredQuery, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center bg-zinc-950/75 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Picture Selection</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">
              {selectedIds.size} selected of {backgrounds.length}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={Trash2} onClick={onRemoveSelected} disabled={!selectedIds.size}>
              Remove
            </Button>
            <Button size="sm" icon={Plus} onClick={onAdd}>
              Add Pictures
            </Button>
            <Button size="icon" variant="secondary" icon={X} onClick={onClose} aria-label="Close picture selection" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pictures"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => visible.forEach((image) => !selectedIds.has(image.id) && onToggleSelected(image.id))} disabled={!visible.length}>
              Select Page
            </Button>
            <span className="min-w-20 text-center font-mono text-xs font-bold text-zinc-500">{page + 1} / {pageCount}</span>
            <Button size="icon" variant="secondary" icon={ArrowLeft} onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="Previous picture page" />
            <Button size="icon" variant="secondary" icon={ArrowRight} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1} aria-label="Next picture page" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {visible.map((image) => (
              <div
                key={image.id}
                className={`relative overflow-hidden rounded-xl border bg-zinc-950 transition ${
                  selectedBackgroundId === image.id
                    ? "border-zinc-950 ring-2 ring-zinc-950/20 dark:border-white dark:ring-white/25"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <button type="button" onClick={() => onSelect(image.id)} className="block w-full text-left">
                  <img
                    src={image.src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover"
                    style={{ contentVisibility: "auto", containIntrinsicSize: "140px" }}
                  />
                  <p className="truncate px-2 py-2 text-[11px] font-black text-white">{image.name}</p>
                </button>
                <label className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-white/25 bg-zinc-950/80 text-white shadow-lg">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(image.id)}
                    onChange={() => onToggleSelected(image.id)}
                    className="h-3.5 w-3.5 accent-emerald-500"
                    aria-label={`Select ${image.name}`}
                  />
                </label>
              </div>
            ))}
            {!backgrounds.length && (
              <button
                type="button"
                onClick={onAdd}
                className="col-span-full grid min-h-52 place-items-center rounded-2xl border border-dashed border-zinc-300 p-5 text-center text-sm font-semibold text-zinc-500 dark:border-zinc-700"
              >
                Import the first picture
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CanvasDialog({ open, background, layers, positionLabel, previewSize, canCycle, onClose, onPrevious, onNext }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-zinc-950/90 p-4 backdrop-blur-sm sm:p-6">
      <Card className="flex min-h-0 max-h-[calc(100vh-7rem)] flex-1 flex-col overflow-hidden border-zinc-700 bg-zinc-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Finished Result</p>
            <h3 className="mt-1 truncate text-xl font-black tracking-tight">{background?.name || "No canvas picture"}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="black">{positionLabel}</Badge>
            <Button size="icon" variant="secondary" icon={X} onClick={onClose} aria-label="Close result preview" />
          </div>
        </div>
        <div className="relative grid min-h-0 flex-1 place-items-center overflow-auto bg-zinc-950 p-14 sm:p-16">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!canCycle}
            className="absolute left-3 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:left-5"
            aria-label="Previous finished result"
          >
            <ArrowLeft size={20} />
          </button>
          <LayerStage
            background={background}
            layers={layers}
            selectedLayerId=""
            resizeMode={false}
            expanded
            previewSize={previewSize}
            readOnly
          />
          <button
            type="button"
            onClick={onNext}
            disabled={!canCycle}
            className="absolute right-3 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:right-5"
            aria-label="Next finished result"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </Card>
    </div>
  );
}

function LogoPreviewDialog({ open, logo, onClose }) {
  if (!open || !logo) return null;
  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-zinc-950 dark:text-white">Logo Preview</h3>
            <p className="truncate text-xs font-semibold text-zinc-500">{logo.name}</p>
          </div>
          <Button size="icon" variant="secondary" icon={X} onClick={onClose} aria-label="Close logo preview" />
        </div>
        <div className="grid min-h-72 place-items-center bg-[linear-gradient(45deg,#e4e4e7_25%,transparent_25%),linear-gradient(-45deg,#e4e4e7_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e4e4e7_75%),linear-gradient(-45deg,transparent_75%,#e4e4e7_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-10 dark:bg-zinc-950">
          <img src={logo.src} alt={logo.name} className="max-h-60 max-w-full object-contain drop-shadow-xl" />
        </div>
      </Card>
    </div>
  );
}

function CompressionPreviewDialog({ preview, background, onClose }) {
  if (!preview || !background) return null;
  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-black text-zinc-950 dark:text-white">Compression Comparison</h3>
            <p className="text-xs font-semibold text-zinc-500">{background.name}</p>
          </div>
          <Button size="icon" variant="secondary" icon={X} onClick={onClose} aria-label="Close compression comparison" />
        </div>
        <div className="grid min-h-0 flex-1 gap-px overflow-auto bg-zinc-200 dark:bg-zinc-800 lg:grid-cols-2">
          <figure className="grid min-h-80 grid-rows-[1fr_auto] bg-zinc-950 p-4">
            <img src={background.src} alt="Original" className="m-auto max-h-[56vh] max-w-full object-contain" />
            <figcaption className="mt-3 flex items-center justify-between text-xs font-bold text-white">
              <span>Original</span><span>{formatBytes(preview.originalSize)}</span>
            </figcaption>
          </figure>
          <figure className="grid min-h-80 grid-rows-[1fr_auto] bg-zinc-950 p-4">
            <img src={preview.src} alt="Compressed result" className="m-auto max-h-[56vh] max-w-full object-contain" />
            <figcaption className="mt-3 flex items-center justify-between text-xs font-bold text-white">
              <span>Compressed · {preview.width}×{preview.height}</span><span>{formatBytes(preview.compressedSize)}</span>
            </figcaption>
          </figure>
        </div>
      </Card>
    </div>
  );
}

function ReplayDialog({
  open,
  backgrounds,
  recordings,
  selectedBackgroundId,
  selectedRecordingId,
  onClose,
  onSelectBackground,
  onSelectRecording,
  onPlay,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center bg-zinc-950/75 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Play Recording</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">
              Pick a picture and placement
            </h3>
          </div>
          <Button size="icon" variant="secondary" icon={X} onClick={onClose} aria-label="Close recordings" />
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Pictures</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {backgrounds.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => onSelectBackground(image.id)}
                  className={`overflow-hidden rounded-2xl border bg-zinc-950 text-left transition ${
                    selectedBackgroundId === image.id
                      ? "border-zinc-950 ring-2 ring-zinc-950/20 dark:border-white dark:ring-white/25"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <img src={image.src} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                  <p className="truncate px-3 py-2 text-xs font-black text-white">{image.name}</p>
                </button>
              ))}
              {!backgrounds.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 p-5 text-sm font-semibold text-zinc-500 dark:border-zinc-700">
                  Import canvas pictures first.
                </div>
              )}
            </div>
          </div>

          <aside>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Saved Actions</p>
            <div className="grid gap-2">
              {recordings.map((recording) => (
                <button
                  key={recording.id}
                  type="button"
                  onClick={() => onSelectRecording(recording.id)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selectedRecordingId === recording.id
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  }`}
                >
                  <p className="flex min-w-0 items-center gap-2 truncate text-sm font-black">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/40"
                      style={{ backgroundColor: recording.color || RECORDING_COLORS[0] }}
                    />
                    <span className="truncate">{recording.name}</span>
                  </p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest opacity-60">
                    {recording.layers?.length || 0} layer{recording.layers?.length === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
              {!recordings.length && (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-sm font-semibold text-zinc-500 dark:border-zinc-700">
                  Record and save a placement first.
                </div>
              )}
            </div>
            <Button
              className="mt-4 w-full"
              icon={Play}
              disabled={!selectedRecordingId || !selectedBackgroundId}
              onClick={onPlay}
            >
              Play
            </Button>
          </aside>
        </div>
      </Card>
    </div>
  );
}

export default function GridActionRecorder() {
  const [backgrounds, setBackgrounds] = useState([]);
  const [activeBackgroundId, setActiveBackgroundId] = useState("");
  const [layers, setLayers] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [resizeMode, setResizeMode] = useState(true);
  const [recording, setRecording] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionName, setActionName] = useState("");
  const [actionColor, setActionColor] = useState(RECORDING_COLORS[0]);
  const [recordings, setRecordings] = useState(readRecordings);
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameColor, setRenameColor] = useState(RECORDING_COLORS[0]);
  const [replayOpen, setReplayOpen] = useState(false);
  const [picturePickerOpen, setPicturePickerOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [replayBackgroundId, setReplayBackgroundId] = useState("");
  const [replayRecordingId, setReplayRecordingId] = useState("");
  const [operation, setOperation] = useState(null);
  const [selectedPictureIds, setSelectedPictureIds] = useState(() => new Set());
  const [selectedPresetIds, setSelectedPresetIds] = useState(() => new Set());
  const [placementsByBackground, setPlacementsByBackground] = useState({});
  const [selectedPositionId, setSelectedPositionId] = useState("bottom-right");
  const [presetName, setPresetName] = useState("");
  const [previewSize, setPreviewSize] = useState("medium");
  const [outputFormat, setOutputFormat] = useState("jpeg");
  const [quality, setQuality] = useState(85);
  const [resizePercent, setResizePercent] = useState(100);
  const [fileNamePattern, setFileNamePattern] = useState("{name}_placement");
  const [savedLogo, setSavedLogo] = useState(readSavedLogo);
  const [logoPreviewOpen, setLogoPreviewOpen] = useState(false);
  const [compressionPreview, setCompressionPreview] = useState(null);
  const backgroundInputRef = useRef(null);
  const backgroundFolderInputRef = useRef(null);
  const layerInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  const background = backgrounds.find((image) => image.id === activeBackgroundId) || backgrounds[0] || null;
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;
  const selectedReplayAction = recordings.find((item) => item.id === replayRecordingId) || null;
  const activeBackgroundIndex = Math.max(0, backgrounds.findIndex((image) => image.id === background?.id));
  const ratioGroups = useMemo(() => groupPicturesByRatio(backgrounds), [backgrounds]);
  const activeRatio = background ? getRatioInfo(background) : null;
  const selectedPictures = useMemo(
    () => backgrounds.filter((image) => selectedPictureIds.has(image.id)),
    [backgrounds, selectedPictureIds],
  );
  const totalOriginalBytes = useMemo(
    () => selectedPictures.reduce((sum, image) => sum + (Number(image.size) || 0), 0),
    [selectedPictures],
  );
  const estimatedOutputBytes = useMemo(() => {
    const pixelFactor = (resizePercent / 100) ** 2;
    const formatFactor = outputFormat === "jpeg" ? 0.18 + (quality / 100) * 0.72 : 0.92;
    return totalOriginalBytes * pixelFactor * formatFactor;
  }, [outputFormat, quality, resizePercent, totalOriginalBytes]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIONS_KEY, JSON.stringify(recordings));
    } catch {
      notify("Recording Storage Full", "The saved action was too large for local storage. Keep fewer recorded layers.", "error");
    }
  }, [recordings]);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((src) => {
        imageCache.delete(src);
        URL.revokeObjectURL(src);
      });
    },
    [],
  );

  useEffect(
    () => () => {
      if (compressionPreview?.src) URL.revokeObjectURL(compressionPreview.src);
    },
    [compressionPreview],
  );

  function selectBackground(id) {
    const target = backgrounds.find((image) => image.id === id);
    if (!target || target.id === background?.id) return;
    if (!background) {
      setActiveBackgroundId(target.id);
      return;
    }
    setPlacementsByBackground((current) => ({ ...current, [background.id]: layers }));
    setLayers(placementsByBackground[target.id] || adaptLayersToBackground(layers, background, target));
    setActiveBackgroundId(target.id);
  }

  function cycleBackground(direction) {
    if (backgrounds.length < 2) return;
    const nextIndex = (activeBackgroundIndex + direction + backgrounds.length) % backgrounds.length;
    selectBackground(backgrounds[nextIndex].id);
  }

  function updateOperation(label, progress) {
    setOperation({ label, progress: clamp(Math.round(progress), 0, 100) });
  }

  async function deliverExport(blob, fileName) {
    try {
      if (await saveBlobToPreferredFolder("grid", fileName, blob)) return true;
    } catch (error) {
      notify("Folder Save Failed", error?.message || "The preferred folder could not be used.", "error");
    }
    downloadBlob(blob, fileName, { skipPreferredFolder: true });
    return false;
  }

  function detectAspectRatios() {
    if (!backgrounds.length) {
      notify("No Pictures", "Import pictures before detecting aspect ratios.", "error");
      return;
    }
    notify("Ratios Detected", `${ratioGroups.length} aspect ratio group${ratioGroups.length === 1 ? "" : "s"} found across ${backgrounds.length} pictures.`);
  }

  function togglePictureSelected(id) {
    setSelectedPictureIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectRatioGroup(group) {
    const firstId = group.ids[0];
    if (firstId) selectBackground(firstId);
    setSelectedPictureIds((current) => {
      const next = new Set(current);
      group.ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function removeSelectedPictures() {
    if (!selectedPictureIds.size) return;
    const removing = selectedPictureIds;
    const remaining = backgrounds.filter((image) => !removing.has(image.id));
    backgrounds.filter((image) => removing.has(image.id)).forEach((image) => {
      imageCache.delete(image.src);
      objectUrlsRef.current.delete(image.src);
      URL.revokeObjectURL(image.src);
    });
    setBackgrounds(remaining);
    setPlacementsByBackground((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !removing.has(id))));
    setSelectedPictureIds(new Set());
    if (!remaining.some((image) => image.id === activeBackgroundId)) {
      setActiveBackgroundId(remaining[0]?.id || "");
      setLayers(remaining[0] ? placementsByBackground[remaining[0].id] || layers : []);
    }
    notify("Pictures Removed", `${removing.size} selected picture${removing.size === 1 ? "" : "s"} removed.`);
  }

  function refreshPictures() {
    setBackgrounds((current) => [...current]);
    detectAspectRatios();
  }

  async function importBackgroundFiles(files) {
    if (!files.length) return;
    updateOperation("Loading pictures", 0);
    try {
      const next = await loadImageFiles(files, (completed, total) =>
        updateOperation(`Loading pictures ${completed}/${total}`, total ? (completed / total) * 100 : 100),
      );
      next.forEach((image) => objectUrlsRef.current.add(image.src));
      if (!next.length) {
        notify("No pictures added", "Import PNG, JPEG, WEBP, or another browser-readable image.", "error");
        return;
      }
      setBackgrounds((current) => [...current, ...next]);
      setSelectedPictureIds((current) => {
        const selected = new Set(current);
        next.forEach((image) => selected.add(image.id));
        return selected;
      });
      setActiveBackgroundId((current) => current || next[0].id);
      notify("Pictures Added", `${next.length} canvas picture${next.length === 1 ? "" : "s"} ready.`);
    } catch (error) {
      notify("Picture Import Failed", error?.message || "Pictures could not be imported.", "error");
    } finally {
      setOperation(null);
    }
  }

  async function importBackgrounds(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await importBackgroundFiles(files);
  }

  async function importLayers(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    updateOperation("Loading logo layers", 0);
    const next = await loadImageFiles(files, (completed, total) =>
      updateOperation(`Loading logo layers ${completed}/${total}`, total ? (completed / total) * 100 : 100),
    );
    next.forEach((image) => objectUrlsRef.current.add(image.src));
    setOperation(null);
    if (!next.length) {
      notify("No layers added", "Import an image layer such as a logo or icon.", "error");
      return;
    }
    const nextLayers = next.map((image, index) => ({
      id: createId("layer"),
      name: image.name,
      src: image.src,
      x: clamp(8 + index * 4, 0, 72),
      y: clamp(8 + index * 4, 0, 72),
      width: DEFAULT_LAYER_WIDTH,
      aspect: image.width / image.height,
    }));
    setLayers((current) => [...current, ...nextLayers]);
    setSelectedLayerId(nextLayers[0].id);
    notify("Layers Added", `${nextLayers.length} overlay layer${nextLayers.length === 1 ? "" : "s"} ready.`);
  }

  function patchLayer(id, patch) {
    setLayers((current) => current.map((layer) => (layer.id === id ? containLayer({ ...layer, ...patch }, background) : layer)));
  }

  function applyPositionPreset(positionId) {
    if (!background || !layers.length) return;
    const positioned = positionLayers(layers, background, positionId);
    setSelectedPositionId(positionId);
    setLayers(positioned);
    setPlacementsByBackground((current) => ({ ...current, [background.id]: positioned }));
  }

  function saveCurrentRatioPreset() {
    if (!background || !layers.length || !activeRatio) {
      notify("Preset Not Ready", "Import pictures and a logo before saving a ratio preset.", "error");
      return;
    }
    const id = createId("ratio-preset");
    const positionLabel = POSITION_PRESETS.find((item) => item.id === selectedPositionId)?.label || "Custom";
    const name = presetName.trim() || `${activeRatio.label} ${positionLabel}`;
    const preset = {
      id,
      name,
      color: RECORDING_COLORS[recordings.length % RECORDING_COLORS.length],
      ratioKey: activeRatio.key,
      ratioLabel: activeRatio.label,
      positionId: selectedPositionId,
      sourceBackground: { width: background.width, height: background.height },
      layers: layers.map((layer) => snapshotLayer(layer, background)),
      createdAt: new Date().toISOString(),
    };
    setRecordings((current) => [preset, ...current].slice(0, 100));
    setSelectedPresetIds((current) => new Set(current).add(id));
    setPresetName("");
    notify("Ratio Preset Saved", `${name} is ready for ${activeRatio.label} pictures.`);
  }

  function togglePresetSelected(id) {
    setSelectedPresetIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function playSelectedPresets() {
    const selectedPresets = recordings.filter((preset) => selectedPresetIds.has(preset.id));
    if (!selectedPresets.length) {
      notify("Select Presets", "Select one or more saved ratio presets before playing.", "error");
      return;
    }
    if (!layers.length) {
      notify("Logo Missing", "Import or restore a saved logo before playing presets.", "error");
      return;
    }

    const nextPlacements = { ...placementsByBackground, ...(background ? { [background.id]: layers } : {}) };
    let applied = 0;
    selectedPresets.forEach((preset) => {
      backgrounds.forEach((image) => {
        if (selectedPictureIds.size && !selectedPictureIds.has(image.id)) return;
        const imageRatio = getRatioInfo(image);
        if (preset.ratioKey && preset.ratioKey !== imageRatio.key) return;
        nextPlacements[image.id] = actionToLayers(preset, layers, image);
        applied += 1;
      });
    });
    setPlacementsByBackground(nextPlacements);
    if (background && nextPlacements[background.id]) setLayers(nextPlacements[background.id]);
    notify("Presets Applied", `${selectedPresets.length} preset${selectedPresets.length === 1 ? "" : "s"} applied to ${applied} matching picture${applied === 1 ? "" : "s"}.`);
  }

  function getLayersForImage(image) {
    if (!image) return layers;
    if (image.id === background?.id) return layers;
    return placementsByBackground[image.id] || adaptLayersToBackground(layers, background, image);
  }

  async function saveSelectedLogo() {
    if (!selectedLayer) {
      notify("Select Logo", "Select a logo layer before saving it.", "error");
      return;
    }
    try {
      const sourceBlob = await fetch(selectedLayer.src).then((response) => response.blob());
      const stored = {
        name: selectedLayer.name,
        src: await blobToDataUrl(sourceBlob),
        aspect: selectedLayer.aspect,
      };
      localStorage.setItem(SAVED_LOGO_KEY, JSON.stringify(stored));
      setSavedLogo(stored);
      notify("Logo Saved", `${selectedLayer.name} can now be restored quickly.`);
    } catch (error) {
      notify("Logo Save Failed", error?.message || "The logo could not be saved.", "error");
    }
  }

  function restoreSavedLogo() {
    if (!savedLogo?.src) return;
    const restored = {
      id: createId("layer"),
      name: savedLogo.name || "Saved logo",
      src: savedLogo.src,
      x: 72,
      y: 84,
      width: DEFAULT_LAYER_WIDTH,
      aspect: Math.max(0.05, Number(savedLogo.aspect) || 1),
    };
    const positioned = background ? positionLayers([restored], background, selectedPositionId) : [restored];
    setLayers(positioned);
    setSelectedLayerId(restored.id);
    notify("Logo Restored", `${restored.name} is ready on the canvas.`);
  }

  async function openCompressionPreview() {
    if (!background) return;
    try {
      updateOperation("Building comparison preview", 25);
      const canvas = await drawPlacementCanvas(background, getLayersForImage(background), { resizePercent });
      const mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";
      const blob = await canvasBlob(canvas, mimeType, quality / 100);
      setCompressionPreview({
        src: URL.createObjectURL(blob),
        originalSize: background.size || 0,
        compressedSize: blob.size,
        width: canvas.width,
        height: canvas.height,
      });
    } catch (error) {
      notify("Preview Failed", error?.message || "The comparison preview could not be created.", "error");
    } finally {
      setOperation(null);
    }
  }

  function startRecording() {
    if (!background || !layers.length) {
      notify("Import layers first", "Add a picture and at least one logo or icon layer before recording.", "error");
      return;
    }
    setPendingAction(null);
    setActionName("");
    setActionColor(RECORDING_COLORS[recordings.length % RECORDING_COLORS.length]);
    setRecording(true);
    notify("Recording", "Move and resize the layers, then stop and save the placement.");
  }

  function stopRecording() {
    if (!recording) return;
    const nextAction = {
      id: createId("action"),
      name: "",
      ratioKey: activeRatio?.key || "",
      ratioLabel: activeRatio?.label || "Any",
      positionId: selectedPositionId,
      sourceBackground: { width: background.width, height: background.height },
      layers: layers.map((layer) => snapshotLayer(layer, background)),
      createdAt: new Date().toISOString(),
    };
    setPendingAction(nextAction);
    setActionName(`Logo placement ${recordings.length + 1}`);
    setActionColor(RECORDING_COLORS[recordings.length % RECORDING_COLORS.length]);
    setRecording(false);
  }

  function saveAction() {
    if (!pendingAction) return;
    const name = actionName.trim() || `Placement ${recordings.length + 1}`;
    setRecordings((current) => [{ ...pendingAction, name, color: actionColor }, ...current].slice(0, 40));
    setSelectedPresetIds((current) => new Set(current).add(pendingAction.id));
    setReplayRecordingId(pendingAction.id);
    setPendingAction(null);
    setActionName("");
    setActionColor(RECORDING_COLORS[0]);
    notify("Action Saved", `${name} can be played on another picture.`);
  }

  function deleteAction(id) {
    setRecordings((current) => current.filter((action) => action.id !== id));
    if (replayRecordingId === id) setReplayRecordingId("");
  }

  function saveRename(id) {
    const cleanName = renameValue.trim();
    if (!cleanName) return;
    setRecordings((current) =>
      current.map((action) => (action.id === id ? { ...action, name: cleanName, color: renameColor } : action)),
    );
    setRenameId("");
    setRenameValue("");
    setRenameColor(RECORDING_COLORS[0]);
  }

  function openReplay() {
    setReplayBackgroundId(background?.id || backgrounds[0]?.id || "");
    setReplayRecordingId((current) => current || recordings[0]?.id || "");
    setReplayOpen(true);
  }

  function playRecording() {
    if (!selectedReplayAction) return;
    if (!layers.length) {
      notify("Layer Missing", "Import the logo or icon layer to place before playing this action.", "error");
      return;
    }
    const targetBackground = backgrounds.find((bg) => bg.id === replayBackgroundId);
    const nextLayers = actionToLayers(selectedReplayAction, layers, targetBackground);
    setActiveBackgroundId(replayBackgroundId);
    setLayers(nextLayers);
    setSelectedLayerId(nextLayers[0]?.id || "");
    setReplayOpen(false);
    notify("Action Played", `${selectedReplayAction.name} was placed on the selected picture.`);
  }

  function removeLayer(id) {
    setLayers((current) => current.filter((layer) => layer.id !== id));
    setSelectedLayerId((current) => (current === id ? "" : current));
  }

  async function exportCurrentPng() {
    try {
      updateOperation("Rendering PNG", 20);
      const canvas = await drawPlacementCanvas(background, getLayersForImage(background), { resizePercent });
      updateOperation("Encoding PNG", 75);
      await deliverExport(await canvasBlob(canvas), buildExportName(background, 0, fileNamePattern, "png"));
      updateOperation("PNG ready", 100);
      notify("PNG Downloaded", "The placed picture was exported.");
    } catch (error) {
      notify("Export Failed", error.message || "The picture could not be exported.", "error");
    } finally {
      setOperation(null);
    }
  }

  async function exportCurrentJpg() {
    try {
      updateOperation("Rendering JPG", 20);
      const canvas = await drawPlacementCanvas(background, getLayersForImage(background), { resizePercent });
      updateOperation("Encoding JPG", 75);
      await deliverExport(await canvasBlob(canvas, "image/jpeg", quality / 100), buildExportName(background, 0, fileNamePattern, "jpg"));
      updateOperation("JPG ready", 100);
      notify("JPG Downloaded", "The placed picture was exported.");
    } catch (error) {
      notify("JPG Failed", error.message || "The picture could not be exported.", "error");
    } finally {
      setOperation(null);
    }
  }

  async function exportAllZip() {
    if (!selectedPictures.length) {
      notify("Select Pictures", "Select one or more pictures before exporting.", "error");
      return;
    }
    try {
      updateOperation("Preparing ZIP", 2);
      const { default: JSZip } = await import("jszip");
      const chunkSize = 500;
      const chunkCount = Math.ceil(selectedPictures.length / chunkSize);
      const mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";
      const extension = outputFormat === "jpeg" ? "jpg" : "png";
      let completed = 0;
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const zip = new JSZip();
        const chunk = selectedPictures.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
        await runWithConcurrency(chunk, 3, async (image, localIndex) => {
          const globalIndex = chunkIndex * chunkSize + localIndex;
          const canvas = await drawPlacementCanvas(image, getLayersForImage(image), { resizePercent });
          const blob = await canvasBlob(canvas, mimeType, quality / 100);
          zip.file(buildExportName(image, globalIndex, fileNamePattern, extension, selectedPictures.length), blob);
          completed += 1;
          updateOperation(`Rendering pictures ${completed}/${selectedPictures.length}`, 5 + (completed / selectedPictures.length) * 70);
        });
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (metadata) => {
          const chunkProgress = (chunkIndex + metadata.percent / 100) / chunkCount;
          updateOperation(`Building ZIP ${chunkIndex + 1}/${chunkCount}`, 75 + chunkProgress * 24);
        });
        const suffix = chunkCount > 1 ? `_part_${String(chunkIndex + 1).padStart(2, "0")}` : "";
        await deliverExport(blob, `grid_action_placements${suffix}.zip`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      updateOperation("ZIP ready", 100);
      notify("ZIP Downloaded", `${selectedPictures.length} selected picture${selectedPictures.length === 1 ? "" : "s"} exported.`);
    } catch (error) {
      notify("ZIP Failed", error.message || "The pictures could not be exported.", "error");
    } finally {
      setOperation(null);
    }
  }

  async function exportCurrentPsd() {
    try {
      updateOperation("Rendering PSD", 20);
      const canvas = await drawPlacementCanvas(background, getLayersForImage(background), { resizePercent });
      updateOperation("Encoding PSD", 75);
      await deliverExport(canvasToPsdBlob(canvas), `${cleanExportName(background?.name)}_placement.psd`);
      updateOperation("PSD ready", 100);
      notify("PSD Downloaded", "The placed picture was exported as PSD.");
    } catch (error) {
      notify("PSD Failed", error.message || "The picture could not be exported.", "error");
    } finally {
      setOperation(null);
    }
  }

  return (
    <>
      <input ref={backgroundInputRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={importBackgrounds} />
      <input ref={backgroundFolderInputRef} type="file" accept={IMAGE_ACCEPT} multiple webkitdirectory="" directory="" className="hidden" onChange={importBackgrounds} />
      <input ref={layerInputRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={importLayers} />

      <main className="flow-page grid max-w-[1536px] items-start gap-6 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <Card className="lg:col-span-2 overflow-hidden border-zinc-200/80 bg-white/90 p-0 shadow-sm transition-shadow duration-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Action Recorder</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Place a logo once, apply it to matching ratios</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-zinc-500">
                Import pictures, add a logo layer, save a ratio preset, then play the preset across every matching picture.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={ImagePlus} onClick={() => backgroundInputRef.current?.click()} disabled={Boolean(operation)}>Import Pictures</Button>
              <Button icon={FolderPlus} variant="secondary" onClick={() => backgroundFolderInputRef.current?.click()} disabled={Boolean(operation)}>Import Folder</Button>
              <Button icon={Layers} variant="secondary" onClick={() => layerInputRef.current?.click()} disabled={Boolean(operation)}>Import Logo</Button>
            </div>
          </div>
          <div className="grid border-t border-zinc-100 bg-zinc-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950/40 md:grid-cols-3">
            {[
              ["1", "Detect", "Load photos and use Detect Ratios to group matching sizes."],
              ["2", "Position", "Move the logo on the canvas for the active ratio."],
              ["3", "Apply", "Save the preset, select presets, then Play or export."],
            ].map(([step, title, copy]) => (
              <div key={step} className="flex gap-3 py-2 md:px-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-950 text-xs font-black text-white dark:bg-white dark:text-zinc-950">{step}</span>
                <span>
                  <span className="block text-xs font-black uppercase tracking-widest text-zinc-500">{title}</span>
                  <span className="mt-0.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-200">{copy}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
        <aside className="grid content-start gap-5">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Grid Actions</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Placement Recorder</h2>
              </div>
              <Badge variant={recording ? "error" : "default"}>{recording ? "Recording" : "Ready"}</Badge>
            </div>

            <div className="mt-4 grid gap-2">
              <Button icon={ImagePlus} onClick={() => backgroundInputRef.current?.click()} disabled={Boolean(operation)}>
                Import Pictures
              </Button>
              <Button icon={FolderPlus} variant="secondary" onClick={() => backgroundFolderInputRef.current?.click()} disabled={Boolean(operation)}>
                Import Folder
              </Button>
              <Button icon={Layers} variant="secondary" onClick={() => layerInputRef.current?.click()} disabled={Boolean(operation)}>
                Import Logo
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button icon={Save} onClick={saveCurrentRatioPreset} disabled={!background || !layers.length}>
                Save
              </Button>
              <Button icon={Play} variant="outline" onClick={playSelectedPresets} disabled={!selectedPresetIds.size || !backgrounds.length}>
                Play {selectedPresetIds.size ? `(${selectedPresetIds.size})` : ""}
              </Button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="sm" icon={RefreshCw} variant="secondary" onClick={refreshPictures} disabled={!backgrounds.length}>
                Refresh
              </Button>
              <Button size="sm" icon={Trash2} variant="outline" onClick={removeSelectedPictures} disabled={!selectedPictureIds.size}>
                Remove ({selectedPictureIds.size})
              </Button>
            </div>

            {pendingAction && (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                <Input label="Save recording as" value={actionName} onChange={(event) => setActionName(event.target.value)} />
                <div className="mt-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Recording Color</p>
                  <div className="flex flex-wrap gap-2">
                    {RECORDING_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setActionColor(color)}
                        aria-label={`Use recording color ${color}`}
                        className={`h-7 w-7 rounded-full border-2 transition ${
                          actionColor === color ? "border-white ring-2 ring-zinc-950 dark:ring-white" : "border-white/80"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <Button className="mt-3 w-full" icon={Save} onClick={saveAction}>
                  Save Recording
                </Button>
              </div>
            )}

            <div className="mt-4 grid gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Export Selected</p>
                <Badge variant="default">{selectedPictures.length}</Badge>
              </div>
              <Input
                label="Batch file name"
                value={fileNamePattern}
                onChange={(event) => setFileNamePattern(event.target.value)}
                placeholder="{name}_{index}_{ratio}"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Format
                  <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
                    <option value="jpeg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Picture size
                  <select value={resizePercent} onChange={(event) => setResizePercent(Number(event.target.value))} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
                    <option value="100">Original</option>
                    <option value="75">75%</option>
                    <option value="50">50%</option>
                    <option value="25">25%</option>
                  </select>
                </label>
              </div>
              <RangeSlider
                label="Image quality"
                valueLabel={`${quality}%`}
                min={40}
                max={100}
                step={5}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
              />
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-3 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">
                <span>Before <strong className="block text-xs text-zinc-800 dark:text-white">{formatBytes(totalOriginalBytes)}</strong></span>
                <span>Estimated after <strong className="block text-xs text-emerald-600">{formatBytes(estimatedOutputBytes)}</strong></span>
              </div>
              <Button size="sm" icon={Eye} variant="outline" onClick={openCompressionPreview} disabled={!background || Boolean(operation)}>
                Compare Quality
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" icon={Download} onClick={exportCurrentPng} disabled={!background || Boolean(operation)}>
                  PNG
                </Button>
                <Button size="sm" icon={Download} variant="secondary" onClick={exportCurrentJpg} disabled={!background || Boolean(operation)}>
                  JPG
                </Button>
                <Button size="sm" icon={FileArchive} variant="secondary" onClick={exportAllZip} disabled={!selectedPictures.length || Boolean(operation)}>
                  ZIP
                </Button>
                <Button size="sm" icon={Layers} variant="outline" onClick={exportCurrentPsd} disabled={!background || Boolean(operation)}>
                  PSD
                </Button>
              </div>
              {operation && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950" role="status">
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                    <span className="flex min-w-0 items-center gap-2">
                      <LoaderCircle className="shrink-0 animate-spin" size={14} />
                      <span className="truncate">{operation.label}</span>
                    </span>
                    <span className="font-mono">{operation.progress}%</span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                    role="progressbar"
                    aria-label={operation.label}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={operation.progress}
                  >
                    <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-200" style={{ width: `${operation.progress}%` }} />
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Layers</p>
                <p className="mt-1 text-sm font-bold text-zinc-700 dark:text-zinc-200">
                  {layers.length} overlay layer{layers.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button size="icon" variant="secondary" icon={Plus} onClick={() => layerInputRef.current?.click()} aria-label="Add layer" />
            </div>

            <div className="mt-3 grid gap-2">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border p-2 ${
                    selectedLayerId === layer.id
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <button type="button" onClick={() => setSelectedLayerId(layer.id)} className="h-12 overflow-hidden rounded-xl bg-white">
                    <img src={layer.src} alt="" className="h-full w-full object-contain" />
                  </button>
                  <button type="button" onClick={() => setSelectedLayerId(layer.id)} className="min-w-0 text-left">
                    <p className="truncate text-xs font-black">{layer.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] opacity-60">{Math.round(layer.width)}% width</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLayer(layer.id)}
                    className="grid h-8 w-8 place-items-center rounded-xl bg-white/15 text-current hover:bg-white/25"
                    aria-label={`Delete ${layer.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!layers.length && (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-sm font-semibold text-zinc-500 dark:border-zinc-700">
                  Import a logo, icon, or image layer.
                </div>
              )}
            </div>

            {selectedLayer && (
              <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <Button icon={Move} size="sm" variant={resizeMode ? "primary" : "outline"} onClick={() => setResizeMode((value) => !value)}>
                  {resizeMode ? "Resize On" : "Resize"}
                </Button>
                <RangeSlider
                  label={`${selectedLayer.name} size`}
                  valueLabel={`${Math.round(selectedLayer.width)}%`}
                  min={4}
                  max={96}
                  value={selectedLayer.width}
                  onChange={(event) => patchLayer(selectedLayer.id, { width: Number(event.target.value) })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" icon={Save} variant="secondary" onClick={saveSelectedLogo}>
                    Save Logo
                  </Button>
                  <Button size="sm" icon={Eye} variant="outline" onClick={() => setLogoPreviewOpen(true)}>
                    Preview
                  </Button>
                </div>
              </div>
            )}
            {!layers.length && savedLogo?.src && (
              <Button className="mt-3 w-full" size="sm" icon={Plus} variant="secondary" onClick={restoreSavedLogo}>
                Use Saved Logo
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ratio Presets</p>
                <p className="mt-1 text-sm font-bold text-zinc-700 dark:text-zinc-200">Select one or more, then Play</p>
              </div>
              <Badge variant="default">{selectedPresetIds.size} / {recordings.length}</Badge>
            </div>

            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1">
              {recordings.map((action) => (
                <div
                  key={action.id}
                  className={`rounded-2xl border bg-white p-3 dark:bg-zinc-950 ${
                    selectedPresetIds.has(action.id)
                      ? "border-zinc-950 ring-1 ring-zinc-950/15 dark:border-white"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                  style={{ borderLeftWidth: "5px", borderLeftColor: action.color || RECORDING_COLORS[0] }}
                >
                  {renameId === action.id ? (
                    <div className="grid gap-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold outline-none dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <Button size="icon" icon={Check} onClick={() => saveRename(action.id)} aria-label="Save recording changes" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {RECORDING_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setRenameColor(color)}
                            aria-label={`Set ${action.name} color ${color}`}
                            className={`h-6 w-6 rounded-full border-2 transition ${
                              renameColor === color ? "border-white ring-2 ring-zinc-950 dark:ring-white" : "border-white/80"
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <label className="mt-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md border border-zinc-300 dark:border-zinc-700">
                          <input
                            type="checkbox"
                            checked={selectedPresetIds.has(action.id)}
                            onChange={() => togglePresetSelected(action.id)}
                            className="h-3.5 w-3.5 accent-emerald-500"
                            aria-label={`Select ${action.name}`}
                          />
                        </label>
                        <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-2 truncate text-sm font-black">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: action.color || RECORDING_COLORS[0] }} />
                          <span className="truncate">{action.name}</span>
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                          {action.ratioLabel || "Any ratio"} · {POSITION_PRESETS.find((item) => item.id === action.positionId)?.label || "Custom"}
                        </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setRenameId(action.id);
                            setRenameValue(action.name);
                            setRenameColor(action.color || RECORDING_COLORS[0]);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 text-zinc-600 hover:text-zinc-950 dark:bg-zinc-800 dark:text-zinc-300"
                          aria-label={`Rename ${action.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAction(action.id)}
                          className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 text-zinc-600 hover:text-rose-600 dark:bg-zinc-800 dark:text-zinc-300"
                          aria-label={`Delete ${action.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!recordings.length && (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-sm font-semibold text-zinc-500 dark:border-zinc-700">
                  Position the logo on a detected ratio, name it, then save the preset.
                </div>
              )}
            </div>
          </Card>
        </aside>

        <section className="grid content-start gap-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black tracking-tight text-zinc-950 dark:text-white">Aspect Ratio Presets</h3>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  {backgrounds.length} pictures · {selectedPictureIds.size} selected · {ratioGroups.length} ratios
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={RefreshCw} onClick={detectAspectRatios} disabled={!backgrounds.length}>
                  Detect Ratios
                </Button>
                <Button size="sm" variant="secondary" icon={ImagePlus} onClick={() => setPicturePickerOpen(true)}>
                  Select Pictures
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {ratioGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => selectRatioGroup(group)}
                  className={`min-w-24 shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                    activeRatio?.key === group.key
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                  }`}
                >
                  <span className="block text-sm font-black">{group.label}</span>
                  <span className="mt-0.5 block text-[10px] font-bold opacity-60">{group.count} picture{group.count === 1 ? "" : "s"}</span>
                </button>
              ))}
              {!ratioGroups.length && (
                <button type="button" onClick={() => backgroundInputRef.current?.click()} className="min-h-16 flex-1 rounded-xl border border-dashed border-zinc-300 px-4 text-sm font-bold text-zinc-500 dark:border-zinc-700">
                  Import pictures to detect ratios
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="grid content-start gap-3">
                <Input
                  label="Preset name"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder={activeRatio ? `${activeRatio.label} logo preset` : "Custom preset name"}
                />
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Canvas popup size</p>
                  <div className="grid grid-cols-3 gap-2">
                    {["small", "medium", "large"].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setPreviewSize(size)}
                        className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase transition ${
                          previewSize === size
                            ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <Button icon={Save} onClick={saveCurrentRatioPreset} disabled={!background || !layers.length}>
                  Save {activeRatio?.label || "Ratio"} Preset
                </Button>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Logo position</p>
                <div className="grid grid-cols-3 gap-2">
                  {POSITION_PRESETS.map((position) => (
                    <button
                      key={position.id}
                      type="button"
                      onClick={() => applyPositionPreset(position.id)}
                      title={position.label}
                      aria-label={position.label}
                      className={`relative h-12 rounded-lg border transition ${
                        selectedPositionId === position.id
                          ? "border-zinc-950 bg-zinc-950 dark:border-white dark:bg-white"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                      }`}
                    >
                      <span
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm ${
                          selectedPositionId === position.id ? "bg-white dark:bg-zinc-950" : "bg-zinc-500"
                        }`}
                        style={{ left: `${20 + position.column * 30}%`, top: `${20 + position.row * 30}%` }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Action Canvas</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-zinc-950 dark:text-white">
                  {background?.name || "No canvas picture"}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="black">{backgrounds.length} picture{backgrounds.length === 1 ? "" : "s"}</Badge>
                <Badge variant="default">{layers.length} layer{layers.length === 1 ? "" : "s"}</Badge>
                <Button size="sm" variant="secondary" icon={Eye} onClick={() => setCanvasOpen(true)} disabled={!background}>
                  View Result
                </Button>
              </div>
            </div>
            <div className="bg-zinc-100 p-4 dark:bg-zinc-950">
              <LayerStage
                background={background}
                layers={layers}
                selectedLayerId={selectedLayerId}
                resizeMode={resizeMode}
                onChoosePicture={() => backgroundInputRef.current?.click()}
                onSelect={setSelectedLayerId}
                onChange={patchLayer}
              />
            </div>
          </Card>

        </section>
      </main>

      <PicturePickerDialog
        open={picturePickerOpen}
        backgrounds={backgrounds}
        selectedBackgroundId={background?.id || ""}
        selectedIds={selectedPictureIds}
        onAdd={() => backgroundInputRef.current?.click()}
        onClose={() => setPicturePickerOpen(false)}
        onRemoveSelected={removeSelectedPictures}
        onSelect={(id) => {
          selectBackground(id);
        }}
        onToggleSelected={togglePictureSelected}
      />
      <CanvasDialog
        open={canvasOpen}
        background={background}
        layers={layers}
        positionLabel={backgrounds.length ? `${activeBackgroundIndex + 1} / ${backgrounds.length}` : "0 / 0"}
        previewSize={previewSize}
        canCycle={backgrounds.length > 1}
        onClose={() => setCanvasOpen(false)}
        onPrevious={() => cycleBackground(-1)}
        onNext={() => cycleBackground(1)}
      />
      <LogoPreviewDialog
        open={logoPreviewOpen}
        logo={selectedLayer || savedLogo}
        onClose={() => setLogoPreviewOpen(false)}
      />
      <CompressionPreviewDialog
        preview={compressionPreview}
        background={background}
        onClose={() => setCompressionPreview(null)}
      />
      <ReplayDialog
        open={replayOpen}
        backgrounds={backgrounds}
        recordings={recordings}
        selectedBackgroundId={replayBackgroundId}
        selectedRecordingId={replayRecordingId}
        onClose={() => setReplayOpen(false)}
        onSelectBackground={setReplayBackgroundId}
        onSelectRecording={setReplayRecordingId}
        onPlay={playRecording}
      />
    </>
  );
}
