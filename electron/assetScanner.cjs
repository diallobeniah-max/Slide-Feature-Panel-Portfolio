const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ASSET_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff", ".svg",
  ".mp4", ".mov", ".webm", ".mkv", ".avi",
  ".psd", ".psb",
  ".afphoto", ".afdesign", ".afpub", ".af",
  ".pdf", ".ai", ".eps", ".indd", ".xd",
]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);
const PSD_EXTENSIONS = new Set([".psd", ".psb"]);
const AFFINITY_EXTENSIONS = new Set([".afphoto", ".afdesign", ".afpub", ".af"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".ai", ".eps", ".indd", ".xd"]);

function waitForTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createAssetId(filePath, stats) {
  return crypto
    .createHash("sha1")
    .update(`asset|${filePath}|${Math.round(stats.mtimeMs)}|${stats.size}`)
    .digest("hex")
    .slice(0, 24);
}

function getAssetType(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (PSD_EXTENSIONS.has(extension)) return "psd";
  if (AFFINITY_EXTENSIONS.has(extension)) return "affinity";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "other";
}

function createProgressSender(onProgress, startedAt) {
  let lastSentAt = 0;
  return (payload, force = false) => {
    const now = Date.now();
    if (!force && now - lastSentAt < 160) return;
    lastSentAt = now;
    onProgress?.({ elapsedMs: now - startedAt, ...payload });
  };
}

async function scanAssetFolder(rootPath, options = {}) {
  const { cancelToken, limit = 30000, onProgress, registerAssetPath, registerAssetThumbnailUrl, logError } = options;
  const startedAt = Date.now();
  const sendProgress = createProgressSender(onProgress, startedAt);
  const items = [];
  const errors = [];
  const counts = { total: 0, images: 0, videos: 0, psd: 0, affinity: 0, documents: 0, skipped: 0, unreadable: 0, scannedFiles: 0, scannedFolders: 0, discoveredFiles: 0, discoveredFolders: 0, limitReached: false };

  function throwIfCancelled() {
    if (cancelToken?.cancelled) {
      const error = new Error("Assets scan cancelled.");
      error.code = "ASSETS_SCAN_CANCELLED";
      throw error;
    }
  }

  function emit(currentFolder, force = false) {
    sendProgress({ phase: "scanning", found: items.length, currentFolder, ...counts }, force);
  }

  const pendingFolders = [rootPath];
  while (pendingFolders.length && items.length < limit) {
    throwIfCancelled();
    const currentPath = pendingFolders.pop();
    counts.scannedFolders += 1;
    emit(path.basename(currentPath), counts.scannedFolders === 1);

    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      counts.skipped += 1;
      counts.unreadable += 1;
      errors.push({ folder: path.basename(currentPath), message: error?.message || "Folder could not be read." });
      logError?.("Assets folder read failed", error, { folderPath: currentPath });
      continue;
    }

    for (const entry of entries) {
      throwIfCancelled();
      if (items.length >= limit) break;
      if (entry.isSymbolicLink()) {
        counts.skipped += 1;
        continue;
      }
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        counts.discoveredFolders += 1;
        pendingFolders.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      counts.discoveredFiles += 1;
      counts.scannedFiles += 1;
      if (counts.scannedFiles % 80 === 0) {
        emit(path.basename(currentPath), true);
        await waitForTurn();
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!ASSET_EXTENSIONS.has(extension)) {
        counts.skipped += 1;
        continue;
      }

      try {
        const stats = await fs.stat(entryPath);
        const type = getAssetType(extension);
        const id = createAssetId(entryPath, stats);
        const url = registerAssetPath?.(id, entryPath) || "";
        const thumbnailUrl = registerAssetThumbnailUrl?.(id, entryPath, {
          extension,
          mediaType: type === "image" ? "image" : type,
          modifiedAt: stats.mtimeMs,
          size: stats.size,
        }) || "";
        items.push({
          id,
          url,
          thumbnailUrl,
          path: entryPath,
          folderPath: path.dirname(entryPath),
          name: entry.name,
          extension: extension.slice(1),
          type,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          takenAt: stats.mtime.toISOString(),
          previewStatus: thumbnailUrl ? "available" : "fallback",
        });
        counts.total += 1;
        if (type === "image") counts.images += 1;
        if (type === "video") counts.videos += 1;
        if (type === "psd") counts.psd += 1;
        if (type === "affinity") counts.affinity += 1;
        if (type === "document") counts.documents += 1;
      } catch (error) {
        counts.skipped += 1;
        counts.unreadable += 1;
        errors.push({ file: entry.name, message: error?.message || "File could not be read." });
        logError?.("Assets file read failed", error, { filePath: entryPath });
      }
    }
  }

  items.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  counts.limitReached = items.length >= limit;
  sendProgress({ phase: "done", found: items.length, ...counts }, true);
  return { items, counts, errors: errors.slice(0, 30) };
}

module.exports = { ASSET_EXTENSIONS, scanAssetFolder };
