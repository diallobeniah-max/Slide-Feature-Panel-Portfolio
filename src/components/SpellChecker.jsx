import React, { useRef, useState } from "react";
import { Upload, ScanText, CheckCircle2, AlertTriangle, X, RefreshCw, AlignLeft } from "lucide-react";
import { Button, Card, Badge } from "./ui.jsx";
import { runBrowserOcr } from "../utils/ocr.js";

const notify = (title, message, type = "success") =>
  window.dispatchEvent(new CustomEvent("studio-notify", { detail: { title, message, type } }));

/* ── Lazy-load Tesseract from CDN ───────────────────────────────── */
/* ── LanguageTool spell check ───────────────────────────────────── */
async function checkSpelling(text) {
  try {
    const res = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: "en-US", enabledOnly: "false" }),
    });
    const data = await res.json();
    return (data.matches || []).filter(m =>
      m.rule?.category?.id === "TYPOS" ||
      m.rule?.issueType === "misspelling" ||
      m.rule?.id?.includes("SPELL")
    );
  } catch {
    return []; // offline — skip remote check
  }
}

/* ── Diff two texts, return list of { text, match } ────────────── */
function diffTexts(expected, actual) {
  const expWords = expected.trim().split(/\s+/);
  const actWords = actual.trim().split(/\s+/);
  const maxLen = Math.max(expWords.length, actWords.length);
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    const exp = expWords[i] || "";
    const act = actWords[i] || "";
    result.push({ expected: exp, actual: act, match: exp.toLowerCase() === act.toLowerCase() });
  }
  return result;
}

/* ── Status line for scan progress ─────────────────────────────── */
const STAGES = ["Loading OCR engine…", "Scanning image…", "Checking spelling…", "Done!"];

export default function SpellChecker() {
  const [image,        setImage]        = useState(null); // objectURL
  const [scanning,     setScanning]     = useState(false);
  const [stage,        setStage]        = useState(0);   // 0–3
  const [scanPct,      setScanPct]      = useState(0);
  const [ocrText,      setOcrText]      = useState("");
  const [errors,       setErrors]       = useState([]);  // LanguageTool matches
  const [expectedText, setExpectedText] = useState("");
  const [diff,         setDiff]         = useState(null);
  const [showDiff,     setShowDiff]     = useState(false);
  const fileInputRef = useRef(null);

  /* ── Load image ─────────────────────────────────────────────── */
  function handleImage(files) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setImage(URL.createObjectURL(file));
    setOcrText("");
    setErrors([]);
    setDiff(null);
    setScanPct(0);
    setStage(0);
  }

  /* ── Main scan function ─────────────────────────────────────── */
  async function runScan() {
    if (!image || scanning) return;
    setScanning(true);
    setOcrText("");
    setErrors([]);
    setDiff(null);
    setScanPct(0);

    try {
      // Stage 1 — load Tesseract
      setStage(0);
      setScanPct(15);

      // Stage 2 — OCR
      setStage(1);
      const { text } = await runBrowserOcr(image, {
        profile: "spell",
        maxLineLength: 56,
        onProgress: (progress) => {
          setScanPct(15 + Math.round(progress * 0.55));
        },
      });
      const cleanText = text.trim();
      setOcrText(cleanText);
      setScanPct(72);

      // Stage 3 — spell check
      setStage(2);
      const spellErrors = await checkSpelling(cleanText);
      setErrors(spellErrors);
      setScanPct(95);

      // Optional comparison
      if (expectedText.trim()) {
        setDiff(diffTexts(expectedText, cleanText));
        setShowDiff(true);
      }

      setStage(3);
      setScanPct(100);

      const errCount = spellErrors.length;
      notify(
        errCount === 0 ? "All Good!" : `${errCount} Issue${errCount > 1 ? "s" : ""} Found`,
        errCount === 0
          ? "No spelling errors detected in the image."
          : `Found ${errCount} potential spelling error${errCount > 1 ? "s" : ""}.`,
        errCount === 0 ? "success" : "error",
      );
    } catch (err) {
      notify("Scan Failed", err.message, "error");
    } finally {
      setScanning(false);
    }
  }

  /* ── Highlight errors in text ───────────────────────────────── */
  function renderHighlightedText(text, errs) {
    if (!errs.length) {
      return <span className="text-emerald-400 font-mono text-sm leading-relaxed">{text}</span>;
    }
    const parts = [];
    let cursor = 0;
    const sorted = [...errs].sort((a, b) => a.offset - b.offset);
    sorted.forEach(err => {
      if (err.offset > cursor) parts.push({ t: text.slice(cursor, err.offset), bad: false });
      parts.push({ t: text.slice(err.offset, err.offset + err.length), bad: true, msg: err.message, sug: err.replacements?.[0]?.value });
      cursor = err.offset + err.length;
    });
    if (cursor < text.length) parts.push({ t: text.slice(cursor), bad: false });

    return (
      <span className="font-mono text-sm leading-loose whitespace-pre-wrap">
        {parts.map((p, i) =>
          p.bad ? (
            <span key={i} title={`${p.msg}${p.sug ? " → " + p.sug : ""}`}
              className="bg-rose-500/20 text-rose-300 border-b-2 border-rose-500 rounded cursor-help">
              {p.t}
            </span>
          ) : (
            <span key={i} className="text-zinc-300">{p.t}</span>
          )
        )}
      </span>
    );
  }

  const hasResult = ocrText !== "" && !scanning;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="p-6 flex flex-col gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Spell Check</p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Image Text Scanner
            </h2>
          </div>

          {/* Upload zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleImage(e.dataTransfer.files); }}
            className="border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer dropzone-interactive group
              border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
          >
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 icon-float">
              <Upload size={22} className="icon-pop" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
              {image ? "Change Image" : "Upload Image"}
            </p>
            <p className="mt-1 text-[10px] text-zinc-400 font-medium">JPG, PNG, WEBP</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => handleImage(e.target.files)} />

          {/* Expected text (optional) */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
              <AlignLeft size={12} /> Expected Text
              <span className="ml-1 font-medium normal-case tracking-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              value={expectedText}
              onChange={e => setExpectedText(e.target.value)}
              rows={4}
              placeholder="Type the text you expect to be in the image…"
              className="resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 transition-all placeholder:text-zinc-400 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:bg-zinc-900 dark:focus:ring-white/5"
            />
            {expectedText && (
              <p className="text-[10px] text-zinc-400 font-medium">
                After scanning, the detected text will be compared word-by-word against your expected text.
              </p>
            )}
          </div>

          {/* Scan button */}
          <Button
            size="lg"
            className="w-full"
            icon={scanning ? RefreshCw : ScanText}
            disabled={!image || scanning}
            onClick={runScan}
          >
            {scanning ? "Scanning…" : "Spell Check Image"}
          </Button>

          {/* Stage progress */}
          {scanning && (
            <div className="space-y-2">
              <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${scanPct}%` }}
                />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 animate-pulse">
                {STAGES[stage]}
              </p>
            </div>
          )}

          {/* Stats */}
          {hasResult && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-3 text-center border border-zinc-200 dark:border-zinc-800">
                <p className="text-2xl font-black text-zinc-950 dark:text-white">
                  {ocrText.trim().split(/\s+/).filter(Boolean).length}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Words</p>
              </div>
              <div className={`rounded-2xl p-3 text-center border ${errors.length > 0 ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900" : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900"}`}>
                <p className={`text-2xl font-black ${errors.length > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {errors.length}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  {errors.length === 0 ? "No Errors" : "Errors"}
                </p>
              </div>
            </div>
          )}

          {/* Reset */}
          {hasResult && (
            <button
              onClick={() => { setImage(null); setOcrText(""); setErrors([]); setDiff(null); }}
              className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <X size={12} /> Clear & Reset
            </button>
          )}
        </Card>
      </aside>

      {/* ── Main area ───────────────────────────────────────────── */}
      <section className="grid content-start gap-5 panel-enter-main">

        {/* Image with scan overlay */}
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Image</p>
            <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              {scanning ? "Scanning…" : image ? "Uploaded" : "No Image"}
            </h3>
          </div>

          <div className="relative bg-zinc-100 dark:bg-zinc-950/60 flex items-center justify-center min-h-64 overflow-hidden">
            {image ? (
              <>
                <img src={image} alt="To check" className="max-w-full max-h-72 object-contain" />

                {/* Apple Intelligence scan animation */}
                {scanning && (
                  <>
                    {/* Iridescent sweep beam */}
                    <div className="absolute inset-0 pointer-events-none ai-scan-beam" />
                    {/* Progress strip at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-300/20 dark:bg-zinc-800">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-sky-500 transition-all duration-500"
                        style={{ width: `${scanPct}%` }}
                      />
                    </div>
                  </>
                )}

                {/* Done badge */}
                {hasResult && (
                  <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg ${errors.length === 0 ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                    {errors.length === 0 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    {errors.length === 0 ? "Clean" : `${errors.length} issue${errors.length > 1 ? "s" : ""}`}
                  </div>
                )}
              </>
            ) : (
              <div className="py-16 text-center select-none group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 icon-float">
                  <ScanText className="text-zinc-400 dark:text-zinc-500 icon-pop" size={28} />
                </div>
                <p className="text-base font-black italic tracking-tight text-zinc-900 dark:text-zinc-100">
                  Upload an image to scan
                </p>
                <p className="mt-2 text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
                  Supports any language via Tesseract OCR
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* OCR Result + spell highlights */}
        {hasResult && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Detected Text</p>
                <h3 className="mt-0.5 text-lg font-black italic tracking-tight text-zinc-900 dark:text-white">
                  {errors.length === 0 ? "No spelling errors found" : `${errors.length} potential error${errors.length > 1 ? "s" : ""} found`}
                </h3>
              </div>
              {errors.length > 0 && (
                <div className="flex flex-col gap-1 text-right">
                  {errors.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-[10px] font-mono text-rose-400">
                      "{e.context?.text?.slice(e.context.offset, e.context.offset + e.length)}"
                      {e.replacements?.[0] ? ` → ${e.replacements[0].value}` : ""}
                    </p>
                  ))}
                  {errors.length > 3 && (
                    <p className="text-[10px] text-zinc-500">+{errors.length - 3} more</p>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-zinc-950 dark:bg-zinc-900 border border-zinc-800 p-4 min-h-24 leading-relaxed">
              {renderHighlightedText(ocrText, errors)}
            </div>
            {errors.length > 0 && (
              <p className="mt-3 text-[10px] font-medium text-zinc-500">
                Hover over underlined words to see the error details and suggestions.
              </p>
            )}
          </Card>
        )}

        {/* Diff comparison */}
        {diff && showDiff && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Text Comparison</p>
                <h3 className="mt-0.5 text-lg font-black italic tracking-tight text-zinc-900 dark:text-white">
                  Expected vs Detected
                </h3>
              </div>
              <div className="flex gap-2">
                <Badge variant="success">{diff.filter(d => d.match).length} match</Badge>
                <Badge variant="error">{diff.filter(d => !d.match).length} differ</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Expected</p>
                <div className="flex flex-wrap gap-1.5">
                  {diff.map((d, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded-lg text-[11px] font-mono font-medium ${d.match ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400"}`}>
                      {d.expected || <span className="opacity-40">—</span>}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Detected</p>
                <div className="flex flex-wrap gap-1.5">
                  {diff.map((d, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded-lg text-[11px] font-mono font-medium ${d.match ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"}`}>
                      {d.actual || <span className="opacity-40">—</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 font-medium">
              <span className="inline-block w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-900 mr-1" />matching words
              <span className="inline-block w-3 h-3 rounded bg-rose-200 dark:bg-rose-900 ml-3 mr-1" />expected but different
              <span className="inline-block w-3 h-3 rounded bg-amber-200 dark:bg-amber-900 ml-3 mr-1" />detected but different
            </p>
          </Card>
        )}
      </section>
    </main>
  );

  function renderHighlightedText(text, errs) {
    if (!errs.length) {
      return <span className="text-emerald-400 font-mono text-sm leading-relaxed">{text}</span>;
    }
    const parts = [];
    let cursor = 0;
    const sorted = [...errs].sort((a, b) => a.offset - b.offset);
    sorted.forEach(err => {
      if (err.offset > cursor) parts.push({ t: text.slice(cursor, err.offset), bad: false });
      parts.push({ t: text.slice(err.offset, err.offset + err.length), bad: true, msg: err.message, sug: err.replacements?.[0]?.value });
      cursor = err.offset + err.length;
    });
    if (cursor < text.length) parts.push({ t: text.slice(cursor), bad: false });
    return (
      <span className="font-mono text-sm leading-loose whitespace-pre-wrap">
        {parts.map((p, i) =>
          p.bad ? (
            <span key={i} title={`${p.msg}${p.sug ? " → " + p.sug : ""}`}
              className="bg-rose-500/20 text-rose-300 border-b-2 border-rose-500 rounded cursor-help">
              {p.t}
            </span>
          ) : <span key={i} className="text-zinc-300">{p.t}</span>
        )}
      </span>
    );
  }
}
