import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  ExternalLink,
  Download,
  FileArchive,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import JSZip from "jszip";
import { downloadBlob } from "../utils/media.js";
import { Button, Card, Badge, Input } from "./ui.jsx";

const iconProps = { strokeWidth: 1.75 };
const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );

/* ── URL helpers ─────────────────────────────────────────────────── */
function normalizeInstagramUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const shortcode = parts[1];
    if (!["p", "reel", "tv"].includes(type) || !shortcode) return "";
    return `https://www.instagram.com/${type}/${shortcode}/`;
  } catch {
    return "";
  }
}

function getShortcode(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[1] || null;
  } catch {
    return null;
  }
}

/* ── Auto-scrape carousel images ─────────────────────────────────── */
const PROXIES = [
  "https://corsproxy.io/?url=",
  "https://api.allorigins.win/raw?url=",
];

/** Fetch a URL through multiple CORS proxies. Returns HTML string or null. */
async function proxyFetch(targetUrl) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(targetUrl), {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return res.text();
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Extract all Instagram CDN image/video URLs from an HTML string.
 * Works on both the embed URL (server-rendered <img> tags) and the main page.
 */
function extractCdnUrls(html) {
  const seen = new Set();
  const items = [];

  // Pattern for Instagram CDN hostnames
  const CDN = "(?:cdninstagram\.com|fbcdn\.net)";

  // ── Videos: .mp4 from CDN ───────────────────────────────────────
  const videoRe = new RegExp(
    `(https://[\\w.-]*${CDN}/[^"'\\s<>]+\.mp4[^"'\\s<>]*)`,
    "g",
  );
  for (const m of html.matchAll(videoRe)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (!seen.has(url)) {
      seen.add(url);
      items.push({
        id: crypto.randomUUID(),
        type: "video",
        url,
        name: `slide_${items.length + 1}.mp4`,
        selected: true,
      });
    }
  }

  // ── Images: CDN URLs that look like post images ─────────────────
  // Instagram post images contain /v/t51. or /v/t50. in the path
  const imgRe = new RegExp(
    `(https://[\\w.-]*${CDN}/v/[^"'\\s<>]+\.(?:jpg|jpeg|webp)[^"'\\s<>]*)`,
    "g",
  );
  for (const m of html.matchAll(imgRe)) {
    const url = m[1].replace(/&amp;/g, "&");
    // Skip profile pics (28x28, 56x56, 150x150)
    if (/\/(?:s28x28|s56x56|s150x150|p28x28|p56x56|p150x150)\//.test(url))
      continue;
    if (!seen.has(url)) {
      seen.add(url);
      items.push({
        id: crypto.randomUUID(),
        type: "image",
        url,
        name: `slide_${items.length + 1}.jpg`,
        selected: true,
      });
    }
  }

  // ── JSON blobs: window.__additionalDataLoaded ────────────────────
  const extraMatch = html.match(
    /window\.__additionalDataLoaded\(['"]extra['"],\s*(\{[\s\S]+?\})\s*\);/,
  );
  if (extraMatch && !items.length) {
    try {
      const data = JSON.parse(extraMatch[1]);
      const media = data?.items?.[0] || data?.media || data;
      const nodes =
        media?.carousel_media || (media?.media_type ? [media] : null);
      nodes?.forEach((node, i) => {
        if (node.media_type === 2 || node.video_versions?.length) {
          const v = (node.video_versions || [])[0];
          if (v && !seen.has(v.url)) {
            seen.add(v.url);
            items.push({
              id: crypto.randomUUID(),
              type: "video",
              url: v.url.replace(/&amp;/g, "&"),
              name: `slide_${i + 1}.mp4`,
              selected: true,
            });
          }
        } else {
          const c = (node.image_versions2?.candidates || [])[0];
          if (c && !seen.has(c.url)) {
            seen.add(c.url);
            items.push({
              id: crypto.randomUUID(),
              type: "image",
              url: c.url.replace(/&amp;/g, "&"),
              name: `slide_${i + 1}.jpg`,
              selected: true,
            });
          }
        }
      });
    } catch {
      /* ignore */
    }
  }

  // ── og:image / og:video meta tags (last resort) ──────────────────
  if (!items.length) {
    for (const m of html.matchAll(
      /content="(https:\/\/[^"]*(?:cdninstagram\.com|fbcdn\.net)[^"]+)"/g,
    )) {
      const url = m[1].replace(/&amp;/g, "&");
      if (!seen.has(url) && !/\/s150x150\//.test(url)) {
        seen.add(url);
        const type = url.includes(".mp4") ? "video" : "image";
        const ext = type === "video" ? "mp4" : "jpg";
        items.push({
          id: crypto.randomUUID(),
          type,
          url,
          name: `slide_${items.length + 1}.${ext}`,
          selected: true,
        });
      }
    }
  }

  return items;
}

async function scrapeCarousel(postUrl) {
  const shortcode = getShortcode(postUrl);
  if (!shortcode) return null;

  /* Strategy 1 ── The embed URL is server-rendered with real <img src="…">
     tags pointing directly at CDN. This is the most reliable source. */
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const embedHtml = await proxyFetch(embedUrl);
  if (embedHtml) {
    const items = extractCdnUrls(embedHtml);
    if (items.length > 0) return items;
  }

  /* Strategy 2 ── Main page HTML (SPA, harder to parse but worth trying) */
  const pageHtml = await proxyFetch(postUrl);
  if (pageHtml) {
    const items = extractCdnUrls(pageHtml);
    if (items.length > 0) return items;
  }

  /* Strategy 3 ── Instagram oEmbed API (no auth needed, public endpoint)
     Only returns the first image/thumbnail but better than nothing. */
  try {
    const oembed = await fetch(
      `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}&format=json`,
      { signal: AbortSignal.timeout(6_000) },
    );
    if (oembed.ok) {
      const data = await oembed.json();
      if (data.thumbnail_url) {
        return [
          {
            id: crypto.randomUUID(),
            type: "image",
            url: data.thumbnail_url,
            name: "slide_1.jpg",
            selected: true,
          },
        ];
      }
    }
  } catch {
    /* offline or blocked */
  }

  return null;
}

/* ── Instagram embed preview ─────────────────────────────────────── */
function EmbedFallback({ previewUrl, onPickFiles, pickerRef }) {
  const hostRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!previewUrl || !hostRef.current) return;
    setFallback(false);
    const process = () => window.instgrm?.Embeds?.process?.();
    const existing = document.querySelector(
      'script[src="https://www.instagram.com/embed.js"]',
    );
    if (existing) {
      process();
    } else {
      const s = document.createElement("script");
      s.src = "https://www.instagram.com/embed.js";
      s.async = true;
      s.onload = process;
      document.body.appendChild(s);
    }
    const t = setTimeout(
      () => setFallback(!hostRef.current?.querySelector("iframe")),
      3500,
    );
    return () => clearTimeout(t);
  }, [previewUrl]);

  return (
    <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-950/50 p-4 flex items-center justify-center min-h-64">
      {previewUrl ? (
        <div className="w-full max-w-[36em]" ref={hostRef} key={previewUrl}>
          <blockquote
            className="instagram-media mx-auto !min-w-0 !max-w-full rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800"
            data-instgrm-permalink={previewUrl}
            data-instgrm-version="14"
            data-instgrm-captioned
            style={{
              background: "#fff",
              border: 0,
              margin: "0 auto",
              maxWidth: "540px",
              minWidth: "326px",
              width: "100%",
            }}
          >
            <a href={previewUrl} target="_blank" rel="noreferrer">
              View this Instagram post
            </a>
          </blockquote>
          {fallback && (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <AlertTriangle
                className="mx-auto mb-2 text-amber-500"
                size={24}
              />
              <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                Instagram blocked the embed
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Open the post, save the images, then pick them below.
              </p>
              <div className="mt-3 flex gap-2 justify-center">
                <Button
                  icon={ExternalLink}
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    window.open(previewUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  Open Post
                </Button>
                <Button
                  icon={Download}
                  size="sm"
                  onClick={() => pickerRef.current?.click()}
                >
                  Pick Saved Files
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center select-none py-8">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 icon-float">
            <Link
              className="text-zinc-400 dark:text-zinc-500 icon-pop"
              size={28}
              {...iconProps}
            />
          </div>
          <p className="text-base font-black italic tracking-tight text-zinc-900 dark:text-zinc-100">
            Paste a public post link
          </p>
          <p className="mt-2 text-xs text-zinc-400 font-medium uppercase tracking-widest">
            Reel · Post · TV
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Main panel ──────────────────────────────────────────────────── */
export default function InstagramPanel({ initialUrl = "" }) {
  const [postUrl, setPostUrl] = useState(initialUrl);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("idle"); // idle | scanning | found | failed
  const [statusMsg, setStatusMsg] = useState("");
  const [items, setItems] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(() =>
    normalizeInstagramUrl(initialUrl),
  );
  const pickerRef = useRef(null);

  const selected = items.filter((i) => i.selected);

  /* ── Auto-trigger on initial URL ─────────────────────────────── */
  useEffect(() => {
    if (initialUrl) loadCarousel(normalizeInstagramUrl(initialUrl));
  }, []);

  /* ── Load carousel ───────────────────────────────────────────── */
  async function loadCarousel(url) {
    const normalized = url || normalizeInstagramUrl(postUrl);
    if (!normalized) {
      setStatusMsg("That doesn't look like a valid Instagram post link.");
      setScanStatus("failed");
      return;
    }
    setPreviewUrl(normalized);
    setScanning(true);
    setScanStatus("scanning");
    setStatusMsg("Scanning carousel for media…");
    setItems([]);

    try {
      const found = await scrapeCarousel(normalized);
      if (found && found.length > 0) {
        setItems(found);
        setScanStatus("found");
        setStatusMsg(
          `Found ${found.length} item${found.length > 1 ? "s" : ""} — select and download below.`,
        );
      } else {
        setScanStatus("failed");
        setStatusMsg(
          'Instagram blocked the scan. The embed below still shows the carousel — scroll through it, then long-press each image in Instagram to save it. After saving, use the "Pick Saved Files" button to load them here.',
        );
      }
    } catch {
      setScanStatus("failed");
      setStatusMsg("Network error — check your connection and try again.");
    } finally {
      setScanning(false);
    }
  }

  /* ── Toggle selection ────────────────────────────────────────── */
  function toggle(id) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)),
    );
  }
  function selectAll() {
    setItems((prev) => prev.map((i) => ({ ...i, selected: true })));
  }
  function deselectAll() {
    setItems((prev) => prev.map((i) => ({ ...i, selected: false })));
  }

  /* ── Individual download ─────────────────────────────────────── */
  async function downloadItem(item) {
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error("Blocked by server");
      const blob = await res.blob();
      downloadBlob(blob, item.name);
    } catch {
      // CORS blocked — open directly
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  }

  /* ── Pick local files as fallback ────────────────────────────── */
  function handlePickedFiles(files) {
    const picked = Array.from(files || []).map((file) => ({
      id: crypto.randomUUID(),
      type: file.type.startsWith("video/") ? "video" : "image",
      url: URL.createObjectURL(file),
      name: file.name,
      file,
      selected: true,
    }));
    if (!picked.length) return;
    setItems((prev) => [...prev, ...picked]);
    setScanStatus("found");
    setStatusMsg(
      `${picked.length} file${picked.length > 1 ? "s" : ""} added manually.`,
    );
  }

  /* ── Download ZIP ────────────────────────────────────────────── */
  async function downloadZip() {
    if (!selected.length) return;
    setScanStatus("scanning");
    setStatusMsg("Building ZIP…");

    const zip = new JSZip();
    const blocked = [];

    for (const item of selected) {
      if (item.file) {
        zip.file(item.name, item.file);
        continue;
      }
      try {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error();
        zip.file(item.name, await res.blob());
      } catch {
        blocked.push(item);
      }
    }

    if (blocked.length) {
      zip.file(
        "blocked.txt",
        blocked.map((b) => b.url).join("\n") +
          "\n\nThese URLs were blocked by Instagram's CDN. Open each link directly in your browser to save manually.",
      );
    }

    const bundle = await zip.generateAsync({ type: "blob" });
    downloadBlob(bundle, `carousel_${Date.now()}.zip`);
    setScanStatus("found");
    setStatusMsg(
      `ZIP ready — ${selected.length - blocked.length} files exported${blocked.length ? `, ${blocked.length} blocked (see blocked.txt)` : ""}.`,
    );
    notify("Carousel Saved", `${selected.length} items downloaded as ZIP.`);
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[26em_1fr]">
      {/* ── Left sidebar ──────────────────────────────────────────── */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="p-5 flex flex-col gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Carousel Capture
            </p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Instagram Download
            </h2>
          </div>

          {/* URL input */}
          <Input
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="https://www.instagram.com/p/..."
            onKeyDown={(e) => e.key === "Enter" && loadCarousel()}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              icon={ExternalLink}
              variant="secondary"
              onClick={() =>
                postUrl &&
                window.open(
                  normalizeInstagramUrl(postUrl) || postUrl,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              disabled={!postUrl}
            >
              Open Post
            </Button>
            <Button
              icon={scanning ? Loader2 : RefreshCw}
              onClick={() => loadCarousel()}
              disabled={!postUrl || scanning}
            >
              {scanning ? "Scanning…" : "Load Carousel"}
            </Button>
          </div>

          {/* Status */}
          {statusMsg && (
            <div
              className={`flex items-start gap-2 rounded-2xl p-3 text-[11px] font-medium ${
                scanStatus === "found"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                  : scanStatus === "failed"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                    : scanStatus === "scanning"
                      ? "bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400"
                      : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {scanStatus === "scanning" && (
                <Loader2 size={14} className="animate-spin shrink-0 mt-0.5" />
              )}
              {scanStatus === "found" && (
                <Check size={14} className="shrink-0 mt-0.5" />
              )}
              {scanStatus === "failed" && (
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMsg}</span>
            </div>
          )}

          {/* Manual file pick fallback */}
          <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
              Import Saved Files
            </p>
            <Button
              icon={Download}
              variant="secondary"
              className="w-full"
              onClick={() => pickerRef.current?.click()}
            >
              Add Files from Disk
            </Button>
            <input
              ref={pickerRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                handlePickedFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="mt-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                How to save from Instagram
              </p>
              <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                1. Open the post in Instagram
                <br />
                2. Tap the three-dot menu ⋯ →{" "}
                <strong className="text-zinc-600 dark:text-zinc-300">
                  Save
                </strong>{" "}
                or long-press each image
                <br />
                3. Find the saved file in Photos / Downloads
                <br />
                4. Click{" "}
                <strong className="text-zinc-600 dark:text-zinc-300">
                  Add Files from Disk
                </strong>{" "}
                above
              </p>
            </div>
          </div>
        </Card>

        {/* ZIP download card */}
        {items.length > 0 && (
          <Card className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Queue
                </p>
                <p className="mt-0.5 text-sm font-black text-zinc-900 dark:text-zinc-100">
                  {selected.length} / {items.length} selected
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={selectAll}
                  className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                  All
                </button>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <button
                  onClick={deselectAll}
                  className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                  None
                </button>
              </div>
            </div>
            <Button
              icon={FileArchive}
              className="w-full"
              disabled={!selected.length || scanning}
              onClick={downloadZip}
            >
              Download ZIP ({selected.length})
            </Button>
          </Card>
        )}
      </aside>

      {/* ── Right — media grid + embed ─────────────────────────────── */}
      <section className="grid content-start gap-5 panel-enter-main">
        {/* Scanned media grid */}
        {items.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Carousel Media
                </p>
                <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
                  {items.length} item{items.length > 1 ? "s" : ""} found
                </h3>
              </div>
              <Badge variant={scanStatus === "found" ? "success" : "default"}>
                {scanStatus === "found" ? "Auto-scanned" : "Manual"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`group relative overflow-hidden rounded-2xl border text-left cursor-pointer card-interactive transition-all ${
                    item.selected
                      ? "border-zinc-950 ring-2 ring-zinc-950/10 dark:border-white dark:ring-white/15"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                    {item.type === "video" ? (
                      <video
                        src={item.url}
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={item.url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    )}
                  </div>

                  {/* Checkbox overlay */}
                  <div
                    className={`absolute top-2 left-2 grid h-5 w-5 place-items-center rounded-full border-2 shadow-sm transition-all ${
                      item.selected
                        ? "border-zinc-950 bg-zinc-950 dark:border-white dark:bg-white"
                        : "border-white/70 bg-black/20 group-hover:bg-black/40"
                    }`}
                  >
                    {item.selected && (
                      <Check
                        size={11}
                        className="text-white dark:text-zinc-950"
                        strokeWidth={3}
                      />
                    )}
                  </div>

                  {/* Type badge */}
                  <div className="absolute top-2 right-2 rounded-lg bg-black/60 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
                    {item.type}
                  </div>

                  {/* Filename + download */}
                  <div
                    className={`px-2.5 py-2 flex items-center justify-between gap-1 transition-colors ${
                      item.selected
                        ? "bg-zinc-950 dark:bg-white"
                        : "bg-white dark:bg-zinc-900"
                    }`}
                  >
                    <p
                      className={`truncate text-[9px] font-black uppercase tracking-widest ${
                        item.selected
                          ? "text-white dark:text-zinc-950"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {item.name}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadItem(item);
                      }}
                      className={`shrink-0 grid h-6 w-6 place-items-center rounded-lg transition-colors ${
                        item.selected
                          ? "text-white/70 hover:text-white dark:text-zinc-950/70 dark:hover:text-zinc-950"
                          : "text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                      }`}
                      title="Download this item"
                    >
                      <Download size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Embed preview (always shown for context / fallback) */}
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Instagram Embed
            </p>
            <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Post Preview
            </h3>
          </div>
          <div className="p-4">
            <EmbedFallback
              previewUrl={previewUrl}
              onPickFiles={handlePickedFiles}
              pickerRef={pickerRef}
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
