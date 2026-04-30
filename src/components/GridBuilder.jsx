import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Download, Grid3X3, Trash2 } from "lucide-react";
import { downloadBlob } from "../utils/media.js";
import { Button, Card, Input, RangeSlider } from "./ui.jsx";

const notify = (title, message, type = "success") =>
  window.dispatchEvent(new CustomEvent("studio-notify", { detail: { title, message, type } }));

export default function GridBuilder() {
  /* ── Canvas config ────────────────────────────────────────────── */
  const [width,      setWidth]      = useState(1080);
  const [height,     setHeight]     = useState(1080);
  const [cols,       setCols]       = useState(3);
  const [rows,       setRows]       = useState(3);
  const [lineColor,  setLineColor]  = useState("#000000");
  const [lineOpacity,setLineOpacity]= useState(30);   // 0–100
  const [lineWidth,  setLineWidth]  = useState(1);
  const [bgColor,    setBgColor]    = useState("#ffffff");
  const [showBg,     setShowBg]     = useState(true);
  const [format,     setFormat]     = useState("png"); // png | jpg | zip

  const canvasRef  = useRef(null);
  const previewRef = useRef(null); // small preview canvas

  /* ── Hex + alpha → rgba ───────────────────────────────────────── */
  const hexAlpha = (hex, pct) => {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${pct/100})`;
  };

  /* ── Draw to an arbitrary canvas ─────────────────────────────── */
  function drawGrid(canvas) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (showBg) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.strokeStyle = hexAlpha(lineColor, lineOpacity);
    ctx.lineWidth   = lineWidth;

    // Vertical lines
    for (let c = 1; c < cols; c++) {
      const x = Math.round((w / cols) * c) - 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    // Horizontal lines
    for (let r = 1; r < rows; r++) {
      const y = Math.round((h / rows) * r) - 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  /* ── Redraw preview whenever params change ────────────────────── */
  useEffect(() => {
    const prev = previewRef.current;
    if (!prev) return;
    const scale = Math.min(500 / width, 340 / height);
    prev.width  = Math.round(width  * scale);
    prev.height = Math.round(height * scale);

    // Draw scaled version
    const tmp = document.createElement("canvas");
    tmp.width  = width;
    tmp.height = height;
    drawGrid(tmp);

    const ctx = prev.getContext("2d");
    ctx.clearRect(0, 0, prev.width, prev.height);
    // Checkerboard if no bg
    if (!showBg) {
      const sz = 12;
      for (let y = 0; y < prev.height; y += sz)
        for (let x = 0; x < prev.width; x += sz) {
          ctx.fillStyle = ((x/sz + y/sz) % 2 === 0) ? "#d4d4d8" : "#a1a1aa";
          ctx.fillRect(x, y, sz, sz);
        }
    }
    ctx.drawImage(tmp, 0, 0, prev.width, prev.height);
  }, [width, height, cols, rows, lineColor, lineOpacity, lineWidth, bgColor, showBg]);

  /* ── Export ───────────────────────────────────────────────────── */
  async function exportGrid() {
    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    drawGrid(canvas);

    if (format === "zip") {
      const zip = new JSZip();
      const png = await new Promise(r => canvas.toBlob(r, "image/png"));
      const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.95));
      zip.file("grid.png", png);
      zip.file("grid.jpg", jpg);
      const bundle = await zip.generateAsync({ type: "blob" });
      downloadBlob(bundle, `grid_${width}x${height}.zip`);
    } else {
      const mime = format === "jpg" ? "image/jpeg" : "image/png";
      const blob = await new Promise(r => canvas.toBlob(r, mime, 0.95));
      downloadBlob(blob, `grid_${width}x${height}.${format}`);
    }
    notify("Grid Exported", `${width}×${height} grid saved as ${format.toUpperCase()}.`);
  }

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="p-6 flex flex-col gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Grid Builder</p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Create Grid Lines
            </h2>
          </div>

          {/* Canvas size */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Width px"  type="number" value={width}  onChange={e => setWidth(Math.max(1, +e.target.value))} />
            <Input label="Height px" type="number" value={height} onChange={e => setHeight(Math.max(1, +e.target.value))} />
          </div>

          {/* Grid divisions */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Columns" type="number" min={1} value={cols} onChange={e => setCols(Math.max(1, +e.target.value))} />
            <Input label="Rows"    type="number" min={1} value={rows} onChange={e => setRows(Math.max(1, +e.target.value))} />
          </div>

          {/* Line weight */}
          <RangeSlider label="Line Weight" valueLabel={`${lineWidth}px`}
            min={1} max={10} step={0.5} value={lineWidth}
            onChange={e => setLineWidth(+e.target.value)} />

          {/* Line opacity */}
          <RangeSlider label="Line Opacity" valueLabel={`${lineOpacity}%`}
            min={5} max={100} step={5} value={lineOpacity}
            onChange={e => setLineOpacity(+e.target.value)} />

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Line Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={lineColor}
                  onChange={e => setLineColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-800 p-0.5 bg-transparent" />
                <span className="font-mono text-[11px] text-zinc-500">{lineColor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={bgColor}
                  onChange={e => setBgColor(e.target.value)}
                  disabled={!showBg}
                  className="h-9 w-14 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-800 p-0.5 bg-transparent disabled:opacity-30" />
                <button
                  onClick={() => setShowBg(v => !v)}
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors ${showBg ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}
                >
                  {showBg ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          {/* Export format */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Export Format</p>
            <div className="grid grid-cols-3 gap-2">
              {["png","jpg","zip"].map(f => (
                <button key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-xl py-2 text-[11px] font-black uppercase tracking-widest transition-all duration-200
                    ${format === f
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"}`}
                >
                  {f === "zip" ? "Both (ZIP)" : f.toUpperCase()}
                </button>
              ))}
            </div>
            {format === "zip" && (
              <p className="mt-2 text-[10px] font-medium text-zinc-400">
                Exports PNG + JPG together in a ZIP archive.
              </p>
            )}
          </div>

          {/* Export button */}
          <Button icon={Download} size="lg" className="w-full mt-2" onClick={exportGrid}>
            Export Grid
          </Button>
        </Card>
      </aside>

      {/* ── Preview ─────────────────────────────────────────────── */}
      <section className="panel-enter-main">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Live Preview</p>
            <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              {cols} × {rows} Grid · {width}×{height}
            </h3>
          </div>
          <div className="p-4 bg-zinc-100 dark:bg-zinc-950/60 flex items-center justify-center min-h-72">
            <canvas
              ref={previewRef}
              className="max-w-full max-h-[60vh] rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {cols - 1} vertical · {rows - 1} horizontal · {lineWidth}px @ {lineOpacity}% opacity
            </p>
          </div>
        </Card>
      </section>
    </main>
  );
}
