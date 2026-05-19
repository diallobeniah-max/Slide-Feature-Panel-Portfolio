export const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "avif",
  "tif",
  "tiff",
]);

export const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
]);

export function isImageMedia(item) {
  return item?.type === "image" || IMAGE_EXTENSIONS.has(String(item?.extension || "").toLowerCase());
}

export function isVideoMedia(item) {
  return item?.type === "video" || VIDEO_EXTENSIONS.has(String(item?.extension || "").toLowerCase());
}

export function formatGalleryCount(counts = {}) {
  const images = counts.images || 0;
  const videos = counts.videos || 0;
  return `${images} image${images === 1 ? "" : "s"} / ${videos} video${videos === 1 ? "" : "s"}`;
}

export function formatShortPath(value = "") {
  const parts = String(value).split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return value;
  return `${parts[0]} / ... / ${parts.slice(-2).join(" / ")}`;
}
