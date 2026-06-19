import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Brush,
  Check,
  ChevronDown,
  ChevronUp,
  Crop,
  Download,
  Edit3,
  Eye,
  FileText,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  MessageSquareQuote,
  Palette,
  Quote,
  Redo2,
  Replace as ReplaceIcon,
  RotateCcw,
  Search,
  Table2,
  Video,
  Type,
  Undo2,
  Underline,
  Upload,
  X,
} from "lucide-react";
import { Button, Card, Input } from "./ui.jsx";
import FloatingToolPanel from "./ui/FloatingToolPanel.jsx";
import ModernSelect from "./ui/ModernSelect.jsx";
import PanelPopupButton from "./ui/PanelPopupButton.jsx";
import { downloadBlob } from "../utils/media.js";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28];
const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Mono" },
];
const WRITE_STATE_KEY = "contentflow-write-state-v1";
const WRITE_COMMAND_ORDER_KEY = "contentflow-write-command-order-v1";
const WRITE_HISTORY_LIMIT = 60;
const IMAGE_WIDTHS = [240, 320, 420, 560, 720];
const WRITE_COMMANDS = [
  { id: "text", label: "Text", hint: "plain", icon: Type },
  { id: "heading-1", label: "Heading 1", hint: "#", icon: Type },
  { id: "heading-2", label: "Heading 2", hint: "##", icon: Type },
  { id: "heading-3", label: "Heading 3", hint: "###", icon: Type },
  { id: "heading-4", label: "Heading 4", hint: "####", icon: Type },
  { id: "heading-5", label: "Heading 5", hint: "#####", icon: Type },
  { id: "bullet", label: "Bulleted List", hint: "-", icon: List },
  { id: "numbered", label: "Numbered List", hint: "1.", icon: ListOrdered },
  { id: "todo", label: "To-do List", hint: "[ ]", icon: Check },
  { id: "callout", label: "Callout", hint: ">", icon: MessageSquareQuote },
  { id: "divider", label: "Divider", hint: "---", icon: Quote },
  { id: "table", label: "Table", hint: "| |", icon: Table2 },
  { id: "image", label: "Image", hint: "PNG JPG", icon: ImagePlus },
  { id: "video", label: "Video", hint: "video", icon: Video },
  { id: "file", label: "File", hint: "file", icon: Upload },
  { id: "emoji", label: "Emoji", hint: "🙂", icon: Palette },
  { id: "dropdown", label: "Dropdown", hint: "toggle", icon: ChevronDown },
];

function loadWriteState() {
  try {
    return JSON.parse(localStorage.getItem(WRITE_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadWriteCommandOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(WRITE_COMMAND_ORDER_KEY) || "[]");
    const savedIds = Array.isArray(saved) ? saved : [];
    const validIds = WRITE_COMMANDS.map((command) => command.id);
    return [...savedIds.filter((id) => validIds.includes(id)), ...validIds.filter((id) => !savedIds.includes(id))];
  } catch {
    return WRITE_COMMANDS.map((command) => command.id);
  }
}

function trailingSlashMenu(value = "") {
  const lineStart = value.lastIndexOf("\n") + 1;
  const line = value.slice(lineStart);
  const slashMatch = line.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!slashMatch) return null;
  const slashIndex = lineStart + line.lastIndexOf("/");
  return {
    start: slashIndex,
    end: value.length,
    query: slashMatch[1] || "",
  };
}

function writeHistoryLabel(value = "") {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.slice(0, 54) || "Blank document";
}

function writeHistoryChange(previous = "", next = "") {
  if (previous === next) return "No text changed";
  let start = 0;
  const maxStart = Math.min(previous.length, next.length);
  while (start < maxStart && previous[start] === next[start]) start += 1;

  let previousEnd = previous.length - 1;
  let nextEnd = next.length - 1;
  while (
    previousEnd >= start &&
    nextEnd >= start &&
    previous[previousEnd] === next[nextEnd]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const removed = writeHistoryLabel(previous.slice(start, previousEnd + 1));
  const added = writeHistoryLabel(next.slice(start, nextEnd + 1));
  if (previousEnd >= start && nextEnd >= start) return `Changed "${removed}" to "${added}"`;
  if (previousEnd >= start) return `Removed "${removed}"`;
  return `Added "${added}"`;
}

function formatWriteHistoryTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildFindRegex(searchTerm, caseSensitive, wholeWord) {
  if (!searchTerm) return null;
  const pattern = wholeWord
    ? `\\b${escapeRegExp(searchTerm)}\\b`
    : escapeRegExp(searchTerm);
  return new RegExp(pattern, caseSensitive ? "g" : "gi");
}

function findMatches(content, searchTerm, caseSensitive, wholeWord) {
  const regex = buildFindRegex(searchTerm, caseSensitive, wholeWord);
  if (!regex || !content) return [];

  const matches = [];
  for (const match of content.matchAll(regex)) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[0],
    });
  }
  return matches;
}

function highlightedTextHtml(content, matches, activeIndex, replacements = [], offset = 0) {
  if (!content) return "";
  if (!matches.length && !replacements.length) return escapeHtml(content);

  let cursor = 0;
  const html = [];
  const highlights = [
    ...replacements.map((range) => ({
      start: range.index - offset,
      end: range.index + range.length - offset,
      className: "write-replace-flash rounded px-0.5 text-zinc-950",
    })),
    ...matches.map((match, index) => ({
      start: match.index - offset,
      end: match.index + match.length - offset,
      className:
        index === activeIndex
          ? "rounded bg-emerald-400/85 px-0.5 text-zinc-950"
          : "rounded bg-emerald-200/85 px-0.5 text-zinc-950",
    })),
  ]
    .filter((range) => range.end > 0 && range.start < content.length && range.end > range.start)
    .map((range) => ({
      ...range,
      start: Math.max(0, range.start),
      end: Math.min(content.length, range.end),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  highlights.forEach((range) => {
    if (range.start < cursor) return;
    html.push(escapeHtml(content.slice(cursor, range.start)));
    html.push(
      `<mark class="${range.className}">${escapeHtml(content.slice(range.start, range.end))}</mark>`,
    );
    cursor = range.end;
  });
  html.push(escapeHtml(content.slice(cursor)));
  return html.join("");
}

function applyInlineMarkdown(value) {
  return value
    .replace(
      /!\[([^\]]*)\]\((data:image\/[^)]+)\)\{width=(\d+)\}/g,
      '<img src="$2" alt="$1" class="my-4 h-auto max-w-full rounded-2xl border border-zinc-200 shadow-sm dark:border-zinc-800" style="width:min(100%, $3px)" />',
    )
    .replace(
      /\[Video: ([^\]]+)\]\((data:video\/[^)]+)\)/g,
      '<video controls src="$2" class="my-4 max-h-[28rem] w-full rounded-2xl border border-zinc-200 bg-black dark:border-zinc-800"></video>',
    )
    .replace(
      /\[File: ([^\]]+)\]\((data:[^)]+)\)/g,
      '<a href="$2" download="$1" class="my-3 inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/60 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-black">$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em class="italic">$1</em>')
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u class="underline">$1</u>');
}

function parseMarkdown(text, matches = [], activeIndex = 0, replacements = []) {
  if (!text.trim()) {
    return '<p class="text-zinc-400">Paste or type your writing here.</p>';
  }

  const lines = [...text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)]
    .map((match) => ({
      offset: match.index || 0,
      text: match[0].replace(/(?:\r\n|\n|\r)$/, ""),
    }))
    .filter((line, index, entries) => line.text || index < entries.length - 1);
  const html = [];
  let listType = null;
  let listItems = [];

  const flushList = () => {
    if (!listType) return;
    const tag = listType === "ordered" ? "ol" : "ul";
    const listClass = listType === "ordered" ? "list-decimal" : "list-disc";
    html.push(
      `<${tag} class="${listClass} ml-6 mb-4 space-y-1">${listItems
        .map((item) => `<li>${applyInlineMarkdown(item)}</li>`)
        .join("")}</${tag}>`,
    );
    listType = null;
    listItems = [];
  };

  const renderSlice = (value, offset) =>
    highlightedTextHtml(value, matches, activeIndex, replacements, offset);

  for (const { text: line, offset: lineOffset } of lines) {
    const trimmed = line.trim();
    const trimmedOffset = lineOffset + line.indexOf(trimmed);

    if (!trimmed) {
      flushList();
      continue;
    }

    if (/^<details(?:\s+open)?>$/i.test(trimmed)) {
      flushList();
      html.push('<details class="my-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40">');
      continue;
    }

    const summary = trimmed.match(/^<summary>(.*)<\/summary>$/i);
    if (summary) {
      flushList();
      html.push(`<summary class="cursor-pointer font-black">${applyInlineMarkdown(renderSlice(summary[1], trimmedOffset + trimmed.indexOf(summary[1])))}</summary>`);
      continue;
    }

    if (/^<\/details>$/i.test(trimmed)) {
      flushList();
      html.push("</details>");
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType && listType !== "unordered") flushList();
      listType = "unordered";
      listItems.push(renderSlice(unordered[1], trimmedOffset + trimmed.indexOf(unordered[1])));
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType && listType !== "ordered") flushList();
      listType = "ordered";
      listItems.push(renderSlice(ordered[1], trimmedOffset + trimmed.indexOf(ordered[1])));
      continue;
    }

    flushList();

    const imageBlock = trimmed.match(/^!\[([^\]]*)\]\((data:image\/[^)]+)\)\{width=(\d+)\}$/);
    if (imageBlock) {
      html.push(
        `<figure data-write-image-block="true" data-write-block-start="${trimmedOffset}" data-write-block-end="${trimmedOffset + trimmed.length}" class="group/write-image relative my-4 rounded-2xl border border-transparent p-1 transition hover:border-zinc-200 dark:hover:border-zinc-700"><img draggable="true" src="${imageBlock[2]}" alt="${escapeHtml(imageBlock[1])}" class="h-auto max-w-full cursor-grab rounded-2xl border border-zinc-200 shadow-sm active:cursor-grabbing dark:border-zinc-800" style="width:min(100%, ${imageBlock[3]}px)" /><figcaption class="pointer-events-none absolute left-3 top-3 rounded-full bg-zinc-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white opacity-0 shadow-xl transition group-hover/write-image:opacity-100">Hold and drag</figcaption></figure>`,
      );
      continue;
    }

    if (trimmed === "---") {
      html.push(`<hr data-write-block-start="${trimmedOffset}" class="my-5 border-zinc-200 dark:border-zinc-800" />`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      html.push(
        `<blockquote data-write-block-start="${trimmedOffset}" class="mb-4 border-l-4 border-zinc-300 pl-4 font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">${applyInlineMarkdown(
          renderSlice(quote[1], trimmedOffset + trimmed.indexOf(quote[1])),
        )}</blockquote>`,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,5})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const sizes = {
        1: "text-2xl",
        2: "text-xl",
        3: "text-lg",
        4: "text-base",
        5: "text-sm",
      };
      html.push(
        `<h${level} data-write-block-start="${trimmedOffset}" class="${sizes[level]} mb-3 mt-5 font-black">${applyInlineMarkdown(
          renderSlice(heading[2], trimmedOffset + trimmed.indexOf(heading[2])),
        )}</h${level}>`,
      );
      continue;
    }

    html.push(`<p data-write-block-start="${trimmedOffset}" class="mb-4">${applyInlineMarkdown(renderSlice(trimmed, trimmedOffset))}</p>`);
  }

  flushList();
  return html.join("");
}

function serializeFormattedNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";

  const inline = () => [...node.childNodes].map(serializeFormattedNode).join("");
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${inline()}**`;
  if (tag === "em" || tag === "i") return `*${inline()}*`;
  if (tag === "u") return `<u>${inline()}</u>`;
  if (tag === "code") return `\`${inline()}\``;
  if (tag === "mark" || tag === "span") return inline();
  if (tag === "hr") return "\n---\n";
  if (tag === "figure") {
    const image = node.querySelector("img");
    if (!image) return inline();
    const width = String(image.getAttribute("style") || "").match(/(\d+)px/)?.[1] || "420";
    const alt = image.getAttribute("alt") || "writing image";
    return `\n![${alt}](${image.getAttribute("src") || ""}){width=${width}}\n`;
  }
  if (tag === "img") {
    const width = String(node.getAttribute("style") || "").match(/(\d+)px/)?.[1] || "420";
    return `\n![${node.getAttribute("alt") || "writing image"}](${node.getAttribute("src") || ""}){width=${width}}\n`;
  }
  if (tag.match(/^h[1-5]$/)) return `${"#".repeat(Number(tag[1]))} ${inline()}\n`;
  if (tag === "blockquote") return `> ${inline().replace(/\n+/g, "\n> ")}\n`;
  if (tag === "li") return inline();
  if (tag === "ul") {
    return `${[...node.children].filter((child) => child.tagName === "LI").map((item) => `- ${serializeFormattedNode(item)}`).join("\n")}\n`;
  }
  if (tag === "ol") {
    return `${[...node.children].filter((child) => child.tagName === "LI").map((item, index) => `${index + 1}. ${serializeFormattedNode(item)}`).join("\n")}\n`;
  }
  if (tag === "summary") return `<summary>${inline()}</summary>\n`;
  if (tag === "details") return `<details open>\n${[...node.childNodes].map(serializeFormattedNode).join("").trim()}\n</details>\n`;
  if (tag === "video") {
    return `[Video: video](${node.getAttribute("src") || ""})\n`;
  }
  if (tag === "a" && String(node.getAttribute("download") || "")) {
    return `[File: ${node.getAttribute("download")}](${node.getAttribute("href") || ""})`;
  }
  if (tag === "p" || tag === "div") return `${inline()}\n`;
  return inline();
}

function serializeFormattedHtml(root) {
  return [...root.childNodes]
    .map(serializeFormattedNode)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formattedMarkdownCursorOffset(root) {
  const selection = window.getSelection?.();
  if (!root || !selection?.rangeCount) return null;
  const activeRange = selection.getRangeAt(0);
  if (!root.contains(activeRange.endContainer)) return null;
  const range = activeRange.cloneRange();
  range.selectNodeContents(root);
  range.setEnd(activeRange.endContainer, activeRange.endOffset);
  return serializeFormattedHtml(range.cloneContents()).length;
}

function WriteImageEditor({ draft, onApply, onClose }) {
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [width, setWidth] = useState(420);
  const [penActive, setPenActive] = useState(false);
  const [penColor, setPenColor] = useState("#ff4d4f");
  const [strokes, setStrokes] = useState([]);
  const [drawingStroke, setDrawingStroke] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null);

  if (!draft) return null;

  const cropStyle = {
    left: `${cropBox.x}%`,
    top: `${cropBox.y}%`,
    width: `${cropBox.width}%`,
    height: `${cropBox.height}%`,
  };
  const strokeList = drawingStroke ? [...strokes, drawingStroke] : strokes;

  const readPoint = (event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const updateCrop = (key, value) => {
    setCropBox((current) => {
      const next = { ...current, [key]: Number(value) };
      if (key === "x") next.width = Math.min(next.width, 100 - next.x);
      if (key === "y") next.height = Math.min(next.height, 100 - next.y);
      if (key === "width") next.width = Math.max(10, Math.min(next.width, 100 - next.x));
      if (key === "height") next.height = Math.max(10, Math.min(next.height, 100 - next.y));
      return next;
    });
  };

  const handlePointerDown = (event) => {
    if (!penActive || event.button !== 0) return;
    const point = readPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrawingStroke({ color: penColor, points: [point] });
  };

  const handlePointerMove = (event) => {
    if (!drawingStroke) return;
    const point = readPoint(event);
    if (!point) return;
    setDrawingStroke((current) => ({
      ...current,
      points: [...current.points, point].slice(-800),
    }));
  };

  const finishStroke = () => {
    if (drawingStroke?.points?.length > 1) {
      setStrokes((current) => [...current, drawingStroke].slice(-80));
    }
    setDrawingStroke(null);
  };

  const renderEditedImage = async () => {
    const image = new Image();
    image.src = draft.src;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const crop = {
      x: Math.round((cropBox.x / 100) * image.naturalWidth),
      y: Math.round((cropBox.y / 100) * image.naturalHeight),
      width: Math.max(1, Math.round((cropBox.width / 100) * image.naturalWidth)),
      height: Math.max(1, Math.round((cropBox.height / 100) * image.naturalHeight)),
    };
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(3, Math.min(crop.width, crop.height) * 0.008);
    strokes.forEach((stroke) => {
      const visiblePoints = stroke.points
        .map((point) => ({
          x: ((point.x - cropBox.x) / cropBox.width) * crop.width,
          y: ((point.y - cropBox.y) / cropBox.height) * crop.height,
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (visiblePoints.length < 2) return;
      context.strokeStyle = stroke.color;
      context.beginPath();
      visiblePoints.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
    });
    return canvas.toDataURL("image/png");
  };

  const applyImage = async () => {
    const src = await renderEditedImage();
    onApply({
      src,
      width,
      name: draft.name || "writing image",
    });
  };

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Writing Image
            </p>
            <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-50">
              Crop and mark image
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              icon={Brush}
              variant={penActive ? "primary" : "secondary"}
              onClick={() => setPenActive((value) => !value)}
              aria-label="Pen tool"
              title="Pen tool"
            />
            <label className="grid h-10 w-10 place-items-center rounded-xl bg-white/60 shadow-sm dark:bg-zinc-800" title="Pen color">
              <Palette size={16} />
              <input
                type="color"
                value={penColor}
                onChange={(event) => setPenColor(event.target.value)}
                className="sr-only"
                aria-label="Pen color"
              />
            </label>
            <Button
              size="icon"
              icon={X}
              variant="secondary"
              onClick={onClose}
              aria-label="Close image editor"
              title="Close"
            />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid min-h-[18rem] place-items-center rounded-2xl bg-zinc-950 p-4">
            <div
              ref={stageRef}
              className={`relative max-h-[62vh] max-w-full select-none overflow-hidden rounded-2xl bg-black ${
                penActive ? "cursor-crosshair" : ""
              }`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            >
              <img
                src={draft.src}
                alt=""
                className="block max-h-[62vh] max-w-full object-contain"
                draggable={false}
                onLoad={(event) =>
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
              />
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {strokeList.map((stroke, index) => (
                  <polyline
                    key={`${stroke.color}-${index}`}
                    points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={stroke.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.2"
                  />
                ))}
              </svg>
              <div className="pointer-events-none absolute inset-0 bg-black/30">
                <div className="absolute rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" style={cropStyle} />
              </div>
            </div>
          </div>

          <div className="grid content-start gap-4">
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-500">
                <Crop size={14} />
                Crop
              </div>
              {[
                { key: "x", label: "Left", max: 90 },
                { key: "y", label: "Top", max: 90 },
                { key: "width", label: "Width", max: 100 - cropBox.x },
                { key: "height", label: "Height", max: 100 - cropBox.y },
              ].map((control) => (
                <label key={control.key} className="mb-3 grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {control.label}
                  <input
                    type="range"
                    min={control.key === "width" || control.key === "height" ? 10 : 0}
                    max={control.max}
                    value={cropBox[control.key]}
                    onChange={(event) => updateCrop(control.key, event.target.value)}
                    className="accent-zinc-950 dark:accent-white"
                  />
                </label>
              ))}
            </div>

            <label className="rounded-2xl border border-zinc-200 p-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:border-zinc-800">
              Display Width
              <ModernSelect
                value={width}
                ariaLabel="Display width"
                className="mt-2"
                options={IMAGE_WIDTHS.map((size) => ({ value: size, label: `${size}px` }))}
                onChange={(value) => setWidth(Number(value))}
              />
            </label>

            <div className="rounded-2xl bg-white/70 p-4 text-xs font-semibold text-zinc-500 dark:bg-zinc-950/40">
              {imageSize.width && imageSize.height
                ? `${imageSize.width} x ${imageSize.height} source image`
                : "Loading image size..."}
            </div>

            <Button icon={Check} onClick={applyImage}>
              Add Image
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function WritingPanel() {
  const savedWriteState = useMemo(loadWriteState, []);
  const [content, setContent] = useState(savedWriteState.content || "");
  const [history, setHistory] = useState(() => [
    {
      content: savedWriteState.content || "",
      label: "Opened document",
      at: Date.now(),
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyMenu, setHistoryMenu] = useState("");
  const [commandOrder, setCommandOrder] = useState(loadWriteCommandOrder);
  const [slashMenu, setSlashMenu] = useState(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [foundTerm, setFoundTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [replacementHighlights, setReplacementHighlights] = useState([]);
  const [showSearchReplace, setShowSearchReplace] = useState(true);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const [autosaveFolder, setAutosaveFolder] = useState("");
  const [autosaveDocs, setAutosaveDocs] = useState([]);
  const [currentAutosaveId, setCurrentAutosaveId] = useState(savedWriteState.currentAutosaveId || "");
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [hasAskedForAutosaveFolder, setHasAskedForAutosaveFolder] = useState(false);
  const [fontSize, setFontSize] = useState(savedWriteState.fontSize || 16);
  const [fontFamily, setFontFamily] = useState(savedWriteState.fontFamily || "sans-serif");
  const [textAlign, setTextAlign] = useState(savedWriteState.textAlign || "left");
  const [fileName, setFileName] = useState(savedWriteState.fileName || "document.md");
  const [isMarkdown, setIsMarkdown] = useState(savedWriteState.isMarkdown !== false);
  const [isPreview, setIsPreview] = useState(true);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [imageDraft, setImageDraft] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const draggedImageBlockRef = useRef(null);
  const formattedEditorRef = useRef(null);
  const historyHoldTimerRef = useRef(null);
  const historyHoldOpenedRef = useRef(false);
  const replaceFlashTimerRef = useRef(null);

  const matches = useMemo(
    () => findMatches(content, foundTerm, false, false),
    [content, foundTerm],
  );
  const highlightedHtml = useMemo(
    () => highlightedTextHtml(content, matches, currentMatch, replacementHighlights),
    [content, currentMatch, matches, replacementHighlights],
  );
  const wordCount = useMemo(
    () => (content.match(/[\p{L}\p{N}'-]+/gu) || []).length,
    [content],
  );
  const orderedCommands = useMemo(
    () => commandOrder.map((id) => WRITE_COMMANDS.find((command) => command.id === id)).filter(Boolean),
    [commandOrder],
  );
  const activeSlashMenu = slashMenu || trailingSlashMenu(content);
  const slashCommands = useMemo(() => {
    if (!activeSlashMenu) return [];
    const query = activeSlashMenu.query.trim().toLowerCase();
    return orderedCommands.filter((command) =>
      !query ||
      command.label.toLowerCase().includes(query) ||
      command.id.includes(query) ||
      command.hint.toLowerCase().includes(query),
    );
  }, [activeSlashMenu, orderedCommands]);

  useEffect(() => {
    const nextState = {
      content,
      fileName,
      fontSize,
      fontFamily,
      textAlign,
      isMarkdown,
      isPreview,
      currentAutosaveId,
    };
    localStorage.setItem(WRITE_STATE_KEY, JSON.stringify(nextState));
    const hasUnsaved = Boolean(content.trim());
    window.dispatchEvent(
      new CustomEvent("contentflow-unsaved-state", {
        detail: { source: "write", hasUnsaved },
      }),
    );
    window.contentFlow?.appState?.setUnsaved?.(hasUnsaved, "write");
  }, [content, currentAutosaveId, fileName, fontFamily, fontSize, isMarkdown, isPreview, textAlign]);

  useEffect(() => {
    let cancelled = false;
    async function loadAutosaveState() {
      const state = await window.contentFlow?.write?.getState?.();
      if (cancelled || !state) return;
      setAutosaveFolder(state.folderPath || "");
      setAutosaveDocs(state.documents || []);
      setCurrentAutosaveId((current) => current || state.currentId || "");
      if (!state.folderPath && !hasAskedForAutosaveFolder) {
        setHasAskedForAutosaveFolder(true);
        const selected = await window.contentFlow?.write?.selectFolder?.();
        if (cancelled || !selected || selected.canceled) return;
        setAutosaveFolder(selected.folderPath || "");
        setAutosaveDocs(selected.documents || []);
      }
    }
    loadAutosaveState();
    return () => {
      cancelled = true;
    };
  }, [hasAskedForAutosaveFolder]);

  useEffect(() => {
    if (!content.trim() || !window.contentFlow?.write?.saveText) return undefined;
    const timer = window.setTimeout(async () => {
      let state = { folderPath: autosaveFolder };
      if (!state.folderPath && !hasAskedForAutosaveFolder) {
        setHasAskedForAutosaveFolder(true);
        state = await window.contentFlow.write.selectFolder();
        if (!state || state.canceled) return;
        setAutosaveFolder(state.folderPath || "");
        setAutosaveDocs(state.documents || []);
      }
      if (!state.folderPath && !autosaveFolder) return;

      setAutosaveStatus("Saving...");
      const saved = await window.contentFlow.write.saveText({
        id: currentAutosaveId,
        content,
        fileName,
      });
      if (saved?.needsFolder) {
        setAutosaveStatus("Choose a save folder");
        return;
      }
      setCurrentAutosaveId(saved.currentId || currentAutosaveId);
      setAutosaveFolder(saved.folderPath || autosaveFolder);
      setAutosaveDocs(saved.documents || []);
      setAutosaveStatus("Saved");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [autosaveFolder, content, currentAutosaveId, fileName, hasAskedForAutosaveFolder]);

  useEffect(() => {
    if (!matches.length) {
      setCurrentMatch(0);
      return;
    }
    setCurrentMatch((current) => (current >= matches.length ? 0 : current));
  }, [matches.length]);

  useEffect(() => {
    if (!matches.length || !textareaRef.current || isPreview) return;
    const match = matches[currentMatch] || matches[0];
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(match.index, match.index + match.length);
    });
  }, [currentMatch, isPreview, matches]);

  useEffect(
    () => () => {
      window.clearTimeout(replaceFlashTimerRef.current);
      window.clearTimeout(historyHoldTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const syncWriteCommands = () => setCommandOrder(loadWriteCommandOrder());
    window.addEventListener("contentflow-write-commands-changed", syncWriteCommands);
    return () => window.removeEventListener("contentflow-write-commands-changed", syncWriteCommands);
  }, []);

  useEffect(() => {
    setSlashActiveIndex((current) => Math.min(current, Math.max(0, slashCommands.length - 1)));
  }, [slashCommands.length]);

  useEffect(() => {
    if (!activeSlashMenu) return;
    document
      .querySelector(`[data-write-slash-index="${slashActiveIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeSlashMenu, slashActiveIndex]);

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) return;
    updateSlashMenu(content, textareaRef.current?.selectionStart || content.length);
  }, [content]);

  useEffect(() => {
    if (!isMarkdown || !isPreview || !formattedEditorRef.current) return;
    if (document.activeElement === formattedEditorRef.current) return;
    formattedEditorRef.current.innerHTML = content.trim()
      ? parseMarkdown(content, matches, currentMatch, replacementHighlights)
      : "";
  }, [content, currentMatch, isMarkdown, isPreview, matches, replacementHighlights]);

  function changeContent(nextContent, label = "Edited text", recordHistory = true) {
    setContent(nextContent);
    if (!recordHistory) return;
    setHistory((current) => {
      const active = current.slice(0, historyIndex + 1);
      if (active[active.length - 1]?.content === nextContent) return current;
      const nextHistory = [
        ...active,
        {
          content: nextContent,
          label,
          change: writeHistoryChange(active[active.length - 1]?.content || "", nextContent),
          at: Date.now(),
        },
      ].slice(-WRITE_HISTORY_LIMIT);
      setHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
  }

  function replaceSelection(nextText, nextSelectionStart, nextSelectionEnd, label) {
    changeContent(nextText, label);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  }

  function insertAtSelection(createText, fallback = "") {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || fallback;
    const inserted = createText(selected);
    const nextText = content.slice(0, start) + inserted + content.slice(end);
    const selectedOffset = inserted.indexOf(selected);
    const selectionStart = selectedOffset >= 0 ? start + selectedOffset : start + inserted.length;
    const selectionEnd = selectionStart + selected.length;

    replaceSelection(nextText, selectionStart, selectionEnd, "Formatted text");
  }

  function prefixSelectedLines(prefixer) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextBreak = content.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? content.length : nextBreak;
    const block = content.slice(lineStart, lineEnd) || "New item";
    const lines = block.split("\n");
    const transformed = lines.map((line, index) => prefixer(line, index)).join("\n");
    const nextText = content.slice(0, lineStart) + transformed + content.slice(lineEnd);

    replaceSelection(nextText, lineStart, lineStart + transformed.length, "Formatted lines");
  }

  function handlePaste(event) {
    const imageItem = [...(event.clipboardData?.items || [])].find((item) =>
      String(item.type || "").startsWith("image/"),
    );
    if (imageItem) {
      event.preventDefault();
      const imageFile = imageItem.getAsFile();
      if (imageFile) openImageFile(imageFile);
      return;
    }

    const text = event.clipboardData?.getData("text/plain") || "";
    const textarea = textareaRef.current;
    if (!textarea || !text) return;

    event.preventDefault();
    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const nextText = content.slice(0, start) + text + content.slice(end);
    if (!content.trim() && text.trim()) setCurrentAutosaveId("");
    replaceSelection(nextText, start + text.length, start + text.length, "Pasted text");
  }

  function updateSlashMenu(nextContent, cursor) {
    const lineStart = nextContent.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const beforeCursor = nextContent.slice(lineStart, cursor);
    const slashMatch = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
    if (!slashMatch) {
      setSlashMenu(null);
      return;
    }
    const slashIndex = lineStart + beforeCursor.lastIndexOf("/");
    setSlashMenu({
      start: slashIndex,
      end: cursor,
      query: slashMatch[1] || "",
    });
    setSlashActiveIndex(0);
  }

  function replaceSlashCommand(inserted, label) {
    if (!activeSlashMenu) return;
    const nextText = content.slice(0, activeSlashMenu.start) + inserted + content.slice(activeSlashMenu.end);
    const cursor = activeSlashMenu.start + inserted.length;
    setSlashMenu(null);
    replaceSelection(nextText, cursor, cursor, label);
    if (isMarkdown && isPreview && formattedEditorRef.current) {
      requestAnimationFrame(() => {
        formattedEditorRef.current.innerHTML = parseMarkdown(nextText);
        formattedEditorRef.current.focus();
      });
    }
  }

  function insertDataAttachment(file, type) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const dataUrl = String(readerEvent.target?.result || "");
      const cleanName = file.name.replace(/[\[\]()]/g, " ");
      const markup =
        type === "video"
          ? `\n\n[Video: ${cleanName}](${dataUrl})\n\n`
          : `\n\n[File: ${cleanName}](${dataUrl})\n\n`;
      replaceSlashCommand(markup, type === "video" ? "Added video" : "Added file");
    };
    reader.readAsDataURL(file);
  }

  function runSlashCommand(command) {
    if (!command) return;
    if (command.id === "image") {
      replaceSlashCommand("", "Image block");
      imageInputRef.current?.click();
      return;
    }
    if (command.id === "video") {
      videoInputRef.current?.click();
      return;
    }
    if (command.id === "file") {
      attachmentInputRef.current?.click();
      return;
    }

    const snippets = {
      text: "",
      "heading-1": "# Heading 1",
      "heading-2": "## Heading 2",
      "heading-3": "### Heading 3",
      "heading-4": "#### Heading 4",
      "heading-5": "##### Heading 5",
      bullet: "- List item",
      numbered: "1. List item",
      todo: "- [ ] To do",
      callout: "> 💡 Callout",
      divider: "\n---\n",
      table: "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |",
      emoji: "🙂",
      dropdown: "<details open>\n<summary>Dropdown</summary>\n\nWrite inside the dropdown.\n</details>",
    };
    replaceSlashCommand(snippets[command.id] ?? "", `Inserted ${command.label}`);
  }

  function handleEditorKeyDown(event) {
    if (!activeSlashMenu) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashActiveIndex((current) => (current + 1) % Math.max(1, slashCommands.length));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashActiveIndex((current) => (current - 1 + Math.max(1, slashCommands.length)) % Math.max(1, slashCommands.length));
    }
    if (event.key === "Enter" && slashCommands.length) {
      event.preventDefault();
      runSlashCommand(slashCommands[slashActiveIndex]);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSlashMenu(null);
    }
  }

  function moveSlashSelection(direction) {
    if (!slashCommands.length) return;
    setSlashActiveIndex((current) => (current + direction + slashCommands.length) % slashCommands.length);
  }

  function openHistory(index) {
    const snapshot = history[index];
    if (!snapshot) return;
    setHistoryIndex(index);
    changeContent(snapshot.content, snapshot.label, false);
    setHistoryMenu("");
  }

  function undoContent() {
    openHistory(historyIndex - 1);
  }

  function redoContent() {
    openHistory(historyIndex + 1);
  }

  function startHistoryHold(type) {
    historyHoldOpenedRef.current = false;
    window.clearTimeout(historyHoldTimerRef.current);
    historyHoldTimerRef.current = window.setTimeout(() => {
      historyHoldOpenedRef.current = true;
      setHistoryMenu(type);
    }, 420);
  }

  function finishHistoryHold(type) {
    window.clearTimeout(historyHoldTimerRef.current);
    if (historyHoldOpenedRef.current) return;
    if (type === "undo") undoContent();
    else redoContent();
  }

  function showReplacementFlash(ranges) {
    window.clearTimeout(replaceFlashTimerRef.current);
    setReplacementHighlights(ranges.filter((range) => range.length > 0));
    replaceFlashTimerRef.current = window.setTimeout(() => {
      setReplacementHighlights([]);
    }, 900);
  }

  function handleSearchChange(value) {
    setSearchTerm(value);
    setFoundTerm("");
    setReplacementHighlights([]);
    setCurrentMatch(0);
  }

  function findText() {
    const nextTerm = searchTerm.trim();
    setFoundTerm(nextTerm);
    setCurrentMatch(0);
    setReplacementHighlights([]);
  }

  function replaceAll() {
    const regex = buildFindRegex(foundTerm, false, false);
    if (!regex || !matches.length) return;

    const replacedCount = matches.length;
    let offset = 0;
    const replacementRanges = matches.map((match) => {
      const range = {
        index: match.index + offset,
        length: replaceTerm.length,
      };
      offset += replaceTerm.length - match.length;
      return range;
    });
    changeContent(content.replace(regex, replaceTerm), "Replaced all matches");
    showReplacementFlash(replacementRanges);
    notify("Replaced", `${replacedCount} match${replacedCount === 1 ? "" : "es"} updated.`);
  }

  function replaceOne() {
    const match = matches[currentMatch] || matches[0];
    if (!match) return;

    const nextText =
      content.slice(0, match.index) +
      replaceTerm +
      content.slice(match.index + match.length);
    changeContent(nextText, "Replaced match");
    showReplacementFlash([{ index: match.index, length: replaceTerm.length }]);
    const nextCursor = match.index + replaceTerm.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
    notify("Replaced", "1 match updated.");
  }

  function saveFile() {
    const blob = new Blob([content], {
      type: isMarkdown ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
    });
    downloadBlob(blob, fileName || "document.md");
  }

  function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const loadedContent = String(readerEvent.target?.result || "");
      setContent(loadedContent);
      setHistory([{ content: loadedContent, label: `Loaded ${file.name}`, at: Date.now() }]);
      setHistoryIndex(0);
      setFileName(file.name);
      setSlashMenu(null);
      setSlashActiveIndex(0);
      notify("Loaded", `${file.name} loaded.`);
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function resetDocument() {
    setContent("");
    setHistory([{ content: "", label: "Reset document", at: Date.now() }]);
    setHistoryIndex(0);
    setSearchTerm("");
    setFoundTerm("");
    setReplaceTerm("");
    setReplacementHighlights([]);
    setCurrentAutosaveId("");
    setAutosaveStatus("");
    setSlashMenu(null);
    setSlashActiveIndex(0);
  }

  function newDocument() {
    setContent("");
    setHistory([{ content: "", label: "New document", at: Date.now() }]);
    setHistoryIndex(0);
    setSearchTerm("");
    setFoundTerm("");
    setReplaceTerm("");
    setReplacementHighlights([]);
    setCurrentAutosaveId("");
    setAutosaveStatus(autosaveFolder ? "New document ready" : "");
    setSlashMenu(null);
    setSlashActiveIndex(0);
    setFileName("document.md");
    setIsPreview(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function chooseAutosaveFolder() {
    const selected = await window.contentFlow?.write?.selectFolder?.();
    if (!selected || selected.canceled) return;
    setAutosaveFolder(selected.folderPath || "");
    setAutosaveDocs(selected.documents || []);
    setAutosaveStatus("Folder ready");
  }

  async function openSavedText(id) {
    const loaded = await window.contentFlow?.write?.loadText?.(id);
    if (!loaded?.found) return;
    const loadedContent = loaded.content || "";
    setContent(loadedContent);
    setHistory([{ content: loadedContent, label: `Opened ${loaded.document?.name || "saved text"}`, at: Date.now() }]);
    setHistoryIndex(0);
    setCurrentAutosaveId(loaded.document?.id || id);
    setFileName(loaded.document?.name || fileName);
    setAutosaveFolder(loaded.folderPath || autosaveFolder);
    setAutosaveDocs(loaded.documents || []);
    setAutosaveStatus("Loaded");
    setSlashMenu(null);
    setSlashActiveIndex(0);
  }

  function openImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      setImageDraft({
        src: String(readerEvent.target?.result || ""),
        name: file.name.replace(/\.[^.]+$/, ""),
      });
    };
    reader.readAsDataURL(file);
  }

  function loadImage(event) {
    const file = event.target.files?.[0];
    openImageFile(file);
    event.target.value = "";
  }

  function insertEditedImage(image) {
    const alt = String(image.name || "writing image").replace(/[\[\]()]/g, " ").trim();
    const imageMarkup = `\n\n![${alt || "writing image"}](${image.src}){width=${image.width}}\n\n`;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const nextContent = content.slice(0, start) + imageMarkup + content.slice(end);
    changeContent(nextContent, "Added image");
    setImageDraft(null);
    setIsMarkdown(true);
    notify("Image added", "The edited image is stored with this writing.");
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + imageMarkup.length, start + imageMarkup.length);
    });
  }

  function handlePreviewImageDragStart(event) {
    const figure = event.target.closest?.("[data-write-image-block]");
    if (!figure) return;
    const start = Number(figure.dataset.writeBlockStart);
    const end = Number(figure.dataset.writeBlockEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    draggedImageBlockRef.current = { start, end };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "contentflow-write-image");
  }

  function handlePreviewImageDragOver(event) {
    if (!draggedImageBlockRef.current) return;
    if (!event.target.closest?.("[data-write-block-start]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handlePreviewImageDrop(event) {
    const target = event.target.closest?.("[data-write-block-start]");
    const dragged = draggedImageBlockRef.current;
    draggedImageBlockRef.current = null;
    if (!target || !dragged) return;
    event.preventDefault();
    const targetStart = Number(target.dataset.writeBlockStart);
    if (!Number.isFinite(targetStart) || targetStart >= dragged.start && targetStart <= dragged.end) return;

    const imageBlock = content.slice(dragged.start, dragged.end);
    const withoutBlock = content.slice(0, dragged.start) + content.slice(dragged.end);
    const adjustedTarget = targetStart > dragged.start ? targetStart - (dragged.end - dragged.start) : targetStart;
    const insertion = `${imageBlock}\n\n`;
    const nextContent =
      withoutBlock.slice(0, adjustedTarget) +
      insertion +
      withoutBlock.slice(adjustedTarget);
    changeContent(nextContent, "Moved image");
  }

  function handlePreviewImageDragEnd() {
    draggedImageBlockRef.current = null;
  }

  function handlePreviewWheel(event) {
    if (!draggedImageBlockRef.current) return;
    event.currentTarget.scrollTop += event.deltaY;
  }

  function syncFormattedSlashMenu(root, nextContent = serializeFormattedHtml(root)) {
    updateSlashMenu(
      nextContent,
      formattedMarkdownCursorOffset(root) ?? nextContent.length,
    );
  }

  function handleFormattedInput(event) {
    const nextContent = serializeFormattedHtml(event.currentTarget);
    changeContent(nextContent, "Edited document");
    syncFormattedSlashMenu(event.currentTarget, nextContent);
  }

  function handleFormattedCursorChange(event) {
    syncFormattedSlashMenu(event.currentTarget);
  }

  function handleFormattedPaste(event) {
    const imageItem = [...(event.clipboardData?.items || [])].find((item) =>
      String(item.type || "").startsWith("image/"),
    );
    if (!imageItem) return;
    event.preventDefault();
    const imageFile = imageItem.getAsFile();
    if (imageFile) openImageFile(imageFile);
  }

  const editorStyle = {
    fontSize: `${fontSize}px`,
    fontFamily,
    lineHeight: 1.65,
    textAlign,
  };
  const undoHistoryOptions = history.slice(0, historyIndex).map((entry, index) => ({ ...entry, index })).reverse();
  const redoHistoryOptions = history.slice(historyIndex + 1).map((entry, offset) => ({
    ...entry,
    index: historyIndex + offset + 1,
  }));

  const renderControlPanel = () => (
    <>
      <Card className="h-fit p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Writing Studio
            </p>
            <p className="mt-1 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {wordCount} words / {content.length} chars
            </p>
          </div>
          <Button size="sm" icon={RotateCcw} variant="secondary" onClick={resetDocument}>
            Reset
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <Button
            icon={FileText}
            variant="secondary"
            className="w-full"
            onClick={newDocument}
          >
            New Document
          </Button>
          <Input
            label="File Name"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="document.md"
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Font Size
              <ModernSelect
                value={fontSize}
                ariaLabel="Font size"
                options={FONT_SIZES.map((size) => ({ value: size, label: `${size}px` }))}
                onChange={(value) => setFontSize(Number(value))}
              />
            </label>

            <label className="grid gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Font
              <ModernSelect
                value={fontFamily}
                ariaLabel="Font"
                options={FONT_FAMILIES}
                onChange={setFontFamily}
              />
            </label>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <button
              type="button"
              onClick={() => {
                setIsMarkdown(true);
                setIsPreview(false);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-pressed={isMarkdown && !isPreview}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black uppercase tracking-widest transition ${
                isMarkdown
                  ? "bg-zinc-950 text-white shadow-md dark:bg-white dark:text-zinc-950"
                  : "bg-white/60 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              <FileText size={15} />
              Markdown
            </button>
            <Button
              size="sm"
              icon={isPreview ? Edit3 : Eye}
              variant={isPreview ? "primary" : "secondary"}
              onClick={() => setIsPreview((value) => !value)}
              disabled={!isMarkdown}
              className="h-12 px-4"
            >
              {isPreview ? "Edit" : "Preview"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="h-fit p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Tools
            </p>
            <h2 className="mt-1 text-lg font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Find & Replace
            </h2>
          </div>
          <Button
            size="sm"
            icon={Search}
            variant="secondary"
            onClick={() => setShowSearchReplace((value) => !value)}
          >
            {showSearchReplace ? "Hide" : "Show"}
          </Button>
        </div>

        {showSearchReplace && (
          <div className="mt-4 space-y-3">
            <Input
              label="Find"
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search text..."
            />
            <Input
              label="Replace"
              value={replaceTerm}
              onChange={(event) => setReplaceTerm(event.target.value)}
              placeholder="Replace with..."
            />

            <div className="rounded-xl bg-white px-3 py-2 font-mono text-xs text-zinc-500 dark:bg-zinc-950/60 dark:text-zinc-400">
              {matches.length
                ? `${currentMatch + 1} of ${matches.length} match${matches.length === 1 ? "" : "es"}`
                : foundTerm
                  ? "No matches"
                  : searchTerm
                    ? "Tap Find to search"
                  : "Enter text to search"}
            </div>

            <div className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)_minmax(8.5rem,1fr)] gap-2">
              <Button
                size="sm"
                icon={Search}
                variant="secondary"
                onClick={findText}
                disabled={!searchTerm.trim() || !content.trim()}
                className="whitespace-nowrap"
              >
                Find
              </Button>
              <Button
                size="sm"
                icon={ReplaceIcon}
                variant="secondary"
                onClick={replaceOne}
                disabled={!matches.length}
                className="whitespace-nowrap"
              >
                Replace
              </Button>
              <Button
                size="sm"
                icon={ReplaceIcon}
                variant="secondary"
                onClick={replaceAll}
                disabled={!matches.length}
                className="whitespace-nowrap"
              >
                Replace All
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="h-fit p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Saved Texts
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500" title={autosaveFolder}>
              {autosaveFolder || "Choose a folder to autosave writing."}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={chooseAutosaveFolder}>
            Folder
          </Button>
        </div>
        <div className="mt-3 rounded-xl bg-white px-3 py-2 font-mono text-xs text-zinc-500 dark:bg-zinc-950/60 dark:text-zinc-400">
          {autosaveStatus || (autosaveFolder ? "Autosave ready" : "Folder not set")}
        </div>
        <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto pr-1">
          {autosaveDocs.length ? (
            autosaveDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => openSavedText(doc.id)}
                className={`rounded-2xl border p-3 text-left transition hover:border-zinc-400 dark:hover:border-zinc-600 ${
                  currentAutosaveId === doc.id
                    ? "border-zinc-950 bg-white dark:border-white dark:bg-zinc-950"
                    : "border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/40"
                }`}
              >
                <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">
                  {doc.name}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-relaxed text-zinc-500">
                  {doc.excerpt || "Saved writing"}
                </p>
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-center text-xs font-semibold text-zinc-500 dark:border-zinc-800">
              Pasted text will appear here after autosave.
            </div>
          )}
        </div>
      </Card>

      <Card className="h-fit p-5">
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown"
            className="hidden"
            onChange={loadFile}
          />
          <Button
            icon={Upload}
            variant="secondary"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            Load File
          </Button>
          <Button icon={Download} className="w-full" onClick={saveFile}>
            Save File
          </Button>
        </div>
      </Card>
    </>
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:min-h-[calc(100vh-5.5rem)] lg:grid-cols-[26em_minmax(0,1fr)]">
      <aside
        className="grid auto-rows-max content-start gap-5 panel-enter-aside lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1"
        onScroll={(event) => {
          window.dispatchEvent(
            new CustomEvent("studio-panel-scroll", {
              detail: { compact: event.currentTarget.scrollTop > 24 },
            }),
          );
        }}
      >
        {renderControlPanel()}
      </aside>

      <FloatingToolPanel
        storageKey="contentflow-write-floating-panel"
        title="Writing Tools"
        eyebrow="Write"
        open={isControlPanelOpen}
        onClose={() => setIsControlPanelOpen(false)}
        defaultSize={{ width: 400, height: 580 }}
      >
        {renderControlPanel()}
      </FloatingToolPanel>

      <section className="panel-enter-main lg:sticky lg:top-24 lg:h-[calc(100vh-7.5rem)]">
        <Card className="overflow-hidden lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={loadImage}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => {
                  insertDataAttachment(event.target.files?.[0], "video");
                  event.target.value = "";
                }}
              />
              <input
                ref={attachmentInputRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  insertDataAttachment(event.target.files?.[0], "file");
                  event.target.value = "";
                }}
              />
              <div className="relative flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                {[
                  {
                    value: "undo",
                    icon: Undo2,
                    label: "Undo",
                    disabled: historyIndex <= 0,
                    options: undoHistoryOptions,
                  },
                  {
                    value: "redo",
                    icon: Redo2,
                    label: "Redo",
                    disabled: historyIndex >= history.length - 1,
                    options: redoHistoryOptions,
                  },
                ].map(({ value, icon: Icon, label, disabled, options }) => (
                  <button
                    key={value}
                    type="button"
                    onPointerDown={() => startHistoryHold(value)}
                    onPointerUp={() => finishHistoryHold(value)}
                    onPointerCancel={() => window.clearTimeout(historyHoldTimerRef.current)}
                    onPointerLeave={() => window.clearTimeout(historyHoldTimerRef.current)}
                    onClick={(event) => event.preventDefault()}
                    disabled={disabled}
                    className="rounded-lg p-2 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-zinc-800"
                    title={`${label}. Hold for recent changes.`}
                    aria-label={`${label}. Hold for recent changes.`}
                  >
                    <Icon size={14} />
                  </button>
                ))}
                {historyMenu && (
                  <div className="absolute left-0 top-[calc(100%+0.55rem)] z-40 w-72 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        {historyMenu === "undo" ? "Go Back" : "Go Forward"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setHistoryMenu("")}
                        className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        aria-label="Close recent changes"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="grid max-h-64 gap-1 overflow-y-auto">
                      {(historyMenu === "undo" ? undoHistoryOptions : redoHistoryOptions).length ? (
                        (historyMenu === "undo" ? undoHistoryOptions : redoHistoryOptions).map((entry) => (
                          <button
                            key={`${entry.at}-${entry.index}`}
                            type="button"
                            onClick={() => openHistory(entry.index)}
                            className="rounded-xl px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <p className="truncate text-xs font-black text-zinc-950 dark:text-zinc-50">
                              {entry.label}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500">
                              {formatWriteHistoryTime(entry.at)} -{" "}
                              {entry.change ||
                                writeHistoryChange(
                                  history[Math.max(0, entry.index - 1)]?.content || "",
                                  entry.content,
                                )}
                            </p>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs font-semibold text-zinc-500">
                          No recent changes here yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => insertAtSelection((text) => `**${text}**`, "bold text")}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Bold"
                  aria-label="Bold"
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => insertAtSelection((text) => `*${text}*`, "italic text")}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Italic"
                  aria-label="Italic"
                >
                  <Italic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => insertAtSelection((text) => `<u>${text}</u>`, "underlined text")}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Underline"
                  aria-label="Underline"
                >
                  <Underline size={14} />
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Add image"
                  aria-label="Add image"
                >
                  <ImagePlus size={14} />
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                {[
                  { value: "left", icon: AlignLeft, label: "Align left" },
                  { value: "center", icon: AlignCenter, label: "Align center" },
                  { value: "right", icon: AlignRight, label: "Align right" },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTextAlign(value)}
                    className={`rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800 ${
                      textAlign === value ? "bg-white/60 dark:bg-zinc-800" : ""
                    }`}
                    title={label}
                    aria-label={label}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => prefixSelectedLines((line) => (line.startsWith("- ") ? line : `- ${line}`))}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Bullet list"
                  aria-label="Bullet list"
                >
                  <List size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => prefixSelectedLines((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`)}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Numbered list"
                  aria-label="Numbered list"
                >
                  <ListOrdered size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => prefixSelectedLines((line) => (line.startsWith("> ") ? line : `> ${line}`))}
                  className="rounded-lg p-2 hover:bg-white/60 dark:hover:bg-zinc-800"
                  title="Quote"
                  aria-label="Quote"
                >
                  <Quote size={14} />
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <Type size={13} />
                {isPreview ? "Preview" : "Editor"}
              </div>
              <PanelPopupButton
                label="Panel"
                onClick={() => setIsControlPanelOpen(true)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 p-6">
            {isMarkdown && isPreview ? (
              <div className="relative h-[60vh] rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:h-full">
                <div
                  ref={formattedEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Paste or type your writing here..."
                  className="write-formatted-editor h-full w-full overflow-auto rounded-xl p-4 leading-relaxed outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white"
                  style={editorStyle}
                  onInput={handleFormattedInput}
                  onKeyDownCapture={handleEditorKeyDown}
                  onKeyUp={handleFormattedCursorChange}
                  onClick={handleFormattedCursorChange}
                  onPaste={handleFormattedPaste}
                  onDragStart={handlePreviewImageDragStart}
                  onDragOver={handlePreviewImageDragOver}
                  onDrop={handlePreviewImageDrop}
                  onDragEnd={handlePreviewImageDragEnd}
                  onWheel={handlePreviewWheel}
                />
                {activeSlashMenu && (
                  <div className="absolute bottom-5 left-5 z-30 w-[min(24rem,calc(100%-2.5rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                          Insert Block
                        </p>
                        <p className="truncate text-xs font-semibold text-zinc-500">
                          {activeSlashMenu.query ? `/${activeSlashMenu.query}` : "Type to search commands"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => moveSlashSelection(-1)} aria-label="Previous slash command" className="rounded-lg bg-zinc-100 p-1.5 dark:bg-zinc-800">
                          <ChevronUp size={14} />
                        </button>
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => moveSlashSelection(1)} aria-label="Next slash command" className="rounded-lg bg-zinc-100 p-1.5 dark:bg-zinc-800">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="grid max-h-80 gap-1 overflow-y-auto p-2">
                      {slashCommands.map((command, index) => {
                        const Icon = command.icon;
                        return (
                          <button
                            key={command.id}
                            data-write-slash-index={index}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => runSlashCommand(command)}
                            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${
                              index === slashActiveIndex
                                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <Icon size={16} className="shrink-0" />
                              <span className="truncate text-sm font-bold">{command.label}</span>
                            </span>
                            <span className="font-mono text-[11px] text-zinc-400">{command.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid h-[60vh] min-h-0 gap-4 lg:h-full">
                <div className="relative min-h-[22rem] overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  {(matches.length > 0 || replacementHighlights.length > 0) && (
                    <pre
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 m-0 whitespace-pre-wrap break-words p-4 text-zinc-950 dark:text-zinc-100"
                      style={{
                        ...editorStyle,
                        transform: `translate(${-editorScroll.left}px, ${-editorScroll.top}px)`,
                      }}
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                  )}
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      changeContent(nextValue, "Edited text");
                      requestAnimationFrame(() => {
                        updateSlashMenu(
                          nextValue,
                          textareaRef.current?.selectionStart || nextValue.length,
                        );
                      });
                    }}
                    onKeyDown={handleEditorKeyDown}
                    onKeyUp={(event) =>
                      updateSlashMenu(
                        event.currentTarget.value,
                        event.currentTarget.selectionStart || event.currentTarget.value.length,
                      )
                    }
                    onPaste={handlePaste}
                    onScroll={(event) =>
                      setEditorScroll({
                        top: event.currentTarget.scrollTop,
                        left: event.currentTarget.scrollLeft,
                      })
                    }
                    placeholder="Paste or type your writing here..."
                    className={`relative h-full w-full resize-none rounded-xl border-0 bg-transparent p-4 leading-relaxed outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white ${
                      matches.length > 0 || replacementHighlights.length > 0
                        ? "text-transparent caret-zinc-950 selection:bg-zinc-950/20 dark:caret-white dark:selection:bg-white/25"
                        : "text-zinc-950 dark:text-zinc-100"
                    }`}
                    style={editorStyle}
                    spellCheck
                  />
                  {activeSlashMenu && (
                    <div className="absolute bottom-5 left-5 z-30 w-[min(24rem,calc(100%-2.5rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            Insert Block
                          </p>
                          <p className="mt-1 truncate text-xs font-semibold text-zinc-500">
                            {activeSlashMenu.query ? `/${activeSlashMenu.query}` : "Type to search commands"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => moveSlashSelection(-1)}
                            className="rounded-lg bg-zinc-100 p-1.5 text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            aria-label="Previous slash command"
                            title="Previous command"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => moveSlashSelection(1)}
                            className="rounded-lg bg-zinc-100 p-1.5 text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            aria-label="Next slash command"
                            title="Next command"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid max-h-80 gap-1 overflow-y-auto p-2">
                      {slashCommands.length ? (
                        slashCommands.map((command, index) => {
                          const Icon = command.icon;
                          return (
                            <button
                              key={command.id}
                              data-write-slash-index={index}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => runSlashCommand(command)}
                              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${
                                index === slashActiveIndex
                                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <Icon size={16} className="shrink-0" />
                                <span className="truncate text-sm font-bold">{command.label}</span>
                              </span>
                              <span className={`shrink-0 font-mono text-[11px] ${index === slashActiveIndex ? "text-white/70 dark:text-zinc-500" : "text-zinc-400"}`}>
                                {command.hint}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-4 text-sm font-semibold text-zinc-500">
                          No matching command.
                        </p>
                      )}
                    </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          <div className="border-t border-zinc-100 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <div>
                {wordCount} words / {content.length} characters
              </div>
              <div>
                {matches.length
                  ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
                  : isMarkdown
                    ? "Markdown ready"
                    : "Plain text"}
              </div>
            </div>
          </div>
        </Card>
      </section>
      <WriteImageEditor
        draft={imageDraft}
        onApply={insertEditedImage}
        onClose={() => setImageDraft(null)}
      />
    </div>
  );
}

