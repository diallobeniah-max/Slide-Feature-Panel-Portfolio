import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Download, Plus, Check } from "lucide-react";
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

export default function GridBuilder() {
  /* ── Canvas config ────────────────────────────────────────────── */
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [hSlices, setHSlices] = useState(3); // horizontal sections (rows of content)
  const [vSlices, setVSlices] = useState(3); // vertical sections (cols of content)
  const [lineColor, setLineColor] = useState("#000000");
  const [lineOpacity, setLineOpacity] = useState(30);
  const [lineWeight, setLineWeight] = useState(1);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showBg, setShowBg] = useState(true);
  const [format, setFormat] = useState("png");

  const previewRef = useRef(null);

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
  function drawGrid(canvas) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (showBg) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.strokeStyle = hexAlpha(lineColor, lineOpacity);
    ctx.lineWidth = lineWeight;
    ctx.lineCap = "square";

    // Horizontal dividers — vSlices sections means vSlices-1 lines
    for (let r = 1; r < hSlices; r++) {
      const y = Math.round((h / hSlices) * r) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical dividers — hSlices sections means hSlices-1 lines
    for (let c = 1; c < vSlices; c++) {
      const x = Math.round((w / vSlices) * c) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  /* ── Live preview redraw ──────────────────────────────────────── */
  useEffect(() => {
    const prev = previewRef.current;
    if (!prev) return;
    const scale = Math.min(520 / width, 360 / height, 1);
    prev.width = Math.max(1, Math.round(width * scale));
    prev.height = Math.max(1, Math.round(height * scale));

    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    drawGrid(tmp);

    const ctx = prev.getContext("2d");
    ctx.clearRect(0, 0, prev.width, prev.height);
    if (!showBg) {
      const sz = 10;
      for (let y = 0; y < prev.height; y += sz)
        for (let x = 0; x < prev.width; x += sz) {
          ctx.fillStyle = (x / sz + y / sz) % 2 === 0 ? "#d4d4d8" : "#a1a1aa";
          ctx.fillRect(x, y, sz, sz);
        }
    }
    ctx.drawImage(tmp, 0, 0, prev.width, prev.height);
  }, [
    width,
    height,
    hSlices,
    vSlices,
    lineColor,
    lineOpacity,
    lineWeight,
    bgColor,
    showBg,
  ]);

  /* ── Export ───────────────────────────────────────────────────── */
  async function exportGrid() {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    drawGrid(canvas);

    if (format === "zip") {
      const zip = new JSZip();
      const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const jpg = await new Promise((r) =>
        canvas.toBlob(r, "image/jpeg", 0.95),
      );
      zip.file("grid.png", png);
      zip.file("grid.jpg", jpg);
      const bundle = await zip.generateAsync({ type: "blob" });
      downloadBlob(bundle, `grid_${width}x${height}.zip`);
    } else {
      const mime = format === "jpg" ? "image/jpeg" : "image/png";
      const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.95));
      downloadBlob(blob, `grid_${width}x${height}.${format}`);
    }
    notify(
      "Grid Exported",
      `${width}×${height} · ${hSlices}×${vSlices} grid saved as ${format.toUpperCase()}.`,
    );
  }

  /* ── Preset button ────────────────────────────────────────────── */
  const PresetBtn = ({ preset, label }) => {
    const active = width === preset.w && height === preset.h;
    return (
      <button
        onClick={() => {
          setWidth(preset.w);
          setHeight(preset.h);
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

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        {/* Dimension Presets */}
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Dimension Presets
              </p>
              <p className="mt-0.5 font-mono text-[10px] font-bold text-zinc-400">
                {width}×{height}px
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
          <div className="max-h-[22em] overflow-y-auto space-y-4 pr-0.5">
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
              label="Width px"
              type="number"
              value={width}
              onChange={(e) => setWidth(Math.max(1, +e.target.value))}
            />
            <Input
              label="Height px"
              type="number"
              value={height}
              onChange={(e) => setHeight(Math.max(1, +e.target.value))}
            />
          </div>
        </Card>

        {/* Grid Lines Config */}
        <Card className="p-5 flex flex-col gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Grid Builder
            </p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Grid Lines
            </h2>
          </div>

          {/* H + V Slices — same pattern as Slide Slicer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                H Slices
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHSlices((v) => Math.max(1, v - 1))}
                  className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-zinc-500 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={hSlices}
                  onChange={(e) => setHSlices(Math.max(1, +e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center font-mono text-sm font-bold text-zinc-900 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-white"
                />
                <button
                  onClick={() => setHSlices((v) => v + 1)}
                  className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-zinc-500 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors"
                >
                  +
                </button>
              </div>
              <p className="text-[9px] font-medium text-zinc-400">
                {hSlices - 1} horizontal line{hSlices - 1 !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                V Slices
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setVSlices((v) => Math.max(1, v - 1))}
                  className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-zinc-500 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={vSlices}
                  onChange={(e) => setVSlices(Math.max(1, +e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center font-mono text-sm font-bold text-zinc-900 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-white"
                />
                <button
                  onClick={() => setVSlices((v) => v + 1)}
                  className="h-9 w-9 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-zinc-500 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors"
                >
                  +
                </button>
              </div>
              <p className="text-[9px] font-medium text-zinc-400">
                {vSlices - 1} vertical line{vSlices - 1 !== 1 ? "s" : ""}
              </p>
            </div>
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
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {showBg ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          {/* Export format */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
              Export Format
            </p>
            <div className="grid grid-cols-3 gap-2">
              {["png", "jpg", "zip"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-xl py-2 text-[11px] font-black uppercase tracking-widest transition-all duration-200 ${
                    format === f
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  {f === "zip" ? "Both" : f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <Button
            icon={Download}
            size="lg"
            className="w-full"
            onClick={exportGrid}
          >
            Export Grid
          </Button>
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
              {hSlices} × {vSlices} Grid &nbsp;·&nbsp; {width}×{height}px
            </h3>
          </div>
          <div className="p-6 bg-zinc-100 dark:bg-zinc-950/60 flex items-center justify-center min-h-72">
            <canvas
              ref={previewRef}
              className="max-w-full max-h-[60vh] rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800"
            />
          </div>
          <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {hSlices - 1} horizontal · {vSlices - 1} vertical · {lineWeight}px
              @ {lineOpacity}%
            </p>
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {showBg ? bgColor : "transparent bg"}
            </p>
          </div>
        </Card>
      </section>
    </main>
  );
}
