import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  FileArchive,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Link,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { downloadBlob } from "../utils/media.js";
import { runBrowserOcr } from "../utils/ocr.js";
import { Badge, Button, Card, Input } from "./ui.jsx";

const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );
const OCR_CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'\".,!?;:-()/#& ";

function normalizeInstagramUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0] === "reels" ? "reel" : parts[0];
    const shortcode = parts[1];

    if (host !== "instagram.com") return "";
    if (!["p", "reel", "tv"].includes(type)) return "";
    if (!shortcode) return "";

    return `https://www.instagram.com/${type}/${shortcode}/`;
  } catch {
    return "";
  }
}

function formatDimensions(item) {
  if (!item.width || !item.height) return "Original media";
  return `${item.width} x ${item.height}`;
}

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
  if (!width || !height) return "Unknown";

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
  const closeMatch = commonRatios.find(
    (ratio) => Math.abs(value - ratio.value) <= 0.015,
  );
  if (closeMatch) return closeMatch.label;

  const divisor = greatestCommonDivisor(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function getMediaSizing(items) {
  const item = items.find((media) => media.width && media.height);
  if (!item) return null;

  const ratio = formatAspectRatio(item.width, item.height);
  return {
    ratio,
    width: item.width,
    height: item.height,
    sizeText: `W ${item.width} x H ${item.height}`,
    combinedText: `${ratio} | W ${item.width} x H ${item.height}`,
  };
}

async function getErrorMessage(response) {
  try {
    const data = await response.json();
    return data?.error || "Instagram blocked extraction for this link.";
  } catch {
    return "Instagram blocked extraction for this link.";
  }
}

function fallbackCopyText(value) {
  let copied = false;
  const copyListener = (event) => {
    event.clipboardData?.setData("text/plain", value);
    event.preventDefault();
    copied = true;
  };
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "0";
  textarea.style.top = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  document.addEventListener("copy", copyListener);
  try {
    copied = document.execCommand("copy") || copied;
  } finally {
    document.removeEventListener("copy", copyListener);
    textarea.remove();
  }
  if (!copied) throw new Error("Copy fallback failed.");
}

async function writeClipboardText(value) {
  window.focus();
  document.body?.focus?.();
  try {
    fallbackCopyText(value);
  } catch (fallbackError) {
    if (!navigator.clipboard?.writeText) throw fallbackError;
    await navigator.clipboard.writeText(value);
  }
}

function copyTextareaText(textarea) {
  if (!textarea) throw new Error("No textarea available.");
  let copied = false;
  const copyListener = (event) => {
    event.clipboardData?.setData("text/plain", textarea.value);
    event.preventDefault();
    copied = true;
  };
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  document.addEventListener("copy", copyListener);
  try {
    copied = document.execCommand("copy") || copied;
  } finally {
    document.removeEventListener("copy", copyListener);
  }
  if (!copied) {
    throw new Error("Textarea copy failed.");
  }
}

function getPlayableMediaUrl(item) {
  if (!item) return "";
  if (item.type !== "video") return item.previewUrl;
  return item.downloadUrl.replace(/([?&])download=1&?/, "$1").replace(/[?&]$/, "");
}

function cleanOcrText(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const compact = line.replace(/\s/g, "");
      if (!compact) return false;
      const letters = (compact.match(/[A-Za-z]/g) || []).length;
      const words = (line.match(/[A-Za-z]{2,}/g) || []).length;
      return words >= 1 && letters / compact.length >= 0.45;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanOcrWord(value) {
  return String(value || "")
    .replace(/[|]+/g, "I")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulOcrWord(word) {
  const compact = word.replace(/\s/g, "");
  if (!compact) return false;
  if (!/[A-Za-z0-9]/.test(compact)) return false;
  if (compact.length === 1 && !/[AIa0-9]/.test(compact)) return false;
  const letters = (compact.match(/[A-Za-z]/g) || []).length;
  const digits = (compact.match(/[0-9]/g) || []).length;
  return (letters + digits) / compact.length >= 0.45;
}

function getWordBox(word) {
  const box = word?.bbox || {};
  const x0 = Number(box.x0 || 0);
  const y0 = Number(box.y0 || 0);
  const x1 = Number(box.x1 || x0);
  const y1 = Number(box.y1 || y0);
  return {
    x0,
    y0,
    x1,
    y1,
    centerY: y0 + (y1 - y0) / 2,
    height: Math.max(1, y1 - y0),
  };
}

function collectOcrWords(data) {
  const words = [];
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  for (const block of blocks) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    for (const paragraph of paragraphs) {
      const lines = Array.isArray(paragraph?.lines) ? paragraph.lines : [];
      for (const line of lines) {
        const lineWords = Array.isArray(line?.words) ? line.words : [];
        for (const word of lineWords) {
          const text = cleanOcrWord(word?.text);
          const confidence = Number(word?.confidence || 0);
          if (confidence < 18 || !isUsefulOcrWord(text)) continue;
          words.push({ ...getWordBox(word), confidence, text });
        }
      }
    }
  }
  return words;
}

function arrangeOcrWords(data) {
  const words = collectOcrWords(data);
  if (!words.length) return cleanOcrText(data?.text || "");

  const sorted = [...words].sort((a, b) => a.centerY - b.centerY || a.x0 - b.x0);
  const rows = [];
  for (const word of sorted) {
    const row = rows.find((candidate) => {
      const tolerance = Math.max(10, Math.min(candidate.height, word.height) * 0.75);
      return Math.abs(candidate.centerY - word.centerY) <= tolerance;
    });

    if (row) {
      row.words.push(word);
      row.centerY =
        row.words.reduce((total, item) => total + item.centerY, 0) /
        row.words.length;
      row.height = Math.max(row.height, word.height);
    } else {
      rows.push({ centerY: word.centerY, height: word.height, words: [word] });
    }
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY)
    .map((row) =>
      row.words
        .sort((a, b) => a.x0 - b.x0)
        .map((word) => word.text)
        .join(" ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/(["'])\s+/g, "$1")
        .trim(),
    )
    .filter((line) => {
      const wordsInLine = line.match(/[A-Za-z0-9]{2,}/g) || [];
      const letters = (line.match(/[A-Za-z]/g) || []).length;
      return wordsInLine.length > 0 && letters >= 2;
    })
    .join("\n")
    .trim();
}

function wrapOcrText(value, maxLineLength = 34) {
  return String(value || "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const words = line.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];

      const wrapped = [];
      let current = "";
      for (const word of words) {
        if (!current) {
          current = word;
        } else if (`${current} ${word}`.length <= maxLineLength) {
          current = `${current} ${word}`;
        } else {
          wrapped.push(current);
          current = word;
        }
      }
      if (current) wrapped.push(current);
      return wrapped;
    })
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

function getReadableOcrWords(value) {
  return String(value || "").match(/[A-Za-z0-9][A-Za-z0-9'"#&/.-]*/g) || [];
}

function getOcrLineStats(line) {
  const words = getReadableOcrWords(line);
  const longerWords = words.filter((word) => /[A-Za-z]/.test(word) && word.length >= 3);
  const compact = String(line || "").replace(/\s/g, "");
  const letters = (compact.match(/[A-Za-z]/g) || []).length;
  const digits = (compact.match(/[0-9]/g) || []).length;
  const usefulChars = letters + digits;

  return {
    words,
    longerWords,
    letters,
    usefulChars,
    compactLength: compact.length,
  };
}

function shouldKeepOcrLine(line) {
  const stats = getOcrLineStats(line);
  if (!stats.compactLength) return false;
  if (stats.usefulChars / stats.compactLength < 0.45) return false;
  if (stats.longerWords.length >= 2) return true;
  if (stats.longerWords.length === 1 && stats.letters >= 4) return true;
  return stats.words.length >= 2 && stats.usefulChars >= 5;
}

function normalizeOcrDisplayText(value, maxLineLength = 34) {
  const rawLines = String(value || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[^\w'"#&/.,!?;:()\-\s]/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (!rawLines.length) return "";

  const keptLines = rawLines.filter(shouldKeepOcrLine);
  const sourceLines = keptLines.length ? keptLines : rawLines;
  const tinyLineCount = sourceLines.filter((line) => {
    const stats = getOcrLineStats(line);
    return line.length < 8 || stats.longerWords.length === 0;
  }).length;
  const averageLineLength =
    sourceLines.reduce((total, line) => total + line.length, 0) / sourceLines.length;
  const hasTooManyTinyLines =
    sourceLines.length >= 3 && tinyLineCount / sourceLines.length > 0.4;
  const shouldPreserveLineBreaks =
    !hasTooManyTinyLines &&
    sourceLines.length >= 2 &&
    averageLineLength >= Math.min(20, maxLineLength * 0.58) &&
    tinyLineCount / sourceLines.length <= 0.25;
  const arranged = shouldPreserveLineBreaks ? sourceLines.join("\n") : sourceLines.join(" ");

  return wrapOcrText(arranged, maxLineLength);
}

function isReadableOcrLayout(lines) {
  if (lines.length < 2) return false;
  const usefulLines = lines.filter(shouldKeepOcrLine);
  if (usefulLines.length < 2) return false;

  const tinyLines = usefulLines.filter((line) => {
    const stats = getOcrLineStats(line);
    return line.length < 8 || stats.longerWords.length === 0;
  }).length;
  const averageLength =
    usefulLines.reduce((total, line) => total + line.length, 0) / usefulLines.length;

  return averageLength >= 10 && tinyLines / usefulLines.length <= 0.35;
}

function scoreOcrText(text, confidence) {
  const words = text.match(/[A-Za-z]{2,}/g) || [];
  const usefulWords = words.filter((word) => word.length > 2).length;
  return confidence + usefulWords * 8 + Math.min(text.length, 240) * 0.12;
}

async function imageToOcrSources(url) {
  const image = await new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  const blockCrops = [
    { left: 0, top: 0, width: 1, height: 1, psm: "sparse" },
    { left: 0.04, top: 0.08, width: 0.92, height: 0.52, psm: "block" },
    { left: 0.08, top: 0.14, width: 0.84, height: 0.34, psm: "block" },
    { left: 0.04, top: 0.42, width: 0.92, height: 0.48, psm: "block" },
  ];
  const lineCrops = [];
  const modes = ["original", "whiteText", "brightText"];
  const sources = [];

  [...blockCrops, ...lineCrops].forEach((crop, cropIndex) => {
    modes.forEach((mode) => {
      const sourceX = Math.round(sourceWidth * crop.left);
      const sourceY = Math.round(sourceHeight * crop.top);
      const cropWidth = Math.round(sourceWidth * crop.width);
      const cropHeight = Math.round(sourceHeight * crop.height);
      const scale = Math.max(
        1.4,
        Math.min(3, 2200 / Math.max(cropWidth, cropHeight)),
      );
      const width = Math.max(1, Math.round(cropWidth * scale));
      const height = Math.max(1, Math.round(cropHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        cropWidth,
        cropHeight,
        0,
        0,
        width,
        height,
      );

      if (mode !== "original") {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
          const maxChannel = Math.max(red, green, blue);
          const minChannel = Math.min(red, green, blue);
          const saturation = maxChannel ? (maxChannel - minChannel) / maxChannel : 0;
          const isLikelyWhiteText = luminance > 155 && saturation < 0.55;
          const isLikelyBrightText = luminance > 130;
          const isLikelyDarkText = luminance < 105;
          const isInk =
            mode === "whiteText"
              ? isLikelyWhiteText
              : mode === "brightText"
                ? isLikelyBrightText
                : isLikelyDarkText;
          data[index] = isInk ? 0 : 255;
          data[index + 1] = isInk ? 0 : 255;
          data[index + 2] = isInk ? 0 : 255;
          data[index + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      sources.push({
        cropIndex,
        key: `${mode}-${cropIndex}`,
        lineOrder: crop.lineOrder,
        mode,
        psm: crop.psm,
        source: canvas.toDataURL("image/png"),
      });
    });
  });

  return sources;
}

export default function InstagramPanel({ initialUrl = "" }) {
  const [postUrl, setPostUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [postMeta, setPostMeta] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [phaseMsg, setPhaseMsg] = useState("");
  const [activeViewerIndex, setActiveViewerIndex] = useState(null);
  const [ocrById, setOcrById] = useState({});
  const [ocrLoadingId, setOcrLoadingId] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const inputRef = useRef(null);
  const loadedUrlRef = useRef("");
  const abortRef = useRef(null);
  const sidebarCardRef = useRef(null);
  const ocrTextRef = useRef(null);
  const [mediaHeight, setMediaHeight] = useState(null);

  useEffect(() => {
    const node = sidebarCardRef.current;
    if (!node) return undefined;

    const updateHeight = () => {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      setMediaHeight(isDesktop ? Math.round(node.getBoundingClientRect().height) : null);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  async function loadPost(urlValue = postUrl) {
    const normalized = normalizeInstagramUrl(urlValue);
    if (!normalized) {
      setPhase("failed");
      setPhaseMsg("Paste a valid Instagram post, reel, or carousel link.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    loadedUrlRef.current = normalized;
    setPostUrl(normalized);
    setLoading(true);
    setItems([]);
    setPostMeta(null);
    setActiveViewerIndex(null);
    setIsViewerFullscreen(false);
    setOcrById({});
    setPhase("loading");
    setPhaseMsg("Loading carousel media...");

    try {
      const response = await fetch(
        `/api/instagram-carousel?url=${encodeURIComponent(normalized)}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const data = await response.json();
      const mediaItems = Array.isArray(data.items) ? data.items : [];
      if (!mediaItems.length) {
        throw new Error("No downloadable carousel media was found.");
      }

      setItems(mediaItems);
      setPostMeta(data.post || null);
      setPhase("done");
      setPhaseMsg(
        `${mediaItems.length} item${mediaItems.length === 1 ? "" : "s"} ready for download.`,
      );
      notify(
        "Carousel Ready",
        `${mediaItems.length} Instagram item${mediaItems.length === 1 ? "" : "s"} loaded.`,
      );
    } catch (error) {
      if (error.name === "AbortError") return;
      setItems([]);
      setPostMeta(null);
      setPhase("failed");
      setPhaseMsg(error.message || "Instagram blocked extraction.");
    } finally {
      setLoading(false);
    }
  }

  async function processMultipleUrls(urls) {
    setLoading(true);
    setPhase("loading");
    setPhaseMsg(`Loading ${urls.length} links...`);
    let allItems = [];
    let lastPostMeta = null;
    
    for (const url of urls) {
      try {
        const response = await fetch(`/api/instagram-carousel?url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          const mediaItems = Array.isArray(data.items) ? data.items : [];
          allItems = [...allItems, ...mediaItems];
          if (data.post) lastPostMeta = data.post;
        }
      } catch (e) {
        console.error("Failed to load", url, e);
      }
    }
    
    setItems(allItems);
    if (lastPostMeta) setPostMeta(lastPostMeta);
    setPhase("done");
    setPhaseMsg(`${allItems.length} items ready for download.`);
    setLoading(false);
  }

  useEffect(() => {
    const normalized = normalizeInstagramUrl(initialUrl);
    if (normalized) loadPost(normalized);
  }, []);

  useEffect(() => {
    const normalized = normalizeInstagramUrl(postUrl);
    if (!normalized || normalized === loadedUrlRef.current || loading) return;

    const timer = window.setTimeout(() => {
      loadPost(normalized);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [postUrl, loading]);

  useEffect(() => {
    if (activeViewerIndex === null) return;
    if (!items.length) {
      setActiveViewerIndex(null);
      setIsViewerFullscreen(false);
      return;
    }
    if (activeViewerIndex > items.length - 1) {
      setActiveViewerIndex(items.length - 1);
    }
  }, [activeViewerIndex, items.length]);

  useEffect(() => {
    if (activeViewerIndex === null) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeViewer();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveViewer(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveViewer(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeViewerIndex, items.length]);

  useEffect(() => {
    if (activeViewerIndex === null) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeViewerIndex]);

  async function pasteAndLoad() {
    try {
      const text = await navigator.clipboard.readText();
      const normalized = normalizeInstagramUrl(text);
      if (!normalized) {
        inputRef.current?.focus();
        setPhase("failed");
        setPhaseMsg("Clipboard does not contain a valid Instagram link.");
        return;
      }

      setPostUrl(normalized);
      await loadPost(normalized);
    } catch {
      inputRef.current?.focus();
      setPhase("idle");
      setPhaseMsg("Press Ctrl+V in the link field, and it will load automatically.");
    }
  }

  function handlePaste(event) {
    const text = event.clipboardData?.getData("text") || "";
    const normalized = normalizeInstagramUrl(text);
    if (!normalized) return;

    event.preventDefault();
    setPostUrl(normalized);
    window.setTimeout(() => loadPost(normalized), 0);
  }

  function openViewer(index) {
    setActiveViewerIndex(index);
    setIsViewerFullscreen(false);
  }

  function closeViewer() {
    setActiveViewerIndex(null);
    setIsViewerFullscreen(false);
  }

  function moveViewer(direction) {
    setActiveViewerIndex((current) => {
      if (current === null || !items.length) return current;
      return (current + direction + items.length) % items.length;
    });
  }

  async function readImageText(item) {
    if (!item) return;

    setOcrLoadingId(item.id);
    setOcrProgress(1);
    try {
      const result = await runBrowserOcr(item.previewUrl, {
        profile: "instagram",
        maxLineLength: 42,
        onProgress: (progress) => {
          setOcrProgress((current) => Math.max(current, progress));
        },
      });
      setOcrById((current) => ({
        ...current,
        [item.id]: {
          confidence: result.confidence,
          text: result.text || "No clear text found on this media.",
        },
      }));
    } catch {
      setOcrById((current) => ({
        ...current,
        [item.id]: {
          confidence: 0,
          error: true,
          text: "Could not read text from this media.",
        },
      }));
    } finally {
      setOcrLoadingId(null);
      setOcrProgress(0);
    }
  }

  async function downloadOne(item) {
    try {
      const response = await fetch(item.downloadUrl);
      if (!response.ok) throw new Error();
      downloadBlob(await response.blob(), item.name);
    } catch {
      setPhase("failed");
      setPhaseMsg(`${item.name} could not be downloaded. Try loading again.`);
    }
  }

  async function downloadAll() {
    if (!items.length) return;

    setPhase("loading");
    setPhaseMsg("Building ZIP file...");

    const zip = new JSZip();
    const failed = [];

    for (const item of items) {
      try {
        const response = await fetch(item.downloadUrl);
        if (!response.ok) throw new Error();
        zip.file(item.name, await response.blob());
      } catch {
        failed.push(item);
      }
    }

    if (failed.length) {
      zip.file(
        "failed_downloads.txt",
        failed
          .map((item) => `${item.name}: ${item.mediaUrl || item.downloadUrl}`)
          .join("\n"),
      );
    }

    const bundle = await zip.generateAsync({ type: "blob" });
    downloadBlob(bundle, `instagram_carousel_${Date.now()}.zip`);

    setPhase(failed.length ? "partial" : "done");
    setPhaseMsg(
      failed.length
        ? `ZIP downloaded with ${failed.length} failed item${failed.length === 1 ? "" : "s"} listed inside.`
        : "ZIP downloaded.",
    );
  }

  function deleteOne(id) {
    setItems((current) => current.filter((item) => item.id !== id));
    setOcrById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function clearAll() {
    abortRef.current?.abort();
    loadedUrlRef.current = "";
    setPostUrl("");
    setBulkText("");
    setItems([]);
    setPostMeta(null);
    setActiveViewerIndex(null);
    setIsViewerFullscreen(false);
    setOcrById({});
    setOcrLoadingId(null);
    setOcrProgress(0);
    setPhase("idle");
    setPhaseMsg("");
    setLoading(false);
  }

  async function copyDetail(label, value, sourceRef) {
    try {
      await writeClipboardText(value);
      setPhase("done");
      setPhaseMsg(`${label} copied.`);
      notify("Copied", `${label} copied.`);
    } catch {
      if (sourceRef?.current) {
        try {
          copyTextareaText(sourceRef.current);
          setPhase("done");
          setPhaseMsg(`${label} copied.`);
          notify("Copied", `${label} copied.`);
          return;
        } catch {
          sourceRef.current.focus();
          sourceRef.current.select();
          sourceRef.current.setSelectionRange(0, sourceRef.current.value.length);
          setPhase("done");
          setPhaseMsg(`${label} selected. Press Ctrl+C to copy.`);
          return;
        }
      }
      setPhase("failed");
      setPhaseMsg("Could not copy. Select the value and copy it manually.");
    }
  }

  const statusStyle =
    phase === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400"
      : phase === "failed"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400"
        : phase === "partial"
          ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/30 dark:bg-sky-950/20 dark:text-sky-400"
          : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  const mediaSizing = getMediaSizing(items);
  const activeItem =
    activeViewerIndex === null ? null : items[activeViewerIndex] || null;
  const activeOcr = activeItem ? ocrById[activeItem.id] : null;
  const activeOcrText = activeOcr?.text || "";
  const isReadingActive = activeItem && ocrLoadingId === activeItem.id;

  return (
    <>
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[26em_1fr]">
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card ref={sidebarCardRef} className="flex flex-col gap-5 p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Carousel Capture
            </p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Instagram Download
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2 relative transition-all duration-300">
              {!bulkMode ? (
                <Input
                  ref={inputRef}
                  value={postUrl}
                  onChange={(event) => setPostUrl(event.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") loadPost();
                  }}
                  placeholder="https://www.instagram.com/p/..."
                  className="flex-1"
                  aria-label="Instagram link"
                />
              ) : (
                <textarea
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder="Paste multiple Instagram URLs here (newlines, commas, or spaces)..."
                  className="flex-1 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all focus:border-zinc-500 focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:focus:ring-white/5 font-mono resize-none shadow-inner-sm min-h-[120px]"
                />
              )}
              {!bulkMode && (
                <Button
                  icon={Clipboard}
                  variant="secondary"
                  size="icon"
                  onClick={pasteAndLoad}
                  title="Paste and load"
                  aria-label="Paste and load Instagram link"
                />
              )}
            </div>
            
            {bulkMode && bulkText.trim().length > 0 && (() => {
              const urls = bulkText.split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean);
              const uniqueUrls = [...new Set(urls)];
              const parsedUrls = uniqueUrls.map(url => ({
                url,
                valid: normalizeInstagramUrl(url) !== ""
              }));
              const validCount = parsedUrls.filter(p => p.valid).length;
              const invalidUrls = parsedUrls.filter(p => !p.valid).map(p => p.url);

              return (
                <div className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <span>{parsedUrls.length} total</span>
                    <div className="flex gap-3">
                      <span className="text-emerald-600 dark:text-emerald-400">{validCount} valid</span>
                      {invalidUrls.length > 0 && <span className="text-red-600 dark:text-red-400">{invalidUrls.length} invalid</span>}
                    </div>
                  </div>
                  {invalidUrls.length > 0 && (
                    <div className="text-xs text-red-500 font-mono overflow-y-auto max-h-24 pr-1 custom-scrollbar">
                      <p className="font-bold mb-1 uppercase tracking-widest text-[9px]">Invalid links:</p>
                      {invalidUrls.map((url, i) => (
                        <div key={i} className="truncate line-through opacity-70 mb-0.5">{url}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            
            <div className="flex gap-2">
              <Button
                className="flex-1"
                icon={loading ? Loader2 : RefreshCw}
                disabled={(!bulkMode && !postUrl) || (bulkMode && !bulkText) || loading}
                onClick={() => {
                  if (bulkMode) {
                    const urls = bulkText.split(/[\n,\s]+/).map(u => u.trim()).filter(Boolean);
                    const validUrls = [...new Set(urls)].filter(u => normalizeInstagramUrl(u) !== "");
                    if (validUrls.length > 0) {
                      processMultipleUrls(validUrls);
                      setBulkMode(false);
                      setBulkText("");
                    }
                  } else {
                    loadPost();
                  }
                }}
              >
                {loading ? "Loading" : "Load"}
              </Button>
              <Button
                variant={bulkMode ? "primary" : "secondary"}
                onClick={() => setBulkMode(!bulkMode)}
              >
                {bulkMode ? "Single Link" : "Bulk Add"}
              </Button>
              <Button
                icon={X}
                variant="secondary"
                disabled={(!postUrl && !items.length && !bulkText)}
                onClick={clearAll}
              >
                Clear
              </Button>
            </div>
          </div>

          {phaseMsg && (
            <div
              className={`flex items-start gap-2 rounded-2xl border p-3 text-[11px] font-medium ${statusStyle}`}
            >
              {loading ? (
                <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" />
              ) : phase === "failed" ? (
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              ) : (
                <Link size={13} className="mt-0.5 shrink-0" />
              )}
              <span className="leading-relaxed">{phaseMsg}</span>
            </div>
          )}

          {postMeta && (
            <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black text-zinc-900 dark:text-zinc-100">
                    {postMeta.ownerUsername
                      ? `@${postMeta.ownerUsername}`
                      : postMeta.shortcode}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                    {postMeta.source} extraction
                  </p>
                </div>
                <Badge variant={postMeta.type === "reel" ? "warning" : "default"}>
                  {postMeta.type === "reel" ? (
                    <>
                      <Film size={10} /> Reel
                    </>
                  ) : (
                    <>
                      <Layers size={10} /> Post
                    </>
                  )}
                </Badge>
              </div>

              {mediaSizing && (
                <div className="mt-3 grid gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white p-2 dark:bg-zinc-950/50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        Ratio
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-black text-zinc-900 dark:text-zinc-100">
                          {mediaSizing.ratio}
                        </span>
                        <button
                          type="button"
                          onPointerDown={() => {
                            copyDetail("Aspect ratio", mediaSizing.ratio);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              copyDetail("Aspect ratio", mediaSizing.ratio);
                            }
                          }}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 shadow-sm transition-colors hover:text-zinc-950 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                          title="Copy aspect ratio"
                          aria-label="Copy aspect ratio"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-2 dark:bg-zinc-950/50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        Size
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-black text-zinc-900 dark:text-zinc-100">
                          W {mediaSizing.width} · H {mediaSizing.height}
                        </span>
                        <button
                          type="button"
                          onPointerDown={() => {
                            copyDetail("Width and height", mediaSizing.sizeText);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              copyDetail("Width and height", mediaSizing.sizeText);
                            }
                          }}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 shadow-sm transition-colors hover:text-zinc-950 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                          title="Copy width and height"
                          aria-label="Copy width and height"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onPointerDown={() => {
                      copyDetail("Ratio and size", mediaSizing.combinedText);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        copyDetail("Ratio and size", mediaSizing.combinedText);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <Copy size={12} />
                    Copy Both
                  </button>
                </div>
              )}
            </div>
          )}

          {items.length > 0 && !loading && (
            <Button icon={FileArchive} onClick={downloadAll} className="w-full">
              Download ZIP
            </Button>
          )}
        </Card>
      </aside>

      <section className="grid content-start gap-5 panel-enter-main">
        {loading && !items.length && (
          <Card
            className="flex flex-col p-5 lg:overflow-hidden"
            style={mediaHeight ? { height: `${mediaHeight}px` } : undefined}
          >
            <div className="min-h-0 space-y-3 overflow-y-auto pr-1 lg:flex-1">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="skeleton h-24 w-24 shrink-0 rounded-2xl" />
                  <div className="grid flex-1 content-center gap-2">
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {items.length > 0 && (
          <Card
            className="flex flex-col p-5 lg:overflow-hidden"
            style={mediaHeight ? { height: `${mediaHeight}px` } : undefined}
          >
            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Extracted Media
                </p>
                <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </h3>
              </div>
              <Badge variant="success">Ready</Badge>
            </div>

            <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 lg:flex-1 lg:overscroll-contain">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[9rem_1fr_auto]"
                >
                  <button
                    type="button"
                    onClick={() => openViewer(index)}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-white/60 text-left outline-none ring-offset-2 transition-transform hover:scale-[1.015] focus-visible:ring-2 focus-visible:ring-zinc-950 dark:bg-zinc-950 dark:ring-offset-zinc-900 dark:focus-visible:ring-white"
                    aria-label={`Open ${item.name} preview`}
                  >
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-black/70 px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ImageIcon size={11} />
                      Expand
                    </span>
                    {item.type === "video" && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                        <Film size={10} />
                        Video
                      </span>
                    )}
                  </button>

                  <div className="grid content-center gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="black">
                        {String(item.index + 1).padStart(2, "0")}
                      </Badge>
                      <Badge variant={item.type === "video" ? "warning" : "default"}>
                        {item.type === "video" ? (
                          <>
                            <Film size={10} /> Video
                          </>
                        ) : (
                          <>
                            <ImageIcon size={10} /> Image
                          </>
                        )}
                      </Badge>
                    </div>
                    <p className="break-all text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {item.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                      {formatDimensions(item)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 sm:flex-col sm:justify-center">
                    <Button
                      icon={Download}
                      size="icon"
                      onClick={() => downloadOne(item)}
                      title="Download"
                      aria-label={`Download ${item.name}`}
                    />
                    <Button
                      icon={Trash2}
                      size="icon"
                      variant="danger"
                      onClick={() => deleteOne(item.id)}
                      title="Delete"
                      aria-label={`Delete ${item.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {!items.length && !loading && (
          <Card className="overflow-hidden">
            <div className="flex min-h-48 items-center justify-center bg-white/60 p-4 dark:bg-zinc-950/60">
              <div className="text-center">
                <div className="icon-float mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <Link className="text-zinc-400 dark:text-zinc-500" size={28} />
                </div>
                <p className="text-base font-black italic tracking-tight text-zinc-900 dark:text-zinc-100">
                  Paste an Instagram carousel link
                </p>
                <p className="mt-2 text-xs font-medium uppercase tracking-widest text-zinc-400">
                  It will load automatically
                </p>
              </div>
            </div>
          </Card>
        )}
      </section>
    </div>

    {activeItem &&
      typeof document !== "undefined" &&
      createPortal(
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center ${
            isViewerFullscreen ? "p-0" : "p-4 sm:p-8"
          }`}
        >
        <div
          className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
          onClick={closeViewer}
        />
        <Card
          className={`relative flex flex-col overflow-hidden bg-white shadow-2xl transition-all duration-500 dark:bg-zinc-900 ${
            isViewerFullscreen
              ? "h-full w-full rounded-none border-0"
              : "max-h-[94vh] w-full max-w-6xl rounded-[32px] border border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 sm:px-8">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Expanded Preview
              </p>
              <h3 className="mt-1 truncate text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                {activeItem.name}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={activeItem.type === "video" ? "warning" : "default"}>
                {String((activeViewerIndex || 0) + 1).padStart(2, "0")} /{" "}
                {String(items.length).padStart(2, "0")}
              </Badge>
              <Button
                icon={isViewerFullscreen ? Minimize2 : Maximize2}
                size="icon"
                variant={isViewerFullscreen ? "primary" : "secondary"}
                onClick={() => setIsViewerFullscreen((value) => !value)}
                aria-label={isViewerFullscreen ? "Exit full screen" : "Open full screen"}
                title={isViewerFullscreen ? "Exit full screen" : "Open full screen"}
              />
              <Button
                icon={X}
                size="icon"
                variant="secondary"
                onClick={closeViewer}
                aria-label="Close preview"
                title="Close preview"
              />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 bg-white/60 dark:bg-zinc-950 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div
              className={`relative flex items-center justify-center overflow-hidden bg-zinc-950 p-4 ${
                isViewerFullscreen ? "min-h-0" : "min-h-[360px] sm:min-h-[520px]"
              }`}
            >
              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => moveViewer(-1)}
                    className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-white/90 text-zinc-950 shadow-xl transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label="Previous media"
                    title="Previous media"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveViewer(1)}
                    className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-white/90 text-zinc-950 shadow-xl transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label="Next media"
                    title="Next media"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}

              {activeItem.type === "video" ? (
                <video
                  key={activeItem.id}
                  src={getPlayableMediaUrl(activeItem)}
                  poster={activeItem.previewUrl}
                  controls
                  playsInline
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                />
              ) : (
                <img
                  key={activeItem.id}
                  src={activeItem.previewUrl}
                  alt=""
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                />
              )}
            </div>

            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 lg:border-l lg:border-t-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Media Details
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-white p-3 dark:bg-zinc-950/70">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                      Ratio
                    </p>
                    <p className="mt-1 font-mono text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {formatAspectRatio(activeItem.width, activeItem.height)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-zinc-950/70">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                      Size
                    </p>
                    <p className="mt-1 font-mono text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {activeItem.width || "?"} x {activeItem.height || "?"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-3 rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <FileText size={13} />
                      Detected Text
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-zinc-400">
                      {activeItem.type === "video"
                        ? "Reads the video thumbnail"
                        : "Reads the visible image"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      icon={FileText}
                      size="sm"
                      onClick={() => readImageText(activeItem)}
                      disabled={isReadingActive}
                    >
                      {isReadingActive ? `${ocrProgress}%` : "Read"}
                    </Button>
                    <Button
                      icon={Copy}
                      size="sm"
                      variant="secondary"
                      disabled={!activeOcrText || activeOcr?.error}
                      onClick={() => copyDetail("Detected text", activeOcrText, ocrTextRef)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="min-h-[9rem] max-h-[18rem] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {isReadingActive ? (
                    <div className="grid h-full place-items-center text-center">
                      <div>
                        <Loader2 className="mx-auto mb-3 animate-spin text-zinc-400" size={24} />
                        <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
                          Reading text
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-zinc-400">
                          {ocrProgress}%
                        </p>
                      </div>
                    </div>
                  ) : activeOcrText ? (
                    <textarea
                      ref={ocrTextRef}
                      aria-label="Detected text"
                      value={activeOcrText}
                      onChange={(event) => {
                        setOcrById((current) => ({
                          ...current,
                          [activeItem.id]: {
                            ...(current[activeItem.id] || {}),
                            text: event.target.value,
                          },
                        }));
                      }}
                      className="min-h-[8rem] w-full resize-none bg-transparent text-sm font-medium leading-relaxed text-zinc-800 outline-none dark:text-zinc-100"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-center">
                      <p className="max-w-[14rem] text-xs font-medium leading-relaxed text-zinc-400">
                        Tap Read to identify visible text, then copy it from here.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {activeOcr?.confidence ? (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                      Confidence {activeOcr.confidence}%
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    icon={Copy}
                    size="sm"
                    variant="secondary"
                    disabled={!activeOcrText || activeOcr?.error}
                    onClick={() => copyDetail("Detected text", activeOcrText, ocrTextRef)}
                  >
                    Copy Text
                  </Button>
                </div>
              </div>
            </aside>
          </div>

          <div className="shrink-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveViewerIndex(index)}
                  className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-white/60 transition dark:bg-zinc-950 ${
                    index === activeViewerIndex
                      ? "border-zinc-950 shadow-lg dark:border-white"
                      : "border-transparent opacity-65 hover:opacity-100"
                  }`}
                  aria-label={`View ${item.name}`}
                  title={item.name}
                >
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  {item.type === "video" && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-black/70 text-white">
                      <Film size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>,
        document.body,
      )}
    </>
  );
}

