import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AlignLeft,
  CheckCircle2,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileText,
  RefreshCw,
  ScanLine,
  ScanText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "./ui.jsx";
import {
  cancelBrowserOcr,
  cleanOcrText,
  normalizeOcrDisplayText,
  runBrowserOcr,
} from "../utils/ocr.js";
import { checkEnglishSpelling } from "../utils/spellcheck.js";
import { downloadBlob } from "../utils/media.js";

const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function diffTexts(expected, actual) {
  const expWords = expected.trim().split(/\s+/).filter(Boolean);
  const actWords = actual.trim().split(/\s+/).filter(Boolean);
  const maxLen = Math.max(expWords.length, actWords.length);
  const result = [];

  for (let index = 0; index < maxLen; index += 1) {
    const expectedWord = expWords[index] || "";
    const actualWord = actWords[index] || "";
    result.push({
      expected: expectedWord,
      actual: actualWord,
      match: expectedWord.toLowerCase() === actualWord.toLowerCase(),
    });
  }

  return result;
}

function renderHighlightedText(text, issues) {
  if (!text.trim()) {
    return (
      <span className="text-sm font-medium text-zinc-400">
        No text detected yet.
      </span>
    );
  }

  if (!issues.length) {
    return (
      <span className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-emerald-600 dark:text-emerald-400">
        {text}
      </span>
    );
  }

  const parts = [];
  let cursor = 0;
  [...issues]
    .sort((a, b) => a.offset - b.offset)
    .forEach((issue) => {
      if (issue.offset < cursor) return;
      if (issue.offset > cursor) {
        parts.push({ text: text.slice(cursor, issue.offset), issue: null });
      }
      parts.push({
        text: text.slice(issue.offset, issue.offset + issue.length),
        issue,
      });
      cursor = issue.offset + issue.length;
    });

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), issue: null });
  }

  return (
    <span className="whitespace-pre-wrap font-mono text-sm leading-loose">
      {parts.map((part, index) =>
        part.issue ? (
          <span
            key={`${part.text}-${index}`}
            title={`${part.issue.message}${
              part.issue.replacements?.[0]?.value
                ? ` -> ${part.issue.replacements[0].value}`
                : ""
            }`}
            className="rounded bg-amber-500/20 px-0.5 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300"
          >
            {part.text}
          </span>
        ) : (
          <span key={`${part.text}-${index}`} className="text-zinc-700 dark:text-zinc-300">
            {part.text}
          </span>
        ),
      )}
    </span>
  );
}

function getPointerFraction(event, imageElement) {
  const rect = imageElement.getBoundingClientRect();
  const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
  const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
  return {
    x: rect.width ? x / rect.width : 0,
    y: rect.height ? y / rect.height : 0,
  };
}

function buildSelection(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  if (width < 0.015 || height < 0.015) return null;
  return { x, y, width, height };
}

export default function SpellChecker() {
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [scanStatus, setScanStatus] = useState("Ready");
  const [ocrText, setOcrText] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [issues, setIssues] = useState([]);
  const [expectedText, setExpectedText] = useState("");
  const [hasAttemptedScan, setHasAttemptedScan] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState("simple");
  const [lastScan, setLastScan] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState(null);
  const [activeSelection, setActiveSelection] = useState(null);
  const [defaultMode, setDefaultMode] = useState(() =>
    readSetting("flow-ocr-default-mode", "fast"),
  );
  const [preprocessing, setPreprocessing] = useState(
    () => readSetting("flow-ocr-preprocess", "true") !== "false",
  );

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);
  const dragStartRef = useRef(null);

  const comparison = useMemo(() => {
    if (!expectedText.trim() || !ocrText.trim()) return null;
    return diffTexts(expectedText, ocrText);
  }, [expectedText, ocrText]);

  const wordCount = useMemo(
    () => (ocrText.match(/[A-Za-z0-9][A-Za-z0-9'\u2019-]*/g) || []).length,
    [ocrText],
  );

  const quality = useMemo(() => {
    if (confidence === null) return { label: "Not scanned", variant: "default" };
    if (confidence >= 80) return { label: "Strong OCR", variant: "success" };
    if (confidence >= 55) return { label: "Usable OCR", variant: "warning" };
    return { label: "Low confidence", variant: "error" };
  }, [confidence]);

  useEffect(() => {
    const syncSettings = () => {
      setDefaultMode(readSetting("flow-ocr-default-mode", "fast"));
      setPreprocessing(readSetting("flow-ocr-preprocess", "true") !== "false");
    };
    window.addEventListener("flow-settings-changed", syncSettings);
    return () => window.removeEventListener("flow-settings-changed", syncSettings);
  }, []);

  useEffect(() => {
    if (!ocrText.trim() || scanning) {
      setIssues([]);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const nextIssues = await checkEnglishSpelling(ocrText, {
        maxIssues: viewMode === "detailed" ? 24 : 12,
      });
      if (!cancelled) setIssues(nextIssues);
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [ocrText, scanning, viewMode]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      cancelBrowserOcr().catch(() => {});
    };
  }, [imageUrl]);

  function handleImage(files) {
    const file = files?.[0];
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setErrorMessage("Use a JPG, PNG, or WEBP image.");
      notify("Unsupported Image", "Use a JPG, PNG, or WEBP image.", "error");
      return;
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setOcrText("");
    setIssues([]);
    setConfidence(null);
    setScanPct(0);
    setScanStatus("Ready");
    setHasAttemptedScan(false);
    setErrorMessage("");
    setSelection(null);
    setActiveSelection(null);
    setIsSelecting(false);
    setLastScan(null);
  }

  function handleImageDrop(event) {
    event.preventDefault();
    handleImage(event.dataTransfer.files);
  }

  async function runSpellCheck(text = ocrText) {
    setScanStatus("Checking spelling");
    const nextIssues = text
      ? await checkEnglishSpelling(text, {
          maxIssues: viewMode === "detailed" ? 24 : 12,
        })
      : [];
    setIssues(nextIssues);
    return nextIssues;
  }

  async function runScan(scanMode = defaultMode, useSelection = false) {
    if (!imageUrl || scanning) return;
    if (useSelection && !selection) {
      setIsSelecting(true);
      notify("Select Text Area", "Drag a rectangle over the text, then scan again.", "error");
      return;
    }

    setScanning(true);
    setHasAttemptedScan(true);
    setErrorMessage("");
    setScanPct(1);
    setConfidence(null);
    setScanStatus("Preparing image");
    setLastScan({ scanMode, selected: useSelection });

    try {
      const result = await runBrowserOcr(imageUrl, {
        profile: "spell",
        scanMode,
        crop: useSelection ? selection : null,
        preprocess: preprocessing,
        maxLineLength: 74,
        onStatus: setScanStatus,
        onProgress: (progress) => {
          setScanPct(Math.max(1, Math.min(98, Math.round(progress))));
        },
      });
      const text = result.text.trim();
      setOcrText(text);
      setConfidence(result.confidence ?? null);
      setScanStatus("Checking spelling");

      const nextIssues = await runSpellCheck(text);
      setScanPct(100);
      setScanStatus("Done");

      if (!text) {
        setErrorMessage("No readable text was detected. Try selected-area scan or a sharper image.");
        notify("No Text Found", "Try selected-area scan or a sharper image.", "error");
        return;
      }

      notify(
        nextIssues.length ? "Spelling Review Ready" : "Scan Clean",
        nextIssues.length
          ? `${nextIssues.length} useful spelling issue${nextIssues.length === 1 ? "" : "s"} found.`
          : "OCR finished with no spelling issues found.",
        nextIssues.length ? "error" : "success",
      );
    } catch (error) {
      const cancelled = /cancel/i.test(error?.message || "");
      const message = cancelled
        ? "OCR scan cancelled."
        : error?.message || "OCR could not read this image. Try another image.";
      setErrorMessage(cancelled ? "" : message);
      setScanStatus(cancelled ? "Cancelled" : "Failed");
      if (!cancelled) notify("Scan Failed", message, "error");
    } finally {
      setScanning(false);
    }
  }

  async function cancelScan() {
    if (!scanning) return;
    setScanStatus("Cancelling");
    await cancelBrowserOcr();
    setScanning(false);
    setScanPct(0);
    setScanStatus("Cancelled");
  }

  function cleanText() {
    const cleaned = normalizeOcrDisplayText(cleanOcrText(ocrText), 74);
    setOcrText(cleaned);
    runSpellCheck(cleaned).catch(() => {});
    notify("Text Cleaned", "Obvious OCR noise was removed from the editable text.");
  }

  async function copyText() {
    if (!ocrText.trim()) return;
    await navigator.clipboard?.writeText(ocrText);
    notify("Copied", "Extracted text copied to clipboard.");
  }

  function saveText() {
    if (!ocrText.trim()) return;
    const baseName = (imageName || "flow-ocr").replace(/\.[^.]+$/, "");
    downloadBlob(new Blob([ocrText], { type: "text/plain;charset=utf-8" }), `${baseName}.txt`);
    notify("Text Saved", `${baseName}.txt was exported.`);
  }

  function resetScan() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    cancelBrowserOcr().catch(() => {});
    setImageUrl("");
    setImageName("");
    setOcrText("");
    setIssues([]);
    setConfidence(null);
    setScanPct(0);
    setScanStatus("Ready");
    setHasAttemptedScan(false);
    setErrorMessage("");
    setSelection(null);
    setActiveSelection(null);
    setIsSelecting(false);
    setLastScan(null);
  }

  function handleSelectionPointerDown(event) {
    if (!isSelecting || !imageRef.current || scanning) return;
    event.preventDefault();
    const point = getPointerFraction(event, imageRef.current);
    dragStartRef.current = point;
    setActiveSelection(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleSelectionPointerMove(event) {
    if (!dragStartRef.current || !imageRef.current) return;
    event.preventDefault();
    const point = getPointerFraction(event, imageRef.current);
    setActiveSelection(buildSelection(dragStartRef.current, point));
  }

  function handleSelectionPointerUp(event) {
    if (!dragStartRef.current || !imageRef.current) return;
    event.preventDefault();
    const point = getPointerFraction(event, imageRef.current);
    const nextSelection = buildSelection(dragStartRef.current, point);
    dragStartRef.current = null;
    setActiveSelection(null);
    if (nextSelection) {
      setSelection(nextSelection);
      setIsSelecting(false);
      notify("Area Selected", "Selected-area scan will focus only on that region.");
    }
  }

  const hasResult = hasAttemptedScan && !scanning;
  const selectedBox = activeSelection || selection;
  const matchedWords = comparison?.filter((item) => item.match).length || 0;
  const differingWords = comparison?.filter((item) => !item.match).length || 0;
  const visibleIssues = viewMode === "detailed" ? issues : issues.slice(0, 8);

  return (
    <main className="flow-page grid max-w-[1536px] items-start gap-6 lg:grid-cols-[23em_1fr]">
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="flex flex-col gap-5 p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Spell Check
            </p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Image Text Scanner
            </h2>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleImage(event.dataTransfer.files);
            }}
            className="dropzone-interactive rounded-2xl border-2 border-dashed border-zinc-200 p-5 text-center transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="icon-float mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white/60 text-zinc-400 dark:bg-zinc-800">
              <Upload size={22} className="icon-pop" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
              {imageUrl ? "Change Image" : "Upload Image"}
            </p>
            <p className="mt-1 text-[10px] font-medium text-zinc-400">
              JPG, PNG, WEBP
            </p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => handleImage(event.target.files)}
          />

          <div className="rounded-2xl border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Scan Mode
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                icon={ScanLine}
                disabled={!imageUrl || scanning}
                variant={defaultMode === "fast" ? "primary" : "secondary"}
                onClick={() => runScan("fast", false)}
              >
                Fast Scan
              </Button>
              <Button
                size="sm"
                icon={ScanText}
                disabled={!imageUrl || scanning}
                variant={defaultMode === "accurate" ? "primary" : "secondary"}
                onClick={() => runScan("accurate", false)}
              >
                Accurate Scan
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <Button
                size="sm"
                icon={Crop}
                disabled={!imageUrl || scanning}
                variant={isSelecting || selection ? "primary" : "outline"}
                onClick={() => setIsSelecting((value) => !value)}
              >
                Select Area
              </Button>
              <Button
                size="sm"
                disabled={!imageUrl || scanning || !selection}
                variant="secondary"
                onClick={() => runScan("accurate", true)}
              >
                Scan Area
              </Button>
            </div>
            {(selection || isSelecting) && (
              <button
                type="button"
                onClick={() => {
                  setSelection(null);
                  setActiveSelection(null);
                  setIsSelecting(false);
                }}
                className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:text-white"
              >
                Reset Selection
              </button>
            )}
            <p className="mt-2 text-[10px] font-medium leading-relaxed text-zinc-500">
              Select only the text area to reduce image noise and make OCR faster. Tesseract runs locally/offline.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              <AlignLeft size={12} />
              Expected Text
              <span className="ml-1 font-medium normal-case tracking-normal text-zinc-400">
                optional
              </span>
            </label>
            <textarea
              value={expectedText}
              onChange={(event) => setExpectedText(event.target.value)}
              rows={4}
              placeholder="Type the text you expect to be in the image..."
              className="resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-all placeholder:text-zinc-400 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:bg-zinc-900 dark:focus:ring-white/5"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={Sparkles}
              disabled
              title="Future online AI Vision mode. Requires internet and an approved API key."
            >
              Improve AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={RefreshCw}
              disabled={!ocrText.trim() || scanning}
              onClick={() => runSpellCheck()}
            >
              Recheck
            </Button>
          </div>

          {scanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {scanStatus}
                </p>
                <button
                  type="button"
                  onClick={cancelScan}
                  className="text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:text-zinc-950 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-zinc-950 transition-all duration-300 dark:bg-white"
                  style={{ width: `${scanPct}%` }}
                />
              </div>
              <p className="text-[10px] font-medium text-zinc-500">
                OCR is running offline on a processed copy.
              </p>
            </div>
          )}

          {hasResult && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-xl font-black text-zinc-950 dark:text-white">{wordCount}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  Words
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-xl font-black text-zinc-950 dark:text-white">
                  {confidence === null ? "--" : `${confidence}%`}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  OCR
                </p>
              </div>
              <div
                className={`rounded-2xl border p-3 text-center ${
                  issues.length
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
                }`}
              >
                <p
                  className={`text-xl font-black ${
                    issues.length
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {issues.length}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  Issues
                </p>
              </div>
            </div>
          )}

          {(imageUrl || hasAttemptedScan) && (
            <button
              type="button"
              onClick={resetScan}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X size={12} /> Clear & Reset
            </button>
          )}
        </Card>
      </aside>

      <section className="grid content-start gap-5 panel-enter-main">
        <Card
          className="overflow-hidden"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleImageDrop}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Image
              </p>
              <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
                {scanning ? scanStatus : imageUrl ? imageName || "Uploaded" : "No Image"}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {lastScan && (
                <Badge variant="default">
                  {lastScan.selected ? "Selected Area" : lastScan.scanMode}
                </Badge>
              )}
              <Badge variant={preprocessing ? "success" : "warning"}>
                {preprocessing ? "Preprocess On" : "Raw OCR"}
              </Badge>
            </div>
          </div>

          <div className="relative flex min-h-80 items-center justify-center overflow-hidden bg-white/60 p-4 dark:bg-zinc-950/60">
            {imageUrl ? (
              <div
                className={`relative inline-block max-w-full ${
                  isSelecting ? "cursor-crosshair" : ""
                }`}
                onPointerDown={handleSelectionPointerDown}
                onPointerMove={handleSelectionPointerMove}
                onPointerUp={handleSelectionPointerUp}
                onPointerCancel={() => {
                  dragStartRef.current = null;
                  setActiveSelection(null);
                }}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Uploaded text source"
                  draggable={false}
                  className="max-h-[28rem] max-w-full select-none rounded-2xl object-contain"
                />
                {selectedBox && (
                  <div
                    className="pointer-events-none absolute rounded-xl border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)] ring-2 ring-zinc-950/60 dark:ring-white/70"
                    style={{
                      left: `${selectedBox.x * 100}%`,
                      top: `${selectedBox.y * 100}%`,
                      width: `${selectedBox.width * 100}%`,
                      height: `${selectedBox.height * 100}%`,
                    }}
                  />
                )}
                {isSelecting && (
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-zinc-950/80 px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white backdrop-blur">
                    Drag around the text area
                  </div>
                )}
                {scanning && (
                  <>
                    <div className="ai-scan-beam pointer-events-none absolute inset-0 rounded-2xl" />
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-300/20 dark:bg-zinc-800">
                      <div
                        className="h-full bg-white transition-all duration-500 dark:bg-white"
                        style={{ width: `${scanPct}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="select-none py-16 text-center"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleImageDrop}
              >
                <div className="icon-float mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <ScanText className="text-zinc-400 dark:text-zinc-500 icon-pop" size={28} />
                </div>
                <p className="text-base font-black italic tracking-tight text-zinc-900 dark:text-zinc-100">
                  Upload an image to scan
                </p>
                <p className="mt-2 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                  Local English OCR and spell checking
                </p>
              </button>
            )}
          </div>
        </Card>

        {(hasResult || ocrText || errorMessage) && (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Extracted Text
                </p>
                <h3 className="mt-0.5 text-lg font-black italic tracking-tight text-zinc-900 dark:text-white">
                  {errorMessage || (issues.length ? "Review spelling suggestions" : "Editable OCR result")}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={quality.variant}>{quality.label}</Badge>
                <Badge variant={issues.length ? "warning" : "success"}>
                  {issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "No issues"}
                </Badge>
              </div>
            </div>

            {confidence !== null && confidence < 55 && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-100/70 p-3 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p className="text-xs font-semibold leading-relaxed">
                  OCR confidence is low. Try selected-area scan, a sharper image, or stronger contrast.
                </p>
              </div>
            )}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-950">
                {[
                  { id: "simple", label: "Simple", icon: Eye },
                  { id: "detailed", label: "Detailed", icon: EyeOff },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewMode(id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                      viewMode === id
                        ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                        : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={Copy} disabled={!ocrText.trim()} onClick={copyText}>
                  Copy Text
                </Button>
                <Button size="sm" variant="outline" icon={Download} disabled={!ocrText.trim()} onClick={saveText}>
                  Save Text
                </Button>
                <Button size="sm" variant="secondary" disabled={!ocrText.trim()} onClick={cleanText}>
                  Clean Text
                </Button>
              </div>
            </div>

            <textarea
              value={ocrText}
              onChange={(event) => {
                setOcrText(event.target.value);
                setErrorMessage("");
              }}
              rows={7}
              placeholder="OCR text will appear here..."
              className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-zinc-900 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-white dark:focus:ring-white/5"
            />

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              {renderHighlightedText(ocrText, visibleIssues)}
            </div>

            {visibleIssues.length > 0 && (
              <div className="mt-4 grid gap-2">
                {visibleIssues.map((issue) => (
                  <div
                    key={`${issue.word}-${issue.offset}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div>
                      <p className="font-mono text-sm font-black text-zinc-900 dark:text-zinc-100">
                        {issue.word}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-zinc-500">
                        {issue.message}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {issue.replacements?.length ? (
                        issue.replacements.map((replacement) => (
                          <Badge key={replacement.value} variant="default">
                            {replacement.value}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="default">No suggestion</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === "detailed" && (
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Badge variant="default">Words {wordCount}</Badge>
                <Badge variant="default">Chars {ocrText.length}</Badge>
                <Badge variant="default">Confidence {confidence ?? "--"}%</Badge>
                <Badge variant="default">Mode {lastScan?.selected ? "area" : lastScan?.scanMode || "none"}</Badge>
              </div>
            )}
          </Card>
        )}

        {comparison && (
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  <FileText size={13} />
                  Text Comparison
                </p>
                <h3 className="mt-0.5 text-lg font-black italic tracking-tight text-zinc-900 dark:text-white">
                  Expected vs Detected
                </h3>
              </div>
              <div className="flex gap-2">
                <Badge variant="success">{matchedWords} match</Badge>
                <Badge variant="warning">{differingWords} differ</Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  Expected
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {comparison.map((item, index) => (
                    <span
                      key={`expected-${item.expected}-${index}`}
                      className={`rounded-lg px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                        item.match
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400"
                      }`}
                    >
                      {item.expected || <span className="opacity-40">--</span>}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  Detected
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {comparison.map((item, index) => (
                    <span
                      key={`actual-${item.actual}-${index}`}
                      className={`rounded-lg px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                        item.match
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                      }`}
                    >
                      {item.actual || <span className="opacity-40">--</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </section>
    </main>
  );
}
