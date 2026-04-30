import React, { useState, useEffect, useRef } from "react";
import {
  Link,
  ExternalLink,
  Check,
  Archive,
  Plus,
  Download,
  Image as ImageIcon,
} from "lucide-react";
import JSZip from "jszip";
import { downloadBlob } from "../utils/media.js";
import { Card, Button, Input, Badge } from "./ui.jsx";

const iconProps = { strokeWidth: 1.75 };

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

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

function mediaKindFromName(name, mime = "") {
  if (mime.startsWith("video/") || /\.(mp4|mov|webm)(\?.*)?$/i.test(name))
    return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|wav|ogg)(\?.*)?$/i.test(name))
    return "audio";
  return "image";
}

function createInstagramFileItem(file) {
  return {
    id: crypto.randomUUID(),
    source: "file",
    type: mediaKindFromName(file.name, file.type),
    name: file.name,
    file,
    url: URL.createObjectURL(file),
    size: file.size,
    selected: true,
  };
}

function createInstagramUrlItem(url) {
  const cleanUrl = url.trim();
  const name =
    cleanUrl.split("/").filter(Boolean).at(-1)?.split("?")[0] ||
    `instagram-media-${Date.now()}`;
  return {
    id: crypto.randomUUID(),
    source: "url",
    type: mediaKindFromName(name),
    name,
    url: cleanUrl,
    size: 0,
    selected: true,
  };
}

export default function InstagramPanel({ initialUrl = "" }) {
  const [postUrl, setPostUrl] = useState(initialUrl);
  const [previewUrl, setPreviewUrl] = useState(() =>
    normalizeInstagramUrl(initialUrl),
  );
  const [mediaUrlText, setMediaUrlText] = useState("");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(
    "Paste a public Instagram link to preview the carousel.",
  );
  const [previewFallback, setPreviewFallback] = useState(false);
  const pickerRef = useRef(null);
  const embedHostRef = useRef(null);

  const selectedItems = items.filter((item) => item.selected);
  const sampleLink =
    "https://www.instagram.com/p/DXm8I0zDE65/?img_index=2&igsh=YnhhczBxdXVlN2x3";

  useEffect(() => {
    if (!initialUrl) return;
    const nextPreview = normalizeInstagramUrl(initialUrl);
    setPostUrl(initialUrl);
    setPreviewUrl(nextPreview);
    if (nextPreview)
      setStatus("Public preview requested from the shared Instagram link.");
  }, [initialUrl]);

  useEffect(() => {
    if (!previewUrl || !embedHostRef.current) return;
    setPreviewFallback(false);

    const processEmbed = () => {
      window.instgrm?.Embeds?.process?.();
    };

    const existingScript = document.querySelector(
      'script[src="https://www.instagram.com/embed.js"]',
    );
    if (existingScript) {
      processEmbed();
    } else {
      const script = document.createElement("script");
      script.src = "https://www.instagram.com/embed.js";
      script.async = true;
      script.onload = processEmbed;
      document.body.appendChild(script);
    }

    const fallbackTimer = window.setTimeout(() => {
      const hasIframe = !!embedHostRef.current?.querySelector("iframe");
      setPreviewFallback(!hasIframe);
    }, 3500);

    return () => window.clearTimeout(fallbackTimer);
  }, [previewUrl]);

  function loadPreview() {
    const nextPreview = normalizeInstagramUrl(postUrl);
    if (!nextPreview) {
      setStatus(
        "That does not look like a public Instagram post, reel, or TV link.",
      );
      return;
    }
    setPreviewUrl(nextPreview);
    setStatus(
      "Public preview requested. If Instagram blocks the embed, use Open Post and collect the saved carousel files.",
    );
  }

  function appendPickedFiles(files) {
    const picked = Array.from(files || []);
    if (!picked.length) return;
    const nextItems = picked.map(createInstagramFileItem);
    setItems((current) => [...current, ...nextItems]);
    setStatus(
      `${nextItems.length} media file${nextItems.length === 1 ? "" : "s"} appended to the Instagram collector.`,
    );
  }

  function appendMediaUrls() {
    const urls = mediaUrlText
      .split(/\s+/)
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//i.test(url));
    if (!urls.length) {
      setStatus("Paste one or more direct media URLs first.");
      return;
    }
    const nextItems = urls.map(createInstagramUrlItem);
    setItems((current) => [...current, ...nextItems]);
    setMediaUrlText("");
    setStatus(
      `${nextItems.length} direct URL${nextItems.length === 1 ? "" : "s"} added to the ZIP collector.`,
    );
  }

  function toggleItem(id) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  }

  async function downloadZip() {
    if (!selectedItems.length) {
      setStatus("Select at least one item before downloading a ZIP.");
      return;
    }

    setStatus("Building selected ZIP...");
    const zip = new JSZip();
    const notes = [];

    for (const item of selectedItems) {
      if (item.file) {
        zip.file(item.name, item.file);
        continue;
      }

      try {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        zip.file(item.name, blob);
      } catch {
        notes.push(`${item.name}: ${item.url}`);
      }
    }

    if (notes.length) {
      zip.file(
        "blocked-remote-files.txt",
        [
          "Some remote media URLs could not be fetched by this website because the host blocked cross-origin downloads.",
          "Open these URLs directly or use the Chrome extension/content-script version for automatic capture.",
          "",
          ...notes,
        ].join("\n"),
      );
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `instagram-carousel-selected-${Date.now()}.zip`);
    setStatus(
      "ZIP ready. Local picked files always export; blocked remote links are listed in the ZIP note.",
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[24em_1fr]">
      <div className="grid content-start gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Link size={14} {...iconProps} className="text-zinc-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Instagram Link
            </p>
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            Carousel Preview
          </h2>
          <div className="mt-6 grid gap-4">
            <Input
              value={postUrl}
              onChange={(event) => setPostUrl(event.target.value)}
              placeholder="https://www.instagram.com/p/..."
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
              >
                Open
              </Button>
              <Button onClick={loadPreview}>Preview</Button>
            </div>
            <Button
              icon={Check}
              variant="secondary"
              onClick={() => {
                setPostUrl(sampleLink);
                setPreviewUrl(normalizeInstagramUrl(sampleLink));
                setStatus(
                  "Test link loaded. Public embed route is reachable for this post.",
                );
              }}
            >
              Load Test Post
            </Button>
          </div>
          <div className="mt-5 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
            <p className="font-mono text-xs font-medium leading-relaxed text-zinc-600 dark:text-zinc-400">
              {status}
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Archive size={14} {...iconProps} className="text-zinc-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Collector
            </p>
          </div>
          <div className="mt-5 grid gap-4">
            <Button icon={Plus} onClick={() => pickerRef.current?.click()}>
              Pick Saved Carousel Media
            </Button>
            <input
              ref={pickerRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => {
                appendPickedFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <textarea
              value={mediaUrlText}
              onChange={(event) => setMediaUrlText(event.target.value)}
              rows={5}
              placeholder="Optional direct CDN/media URLs, one per line..."
              className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 transition-all placeholder:text-zinc-400 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:bg-zinc-900 dark:focus:ring-white/5"
            />
            <Button variant="secondary" icon={Plus} onClick={appendMediaUrls}>
              Add Direct URLs
            </Button>
            <div className="pt-2">
              <Button
                icon={Download}
                onClick={downloadZip}
                disabled={!selectedItems.length}
                className="w-full"
                size="lg"
              >
                Download Selected ZIP ({selectedItems.length})
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card className="overflow-hidden border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-800/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Public Embed
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
              Instagram Carousel Space
            </h2>
          </div>
          <div className="grid min-h-[34em] place-items-center bg-zinc-100/50 p-5 dark:bg-zinc-950/50">
            {previewUrl ? (
              <div
                className="w-full max-w-[40em]"
                ref={embedHostRef}
                key={previewUrl}
              >
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
                {previewFallback && (
                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-white">
                      Instagram did not render the embed in this browser.
                    </p>
                    <p className="mt-2 font-mono text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
                      The link is valid, but Instagram sometimes blocks embedded
                      rendering. Open the post, save the carousel media, then
                      use Pick Saved Carousel Media.
                    </p>
                    <Button
                      className="mt-5"
                      icon={ExternalLink}
                      onClick={() =>
                        window.open(previewUrl, "_blank", "noopener,noreferrer")
                      }
                    >
                      Open Post
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center select-none group cursor-default">
                <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 icon-float">
                  <Link
                    className="text-zinc-400 dark:text-zinc-500 icon-pop"
                    size={26}
                    {...iconProps}
                  />
                </div>
                <p className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                  Paste a public post link
                </p>
                <p className="mt-2 max-w-sm font-mono text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
                  The visible carousel loads here. Browser security prevents
                  reading iframe URLs directly.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Selected Media
              </p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                ZIP Queue
              </h3>
            </div>
            <Badge variant="default" className="mb-1">
              {items.length} collected · {selectedItems.length} selected
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`group relative overflow-hidden rounded-2xl border text-left card-interactive ${
                  item.selected
                    ? "border-zinc-950 shadow-md ring-2 ring-zinc-950/10 dark:border-white dark:ring-white/20"
                    : "border-zinc-200 bg-white shadow-sm hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
                }`}
              >
                <div className="aspect-[4/5] bg-zinc-100 dark:bg-zinc-950/50">
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
                    />
                  )}
                </div>
                <div
                  className={`p-4 transition-colors ${
                    item.selected
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black uppercase tracking-widest">
                      {item.name}
                    </p>
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${
                        item.selected
                          ? "border-transparent bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white"
                          : "border-zinc-300 text-transparent group-hover:border-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      <Check size={12} {...iconProps} />
                    </span>
                  </div>
                  <p
                    className={`mt-2 font-mono text-[10px] font-medium uppercase ${
                      item.selected
                        ? "text-zinc-400 dark:text-zinc-500"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {item.source} · {item.type}{" "}
                    {item.size ? `· ${formatBytes(item.size)}` : ""}
                  </p>
                </div>
              </button>
            ))}

            {items.length === 0 && (
              <div
                className="col-span-full grid min-h-[14rem] place-items-center rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-center dark:border-zinc-800 dark:bg-zinc-900/50 group dropzone-interactive cursor-pointer"
                onClick={() => pickerRef.current?.click()}
              >
                <div className="select-none">
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 icon-float">
                    <ImageIcon
                      className="text-zinc-400 dark:text-zinc-500 icon-pop"
                      size={24}
                      {...iconProps}
                    />
                  </div>
                  <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                    No selected media yet
                  </p>
                  <p className="mt-1 font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Click to pick files or paste direct URLs above.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
