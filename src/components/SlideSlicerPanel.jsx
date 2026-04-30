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
    if (!file) return;

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
    image.src = sourceImage;
    await new Promise((resolve) => {
      image.onload = resolve;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = slideWidth;
    canvas.height = slideHeight;
    const slices = [];

    for (let index = 0; index < slideCount; index += 1) {
      ctx.clearRect(0, 0, slideWidth, slideHeight);
      const sourceWidth =
        direction === "horizontal" ? image.width / slideCount : image.width;
      const sourceHeight =
        direction === "horizontal" ? image.height : image.height / slideCount;
      const sourceX = direction === "horizontal" ? index * sourceWidth : 0;
      const sourceY = direction === "horizontal" ? 0 : index * sourceHeight;
      const zoomFactor = 1 / zoom;
      const panX = (pan.x / 100) * sourceWidth;
      const panY = (pan.y / 100) * sourceHeight;

      ctx.drawImage(
        image,
        sourceX - panX,
        sourceY - panY,
        sourceWidth * zoomFactor,
        sourceHeight * zoomFactor,
        0,
        0,
        slideWidth,
        slideHeight,
      );
      slices.push(canvas.toDataURL("image/png"));
      await new Promise((resolve) => window.setTimeout(resolve, 40));
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
    setSlideWidth(preset.w);
    setSlideHeight(preset.h);
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
        <Card className="order-2 p-5">
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
            <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 p-4 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
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
        </Card>

        <Card className="order-1 p-5">
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
            <Card className="p-4 shadow-none border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
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
                          : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400"
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
          className={`grid aspect-video place-items-center overflow-hidden bg-zinc-100 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800 group ${
            sourceImage
              ? "cursor-grab active:cursor-grabbing"
              : "dropzone-interactive cursor-pointer"
          }`}
          onMouseDown={startDrag}
          onMouseMove={moveDrag}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onClick={
            !sourceImage ? () => fileInputRef.current?.click() : undefined
          }
        >
          {sourceImage ? (
            <div
              className="relative transition-transform duration-75"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              }}
            >
              <img
                src={sourceImage}
                alt="Source"
                draggable="false"
                className="max-h-[34em] select-none rounded-2xl border border-zinc-200 bg-white object-contain shadow-sm dark:border-zinc-800"
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
                  onClick={() => setExpandedSlice({ src: slice, index })}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 text-left shadow-sm card-interactive dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <img
                    src={slice}
                    alt={`Slide ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-[10px] font-black uppercase tracking-widest text-white opacity-0 transition group-hover:opacity-100">
                    Tap to expand
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
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/80 p-4 backdrop-blur-sm"
          onClick={() => setExpandedSlice(null)}
        >
          <div
            className="grid max-h-[92vh] w-full max-w-6xl grid-rows-[auto_1fr] gap-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Generated Slide Preview
                </p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-white">
                  Slide {expandedSlice.index + 1}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="bg-zinc-900 hover:bg-zinc-800 text-white hover:text-white"
                onClick={() => setExpandedSlice(null)}
                aria-label="Close expanded slide"
              >
                <X size={20} {...iconProps} />
              </Button>
            </div>
            <div className="grid min-h-0 place-items-center overflow-auto rounded-2xl bg-black">
              <img
                src={expandedSlice.src}
                alt={`Expanded slide ${expandedSlice.index + 1}`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
