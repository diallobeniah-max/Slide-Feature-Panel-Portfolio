const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
]);

const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
const EXIF_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".tif", ".tiff", ".webp"]);

function waitForTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createMediaId(filePath, stats) {
  return crypto
    .createHash("sha1")
    .update(`${filePath}|${Math.round(stats.mtimeMs)}|${stats.size}`)
    .digest("hex")
    .slice(0, 24);
}

function toIsoDate(value, fallback) {
  if (!value) return fallback.toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

async function readExifDate(filePath, extension, fallbackDate) {
  if (!EXIF_IMAGE_EXTENSIONS.has(extension)) return fallbackDate.toISOString();

  try {
    const exifr = await import("exifr");
    const metadata = await exifr.parse(filePath, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
      translateValues: false,
      reviveValues: true,
      sanitize: true,
    });
    return toIsoDate(
      metadata?.DateTimeOriginal || metadata?.CreateDate || metadata?.ModifyDate,
      fallbackDate,
    );
  } catch {
    return fallbackDate.toISOString();
  }
}

function getMediaType(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "unknown";
}

function createProgressSender(onProgress, startedAt) {
  let lastSentAt = 0;
  return (payload, force = false) => {
    const now = Date.now();
    if (!force && now - lastSentAt < 160) return;
    lastSentAt = now;
    onProgress?.({
      elapsedMs: now - startedAt,
      ...payload,
    });
  };
}

async function scanMediaFolder(rootPath, options = {}) {
  const {
    cancelToken,
    limit = 25000,
    onProgress,
    registerMediaPath,
    registerThumbnailUrl,
    logError,
  } = options;
  const startedAt = Date.now();
  const sendProgress = createProgressSender(onProgress, startedAt);
  const items = [];
  const errors = [];
  const cacheKeys = new Set();
  let scannedFiles = 0;
  let scannedFolders = 0;
  let discoveredFiles = 0;
  let discoveredFolders = 0;
  let skippedFiles = 0;
  let imageCount = 0;
  let videoCount = 0;

  function throwIfCancelled() {
    if (cancelToken?.cancelled) {
      const error = new Error("Gallery scan cancelled.");
      error.code = "GALLERY_SCAN_CANCELLED";
      throw error;
    }
  }

  function sendScanProgress(currentFolder, force = false) {
    sendProgress(
      {
        phase: "scanning",
        found: items.length,
        images: imageCount,
        videos: videoCount,
        skipped: skippedFiles,
        unreadable: errors.length,
        scannedFiles,
        scannedFolders,
        discoveredFiles,
        discoveredFolders,
        currentFolder,
      },
      force,
    );
  }

  const pendingFolders = [rootPath];
  while (pendingFolders.length && items.length < limit) {
    throwIfCancelled();
    const currentPath = pendingFolders.pop();
    let entries = [];
    scannedFolders += 1;
    sendScanProgress(path.basename(currentPath), scannedFolders === 1);
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      skippedFiles += 1;
      errors.push({
        folder: path.basename(currentPath),
        message: error?.message || "Folder could not be read.",
      });
      logError?.("Gallery folder read failed", error, { folderPath: currentPath });
      sendScanProgress(path.basename(currentPath), true);
      continue;
    }

    for (const entry of entries) {
      throwIfCancelled();
      if (items.length >= limit) break;
      if (entry.isSymbolicLink()) {
        skippedFiles += 1;
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        discoveredFolders += 1;
        pendingFolders.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;

      discoveredFiles += 1;
      scannedFiles += 1;
      if (scannedFiles % 80 === 0) {
        sendScanProgress(path.basename(currentPath), true);
        await waitForTurn();
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(extension)) {
        skippedFiles += 1;
        continue;
      }

      try {
        const stats = await fs.stat(entryPath);
        const mediaType = getMediaType(extension);
        const takenAt = await readExifDate(entryPath, extension, stats.mtime);
        const id = createMediaId(entryPath, stats);
        const url = registerMediaPath?.(id, entryPath) || "";
        const thumbnailUrl = registerThumbnailUrl?.(id, entryPath, {
          extension,
          mediaType,
          modifiedAt: stats.mtimeMs,
          size: stats.size,
        }) || "";
        const cacheKey = `${id}:${Math.round(stats.mtimeMs)}:${stats.size}`;
        if (thumbnailUrl) cacheKeys.add(`${id}-${Math.round(stats.mtimeMs)}-${stats.size}`);

        items.push({
          id,
          url,
          thumbnailUrl,
          path: entryPath,
          folderPath: path.dirname(entryPath),
          name: entry.name,
          extension: extension.slice(1),
          type: mediaType,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          takenAt,
          cacheKey,
        });
        if (mediaType === "image") imageCount += 1;
        if (mediaType === "video") videoCount += 1;

        sendScanProgress(path.basename(currentPath));
      } catch (error) {
        skippedFiles += 1;
        errors.push({
          file: entry.name,
          message: error?.message || "File could not be read.",
        });
        logError?.("Gallery media read failed", error, { filePath: entryPath });
      }
    }
  }

  items.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
  sendProgress(
    {
      phase: "done",
      found: items.length,
      images: imageCount,
      videos: videoCount,
      skipped: skippedFiles,
      unreadable: errors.length,
      scannedFiles,
      scannedFolders,
      discoveredFiles,
      discoveredFolders,
    },
    true,
  );

  return {
    items,
    errors: errors.slice(0, 30),
    counts: {
      total: items.length,
      images: imageCount,
      videos: videoCount,
      skipped: skippedFiles,
      unreadable: errors.length,
      scannedFiles,
      scannedFolders,
      discoveredFiles,
      discoveredFolders,
      limitReached: items.length >= limit,
    },
    cacheKeys: [...cacheKeys],
  };
}

module.exports = {
  IMAGE_EXTENSIONS,
  MEDIA_EXTENSIONS,
  VIDEO_EXTENSIONS,
  scanMediaFolder,
};
