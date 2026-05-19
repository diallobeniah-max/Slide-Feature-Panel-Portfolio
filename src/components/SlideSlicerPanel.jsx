import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Check,
  RotateCcw,
  Upload,
  Grid3X3,
  Image as ImageIcon,
  FileArchive,
  Trash2,
  X,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import JSZip from "jszip";
import { downloadBlob } from "../utils/media.js";
import { Card, Button, Input, RangeSlider } from "./ui.jsx";
import {
  INITIAL_CUSTOM_PRESETS,
  STATIC_PRESETS,
} from "../constants/presets.jsx";

const iconProps = { strokeWidth: 1.75 };

export default function SlideSlicerPanel() {
  const [activeTab, setActiveTab] = useState("slicer"); // "slicer" | "presets"
  const [sourceImage, setSourceImage] = useState(null);
  const [slideWidth, setSlideWidth] = useState(1080);
  const [slideHeight, setSlideHeight] = useState(1080);
  const [slideCount, setSlideCount] = useState(1);
  const [prefix, setPrefix] = useState("Promo_Asset");
  const [direction, setDirection] = useState("horizontal");
  const [generatedSlices, setGeneratedSlices] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState({
    type: "idle",
    message: "Import an image to begin slicing.",
  });
  const [expandedSlice, setExpandedSlice] = useState(null);
  const [expandedZoom, setExpandedZoom] = useState(1);
  const [customPresets, setCustomPresets] = useState(() => {
    const saved = localStorage.getItem("studio_custom_presets_v2");
    return saved ? JSON.parse(saved) : INITIAL_CUSTOM_PRESETS;
  });
  const [presetDraft, setPresetDraft] = useState({
    name: "",
    w: 1080,
    h: 1080,
  });
  const [showPresetForm, setShowPresetForm] = useState(false);
  const fileInputRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem(
      "studio_custom_presets_v2",
      JSON.stringify(customPresets),
    );
  }, [customPresets]);

  function importImage(event) {
    const file = event.target.files?.[0];
    loadSourceFile(file);
  }

  function loadSourceFile(file) {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setStatus({ type: "idle", message: "Drop a PNG, JPG, WEBP, or other image file." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const image = new Image();
      image.onload = () => {
        setSourceImage(image.src);
        setGeneratedSlices([]);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setStatus({ type: "success", message: `${file.name} imported.` });
      };
      image.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function generateSlices() {
    if (!sourceImage) return;
    setStatus({ type: "loading", message: "Rendering slide slices..." });

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = sourceImage;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Failed to load image"));
    });

    const slices = [];

    for (let index = 0; index < slideCount; index += 1) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = slideWidth;
      canvas.height = slideHeight;

      const sourceWidth =
        direction === "horizontal" ? image.width / slideCount : image.width;
      const sourceHeight =
        direction === "horizontal" ? image.height : image.height / slideCount;
      const sourceX = direction === "horizontal" ? index * sourceWidth : 0;
      const sourceY = direction === "horizontal" ? 0 : index * sourceHeight;
      
      // Calculate aspect ratios
      const sourceAspectRatio = sourceWidth / sourceHeight;
      const targetAspectRatio = slideWidth / slideHeight;
      
      let drawWidth, drawHeight, drawX = 0, drawY = 0;
      
      if (sourceAspectRatio > targetAspectRatio) {
        // Source is wider than target - fit to height
        drawHeight = slideHeight;
        drawWidth = slideHeight * sourceAspectRatio;
        drawX = (slideWidth - drawWidth) / 2;
      } else {
        // Source is taller than target - fit to width
        drawWidth = slideWidth;
        drawHeight = slideWidth / sourceAspectRatio;
        drawY = (slideHeight - drawHeight) / 2;
      }
      
      const zoomFactor = 1 / zoom;
      const panX = (pan.x / 100) * image.width;
      const panY = (pan.y / 100) * image.height;

      // Clear canvas with white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slideWidth, slideHeight);
      
      ctx.drawImage(
        image,
        sourceX + panX,
        sourceY + panY,
        sourceWidth * zoomFactor,
        sourceHeight * zoomFactor,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
      slices.push(canvas.toDataURL("image/png"));
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }

    setGeneratedSlices(slices);
    setStatus({
      type: "success",
      message: `${slices.length} slide slice${slices.length === 1 ? "" : "s"} generated.`,
    });
  }

  async function exportSlices() {
    if (!generatedSlices.length) return;
    setStatus({ type: "loading", message: "Bundling slide ZIP..." });
    const zip = new JSZip();

    for (let index = 0; index < generatedSlices.length; index += 1) {
      const blob = await fetch(generatedSlices[index]).then((response) =>
        response.blob(),
      );
      zip.file(
        `${prefix}_Slide_${String(index + 1).padStart(2, "0")}.png`,
        blob,
      );
    }

    const bundle = await zip.generateAsync({ type: "blob" });
    downloadBlob(bundle, `${prefix}_Slides.zip`);
    setStatus({ type: "success", message: "Slide ZIP exported." });
    window.dispatchEvent(
      new CustomEvent("studio-notify", {
        detail: {
          title: "Slides Exported",
          message: `${generatedSlices.length} slides saved as ZIP.`,
          type: "success",
        },
      }),
    );
  }

  function savePreset() {
    if (!presetDraft.name || presetDraft.w <= 0 || presetDraft.h <= 0) return;
    setCustomPresets((items) => [
      { ...presetDraft, id: crypto.randomUUID() },
      ...items,
    ]);
    setShowPresetForm(false);
    setPresetDraft({ name: "", w: slideWidth, h: slideHeight });
  }

  function selectPreset(preset) {
    const width = Math.max(1, Number(preset.w) || 1080);
    const height = Math.max(1, Number(preset.h) || 1080);
    setSlideWidth(width);
    setSlideHeight(height);
    setPresetDraft((draft) => ({ ...draft, w: width, h: height }));
    setStatus({ type: "success", message: `${preset.name} preset applied: ${width}x${height}px.` });
    setActiveTab("slicer");
  }

  function resetSlicer() {
    setSourceImage(null);
    setGeneratedSlices([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStatus({ type: "idle", message: "Import an image to begin slicing." });
  }

  function startDrag(event) {
    if (!sourceImage) return;
    event.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  }

  function moveDrag(event) {
    if (!isDragging) return;
    event.preventDefault();
    setPan({
      x: event.clientX - dragStart.current.x,
      y: event.clientY - dragStart.current.y,
    });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[24em_1fr]">
      <aside className="grid content-start gap-5">
        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-950/20">
            <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-[14px] gap-1">
              <button
                onClick={() => setActiveTab("slicer")}
                className={`flex-1 text-[10px] py-2.5 rounded-[10px] font-black uppercase tracking-[0.12em] transition-all duration-300 ${
                  activeTab === "slicer"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)] scale-[1.02]"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                Slide Slicer
              </button>
              <button
                onClick={() => setActiveTab("presets")}
                className={`flex-1 text-[10px] py-2.5 rounded-[10px] font-black uppercase tracking-[0.12em] transition-all duration-300 ${
                  activeTab === "presets"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)] scale-[1.02]"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                Presets
              </button>
            </div>
          </div>

          <div className="p-5">
            <div className={activeTab === "presets" ? "block" : "hidden"}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    Dimension Presets
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {slideWidth}x{slideHeight}px
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={Plus}
                  variant="secondary"
                  onClick={() => {
                    setPresetDraft({ name: "", w: slideWidth, h: slideHeight });
                    setShowPresetForm((value) => !value);
                  }}
                >
                  Add
                </Button>
              </div>

              {showPresetForm && (
                <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 p-4 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
                  <Input
                    placeholder="Preset name"
                    value={presetDraft.name}
                    onChange={(event) =>
                      setPresetDraft({ ...presetDraft, name: event.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={presetDraft.w}
                      onChange={(event) =>
                        setPresetDraft({
                          ...presetDraft,
                          w: Number(event.target.value),
                        })
                      }
                    />
                    <Input
                      type="number"
                      value={presetDraft.h}
                      onChange={(event) =>
                        setPresetDraft({
                          ...presetDraft,
                          h: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  <Button icon={Check} onClick={savePreset} className="w-full">
                    Save Preset
                  </Button>
                </div>
              )}

              <div className="mt-5 grid max-h-[18em] gap-5 overflow-y-auto pr-1 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                  {customPresets.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => selectPreset(preset)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        slideWidth === preset.w && slideHeight === preset.h
                          ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950 shadow-md"
                          : "border-zinc-200 bg-white hover:border-zinc-950 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-white"
                      }`}
                    >
                      <span className="block truncate text-[11px] font-black uppercase tracking-widest">
                        {preset.name}
                      </span>
                      <span
                        className={`mt-1 block font-mono text-xs font-medium ${
                          slideWidth === preset.w && slideHeight === preset.h
                            ? "opacity-70"
                            : "text-zinc-500"
                        }`}
                      >
                        {preset.w}x{preset.h}
                      </span>
                    </button>
                  ))}
                </div>

                {STATIC_PRESETS.map((group) => {
                  const Icon = group.icon.type;
                  return (
                    <div key={group.category} className="grid gap-3">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        <Icon size={14} {...iconProps} /> {group.category}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {group.items.map((preset) => (
                          <button
                            type="button"
                            key={`${group.category}-${preset.name}`}
                            onClick={() => selectPreset(preset)}
                            className={`rounded-2xl border p-3 text-left transition ${
                              slideWidth === preset.w && slideHeight === preset.h
                                ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950 shadow-md"
                                : "border-zinc-200 bg-white hover:border-zinc-950 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-white"
                            }`}
                          >
                            <span className="block truncate text-[11px] font-black uppercase tracking-widest">
                              {preset.name}
                            </span>
                            <span
                              className={`mt-1 block font-mono text-xs font-medium ${
                                slideWidth === preset.w && slideHeight === preset.h
                                  ? "opacity-70"
                                  : "text-zinc-500"
                              }`}
                            >
                              {preset.w}x{preset.h}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={activeTab === "slicer" ? "block" : "hidden"}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    Slide Slicer
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                    Batch Slice Assets
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetSlicer}
                  aria-label="Reset slicer"
                >
                  <RotateCcw size={18} />
                </Button>
              </div>

              <div className="mt-6 grid gap-5">
                <Card className="p-4 shadow-none border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-800/30">
                  <RangeSlider
                    label="Canvas Zoom"
                    valueLabel={`${Math.round(zoom * 100)}%`}
                    min="1"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                </Card>

                <Input
                  label="Export Prefix"
                  value={prefix}
                  onChange={(event) => setPrefix(event.target.value)}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Width"
                    type="number"
                    value={slideWidth}
                    onChange={(event) => setSlideWidth(Number(event.target.value))}
                  />
                  <Input
                    label="Height"
                    type="number"
                    value={slideHeight}
                    onChange={(event) => setSlideHeight(Number(event.target.value))}
                  />
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_8em] gap-3">
                  <Input
                    label="Slices"
                    type="number"
                    min="1"
                    value={slideCount}
                    onChange={(event) =>
                      setSlideCount(Math.max(1, Number(event.target.value)))
                    }
                  />
                  <div className="grid content-end">
                    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-zinc-200 p-1 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                      {[
                        ["horizontal", "H"],
                        ["vertical", "V"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setDirection(value)}
                          className={`rounded-xl py-2.5 text-xs font-black transition-all duration-200 ease-out ${
                            direction === value
                              ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                              : "text-zinc-500 hover:bg-white/60 dark:hover:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={importImage}
                />
                <div className="grid gap-2 pt-2">
                  <Button
                    icon={Upload}
                    variant="secondary"
                    size="lg"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import Source
                  </Button>
                  <Button
                    icon={Grid3X3}
                    variant="primary"
                    size="lg"
                    disabled={!sourceImage}
                    onClick={generateSlices}
                  >
                    Slice Image
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="order-3 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold dark:border-zinc-800 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 card-hover">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              status.type === "loading"
                ? "animate-pulse bg-zinc-950 dark:bg-white"
                : status.type === "success"
                  ? "bg-emerald-500"
                  : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          />
          {status.message}
        </div>
      </aside>

      <section className="grid content-start gap-5">
        <Card
          className={`grid aspect-video place-items-center overflow-hidden border-zinc-800 bg-zinc-950 group ${
            sourceImage
              ? "cursor-grab active:cursor-grabbing"
              : "dropzone-interactive cursor-pointer"
          }`}
          onMouseDown={startDrag}
          onMouseMove={moveDrag}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            loadSourceFile(event.dataTransfer.files?.[0]);
          }}
          onClick={
            !sourceImage ? () => fileInputRef.current?.click() : undefined
          }
        >
          {sourceImage ? (
            <div
              className="group/preview relative flex h-full w-full items-center justify-center overflow-hidden bg-black p-4 transition-transform duration-75"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              }}
            >
              <img
                src={sourceImage}
                alt="Source"
                draggable="false"
                className="max-h-[34em] max-w-full select-none rounded-2xl bg-black object-contain shadow-2xl"
              />
              <div
                className={`pointer-events-none absolute inset-0 flex ${
                  direction === "horizontal" ? "flex-row" : "flex-col"
                }`}
              >
                {Array.from({ length: slideCount }).map((_, index) => (
                  <div
                    key={index}
                    className="grid flex-1 place-items-center border border-white/50 bg-black/10 font-mono text-[10px] font-black uppercase text-white shadow-sm"
                  >
                    Slide {index + 1}
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs font-black uppercase tracking-widest text-white opacity-0 shadow-2xl backdrop-blur-md transition duration-200 group-hover/preview:opacity-100">
                {slideWidth} x {slideHeight}
              </div>
            </div>
          ) : (
            <div className="text-center select-none">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 icon-float">
                <ImageIcon
                  className="text-zinc-400 dark:text-zinc-500 icon-pop"
                  size={28}
                  {...iconProps}
                />
              </div>
              <p className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                No source image
              </p>
              <p className="mt-2 font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Click or drag to import a carousel design.
              </p>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
                PNG · JPG · WEBP
              </p>
            </div>
          )}
        </Card>

        {generatedSlices.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                  Generated Assets
                </p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                  {generatedSlices.length} slide outputs
                </h3>
              </div>
              <Button icon={FileArchive} onClick={exportSlices}>
                Export ZIP
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {generatedSlices.map((slice, index) => (
                <button
                  key={slice}
                  onClick={() => {
                    setExpandedZoom(1);
                    setExpandedSlice({ src: slice, index });
                  }}
                  className="group relative aspect-square overflow-hidden rounded-[18px] border border-zinc-200 bg-zinc-100 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
                >
                  <img
                    src={slice}
                    alt={`Slide ${index + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 text-white opacity-0 transition group-hover:opacity-100">
                    <span className="block truncate text-xs font-black">
                      Slide {index + 1}
                    </span>
                    <span className="mt-1 block text-[10px] font-medium text-white/75">
                      {slideWidth} x {slideHeight}
                    </span>
                  </span>
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      setGeneratedSlices((items) =>
                        items.filter((_, itemIndex) => itemIndex !== index),
                      );
                    }}
                    className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-xl bg-white/90 text-zinc-950 opacity-0 shadow-sm transition hover:bg-red-500 hover:text-white group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-white dark:hover:bg-red-600"
                  >
                    <Trash2 size={14} {...iconProps} />
                  </span>
                  <span className="absolute bottom-3 right-3 rounded-lg bg-zinc-950 px-2 py-1 font-mono text-[10px] font-bold text-white shadow-sm dark:bg-white dark:text-zinc-950">
                    #{index + 1}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </section>

      {expandedSlice && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-4 sm:p-8"
          onClick={() => setExpandedSlice(null)}
        >
          <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-xl" />
          <div
            className="relative flex h-[min(90vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-900 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900 px-5 py-4 sm:px-8">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Expanded Preview
                </p>
                <h3 className="mt-1 truncate text-base font-black tracking-tight text-zinc-50">
                  Slide {expandedSlice.index + 1}
                </h3>
                <p className="mt-1 truncate text-[11px] font-semibold text-zinc-500">
                  {prefix}_Slide_{String(expandedSlice.index + 1).padStart(2, "0")}.png
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  icon={ZoomOut}
                  size="icon"
                  variant="secondary"
                  onClick={() => setExpandedZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
                  aria-label="Zoom out"
                  title="Zoom out"
                />
                <span className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-300">
                  {Math.round(expandedZoom * 100)}%
                </span>
                <Button
                  icon={ZoomIn}
                  size="icon"
                  variant="secondary"
                  onClick={() => setExpandedZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
                  aria-label="Zoom in"
                  title="Zoom in"
                />
                <Button
                  icon={X}
                  size="icon"
                  variant="secondary"
                  onClick={() => setExpandedSlice(null)}
                  aria-label="Close preview"
                  title="Close preview"
                />
              </div>
            </div>

            <div className="grid min-h-0 flex-1 bg-zinc-950 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="group/preview relative flex min-h-0 items-center justify-center overflow-hidden bg-black p-4">
                {generatedSlices.length > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={expandedSlice.index <= 0}
                      onClick={() => {
                        const nextIndex = Math.max(0, expandedSlice.index - 1);
                        setExpandedZoom(1);
                        setExpandedSlice({ src: generatedSlices[nextIndex], index: nextIndex });
                      }}
                      className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-white/90 text-zinc-950 shadow-xl transition hover:bg-white disabled:opacity-25"
                      aria-label="Previous slice"
                      title="Previous slice"
                    >
                      <span className="text-2xl leading-none">‹</span>
                    </button>
                    <button
                      type="button"
                      disabled={expandedSlice.index >= generatedSlices.length - 1}
                      onClick={() => {
                        const nextIndex = Math.min(generatedSlices.length - 1, expandedSlice.index + 1);
                        setExpandedZoom(1);
                        setExpandedSlice({ src: generatedSlices[nextIndex], index: nextIndex });
                      }}
                      className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-white/90 text-zinc-950 shadow-xl transition hover:bg-white disabled:opacity-25"
                      aria-label="Next slice"
                      title="Next slice"
                    >
                      <span className="text-2xl leading-none">›</span>
                    </button>
                  </>
                )}
                <img
                  src={expandedSlice.src}
                  alt={`Expanded slide ${expandedSlice.index + 1}`}
                  style={{ transform: `scale(${expandedZoom})` }}
                  className="max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl"
                />
                <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs font-black uppercase tracking-widest text-white opacity-0 shadow-2xl backdrop-blur-md transition duration-200 group-hover/preview:opacity-100">
                  {slideWidth} x {slideHeight}
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
                      <p className="mt-1 font-mono text-sm font-black text-zinc-100">
                        {slideWidth} x {slideHeight}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-zinc-950/70 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">File</p>
                      <p className="mt-1 font-mono text-sm font-black uppercase text-zinc-100">PNG</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Slice Info
                  </p>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Output</p>
                    <p className="mt-1 break-words text-sm font-semibold text-zinc-200">
                      {prefix}_Slide_{String(expandedSlice.index + 1).padStart(2, "0")}.png
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Position</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-200">
                      {expandedSlice.index + 1} of {generatedSlices.length}
                    </p>
                  </div>
                </div>
              </aside>
            </div>

            {generatedSlices.length > 1 && (
              <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 p-4">
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {generatedSlices.map((slice, index) => (
                    <button
                      key={`${slice}-${index}`}
                      type="button"
                      onClick={() => {
                        setExpandedZoom(1);
                        setExpandedSlice({ src: slice, index });
                      }}
                      className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-zinc-950 transition ${
                        expandedSlice.index === index
                          ? "border-white shadow-lg"
                          : "border-transparent opacity-65 hover:opacity-100"
                      }`}
                      aria-label={`View slide ${index + 1}`}
                      title={`Slide ${index + 1}`}
                    >
                      <img src={slice} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

