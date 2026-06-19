import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Download, FileImage, Layers, RotateCcw } from "lucide-react";
import { downloadBlob } from "../utils/media.js";
import { Button, Card, Input, RangeSlider } from "./ui.jsx";
import {
  INITIAL_CUSTOM_PRESETS,
  STATIC_PRESETS,
} from "../constants/presets.jsx";

const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );

const iconProps = { strokeWidth: 1.75 };
const GridActionRecorder = lazy(() => import("./GridActionRecorder.jsx"));

export default function GridBuilder() {
  const [activeTab, setActiveTab] = useState("builder"); // "builder" | "presets" | "actions"
  /* ── Canvas config ────────────────────────────────────────────── */
  const [slideWidth, setSlideWidth] = useState(1080);
  const [slideHeight, setSlideHeight] = useState(1080);
  const [slideCount, setSlideCount] = useState(4);
  const [lineColor, setLineColor] = useState("#000000");
  const [lineOpacity, setLineOpacity] = useState(30);
  const [lineWeight, setLineWeight] = useState(1);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showBg, setShowBg] = useState(true);
  const [exportMode, setExportMode] = useState("png");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const previewRef = useRef(null);
  const previewViewportRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });

  /* ── Custom presets (shared with Slide Slicer) ────────────────── */
  const [customPresets] = useState(() => {
    const saved = localStorage.getItem("studio_custom_presets_v2");
    return saved ? JSON.parse(saved) : INITIAL_CUSTOM_PRESETS;
  });

  /* ── Hex + alpha → rgba ───────────────────────────────────────── */
  const hexAlpha = (hex, pct) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${(pct / 100).toFixed(2)})`;
  };

  /* ── Draw grid to any canvas ──────────────────────────────────── */
  function drawGrid(canvas, { forceBackground = false } = {}) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (showBg || forceBackground) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = hexAlpha(lineColor, lineOpacity);
    ctx.lineWidth = lineWeight;
    ctx.lineCap = "square";

    for (let c = 1; c < slideCount; c++) {
      const x = Math.round((w / slideCount) * c) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }

  function createExportCanvas({ forceBackground = false } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = slideWidth * slideCount;
    canvas.height = slideHeight;
    drawGrid(canvas, { forceBackground });
    return canvas;
  }

  function writeAscii(view, offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  function canvasToPsdBlob(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const channelCount = 4;
    const headerBytes = 26;
    const emptySectionBytes = 12;
    const compressionBytes = 2;
    const channelBytes = width * height * channelCount;
    const buffer = new ArrayBuffer(
      headerBytes + emptySectionBytes + compressionBytes + channelBytes,
    );
    const view = new DataView(buffer);
    let offset = 0;

    writeAscii(view, offset, "8BPS");
    offset += 4;
    view.setUint16(offset, 1);
    offset += 2;
    offset += 6;
    view.setUint16(offset, channelCount);
    offset += 2;
    view.setUint32(offset, height);
    offset += 4;
    view.setUint32(offset, width);
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
    const pixelCount = width * height;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const channelOffset = offset + channel * pixelCount;
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        bytes[channelOffset + pixel] = rgba[pixel * 4 + channel];
      }
    }

    return new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
  }

  /* ── Live preview redraw ──────────────────────────────────────── */
  useEffect(() => {
    const prev = previewRef.current;
    if (!prev) return;
    const canvasWidth = slideWidth * slideCount;
    const canvasHeight = slideHeight;
    const fitScale = Math.min(520 / canvasWidth, 360 / canvasHeight, 1);
    const scale = fitScale * (previewZoom / 100);
    prev.width = Math.max(1, Math.round(canvasWidth * scale));
    prev.height = Math.max(1, Math.round(canvasHeight * scale));

    const ctx = prev.getContext("2d");
    ctx.clearRect(0, 0, prev.width, prev.height);
    if (!showBg) {
      const sz = 10;
      for (let y = 0; y < prev.height; y += sz)
        for (let x = 0; x < prev.width; x += sz) {
          ctx.fillStyle = (x / sz + y / sz) % 2 === 0 ? "#d4d4d8" : "#a1a1aa";
          ctx.fillRect(x, y, sz, sz);
        }
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, prev.width, prev.height);
    }

    ctx.strokeStyle = hexAlpha(lineColor, lineOpacity);
    ctx.lineWidth = Math.max(1, lineWeight * scale);
    ctx.lineCap = "square";
    for (let c = 1; c < slideCount; c++) {
      const x = Math.round((prev.width / slideCount) * c) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, prev.height);
      ctx.stroke();
    }
  }, [
    slideWidth,
    slideHeight,
    slideCount,
    lineColor,
    lineOpacity,
    lineWeight,
    bgColor,
    showBg,
    previewZoom,
  ]);

  function resetPreviewView() {
    setPreviewZoom(100);
    setPan({ x: 0, y: 0 });
  }

  function handlePanStart(event) {
    // Only enable panning when zoomed in (zoom > 100%)
    if (previewZoom <= 100) return;
    event.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  }

  function handlePanMove(event) {
    if (!isDragging) return;
    event.preventDefault();
    setPan({
      x: event.clientX - dragStart.current.x,
      y: event.clientY - dragStart.current.y,
    });
  }

  function handlePanEnd(event) {
    setIsDragging(false);
  }

  /* ── Export ───────────────────────────────────────────────────── */
  async function exportGrid() {
    const totalWidth = slideWidth * slideCount;
    const canvas = createExportCanvas({ forceBackground: exportMode === "jpg" });

    const filenameBase = `grid_${slideCount}_slides_${totalWidth}x${slideHeight}`;

    if (exportMode === "psd") {
      downloadBlob(canvasToPsdBlob(canvas), `${filenameBase}.psd`);
    } else {
      const mimeType = exportMode === "jpg" ? "image/jpeg" : "image/png";
      const extension = exportMode === "jpg" ? "jpg" : "png";
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, mimeType, 0.95),
      );
      downloadBlob(blob, `${filenameBase}.${extension}`);
    }
    notify(
      "Grid Exported",
      `${totalWidth}x${slideHeight} - ${slideCount} slides saved as ${exportMode.toUpperCase()}.`,
    );
  }

  /* ── Preset button ────────────────────────────────────────────── */
  const exportOptions = [
    { value: "png", label: "PNG", icon: FileImage },
    { value: "jpg", label: "JPEG", icon: FileImage },
    { value: "psd", label: "PSD", icon: Layers },
  ];

  const PresetBtn = ({ preset, label }) => {
    const active = slideWidth === preset.w && slideHeight === preset.h;
    return (
      <button
        onClick={() => {
          setSlideWidth(preset.w);
          setSlideHeight(preset.h);
        }}
        className={`rounded-2xl border p-3 text-left transition-all duration-200 ${
          active
            ? "border-zinc-950 bg-zinc-950 text-white shadow-md dark:border-white dark:bg-white dark:text-zinc-950"
            : "border-zinc-200 bg-white hover:border-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
        }`}
      >
        <span className="block truncate text-[10px] font-black uppercase tracking-widest">
          {label || preset.name}
        </span>
        <span
          className={`mt-0.5 block font-mono text-[9px] font-bold ${active ? "opacity-70" : "text-zinc-400"}`}
        >
          {preset.w}×{preset.h}
        </span>
      </button>
    );
  };

  const TabButton = ({ value, children }) => (
    <button
      type="button"
      onClick={() => setActiveTab(value)}
      className={`flex-1 rounded-[10px] py-2.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all duration-300 ${
        activeTab === value
          ? "scale-[1.02] bg-white text-zinc-900 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:bg-zinc-700 dark:text-zinc-50 dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );

  const GridTabBar = () => (
    <div className="mx-auto w-full max-w-7xl px-5 pt-6">
      <Card className="p-2">
        <div className="flex gap-1 rounded-[14px] bg-zinc-100 p-1 dark:bg-zinc-800/50">
          <TabButton value="builder">Grid Builder</TabButton>
          <TabButton value="presets">Presets</TabButton>
          <TabButton value="actions">Action Recorder</TabButton>
        </div>
      </Card>
    </div>
  );

  if (activeTab === "actions") {
    return (
      <>
        <GridTabBar />
        <Suspense
          fallback={
            <main className="mx-auto max-w-7xl px-5 py-6">
              <Card className="p-5 text-sm font-bold text-zinc-500">Loading Action Recorder...</Card>
            </main>
          }
        >
          <GridActionRecorder />
        </Suspense>
      </>
    );
  }

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <>
      <GridTabBar />
      <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="p-5">
            <div className={`flex flex-col gap-4 ${activeTab === "presets" ? "block" : "hidden"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Dimension Presets
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] font-bold text-zinc-400">
                    {slideWidth}×{slideHeight}px per slide · {slideWidth * slideCount}×{slideHeight}px total
                  </p>
                </div>
              </div>

              {/* Custom presets */}
              {customPresets.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {customPresets.map((p) => (
                    <PresetBtn key={p.id} preset={p} />
                  ))}
                </div>
              )}

              {/* Static presets by category */}
              <div className="max-h-[15em] overflow-y-auto space-y-4 pr-0.5">
                {STATIC_PRESETS.map((group) => {
                  const Icon = group.icon.type;
                  return (
                    <div key={group.category}>
                      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
                        <Icon size={13} {...iconProps} /> {group.category}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.items.map((p) => (
                          <PresetBtn
                            key={`${group.category}-${p.name}`}
                            preset={p}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Manual size */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Input
                  label="Slide Width px"
                  type="number"
                  value={slideWidth}
                  onChange={(e) => setSlideWidth(Math.max(1, +e.target.value))}
                />
                <Input
                  label="Slide Height px"
                  type="number"
                  value={slideHeight}
                  onChange={(e) => setSlideHeight(Math.max(1, +e.target.value))}
                />
              </div>
            </div>

            <div className={`flex flex-col gap-5 ${activeTab === "builder" ? "block" : "hidden"}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Grid Builder
                </p>
                <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
                  Slide Number
                </h2>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Number of Slides
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSlideCount((v) => Math.max(1, v - 1))}
                    className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 bg-white font-black text-zinc-500 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={slideCount}
                    onChange={(e) => setSlideCount(Math.max(1, +e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-center font-mono text-sm font-bold text-zinc-900 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-white"
                  />
                  <button
                    onClick={() => setSlideCount((v) => v + 1)}
                    className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 bg-white font-black text-zinc-500 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="text-[9px] font-medium text-zinc-400">
                  Canvas {slideWidth * slideCount}×{slideHeight}px · {slideCount} slide{slideCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Line style */}
              <RangeSlider
                label="Line Weight"
                valueLabel={`${lineWeight}px`}
                min={0.5}
                max={10}
                step={0.5}
                value={lineWeight}
                onChange={(e) => setLineWeight(+e.target.value)}
              />

              <RangeSlider
                label="Line Opacity"
                valueLabel={`${lineOpacity}%`}
                min={5}
                max={100}
                step={5}
                value={lineOpacity}
                onChange={(e) => setLineOpacity(+e.target.value)}
              />

              <div className="grid gap-3 rounded-2xl border border-zinc-200/80 bg-white/60/50 p-3 dark:border-zinc-800/80 dark:bg-zinc-950/60">
                <RangeSlider
                  label="Preview Zoom"
                  valueLabel={`${previewZoom}%`}
                  min={50}
                  max={300}
                  step={10}
                  value={previewZoom}
                  onChange={(e) => setPreviewZoom(Number(e.target.value))}
                />
                <Button
                  variant="outline"
                  size="sm"
                  icon={RotateCcw}
                  onClick={resetPreviewView}
                  className="w-full"
                >
                  Reset View
                </Button>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Line Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={lineColor}
                      onChange={(e) => setLineColor(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-800 p-0.5 bg-transparent"
                    />
                    <span className="font-mono text-[10px] text-zinc-400">
                      {lineColor}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      disabled={!showBg}
                      className="h-9 w-14 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-800 p-0.5 bg-transparent disabled:opacity-30"
                    />
                    <button
                      onClick={() => setShowBg((v) => !v)}
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors ${
                        showBg
                          ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                          : "bg-white/60 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {showBg ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Export Mode
                </p>
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-200 bg-white/60/70 p-1 dark:border-zinc-800 dark:bg-zinc-950">
                  {exportOptions.map((option) => {
                    const Icon = option.icon;
                    const active = exportMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setExportMode(option.value)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                          active
                            ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                            : "text-zinc-500 hover:bg-white hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
                        }`}
                      >
                        <Icon size={13} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                icon={Download}
                size="lg"
                className="w-full"
                onClick={exportGrid}
              >
                Export Grid as {exportMode.toUpperCase()}
              </Button>
            </div>
          </div>
        </Card>
      </aside>

      {/* ── Preview ───────────────────────────────────────────────── */}
      <section className="panel-enter-main">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Live Preview
            </p>
            <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              {slideCount} Slide{slideCount !== 1 ? "s" : ""} Grid &nbsp;·&nbsp; {slideWidth * slideCount}×{slideHeight}px
            </h3>
          </div>
          <div
            ref={previewViewportRef}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            className={`h-[28rem] overflow-auto bg-white/60 dark:bg-zinc-950/60 ${
              previewZoom > 100
                ? isDragging
                  ? "cursor-grabbing select-none"
                  : "cursor-grab"
                : ""
            }`}
          >
            <div className="flex min-h-full min-w-full items-center justify-center p-6">
              <div
                className="relative transition-transform duration-75"
                style={{
                  transform: `scale(${previewZoom / 100}) translate(${pan.x / (previewZoom / 100)}px, ${pan.y / (previewZoom / 100)}px)`,
                }}
              >
                <canvas
                  ref={previewRef}
                  className="shrink-0 rounded-xl border border-zinc-200 shadow-xl dark:border-zinc-800"
                />
              </div>
            </div>
          </div>
          <div className="px-5 py-3 bg-white dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {slideCount} slides horizontal · {slideCount - 1} vertical lines · {lineWeight}px @ {lineOpacity}%
            </p>
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {previewZoom}% zoom - {showBg ? bgColor : "transparent bg"}
            </p>
          </div>
        </Card>
      </section>
      </main>
    </>
  );
}
