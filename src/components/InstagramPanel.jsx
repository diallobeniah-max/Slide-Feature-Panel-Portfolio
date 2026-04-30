import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  ExternalLink,
  Download,
  FileArchive,
  Loader2,
  RefreshCw,
  X,
  AlertTriangle,
  Film,
  Image as ImageIcon,
  Layers,
} from "lucide-react";
import JSZip from "jszip";
import { downloadBlob } from "../utils/media.js";
import { Button, Card, Badge, Input } from "./ui.jsx";

const iconProps = { strokeWidth: 1.75 };
const notify = (title, message, type = "success") =>
  window.dispatchEvent(
    new CustomEvent("studio-notify", { detail: { title, message, type } }),
  );

/* ── URL helpers ───────────────────────────────────────────────────── */
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
    if (!["p", "reel", "reels", "tv"].includes(type) || !shortcode) return "";
    return `https://www.instagram.com/${type}/${shortcode}/`;
  } catch {
    return "";
  }
}

function getShortcode(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean)[1] || null;
  } catch {
    return null;
  }
}

function detectType(url) {
  if (/\/(reel|reels)\//.test(url)) return "reel";
  return "post";
}

/* ── CORS proxy fetch ─────────────────────────────────────────────── */
const PROXIES = [
  "https://corsproxy.io/?url=",
  "https://api.allorigins.win/raw?url=",
];

async function proxyFetch(targetUrl) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(targetUrl), {
        headers: { Accept: "text/html,application/xhtml+xml,*/*" },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return res.text();
    } catch {
      /* next */
    }
  }
  return null;
}

/* ── Extract CDN URLs from HTML ─────────────────────────────────────── */
function extractCdnUrls(html) {
  const seen = new Set();
  const items = [];
  const CDN = "(?:cdninstagram\\.com|fbcdn\\.net)";

  // Videos (.mp4)
  for (const m of html.matchAll(
    new RegExp(`(https://[\\w.-]*${CDN}/[^"'\\s<>]+\\.mp4[^"'\\s<>]*)`, "g"),
  )) {
    const url = m[1].replace(/&amp;/g, "&");
    if (!seen.has(url)) {
      seen.add(url);
      items.push({
        id: crypto.randomUUID(),
        type: "video",
        url,
        name: `slide_${items.length + 1}.mp4`,
      });
    }
  }

  // Images with /v/t51. path (post images, not icons)
  for (const m of html.matchAll(
    new RegExp(
      `(https://[\\w.-]*${CDN}/v/[^"'\\s<>]+\\.(?:jpg|jpeg|webp)[^"'\\s<>]*)`,
      "g",
    ),
  )) {
    const url = m[1].replace(/&amp;/g, "&");
    if (/\/(?:s28x28|s56x56|s150x150|p28x28|p56x56|p150x150)\//.test(url))
      continue;
    if (!seen.has(url)) {
      seen.add(url);
      items.push({
        id: crypto.randomUUID(),
        type: "image",
        url,
        name: `slide_${items.length + 1}.jpg`,
      });
    }
  }

  // JSON blob fallback
  if (!items.length) {
    const extra = html.match(
      /window\.__additionalDataLoaded\(['"]extra['"],\s*(\{[\s\S]+?\})\s*\);/,
    );
    if (extra) {
      try {
        const data = JSON.parse(extra[1]);
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
              });
            }
          }
        });
      } catch {
        /* ignore */
      }
    }
  }

  // og:image/og:video last resort
  if (!items.length) {
    for (const m of html.matchAll(
      /content="(https:\/\/[^"]*(?:cdninstagram\.com|fbcdn\.net)[^"]+)"/g,
    )) {
      const url = m[1].replace(/&amp;/g, "&");
      if (!seen.has(url) && !/\/s150x150\//.test(url)) {
        seen.add(url);
        const type = url.includes(".mp4") ? "video" : "image";
        items.push({
          id: crypto.randomUUID(),
          type,
          url,
          name: `slide_${items.length + 1}.${type === "video" ? "mp4" : "jpg"}`,
        });
      }
    }
  }

  return items;
}

/* ── Full scrape pipeline ──────────────────────────────────────────── */
async function scrapeCarousel(postUrl) {
  const shortcode = getShortcode(postUrl);
  if (!shortcode) return null;

  // Try embed URL first (server-rendered HTML with real <img src="..."> tags)
  const embedHtml = await proxyFetch(
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
  );
  if (embedHtml) {
    const items = extractCdnUrls(embedHtml);
    if (items.length) return items;
  }

  // Try main page
  const pageHtml = await proxyFetch(postUrl);
  if (pageHtml) {
    const items = extractCdnUrls(pageHtml);
    if (items.length) return items;
  }

  return null;
}

/* ── Embed iframe component ────────────────────────────────────────── */
function EmbedView({ previewUrl, pickerRef, onPickFiles }) {
  const hostRef = useRef(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!previewUrl || !hostRef.current) return;
    setBlocked(false);
    const run = () => window.instgrm?.Embeds?.process?.();
    const existing = document.querySelector(
      'script[src="https://www.instagram.com/embed.js"]',
    );
    if (existing) run();
    else {
      const s = document.createElement("script");
      s.src = "https://www.instagram.com/embed.js";
      s.async = true;
      s.onload = run;
      document.body.appendChild(s);
    }
    const t = setTimeout(
      () => setBlocked(!hostRef.current?.querySelector("iframe")),
      3500,
    );
    return () => clearTimeout(t);
  }, [previewUrl]);

  if (!previewUrl) return null;

  return (
    <div>
      <div ref={hostRef} key={previewUrl} className="w-full max-w-lg mx-auto">
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
      </div>
      {blocked && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-800/30 dark:bg-amber-950/20">
          <AlertTriangle className="mx-auto mb-2 text-amber-500" size={20} />
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Embed blocked by Instagram
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
              Open in Instagram
            </Button>
            <Button
              icon={Download}
              size="sm"
              onClick={() => pickerRef.current?.click()}
            >
              Add Saved Files
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main panel ────────────────────────────────────────────────────── */
export default function InstagramPanel({ initialUrl = "" }) {
  const [postUrl, setPostUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(() =>
    normalizeInstagramUrl(initialUrl),
  );
  const [postMeta, setPostMeta] = useState(null); // { author, thumbnail, type }
  const [phase, setPhase] = useState("idle"); // idle | loading | done | failed
  const [phaseMsg, setPhaseMsg] = useState("");
  const pickerRef = useRef(null);

  // Auto-trigger on initial URL
  useEffect(() => {
    if (initialUrl) loadPost(normalizeInstagramUrl(initialUrl));
  }, []);

  /* ── Load post ─────────────────────────────────────────────────── */
  async function loadPost(url) {
    const normalized = url || normalizeInstagramUrl(postUrl);
    if (!normalized) {
      setPhaseMsg("Not a valid Instagram link.");
      setPhase("failed");
      return;
    }

    setPreviewUrl(normalized);
    setItems([]);
    setPostMeta(null);
    setLoading(true);
    setPhase("loading");

    const postType = detectType(normalized);

    // ── Step 1: oEmbed — instant thumbnail (no proxy, direct API)
    setPhaseMsg(
      postType === "reel"
        ? "Detected: Reel · loading preview…"
        : "Detected: Post · loading preview…",
    );
    try {
      const res = await fetch(
        `https://api.instagram.com/oembed/?url=${encodeURIComponent(normalized)}&format=json`,
        { signal: AbortSignal.timeout(6_000) },
      );
      if (res.ok) {
        const data = await res.json();
        const meta = {
          author: data.author_name,
          thumbnail: data.thumbnail_url,
          type: postType,
        };
        setPostMeta(meta);
        if (data.thumbnail_url) {
          // Show thumbnail immediately as first item while scraping continues
          setItems([
            {
              id: crypto.randomUUID(),
              type: "image",
              url: data.thumbnail_url,
              name: "preview.jpg",
              source: "oembed",
            },
          ]);
          setPhaseMsg(`Preview ready · scanning for full carousel…`);
        }
      }
    } catch {
      /* no oembed — continue to scraping */
    }

    // ── Step 2: Scrape for full-res images
    try {
      const scraped = await scrapeCarousel(normalized);
      if (scraped && scraped.length > 0) {
        setItems(scraped);
        setPhase("done");
        setPhaseMsg(
          `${scraped.length} item${scraped.length > 1 ? "s" : ""} extracted — ready to download.`,
        );
        notify(
          "Carousel Ready",
          `${scraped.length} items loaded from Instagram.`,
        );
      } else {
        // Keep the oembed thumbnail if we got one, otherwise fail
        setPhase(items.length > 0 ? "partial" : "failed");
        setPhaseMsg(
          items.length > 0
            ? "Only the preview thumbnail was available — Instagram blocked full extraction. You can still download the preview, or use Add Saved Files."
            : "Instagram blocked all extraction. Open the post, save each image, then use Add Saved Files below.",
        );
      }
    } catch (err) {
      setPhase("failed");
      setPhaseMsg("Network error — check your connection.");
    }

    setLoading(false);
  }

  /* ── Download single item ──────────────────────────────────────── */
  async function downloadOne(item) {
    if (item.file) {
      downloadBlob(item.file, item.name);
      return;
    }
    try {
      const res = await fetch(item.url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error();
      downloadBlob(await res.blob(), item.name);
    } catch {
      // CDN blocked CORS — open directly in new tab
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  }

  /* ── Delete single item ────────────────────────────────────────── */
  const deleteOne = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

  /* ── Download all as ZIP ───────────────────────────────────────── */
  async function downloadAll() {
    if (!items.length) return;
    setPhase("loading");
    setPhaseMsg("Building ZIP…");
    const zip = new JSZip();
    const blocked = [];
    for (const item of items) {
      if (item.file) {
        zip.file(item.name, item.file);
        continue;
      }
      try {
        const res = await fetch(item.url, {
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          zip.file(item.name, await res.blob());
          continue;
        }
      } catch {
        /* fall through */
      }
      blocked.push(item);
    }
    if (blocked.length) {
      zip.file(
        "blocked_urls.txt",
        blocked.map((b) => `${b.name}: ${b.url}`).join("\n") +
          "\n\nThese CDN URLs were blocked. Open each in a browser tab to save manually.",
      );
    }
    const bundle = await zip.generateAsync({ type: "blob" });
    downloadBlob(bundle, `instagram_${Date.now()}.zip`);
    setPhase("done");
    setPhaseMsg(
      `ZIP ready — ${items.length - blocked.length} exported${blocked.length ? `, ${blocked.length} blocked (see blocked_urls.txt)` : ""}.`,
    );
    notify("Downloaded", `${items.length} Instagram files saved.`);
  }

  /* ── Pick files manually ───────────────────────────────────────── */
  function handlePick(files) {
    const picked = Array.from(files || []).map((file) => ({
      id: crypto.randomUUID(),
      type: file.type.startsWith("video/") ? "video" : "image",
      url: URL.createObjectURL(file),
      name: file.name,
      file,
      source: "manual",
    }));
    if (!picked.length) return;
    setItems((prev) => [...prev, ...picked]);
    setPhase("done");
    setPhaseMsg(`${picked.length} file${picked.length > 1 ? "s" : ""} added.`);
  }

  /* ── Status colors ─────────────────────────────────────────────── */
  const statusStyle =
    phase === "done"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30"
      : phase === "failed"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-amber-200 dark:border-amber-800/30"
        : phase === "partial"
          ? "bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border-sky-200 dark:border-sky-800/30"
          : phase === "loading"
            ? "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
            : "";

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[26em_1fr]">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
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
            onKeyDown={(e) => e.key === "Enter" && loadPost()}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              icon={ExternalLink}
              variant="secondary"
              disabled={!postUrl}
              onClick={() =>
                postUrl &&
                window.open(
                  normalizeInstagramUrl(postUrl) || postUrl,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Open Post
            </Button>
            <Button
              icon={loading ? Loader2 : RefreshCw}
              disabled={!postUrl || loading}
              onClick={() => loadPost()}
            >
              {loading ? "Loading…" : "Load"}
            </Button>
          </div>

          {/* Post meta */}
          {postMeta && (
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
              {postMeta.thumbnail && (
                <img
                  src={postMeta.thumbnail}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-zinc-200 dark:border-zinc-700"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black text-zinc-900 dark:text-zinc-100">
                  @{postMeta.author}
                </p>
                <Badge
                  variant={postMeta.type === "reel" ? "warning" : "default"}
                  className="mt-1"
                >
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
            </div>
          )}

          {/* Status */}
          {phaseMsg && (
            <div
              className={`flex items-start gap-2 rounded-2xl border p-3 text-[11px] font-medium ${statusStyle}`}
            >
              {loading && (
                <Loader2 size={13} className="animate-spin shrink-0 mt-0.5" />
              )}
              {phase === "failed" && (
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{phaseMsg}</span>
            </div>
          )}

          {/* Download all / clear all */}
          {items.length > 0 && !loading && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                icon={FileArchive}
                onClick={downloadAll}
                className="w-full"
              >
                Download All
              </Button>
              <Button
                variant="secondary"
                icon={X}
                onClick={() => {
                  setItems([]);
                  setPhase("idle");
                  setPhaseMsg("");
                  setPostMeta(null);
                  setPostUrl("");
                  setPreviewUrl("");
                }}
              >
                Clear
              </Button>
            </div>
          )}

          {/* Separator + manual pick */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 flex flex-col gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Add Files Manually
            </p>
            <Button
              icon={Download}
              variant="secondary"
              className="w-full"
              onClick={() => pickerRef.current?.click()}
            >
              Add Saved Files from Disk
            </Button>
            <input
              ref={pickerRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                handlePick(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5">
                If auto-scan fails
              </p>
              <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                1. Open post in Instagram
                <br />
                2. Tap ⋯ →{" "}
                <strong className="text-zinc-600 dark:text-zinc-300">
                  Save
                </strong>{" "}
                for each slide
                <br />
                3. Click{" "}
                <strong className="text-zinc-600 dark:text-zinc-300">
                  Add Saved Files from Disk
                </strong>
              </p>
            </div>
          </div>
        </Card>
      </aside>

      {/* ── Right: media grid + embed ──────────────────────────────── */}
      <section className="grid content-start gap-5 panel-enter-main">
        {/* Media grid */}
        {items.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Media
                </p>
                <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
                  {items.length} item{items.length > 1 ? "s" : ""}
                </h3>
              </div>
              {/* Source badge */}
              {items[0]?.source === "oembed" ? (
                <Badge variant="warning">Preview only</Badge>
              ) : (
                <Badge variant="success">Full resolution</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 card-hover"
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
                          e.target.parentElement.innerHTML = `<div class="w-full h-full flex items-center justify-center text-zinc-400"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>`;
                        }}
                      />
                    )}
                  </div>

                  {/* Type pill */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 rounded-lg bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                    {item.type === "video" ? (
                      <Film size={9} className="text-white" />
                    ) : (
                      <ImageIcon size={9} className="text-white" />
                    )}
                    <span className="text-[9px] font-black uppercase tracking-widest text-white">
                      {item.type}
                    </span>
                  </div>

                  {/* Action buttons (appear on hover) */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => downloadOne(item)}
                      className="grid h-7 w-7 place-items-center rounded-xl bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white shadow-sm backdrop-blur-sm hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                      title="Download"
                    >
                      <Download size={13} />
                    </button>
                    <button
                      onClick={() => deleteOne(item.id)}
                      className="grid h-7 w-7 place-items-center rounded-xl bg-white/90 dark:bg-zinc-900/90 text-rose-500 shadow-sm backdrop-blur-sm hover:bg-rose-500 hover:text-white transition-colors"
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Filename bar */}
                  <div className="px-2.5 py-2 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="truncate text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                      {item.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Empty state */}
        {!items.length && !loading && (
          <Card className="overflow-hidden">
            <div className="p-4 bg-zinc-100 dark:bg-zinc-950/60 flex items-center justify-center min-h-48">
              <div className="text-center select-none group cursor-default">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 icon-float">
                  <Link
                    className="text-zinc-400 dark:text-zinc-500 icon-pop"
                    size={28}
                    {...iconProps}
                  />
                </div>
                <p className="text-base font-black italic tracking-tight text-zinc-900 dark:text-zinc-100">
                  Paste a link and tap Load
                </p>
                <p className="mt-2 text-xs text-zinc-400 font-medium uppercase tracking-widest">
                  Post · Reel · Carousel
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Instagram embed (always shown when URL is set) */}
        {previewUrl && (
          <Card className="overflow-hidden">
            <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Live Embed
              </p>
              <h3 className="mt-0.5 text-xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
                Instagram Preview
              </h3>
            </div>
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50">
              <EmbedView
                previewUrl={previewUrl}
                pickerRef={pickerRef}
                onPickFiles={handlePick}
              />
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
