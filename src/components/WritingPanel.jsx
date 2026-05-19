import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  Edit3,
  Eye,
  FileText,
  Italic,
  List,
  ListOrdered,
  Quote,
  Replace as ReplaceIcon,
  RotateCcw,
  Search,
  Type,
  Underline,
  Upload,
} from "lucide-react";
import { Button, Card, Input } from "./ui.jsx";
import FloatingToolPanel from "./ui/FloatingToolPanel.jsx";
import PanelPopupButton from "./ui/PanelPopupButton.jsx";
import { downloadBlob } from "../utils/media.js";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28];
const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Mono" },
];
const WRITE_STATE_KEY = "contentflow-write-state-v1";

function loadWriteState() {
  try {
    return JSON.parse(localStorage.getItem(WRITE_STATE_KEY) || "{}");
  } catch {
    return {};
  }
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

function applyInlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/60 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-black">$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em class="italic">$1</em>')
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u class="underline">$1</u>');
}

function parseMarkdown(text) {
  if (!text.trim()) {
    return '<p class="text-zinc-400">Paste or type your writing here.</p>';
  }

  const lines = escapeHtml(text).split(/\r?\n/);
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

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType && listType !== "unordered") flushList();
      listType = "unordered";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType && listType !== "ordered") flushList();
      listType = "ordered";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();

    const quote = trimmed.match(/^&gt;\s?(.+)$/);
    if (quote) {
      html.push(
        `<blockquote class="mb-4 border-l-4 border-zinc-300 pl-4 font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">${applyInlineMarkdown(
          quote[1],
        )}</blockquote>`,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const sizes = {
        1: "text-2xl",
        2: "text-xl",
        3: "text-lg",
      };
      html.push(
        `<h${level} class="${sizes[level]} mb-3 mt-5 font-black">${applyInlineMarkdown(
          heading[2],
        )}</h${level}>`,
      );
      continue;
    }

    html.push(`<p class="mb-4">${applyInlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  return html.join("");
}

export default function WritingPanel() {
  const savedWriteState = useMemo(loadWriteState, []);
  const [content, setContent] = useState(savedWriteState.content || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showSearchReplace, setShowSearchReplace] = useState(true);
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [fontSize, setFontSize] = useState(savedWriteState.fontSize || 16);
  const [fontFamily, setFontFamily] = useState(savedWriteState.fontFamily || "sans-serif");
  const [textAlign, setTextAlign] = useState(savedWriteState.textAlign || "left");
  const [fileName, setFileName] = useState(savedWriteState.fileName || "document.md");
  const [isMarkdown, setIsMarkdown] = useState(savedWriteState.isMarkdown !== false);
  const [isPreview, setIsPreview] = useState(Boolean(savedWriteState.isPreview));
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const matches = useMemo(
    () => findMatches(content, searchTerm, caseSensitive, wholeWord),
    [caseSensitive, content, searchTerm, wholeWord],
  );
  const wordCount = useMemo(
    () => (content.match(/[\p{L}\p{N}'-]+/gu) || []).length,
    [content],
  );

  useEffect(() => {
    if (!matches.length) {
      setCurrentMatch(-1);
      return;
    }
    setCurrentMatch((current) =>
      current < 0 || current >= matches.length ? 0 : current,
    );
  }, [matches.length]);

  useEffect(() => {
    const nextState = {
      content,
      fileName,
      fontSize,
      fontFamily,
      textAlign,
      isMarkdown,
      isPreview,
    };
    localStorage.setItem(WRITE_STATE_KEY, JSON.stringify(nextState));
    const hasUnsaved = Boolean(content.trim());
    window.dispatchEvent(
      new CustomEvent("contentflow-unsaved-state", {
        detail: { source: "write", hasUnsaved },
      }),
    );
    window.contentFlow?.appState?.setUnsaved?.(hasUnsaved, "write");
  }, [content, fileName, fontFamily, fontSize, isMarkdown, isPreview, textAlign]);

  function selectMatch(index) {
    const match = matches[index];
    if (!match || !textareaRef.current) return;
    setCurrentMatch(index);
    setIsPreview(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(match.index, match.index + match.length);
    });
  }

  function replaceSelection(nextText, nextSelectionStart, nextSelectionEnd) {
    setContent(nextText);
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

    replaceSelection(nextText, selectionStart, selectionEnd);
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

    replaceSelection(nextText, lineStart, lineStart + transformed.length);
  }

  function handlePaste(event) {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    const textarea = textareaRef.current;
    if (!textarea || !text) return;

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const nextText = content.slice(0, start) + text + content.slice(end);
    replaceSelection(nextText, start + text.length, start + text.length);
  }

  function findNext() {
    if (!matches.length) return;
    selectMatch((currentMatch + 1 + matches.length) % matches.length);
  }

  function findPrevious() {
    if (!matches.length) return;
    selectMatch((currentMatch - 1 + matches.length) % matches.length);
  }

  function replaceCurrent() {
    const index = currentMatch >= 0 ? currentMatch : 0;
    const match = matches[index];
    if (!match) return;

    const nextText =
      content.slice(0, match.index) +
      replaceTerm +
      content.slice(match.index + match.length);
    setContent(nextText);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        match.index,
        match.index + replaceTerm.length,
      );
    });
  }

  function replaceAll() {
    const regex = buildFindRegex(searchTerm, caseSensitive, wholeWord);
    if (!regex || !matches.length) return;

    const replacedCount = matches.length;
    setContent(content.replace(regex, replaceTerm));
    setCurrentMatch(-1);
    notify("Replaced", `${replacedCount} match${replacedCount === 1 ? "" : "es"} updated.`);
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
      setContent(String(readerEvent.target?.result || ""));
      setFileName(file.name);
      notify("Loaded", `${file.name} loaded.`);
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function resetDocument() {
    setContent("");
    setSearchTerm("");
    setReplaceTerm("");
    setCurrentMatch(-1);
  }

  const editorStyle = {
    fontSize: `${fontSize}px`,
    fontFamily,
    lineHeight: 1.65,
    textAlign,
  };

  const renderControlPanel = () => (
    <>
      <Card className="p-5">
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
          <Input
            label="File Name"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="document.md"
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Font Size
              <select
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 font-mono text-base font-black text-zinc-900 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-white"
              >
                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Font
              <select
                value={fontFamily}
                onChange={(event) => setFontFamily(event.target.value)}
                className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 font-mono text-base font-black text-zinc-900 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-white"
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <button
              type="button"
              onClick={() => setIsMarkdown((value) => !value)}
              aria-pressed={isMarkdown}
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

      <Card className="p-5">
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
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search text..."
            />
            <Input
              label="Replace"
              value={replaceTerm}
              onChange={(event) => setReplaceTerm(event.target.value)}
              placeholder="Replace with..."
            />

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/60 p-1 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setCaseSensitive((value) => !value)}
                aria-pressed={caseSensitive}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${
                  caseSensitive
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-white/60"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    caseSensitive ? "bg-emerald-500" : "bg-zinc-400"
                  }`}
                />
                Match Case
              </button>
              <button
                type="button"
                onClick={() => setWholeWord((value) => !value)}
                aria-pressed={wholeWord}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${
                  wholeWord
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-white/60"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    wholeWord ? "bg-emerald-500" : "bg-zinc-400"
                  }`}
                />
                Whole Word
              </button>
            </div>

            <div className="rounded-xl bg-white px-3 py-2 font-mono text-xs text-zinc-500 dark:bg-zinc-950/60 dark:text-zinc-400">
              {matches.length
                ? `${currentMatch + 1} of ${matches.length} matches`
                : searchTerm
                  ? "No matches"
                  : "Enter text to search"}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={findPrevious} disabled={!matches.length}>
                Previous
              </Button>
              <Button size="sm" onClick={findNext} disabled={!matches.length}>
                Next
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                icon={ReplaceIcon}
                variant="secondary"
                onClick={replaceCurrent}
                disabled={!matches.length}
              >
                Replace
              </Button>
              <Button
                size="sm"
                icon={ReplaceIcon}
                variant="secondary"
                onClick={replaceAll}
                disabled={!matches.length}
              >
                All
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
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
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:min-h-[calc(100vh-5.5rem)] lg:grid-cols-[22em_minmax(0,1fr)]">
      <aside
        className="grid content-start gap-5 panel-enter-aside lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1"
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
        defaultSize={{ width: 340, height: 520 }}
      >
        {renderControlPanel()}
      </FloatingToolPanel>

      <section className="panel-enter-main lg:sticky lg:top-24 lg:h-[calc(100vh-7.5rem)]">
        <Card className="overflow-hidden lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
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
              <div
                className="h-[60vh] w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-4 leading-relaxed outline-none dark:border-zinc-800 dark:bg-zinc-900 lg:h-full"
                style={editorStyle}
                dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onPaste={handlePaste}
                placeholder="Paste or type your writing here..."
                className="h-[60vh] w-full resize-none rounded-xl border border-zinc-200 bg-white p-4 leading-relaxed outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-white lg:h-full"
                style={editorStyle}
                spellCheck
              />
            )}
          </div>

          <div className="border-t border-zinc-100 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <div>
                {wordCount} words / {content.length} characters
              </div>
              <div>
                {matches.length
                  ? `${currentMatch + 1}/${matches.length} matches`
                  : isMarkdown
                    ? "Markdown ready"
                    : "Plain text"}
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

