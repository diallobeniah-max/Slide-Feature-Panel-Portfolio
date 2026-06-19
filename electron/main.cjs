const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { path7za } = require("7zip-bin");
const express = require("express");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  nativeImage,
  nativeTheme,
  protocol,
  shell,
  Tray,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { scanMediaFolder } = require("./fileScanner.cjs");
const { scanAssetFolder } = require("./assetScanner.cjs");
const {
  configureLogger,
  getDiagnostics,
  logError,
  logInfo,
  setOcrAssetsLoaded,
} = require("./logger.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "contentflow-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: "contentflow-thumb",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let companionWindow = null;
const toolWindows = new Map();
let tray = null;
let isQuitting = false;
let hasUnsavedWork = false;
let localServer = null;
let activeGalleryScan = null;
const mediaPathById = new Map();
const assetPathById = new Map();
const thumbnailMetaById = new Map();
const thumbnailInflight = new Map();
const thumbnailQueue = [];
const archiveSessions = new Map();
let activeThumbnailJobs = 0;
const MAX_THUMBNAIL_JOBS = 2;
let activeThumbnailWarm = null;
const isSmokeTest = process.env.CONTENTFLOW_ELECTRON_SMOKE === "1";
const DEFAULT_DESKTOP_PREFS = {
  runOnStartup: false,
  backgroundMode: true,
  downloadFolders: {
    global: "",
    videoGrabber: "",
    instagram: "",
    batch: "",
    grid: "",
    slicer: "",
    spell: "",
    writing: "",
    tools: "",
    useVideoGrabberForAll: false,
    useGlobalForAll: true,
  },
};
const DEFAULT_THEME_PREFS = {
  mode: "auto",
  isDark: true,
};
const PHONE_POPOUT_VERSION = 2;

function getAppIconPath() {
  return path.join(__dirname, "assets", "icon.ico");
}

function getDesktopPrefsPath() {
  return path.join(app.getPath("userData"), "desktop-preferences.json");
}

function getThemePrefsPath() {
  return path.join(app.getPath("userData"), "theme-preferences.json");
}

async function readDesktopPrefs() {
  const prefs = await readJson(getDesktopPrefsPath(), DEFAULT_DESKTOP_PREFS);
  const loginSettings = app.getLoginItemSettings();
  return {
    ...DEFAULT_DESKTOP_PREFS,
    ...prefs,
    downloadFolders: {
      ...DEFAULT_DESKTOP_PREFS.downloadFolders,
      ...(prefs.downloadFolders || {}),
    },
    runOnStartup: Boolean(loginSettings.openAtLogin),
  };
}

async function writeDesktopPrefs(nextPrefs) {
  await writeJson(getDesktopPrefsPath(), {
    ...DEFAULT_DESKTOP_PREFS,
    ...nextPrefs,
  });
}

async function readThemePrefs() {
  const prefs = await readJson(getThemePrefsPath(), DEFAULT_THEME_PREFS);
  return {
    ...DEFAULT_THEME_PREFS,
    ...prefs,
    mode: normalizeThemeMode(prefs.mode),
  };
}

async function writeThemePrefs(nextPrefs) {
  await writeJson(getThemePrefsPath(), {
    ...DEFAULT_THEME_PREFS,
    ...nextPrefs,
    mode: normalizeThemeMode(nextPrefs.mode),
  });
}

function normalizeThemeMode(mode) {
  return ["auto", "light", "dark"].includes(mode) ? mode : "auto";
}

function electronThemeSource(mode) {
  return normalizeThemeMode(mode) === "auto" ? "system" : normalizeThemeMode(mode);
}

function resolveThemeBackground(themePrefs = DEFAULT_THEME_PREFS) {
  const mode = normalizeThemeMode(themePrefs.mode);
  const isDark = mode === "dark" || (mode === "auto" && nativeTheme.shouldUseDarkColors);
  return isDark ? "#09090b" : "#f8f5ef";
}

function broadcastTheme(themePrefs) {
  const mode = normalizeThemeMode(themePrefs.mode);
  const payload = {
    mode,
    isDark:
      mode === "dark" ||
      (mode === "auto" && nativeTheme.shouldUseDarkColors),
  };
  const backgroundColor = resolveThemeBackground({ ...themePrefs, mode });
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.setBackgroundColor(backgroundColor);
    win.webContents.send("theme:changed", payload);
  }
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function sendUpdateStatus(payload) {
  sendToRenderer("updates:status", {
    currentVersion: app.getVersion(),
    ...payload,
  });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getGalleryStorePath() {
  return path.join(app.getPath("userData"), "gallery-store.json");
}

async function readGalleryStore() {
  return readJson(getGalleryStorePath(), {
    lastFolder: "",
    tags: {},
    cacheClearedAt: "",
    lastScan: null,
  });
}

function getAssetsStorePath() {
  return path.join(app.getPath("userData"), "assets-store.json");
}

function getWriteStorePath() {
  return path.join(app.getPath("userData"), "write-store.json");
}

async function readAssetsStore() {
  const store = await readJson(getAssetsStorePath(), {
    lastFolder: "",
    tags: {},
    lastScan: null,
    groups: [],
  });
  return {
    lastFolder: store.lastFolder || "",
    tags: store.tags || {},
    lastScan: store.lastScan || null,
    groups: Array.isArray(store.groups) ? store.groups : [],
  };
}

async function writeAssetsStore(nextStore) {
  await writeJson(getAssetsStorePath(), nextStore);
}

async function readWriteStore() {
  const store = await readJson(getWriteStorePath(), {
    folderPath: "",
    currentId: "",
    documents: [],
  });
  return {
    folderPath: store.folderPath || "",
    currentId: store.currentId || "",
    documents: Array.isArray(store.documents) ? store.documents : [],
  };
}

async function writeWriteStore(nextStore) {
  await writeJson(getWriteStorePath(), {
    folderPath: nextStore.folderPath || "",
    currentId: nextStore.currentId || "",
    documents: Array.isArray(nextStore.documents) ? nextStore.documents : [],
  });
}

async function setLastAssetsFolder(folderPath) {
  const store = await readAssetsStore();
  store.lastFolder = folderPath || "";
  await writeAssetsStore(store);
}

async function setLastAssetsScan(scan) {
  const store = await readAssetsStore();
  store.lastScan = {
    scannedAt: new Date().toISOString(),
    folderName: scan.folderPath ? path.basename(scan.folderPath) : "",
    counts: scan.counts || {},
    error: scan.error || "",
    items: sanitizeStoredAssetItems(scan.items || []),
  };
  await writeAssetsStore(store);
}

async function writeGalleryStore(nextStore) {
  await writeJson(getGalleryStorePath(), nextStore);
}

async function setLastGalleryFolder(folderPath) {
  const store = await readGalleryStore();
  store.lastFolder = folderPath || "";
  await writeGalleryStore(store);
}

async function setLastGalleryScan(scan) {
  const store = await readGalleryStore();
  store.lastScan = {
    scannedAt: new Date().toISOString(),
    folderName: scan.folderPath ? path.basename(scan.folderPath) : "",
    counts: scan.counts || {},
    error: scan.error || "",
    items: sanitizeStoredGalleryItems(scan.items || []),
  };
  await writeGalleryStore(store);
}

function createMediaUrl(id) {
  return `contentflow-media://file/${encodeURIComponent(id)}`;
}

function createThumbnailUrl(id) {
  return `contentflow-thumb://file/${encodeURIComponent(id)}`;
}

function registerMediaPath(id, filePath) {
  mediaPathById.set(id, filePath);
  return createMediaUrl(id);
}

function registerAssetPath(id, filePath) {
  assetPathById.set(id, filePath);
  return createMediaUrl(id);
}

const GROUP_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff", ".svg"]);
const GROUP_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);

function createAssetGroupId(name = "") {
  return crypto
    .createHash("sha1")
    .update(`asset-group|${name}|${Date.now()}|${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
}

function createGroupedAssetId(filePath, stats) {
  return crypto
    .createHash("sha1")
    .update(`asset-group-file|${filePath}|${Math.round(stats.mtimeMs)}|${stats.size}`)
    .digest("hex")
    .slice(0, 24);
}

function getGroupedAssetType(extension) {
  if (GROUP_IMAGE_EXTENSIONS.has(extension)) return "image";
  if (GROUP_VIDEO_EXTENSIONS.has(extension)) return "video";
  return "file";
}

async function createGroupedAssetItem(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) return null;
  const extension = path.extname(filePath).toLowerCase();
  const id = createGroupedAssetId(filePath, stats);
  const type = getGroupedAssetType(extension);
  const url = registerAssetPath(id, filePath);
  const thumbnailUrl = registerAssetThumbnailUrl(id, filePath, {
    extension,
    mediaType: type === "image" ? "image" : type,
    modifiedAt: stats.mtimeMs,
    size: stats.size,
  }) || "";
  return {
    id,
    url,
    thumbnailUrl,
    path: filePath,
    folderPath: path.dirname(filePath),
    name: path.basename(filePath),
    extension: extension.replace(/^\./, "").toLowerCase(),
    type,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    takenAt: stats.mtime.toISOString(),
    previewStatus: thumbnailUrl ? "available" : "fallback",
  };
}

function sanitizeStoredAssetItems(items = []) {
  return items
    .filter((item) => item?.id && item?.path)
    .map((item) => ({
      id: item.id,
      path: item.path,
      folderPath: item.folderPath || path.dirname(item.path),
      name: item.name || path.basename(item.path),
      extension: String(item.extension || "").replace(/^\./, "").toLowerCase(),
      type: item.type || "other",
      size: Number(item.size || 0),
      modifiedAt: item.modifiedAt || "",
      takenAt: item.takenAt || item.modifiedAt || "",
      previewStatus: item.previewStatus || "fallback",
    }));
}

function sanitizeAssetGroups(groups = []) {
  return groups
    .filter((group) => group?.id)
    .map((group) => ({
      id: String(group.id),
      name: String(group.name || "Asset Group").slice(0, 80),
      createdAt: group.createdAt || new Date().toISOString(),
      updatedAt: group.updatedAt || group.createdAt || new Date().toISOString(),
      items: sanitizeStoredAssetItems(group.items || []),
    }));
}

function hydrateAssetGroups(groups = []) {
  return sanitizeAssetGroups(groups).map((group) => ({
    ...group,
    items: hydrateStoredAssetItems(group.items || []),
  }));
}

function hydrateStoredAssetItems(items = []) {
  return sanitizeStoredAssetItems(items).map((item) => {
    const extension = String(item.extension || "").replace(/^\./, "").toLowerCase();
    const modifiedAt = Date.parse(item.modifiedAt || "") || 0;
    const mediaType = item.type === "image" ? "image" : item.type;
    return {
      ...item,
      extension,
      url: registerAssetPath(item.id, item.path),
      thumbnailUrl: registerAssetThumbnailUrl(item.id, item.path, {
        extension: extension ? `.${extension}` : "",
        mediaType,
        modifiedAt,
        size: item.size,
      }),
    };
  });
}

function registerThumbnailUrl(id, filePath, metadata = {}) {
  if (metadata.mediaType !== "image") return "";
  if ([".tif", ".tiff", ".gif", ".avif"].includes(metadata.extension)) return "";
  thumbnailMetaById.set(id, {
    filePath,
    cacheKey: `${id}-${Math.round(metadata.modifiedAt || 0)}-${metadata.size || 0}`,
  });
  return createThumbnailUrl(id);
}

function sanitizeStoredGalleryItems(items = []) {
  return items
    .filter((item) => item?.id && item?.path)
    .map((item) => ({
      id: item.id,
      path: item.path,
      folderPath: item.folderPath || path.dirname(item.path),
      name: item.name || path.basename(item.path),
      extension: String(item.extension || "").replace(/^\./, "").toLowerCase(),
      type: item.type || "image",
      size: Number(item.size || 0),
      modifiedAt: item.modifiedAt || "",
      takenAt: item.takenAt || item.modifiedAt || "",
      cacheKey: item.cacheKey || "",
    }));
}

function hydrateStoredGalleryItems(items = []) {
  return sanitizeStoredGalleryItems(items).map((item) => {
    const extension = String(item.extension || "").replace(/^\./, "").toLowerCase();
    const modifiedAt = Date.parse(item.modifiedAt || "") || 0;
    return {
      ...item,
      extension,
      url: registerMediaPath(item.id, item.path),
      thumbnailUrl: registerThumbnailUrl(item.id, item.path, {
        extension: extension ? `.${extension}` : "",
        mediaType: item.type,
        modifiedAt,
        size: item.size,
      }),
    };
  });
}

function registerAssetThumbnailUrl(id, filePath, metadata = {}) {
  if (metadata.mediaType !== "image") return "";
  if ([".svg", ".tif", ".tiff", ".gif", ".avif"].includes(metadata.extension)) return "";
  thumbnailMetaById.set(id, {
    filePath,
    cacheKey: `asset-${id}-${Math.round(metadata.modifiedAt || 0)}-${metadata.size || 0}`,
  });
  return createThumbnailUrl(id);
}

function getThumbnailCachePath(cacheKey) {
  const safeKey = String(cacheKey || "").replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(app.getPath("userData"), "gallery-cache", `${safeKey}.png`);
}

function runNextThumbnailJob() {
  if (activeThumbnailJobs >= MAX_THUMBNAIL_JOBS || thumbnailQueue.length === 0) return;
  const job = thumbnailQueue.shift();
  activeThumbnailJobs += 1;
  Promise.resolve()
    .then(job.task)
    .then(job.resolve, job.reject)
    .finally(() => {
      activeThumbnailJobs = Math.max(0, activeThumbnailJobs - 1);
      runNextThumbnailJob();
    });
}

function enqueueThumbnailJob(task) {
  return new Promise((resolve, reject) => {
    thumbnailQueue.push({ task, resolve, reject });
    runNextThumbnailJob();
  });
}

function getInflightThumbnail(cacheKey, task) {
  if (thumbnailInflight.has(cacheKey)) return thumbnailInflight.get(cacheKey);
  const pending = enqueueThumbnailJob(task).finally(() => {
    thumbnailInflight.delete(cacheKey);
  });
  thumbnailInflight.set(cacheKey, pending);
  return pending;
}

async function getOrCreateThumbnail(id) {
  const metadata = thumbnailMetaById.get(id);
  if (!metadata?.filePath) return "";
  const cachePath = getThumbnailCachePath(metadata.cacheKey);

  try {
    const stats = await fs.stat(cachePath);
    if (stats.size > 0) {
      const cachedImage = nativeImage.createFromPath(cachePath);
      if (!cachedImage.isEmpty()) return cachePath;
    }
    await fs.rm(cachePath, { force: true });
  } catch {
    // Cache miss; create a small read-only preview copy.
  }

  return getInflightThumbnail(metadata.cacheKey, async () => {
    const source = await nativeImage.createThumbnailFromPath(metadata.filePath, {
      width: 360,
      height: 360,
    });

    if (source.isEmpty()) return "";

    const png = source.toPNG();
    if (!png?.length) return "";
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, png);
    return cachePath;
  }).catch((error) => {
      logError("Gallery thumbnail generation failed", error, {
        fileName: path.basename(metadata.filePath),
      });
      return "";
    });
}

function getGalleryCachePath() {
  return path.join(app.getPath("userData"), "gallery-cache");
}

async function getGalleryCacheStats() {
  const cachePath = getGalleryCachePath();
  let entries = [];
  try {
    entries = await fs.readdir(cachePath, { withFileTypes: true });
  } catch {
    return { files: 0, bytes: 0, corrupt: 0, cachePath };
  }

  let files = 0;
  let bytes = 0;
  let corrupt = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(cachePath, entry.name);
    try {
      const stats = await fs.stat(filePath);
      files += 1;
      bytes += stats.size;
      if (stats.size === 0) corrupt += 1;
    } catch {
      corrupt += 1;
    }
  }
  return { files, bytes, corrupt, cachePath };
}

async function cleanupGalleryCache(activeCacheKeys = [], options = {}) {
  const cachePath = getGalleryCachePath();
  const active = new Set(activeCacheKeys.map((key) => `${key}.png`));
  const removeOrphans = Boolean(options.removeOrphans);
  let removed = 0;
  let removedBytes = 0;
  let kept = 0;

  let entries = [];
  try {
    entries = await fs.readdir(cachePath, { withFileTypes: true });
  } catch {
    return { removed, removedBytes, kept };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".png")) continue;
    const filePath = path.join(cachePath, entry.name);
    try {
      const stats = await fs.stat(filePath);
      const shouldRemove = stats.size === 0 || (removeOrphans && active.size > 0 && !active.has(entry.name));
      if (shouldRemove) {
        await fs.rm(filePath, { force: true });
        removed += 1;
        removedBytes += stats.size;
      } else {
        kept += 1;
      }
    } catch {
      await fs.rm(filePath, { force: true }).catch(() => {});
      removed += 1;
    }
  }
  return { removed, removedBytes, kept };
}

async function assertSelectedFolder(folderPath) {
  const store = await readGalleryStore();
  const selectedFolder = folderPath || store.lastFolder;
  if (!selectedFolder) {
    throw new Error("No gallery folder has been selected.");
  }
  if (selectedFolder !== store.lastFolder) {
    throw new Error("Select this folder in ContentFlow before scanning it.");
  }

  const stats = await fs.stat(selectedFolder);
  if (!stats.isDirectory()) {
    throw new Error("Selected gallery path is not a folder.");
  }
  return selectedFolder;
}

async function assertSelectedAssetsFolder(folderPath) {
  const store = await readAssetsStore();
  const selectedFolder = folderPath || store.lastFolder;
  if (!selectedFolder) throw new Error("No assets folder has been selected.");
  if (selectedFolder !== store.lastFolder) {
    throw new Error("Select this folder in ContentFlow before scanning it.");
  }
  const stats = await fs.stat(selectedFolder);
  if (!stats.isDirectory()) throw new Error("Selected assets path is not a folder.");
  return selectedFolder;
}

function getIndexedFilePath(kind, id) {
  if (kind === "assets") return assetPathById.get(id) || "";
  return mediaPathById.get(id) || "";
}

function getIndexedFilePaths(kind, ids = []) {
  return [...new Set(Array.isArray(ids) ? ids : [ids])]
    .map((id) => getIndexedFilePath(kind, id))
    .filter(Boolean);
}

function createWriteDocumentId() {
  return crypto.randomBytes(8).toString("hex");
}

function sanitizeWriteFileName(value = "writing") {
  const base = String(value || "writing")
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 56) || "writing";
  return base;
}

function getWriteExcerpt(content = "") {
  return String(content || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

async function sanitizeWriteDocuments(documents = [], folderPath = "") {
  const clean = [];
  for (const doc of documents) {
    if (!doc?.id || !doc?.path) continue;
    if (folderPath && !path.resolve(doc.path).startsWith(path.resolve(folderPath))) continue;
    try {
      const stats = await fs.stat(doc.path);
      if (!stats.isFile()) continue;
      clean.push({
        id: String(doc.id),
        name: String(doc.name || path.basename(doc.path)).slice(0, 100),
        path: doc.path,
        updatedAt: doc.updatedAt || stats.mtime.toISOString(),
        excerpt: String(doc.excerpt || "").slice(0, 160),
      });
    } catch {
      // Skip missing autosave files.
    }
  }
  return clean.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function getWriteState() {
  const store = await readWriteStore();
  const documents = await sanitizeWriteDocuments(store.documents, store.folderPath);
  if (documents.length !== store.documents.length) {
    await writeWriteStore({ ...store, documents });
  }
  return {
    folderPath: store.folderPath,
    currentId: store.currentId,
    documents,
  };
}

async function copyIndexedFiles(kind, ids = []) {
  const selected = getIndexedFilePaths(kind, ids);
  if (!selected.length) return { copied: 0, canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose export folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths?.[0]) return { copied: 0, canceled: true };
  const targetFolder = result.filePaths[0];
  let copied = 0;
  for (const source of selected) {
    const parsed = path.parse(source);
    let target = path.join(targetFolder, parsed.base);
    let index = 1;
    while (true) {
      try {
        await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
        copied += 1;
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        target = path.join(targetFolder, `${parsed.name} copy ${index}${parsed.ext}`);
        index += 1;
      }
    }
  }
  return { copied, targetFolder };
}

async function importServerModule(relativePath) {
  const moduleUrl = pathToFileURL(path.join(__dirname, "..", relativePath)).href;
  return import(moduleUrl);
}

async function startLocalServer() {
  const serverApp = express();
  const { createInstagramMiddleware } = await importServerModule("server/instagramApi.mjs");
  const { createYoutubeMiddleware } = await importServerModule("server/youtube/youtubeRoutes.mjs");
  const distPath = path.join(__dirname, "..", "dist");
  const indexPath = path.join(distPath, "index.html");

  serverApp.disable("x-powered-by");
  serverApp.use(createInstagramMiddleware());
  serverApp.use(createYoutubeMiddleware());
  serverApp.use(express.static(distPath, { fallthrough: true }));
  serverApp.use((req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    res.sendFile(indexPath);
  });

  return new Promise((resolve, reject) => {
    const server = serverApp.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on("error", reject);
  });
}

async function createWindow() {
  const themePrefs = await readThemePrefs();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: resolveThemeBackground(themePrefs),
    title: "ContentFlow",
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.on("close", (event) => {
    if (isQuitting || isSmokeTest) return;
    event.preventDefault();
    readDesktopPrefs()
      .then((prefs) => {
        if (prefs.backgroundMode) {
          ensureTray();
          mainWindow.hide();
          return;
        }
        requestAppQuit();
      })
      .catch((error) => {
        logError("Desktop preferences read failed during close", error);
        requestAppQuit();
      });
  });

  if (isSmokeTest) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => app.quit(), 250);
    });
  }

  if (app.isPackaged) {
    localServer = await startLocalServer();
    await mainWindow.loadURL(localServer.url);
  } else {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173");
    if (!isSmokeTest) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }
}

async function confirmQuitIfNeeded() {
  if (!hasUnsavedWork) return true;
  const result = await dialog.showMessageBox(mainWindow || BrowserWindow.getFocusedWindow(), {
    type: "warning",
    buttons: ["Cancel", "Quit"],
    defaultId: 0,
    cancelId: 0,
    title: "Quit ContentFlow?",
    message: "You may have unsaved work in ContentFlow. Do you want to quit anyway?",
  });
  return result.response === 1;
}

async function requestAppQuit() {
  const canQuit = await confirmQuitIfNeeded();
  if (!canQuit) return false;
  isQuitting = true;
  app.quit();
  return true;
}

function ensureTray() {
  if (tray) return tray;
  tray = new Tray(getAppIconPath());
  tray.setToolTip("ContentFlow");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open ContentFlow",
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow().catch((error) => logError("Window creation failed", error));
            return;
          }
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: "separator" },
      {
        label: "Quit ContentFlow",
        click: () => requestAppQuit(),
      },
    ]),
  );
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  return tray;
}

async function getCompanionBounds() {
  return readJson(path.join(app.getPath("userData"), "companion-window.json"), {
    width: 420,
    height: 560,
  });
}

async function saveCompanionBounds(bounds) {
  await writeJson(path.join(app.getPath("userData"), "companion-window.json"), bounds);
}

function normalizeToolName(tool) {
  const clean = String(tool || "").toLowerCase();
  return ["writing", "instagram", "batch", "gallery"].includes(clean) ? clean : "";
}

function getToolWindowPath(tool) {
  return path.join(app.getPath("userData"), `tool-window-${tool}.json`);
}

async function getToolWindowBounds(tool) {
  const fallback = {
    width: tool === "gallery" ? 480 : tool === "writing" ? 480 : 450,
    height: tool === "gallery" ? 820 : tool === "writing" ? 820 : 780,
    alwaysOnTop: false,
    phonePopoutVersion: PHONE_POPOUT_VERSION,
  };
  const saved = await readJson(getToolWindowPath(tool), fallback);
  if (saved.phonePopoutVersion !== PHONE_POPOUT_VERSION) return fallback;
  return { ...fallback, ...saved };
}

async function saveToolWindowState(tool, nextState) {
  const current = await getToolWindowBounds(tool);
  await writeJson(getToolWindowPath(tool), {
    ...current,
    ...nextState,
    phonePopoutVersion: PHONE_POPOUT_VERSION,
  });
}

async function createToolWindow(toolName) {
  const tool = normalizeToolName(toolName);
  if (!tool) return { opened: false, message: "Unsupported popout tool." };

  const existing = toolWindows.get(tool);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { opened: true };
  }

  const bounds = await getToolWindowBounds(tool);
  const themePrefs = await readThemePrefs();
  const toolWindow = new BrowserWindow({
    width: Math.max(390, bounds.width || 410),
    height: Math.max(620, bounds.height || 760),
    x: bounds.x,
    y: bounds.y,
    minWidth: 360,
    minHeight: 620,
    title: `ContentFlow ${tool}`,
    backgroundColor: resolveThemeBackground(themePrefs),
    icon: getAppIconPath(),
    alwaysOnTop: Boolean(bounds.alwaysOnTop),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  toolWindows.set(tool, toolWindow);
  toolWindow.on("close", () => {
    saveToolWindowState(tool, {
      ...toolWindow.getBounds(),
      alwaysOnTop: toolWindow.isAlwaysOnTop(),
    }).catch((error) =>
      logError("Tool window bounds save failed", error, { tool }),
    );
  });
  toolWindow.on("closed", () => {
    toolWindows.delete(tool);
  });

  const baseUrl = app.isPackaged
    ? localServer?.url || "http://127.0.0.1"
    : process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
  await toolWindow.loadURL(`${baseUrl}?popout=${encodeURIComponent(tool)}`);
  return { opened: true };
}

async function createCompanionWindow() {
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.focus();
    return true;
  }

  const bounds = await getCompanionBounds();
  const themePrefs = await readThemePrefs();
  companionWindow = new BrowserWindow({
    width: Math.max(340, bounds.width || 420),
    height: Math.max(420, bounds.height || 560),
    x: bounds.x,
    y: bounds.y,
    minWidth: 320,
    minHeight: 380,
    title: "ContentFlow Companion",
    backgroundColor: resolveThemeBackground(themePrefs),
    icon: getAppIconPath(),
    alwaysOnTop: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  companionWindow.on("close", () => {
    saveCompanionBounds(companionWindow.getBounds()).catch((error) =>
      logError("Companion bounds save failed", error),
    );
  });

  const companionUrl = app.isPackaged
    ? `${localServer?.url || "http://127.0.0.1"}?companion=1`
    : `${process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173"}?companion=1`;
  await companionWindow.loadURL(companionUrl);
  return true;
}

function setupMediaProtocol() {
  protocol.handle("contentflow-media", async (request) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, "") || url.hostname);
      const filePath = mediaPathById.get(id) || assetPathById.get(id);
      if (!filePath) return new Response("Media not found.", { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      logError("Gallery media protocol failed", error);
      return new Response("Media could not be loaded.", { status: 404 });
    }
  });

  protocol.handle("contentflow-thumb", async (request) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, "") || url.hostname);
      const thumbnailPath = await getOrCreateThumbnail(id);
      if (!thumbnailPath) return new Response("Thumbnail not found.", { status: 404 });
      return net.fetch(pathToFileURL(thumbnailPath).toString());
    } catch (error) {
      logError("Gallery thumbnail protocol failed", error);
      return new Response("Thumbnail could not be loaded.", { status: 404 });
    }
  });
}

async function checkOcrAssets() {
  const candidates = [
    path.join(__dirname, "..", "public", "tessdata", "eng.traineddata.gz"),
    path.join(__dirname, "..", "dist", "tessdata", "eng.traineddata.gz"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      setOcrAssetsLoaded(true);
      return true;
    } catch {
      // Try the next candidate.
    }
  }

  setOcrAssetsLoaded(false);
  logError("OCR traineddata asset was not found");
  return false;
}

function setupUpdates() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus({ state: "checking", title: "Checking for updates" });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus({
      state: "available",
      title: info.releaseName || "ContentFlow update available",
      version: info.version,
      description: info.releaseNotes || "",
      releaseDate: info.releaseDate || "",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    sendUpdateStatus({
      state: "not-available",
      title: "ContentFlow is up to date",
      version: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({
      state: "downloading",
      title: "Downloading update",
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus({
      state: "downloaded",
      title: "Update ready",
      version: info.version,
      description: info.releaseNotes || "",
      releaseDate: info.releaseDate || "",
    });
  });

  autoUpdater.on("error", (error) => {
    logError("Update check failed", error);
    sendUpdateStatus({
      state: "error",
      title: "Update check unavailable",
      message: error?.message || "No update feed is configured yet.",
    });
  });
}

function setupUpdateIpc() {
  ipcMain.handle("updates:get-current-version", () => app.getVersion());

  ipcMain.handle("updates:check", async () => {
    if (!app.isPackaged) {
      const payload = {
        state: "not-configured",
        title: "Desktop update checks run in packaged builds",
        currentVersion: app.getVersion(),
      };
      sendUpdateStatus(payload);
      return payload;
    }

    try {
      await autoUpdater.checkForUpdates();
      return { state: "checking", currentVersion: app.getVersion() };
    } catch (error) {
      logError("Manual update check failed", error);
      const payload = {
        state: "error",
        title: "Update check unavailable",
        message: error?.message || "No update feed is configured yet.",
        currentVersion: app.getVersion(),
      };
      sendUpdateStatus(payload);
      return payload;
    }
  });

  ipcMain.handle("updates:download", async () => {
    await autoUpdater.downloadUpdate();
    return { state: "downloading" };
  });

  ipcMain.handle("updates:restart-and-install", () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
}

function setupCompanionIpc() {
  ipcMain.handle("companion:open", () => createCompanionWindow());
  ipcMain.handle("windows:open-tool", (_event, tool) => createToolWindow(tool));
  ipcMain.handle("popout:get-state", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { alwaysOnTop: Boolean(win?.isAlwaysOnTop?.()) };
  });
  ipcMain.handle("popout:set-always-on-top", async (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { alwaysOnTop: false };
    const alwaysOnTop = Boolean(enabled);
    win.setAlwaysOnTop(alwaysOnTop);
    const tool = [...toolWindows.entries()].find(([, candidate]) => candidate === win)?.[0];
    if (tool) {
      await saveToolWindowState(tool, {
        ...win.getBounds(),
        alwaysOnTop,
      });
    }
    return { alwaysOnTop };
  });
  ipcMain.handle("theme:get-state", async () => {
    const themePrefs = await readThemePrefs();
    const mode = normalizeThemeMode(themePrefs.mode);
    return {
      mode,
      isDark:
        mode === "dark" ||
        (mode === "auto" && nativeTheme.shouldUseDarkColors),
    };
  });
  ipcMain.handle("theme:set-mode", async (_event, mode = "auto", isDark = false) => {
    const cleanMode = normalizeThemeMode(mode);
    nativeTheme.themeSource = electronThemeSource(cleanMode);
    const nextPrefs = { mode: cleanMode, isDark: Boolean(isDark) };
    await writeThemePrefs(nextPrefs);
    broadcastTheme(nextPrefs);
    return {
      mode: cleanMode,
      isDark:
        cleanMode === "dark" ||
        (cleanMode === "auto" && nativeTheme.shouldUseDarkColors),
    };
  });
  ipcMain.handle("app:set-unsaved-state", (_event, hasUnsaved) => {
    hasUnsavedWork = Boolean(hasUnsaved);
    return { hasUnsavedWork };
  });
  ipcMain.handle("desktop:get-preferences", () => readDesktopPrefs());
  ipcMain.handle("desktop:set-run-on-startup", async (_event, enabled) => {
    const current = await readDesktopPrefs();
    const runOnStartup = Boolean(enabled);
    app.setLoginItemSettings({
      openAtLogin: runOnStartup,
      openAsHidden: true,
      path: process.execPath,
    });
    const nextPrefs = { ...current, runOnStartup };
    await writeDesktopPrefs(nextPrefs);
    return readDesktopPrefs();
  });
  ipcMain.handle("desktop:set-background-mode", async (_event, enabled) => {
    const current = await readDesktopPrefs();
    const nextPrefs = { ...current, backgroundMode: Boolean(enabled) };
    await writeDesktopPrefs(nextPrefs);
    if (nextPrefs.backgroundMode) ensureTray();
    return readDesktopPrefs();
  });
  ipcMain.handle("desktop:select-download-folder", async (event, key = "") => {
    const cleanKey = String(key || "").replace(/[^a-zA-Z0-9]/g, "");
    const allowedKeys = new Set(Object.keys(DEFAULT_DESKTOP_PREFS.downloadFolders).filter((name) => !name.startsWith("use")));
    if (!allowedKeys.has(cleanKey)) throw new Error("Unknown download folder setting.");
    const current = await readDesktopPrefs();
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: cleanKey === "global" ? "Choose default export folder" : cleanKey === "videoGrabber" ? "Choose Video Grabber folder" : "Choose download folder",
      defaultPath: current.downloadFolders[cleanKey] || app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true, ...(await readDesktopPrefs()) };
    const folderPath = result.filePaths[0];
    await fs.mkdir(folderPath, { recursive: true });
    const nextPrefs = {
      ...current,
      downloadFolders: {
        ...current.downloadFolders,
        [cleanKey]: folderPath,
      },
    };
    await writeDesktopPrefs(nextPrefs);
    return { canceled: false, ...(await readDesktopPrefs()) };
  });
  ipcMain.handle("desktop:set-download-folders", async (_event, patch = {}) => {
    const current = await readDesktopPrefs();
    const nextFolders = {
      ...current.downloadFolders,
      ...(patch || {}),
    };
    const nextPrefs = { ...current, downloadFolders: nextFolders };
    await writeDesktopPrefs(nextPrefs);
    return readDesktopPrefs();
  });
  ipcMain.handle("desktop:save-export-file", async (_event, key = "", fileName = "", data) => {
    const cleanKey = String(key || "").replace(/[^a-zA-Z0-9]/g, "");
    const current = await readDesktopPrefs();
    const folders = current.downloadFolders || {};
    const folderPath = folders.useGlobalForAll && folders.global
      ? folders.global
      : folders[cleanKey] || folders.global || "";
    if (!folderPath) return { saved: false, path: "" };
    await fs.mkdir(folderPath, { recursive: true });
    const cleanName = String(fileName || "export.bin")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "export.bin";
    const extension = path.extname(cleanName);
    const stem = path.basename(cleanName, extension);
    let targetPath = path.join(folderPath, cleanName);
    for (let index = 2; index < 10000; index += 1) {
      try {
        await fs.access(targetPath);
        targetPath = path.join(folderPath, `${stem} (${index})${extension}`);
      } catch {
        break;
      }
    }
    await fs.writeFile(targetPath, Buffer.from(data));
    return { saved: true, path: targetPath };
  });
  ipcMain.handle("desktop:archive-start", async (event, key = "tools", format = "zip", fileName = "tools-export") => {
    const cleanFormat = format === "7z" ? "7z" : "zip";
    const current = await readDesktopPrefs();
    const folders = current.downloadFolders || {};
    const folderPath = folders.useGlobalForAll && folders.global
      ? folders.global
      : folders[String(key || "tools")] || folders.global || app.getPath("downloads");
    await fs.mkdir(folderPath, { recursive: true });
    const cleanStem = String(fileName || "tools-export")
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "tools-export";
    let archivePath = path.join(folderPath, `${cleanStem}.${cleanFormat}`);
    for (let index = 2; index < 10000; index += 1) {
      try {
        await fs.access(archivePath);
        archivePath = path.join(folderPath, `${cleanStem} (${index}).${cleanFormat}`);
      } catch {
        break;
      }
    }
    const id = crypto.randomUUID();
    const tempPath = path.join(app.getPath("temp"), `contentflow-archive-${id}`);
    await fs.mkdir(tempPath, { recursive: true });
    archiveSessions.set(id, { id, ownerId: event.sender.id, format: cleanFormat, archivePath, tempPath });
    return { id, format: cleanFormat };
  });
  ipcMain.handle("desktop:archive-add", async (event, id = "", fileName = "", data) => {
    const session = archiveSessions.get(String(id || ""));
    if (!session || session.ownerId !== event.sender.id) throw new Error("Archive session is unavailable.");
    const cleanName = String(fileName || "file.bin")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "file.bin";
    await fs.writeFile(path.join(session.tempPath, cleanName), Buffer.from(data));
    return { added: true };
  });
  ipcMain.handle("desktop:archive-finish", async (event, id = "", compression = 5) => {
    const session = archiveSessions.get(String(id || ""));
    if (!session || session.ownerId !== event.sender.id) throw new Error("Archive session is unavailable.");
    const level = Math.max(0, Math.min(9, Number(compression) || 5));
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(path7za, ["a", `-t${session.format}`, session.archivePath, ".", `-mx=${level}`, "-y"], {
          cwd: session.tempPath,
          windowsHide: true,
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        child.on("error", reject);
        child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `7-Zip exited with code ${code}.`)));
      });
      return { saved: true, path: session.archivePath };
    } finally {
      archiveSessions.delete(session.id);
      await fs.rm(session.tempPath, { recursive: true, force: true }).catch(() => {});
    }
  });
  ipcMain.handle("desktop:archive-cancel", async (event, id = "") => {
    const session = archiveSessions.get(String(id || ""));
    if (!session || session.ownerId !== event.sender.id) return { canceled: false };
    archiveSessions.delete(session.id);
    await fs.rm(session.tempPath, { recursive: true, force: true }).catch(() => {});
    return { canceled: true };
  });
}

function setupGalleryIpc() {
  const selectFolder = async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select a gallery folder",
      properties: ["openDirectory"],
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true, folderPath: "" };
    }

    const folderPath = result.filePaths[0];
    await setLastGalleryFolder(folderPath);
    logInfo("Gallery folder selected", { folderPath });
    return { canceled: false, folderPath, readOnly: true };
  };

  const scanFolder = async (folderPath = "") => {
    const selectedFolder = await assertSelectedFolder(folderPath);
    if (activeGalleryScan) activeGalleryScan.cancelled = true;
    const cancelToken = { cancelled: false };
    activeGalleryScan = cancelToken;
    mediaPathById.clear();
    thumbnailMetaById.clear();

    try {
      sendToRenderer("gallery:progress", {
        phase: "starting",
        found: 0,
        scannedFiles: 0,
        scannedFolders: 0,
      });
      const result = await scanMediaFolder(selectedFolder, {
        cancelToken,
        registerMediaPath,
        registerThumbnailUrl,
        logError,
        onProgress: (payload) => sendToRenderer("gallery:progress", payload),
      });
      const cleanup = await cleanupGalleryCache(result.cacheKeys || []);
      const cacheStats = await getGalleryCacheStats();
      if (activeGalleryScan === cancelToken) activeGalleryScan = null;
      await setLastGalleryScan({
        folderPath: selectedFolder,
        items: result.items,
        counts: {
          ...result.counts,
          cacheFiles: cacheStats.files,
          cacheBytes: cacheStats.bytes,
          cacheCorrupt: cacheStats.corrupt,
          cacheRemoved: cleanup.removed,
        },
      });
      logInfo("Gallery scan completed", {
        folderPath: selectedFolder,
        total: result.counts.total,
        images: result.counts.images,
        videos: result.counts.videos,
        skipped: result.counts.skipped,
        cacheFiles: cacheStats.files,
      });
      return {
        canceled: false,
        folderPath: selectedFolder,
        scannedAt: new Date().toISOString(),
        cache: cacheStats,
        cacheCleanup: cleanup,
        ...result,
      };
    } catch (error) {
      if (activeGalleryScan === cancelToken) activeGalleryScan = null;
      const canceled = error?.code === "GALLERY_SCAN_CANCELLED";
      if (!canceled) logError("Gallery scan failed", error, { folderPath: selectedFolder });
      await setLastGalleryScan({
        folderPath: selectedFolder,
        counts: {
          total: 0,
          images: 0,
          videos: 0,
          skipped: 0,
          unreadable: 0,
          scannedFiles: 0,
          scannedFolders: 0,
          discoveredFiles: 0,
          discoveredFolders: 0,
          limitReached: false,
        },
        error: canceled ? "" : error?.message || "Gallery scan failed.",
      });
      return {
        canceled,
        folderPath: selectedFolder,
        items: [],
        errors: canceled ? [] : [{ message: error?.message || "Gallery scan failed." }],
        counts: {
          total: 0,
          images: 0,
          videos: 0,
          skipped: 0,
          unreadable: 0,
          scannedFiles: 0,
          scannedFolders: 0,
          discoveredFiles: 0,
          discoveredFolders: 0,
          limitReached: false,
        },
      };
    }
  };

  ipcMain.handle("gallery:select-folder", selectFolder);

  ipcMain.handle("gallery:get-last-folder", async () => {
    const store = await readGalleryStore();
    return store.lastFolder || "";
  });

  ipcMain.handle("gallery:get-cache-stats", () => getGalleryCacheStats());

  ipcMain.handle("gallery:start-thumbnail-cache", async (_event, ids = []) => {
    if (activeThumbnailWarm) activeThumbnailWarm.cancelled = true;
    const token = { cancelled: false };
    activeThumbnailWarm = token;
    const cleanIds = [...new Set(Array.isArray(ids) ? ids : [])]
      .filter((id) => thumbnailMetaById.has(id))
      .slice(0, 20000);

    const total = cleanIds.length;
    sendToRenderer("gallery:thumbnail-progress", { phase: "starting", done: 0, total });

    (async () => {
      let done = 0;
      for (const id of cleanIds) {
        if (token.cancelled) break;
        await getOrCreateThumbnail(id);
        done += 1;
        if (done % 12 === 0 || done === total) {
          sendToRenderer("gallery:thumbnail-progress", {
            phase: done === total ? "done" : "caching",
            done,
            total,
          });
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      }
      if (activeThumbnailWarm === token) activeThumbnailWarm = null;
    })().catch((error) => {
      if (activeThumbnailWarm === token) activeThumbnailWarm = null;
      logError("Gallery background thumbnail cache failed", error);
      sendToRenderer("gallery:thumbnail-progress", {
        phase: "error",
        done: 0,
        total,
        message: error?.message || "Thumbnail cache failed.",
      });
    });

    return { started: true, total };
  });

  ipcMain.handle("gallery:pause-thumbnail-cache", () => {
    if (activeThumbnailWarm) activeThumbnailWarm.cancelled = true;
    return { paused: true };
  });

  ipcMain.handle("gallery:get-last-scan", async () => {
    const store = await readGalleryStore();
    if (!store.lastScan) return null;
    return {
      ...store.lastScan,
      items: hydrateStoredGalleryItems(store.lastScan.items || []),
    };
  });

  ipcMain.handle("gallery:scan-folder", (_event, folderPath = "") => scanFolder(folderPath));

  ipcMain.handle("gallery:cancel-scan", () => {
    if (activeGalleryScan) activeGalleryScan.cancelled = true;
    return { canceled: true };
  });

  ipcMain.handle("gallery:rescan-folder", async () => {
    const store = await readGalleryStore();
    return scanFolder(store.lastFolder);
  });

  ipcMain.handle("gallery:get-media-file-url", (_event, mediaId) => {
    if (!mediaId || !mediaPathById.has(mediaId)) return "";
    return createMediaUrl(mediaId);
  });

  ipcMain.handle("files:open-external", async (_event, kind, id) => {
    const filePath = getIndexedFilePath(kind, id);
    if (!filePath) return { opened: false };
    const result = await shell.openPath(filePath);
    return { opened: !result, message: result || "" };
  });

  ipcMain.handle("files:reveal", (_event, kind, id) => {
    const filePath = getIndexedFilePath(kind, id);
    if (!filePath) return { revealed: false };
    shell.showItemInFolder(filePath);
    return { revealed: true };
  });

  ipcMain.handle("files:copy-selected", (_event, kind, ids = []) => copyIndexedFiles(kind, ids));

  const createDragIcon = (filePath) => {
    const thumbnail = nativeImage.createFromPath(filePath || "");
    if (!thumbnail.isEmpty()) return thumbnail.resize({ width: 72, height: 72 });
    return nativeImage.createEmpty();
  };

  ipcMain.handle("files:start-drag", (event, kind, ids) => {
    const filePaths = getIndexedFilePaths(kind, ids);
    if (!filePaths.length) return { dragging: false };
    event.sender.startDrag({
      file: filePaths[0],
      files: filePaths,
      icon: createDragIcon(filePaths[0]),
    });
    return { dragging: true, count: filePaths.length };
  });

  ipcMain.on("files:start-drag", (event, kind, ids) => {
    const filePaths = getIndexedFilePaths(kind, ids);
    if (!filePaths.length) return;
    event.sender.startDrag({
      file: filePaths[0],
      files: filePaths,
      icon: createDragIcon(filePaths[0]),
    });
  });

  ipcMain.handle("gallery:get-media-tags", async (_event, mediaId = "") => {
    const store = await readGalleryStore();
    if (mediaId) return store.tags?.[mediaId] || [];
    return store.tags || {};
  });

  ipcMain.handle("gallery:save-media-tags", async (_event, mediaId, tags = []) => {
    if (!mediaId || typeof mediaId !== "string") {
      throw new Error("A media id is required to save tags.");
    }
    const cleanTags = [...new Set(tags)]
      .map((tag) => String(tag || "").trim().slice(0, 32))
      .filter(Boolean)
      .slice(0, 20);
    const store = await readGalleryStore();
    store.tags = store.tags || {};
    store.tags[mediaId] = cleanTags;
    await writeGalleryStore(store);
    return cleanTags;
  });

  ipcMain.handle("gallery:clear-gallery-cache", async () => {
    const cachePath = getGalleryCachePath();
    await fs.rm(cachePath, { recursive: true, force: true });
    const store = await readGalleryStore();
    store.cacheClearedAt = new Date().toISOString();
    await writeGalleryStore(store);
    logInfo("Gallery cache cleared");
    return { cleared: true, cacheClearedAt: store.cacheClearedAt };
  });

  ipcMain.handle("gallery:clear-media-tags", async () => {
    const store = await readGalleryStore();
    store.tags = {};
    await writeGalleryStore(store);
    logInfo("Gallery local tags cleared");
    return { cleared: true };
  });

  ipcMain.handle("gallery:select-image-folder", async () => {
    const selected = await selectFolder();
    if (selected.canceled) return { ...selected, images: [] };
    const result = await scanFolder(selected.folderPath);
    return {
      ...selected,
      images: result.items.filter((item) => item.type === "image"),
      items: result.items,
      counts: result.counts,
      errors: result.errors,
    };
  });
}

function setupAssetsIpc() {
  async function saveGroups(groups) {
    const store = await readAssetsStore();
    store.groups = sanitizeAssetGroups(groups);
    await writeAssetsStore(store);
    return hydrateAssetGroups(store.groups);
  }

  async function getGroups() {
    const store = await readAssetsStore();
    return hydrateAssetGroups(store.groups || []);
  }

  async function addFilesToGroup(groupId, filePaths = []) {
    const cleanGroupId = String(groupId || "");
    const uniquePaths = [...new Set(Array.isArray(filePaths) ? filePaths : [])]
      .map((filePath) => String(filePath || ""))
      .filter(Boolean);
    if (!cleanGroupId || !uniquePaths.length) return getGroups();

    const store = await readAssetsStore();
    const groups = sanitizeAssetGroups(store.groups || []);
    const groupIndex = groups.findIndex((group) => group.id === cleanGroupId);
    if (groupIndex < 0) return hydrateAssetGroups(groups);

    const existingPaths = new Set((groups[groupIndex].items || []).map((item) => item.path));
    const nextItems = [...(groups[groupIndex].items || [])];
    for (const filePath of uniquePaths) {
      if (existingPaths.has(filePath)) continue;
      try {
        const item = await createGroupedAssetItem(filePath);
        if (!item) continue;
        existingPaths.add(filePath);
        nextItems.push(item);
      } catch (error) {
        logError("Asset group file add failed", error, { fileName: path.basename(filePath) });
      }
    }

    groups[groupIndex] = {
      ...groups[groupIndex],
      updatedAt: new Date().toISOString(),
      items: nextItems,
    };
    return saveGroups(groups);
  }

  async function addIndexedFilesToGroup(groupId, sourceKind, ids = []) {
    const filePaths = getIndexedFilePaths(sourceKind, ids);
    return addFilesToGroup(groupId, filePaths);
  }

  const selectFolder = async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select an assets folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true, folderPath: "" };
    }
    const folderPath = result.filePaths[0];
    await setLastAssetsFolder(folderPath);
    logInfo("Assets folder selected", { folderPath });
    return { canceled: false, folderPath, readOnly: true };
  };

  const scanFolder = async (folderPath = "") => {
    const selectedFolder = await assertSelectedAssetsFolder(folderPath);
    const cancelToken = { cancelled: false };
    try {
      sendToRenderer("assets:progress", { phase: "starting", found: 0 });
      const result = await scanAssetFolder(selectedFolder, {
        cancelToken,
        registerAssetPath,
        registerAssetThumbnailUrl,
        logError,
        onProgress: (payload) => sendToRenderer("assets:progress", payload),
      });
      await setLastAssetsScan({
        folderPath: selectedFolder,
        counts: result.counts,
        items: result.items,
      });
      return {
        canceled: false,
        folderPath: selectedFolder,
        scannedAt: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      const canceled = error?.code === "ASSETS_SCAN_CANCELLED";
      if (!canceled) logError("Assets scan failed", error, { folderPath: selectedFolder });
      await setLastAssetsScan({
        folderPath: selectedFolder,
        counts: { total: 0, images: 0, videos: 0, psd: 0, affinity: 0, documents: 0, skipped: 0 },
        error: canceled ? "" : error?.message || "Assets scan failed.",
      });
      return {
        canceled,
        folderPath: selectedFolder,
        items: [],
        errors: canceled ? [] : [{ message: error?.message || "Assets scan failed." }],
        counts: { total: 0, images: 0, videos: 0, psd: 0, affinity: 0, documents: 0, skipped: 0 },
      };
    }
  };

  ipcMain.handle("assets:select-folder", selectFolder);
  ipcMain.handle("assets:get-last-folder", async () => {
    const store = await readAssetsStore();
    return store.lastFolder || "";
  });
  ipcMain.handle("assets:get-last-scan", async () => {
    const store = await readAssetsStore();
    if (!store.lastScan) return null;
    return {
      ...store.lastScan,
      items: hydrateStoredAssetItems(store.lastScan.items || []),
    };
  });
  ipcMain.handle("assets:scan-folder", (_event, folderPath = "") => scanFolder(folderPath));
  ipcMain.handle("assets:rescan-folder", async () => {
    const store = await readAssetsStore();
    return scanFolder(store.lastFolder);
  });
  ipcMain.handle("assets:get-groups", getGroups);
  ipcMain.handle("assets:create-group", async (_event, name) => {
    const cleanName = String(name || "").trim().slice(0, 80) || "New Asset Group";
    const store = await readAssetsStore();
    const now = new Date().toISOString();
    const groups = [
      {
        id: createAssetGroupId(cleanName),
        name: cleanName,
        createdAt: now,
        updatedAt: now,
        items: [],
      },
      ...sanitizeAssetGroups(store.groups || []),
    ];
    return saveGroups(groups);
  });
  ipcMain.handle("assets:rename-group", async (_event, groupId, name) => {
    const cleanName = String(name || "").trim().slice(0, 80);
    if (!cleanName) return getGroups();
    const store = await readAssetsStore();
    const groups = sanitizeAssetGroups(store.groups || []).map((group) =>
      group.id === groupId
        ? { ...group, name: cleanName, updatedAt: new Date().toISOString() }
        : group,
    );
    return saveGroups(groups);
  });
  ipcMain.handle("assets:delete-group", async (_event, groupId) => {
    const store = await readAssetsStore();
    const groups = sanitizeAssetGroups(store.groups || []).filter((group) => group.id !== groupId);
    return saveGroups(groups);
  });
  ipcMain.handle("assets:select-files-for-group", async (_event, groupId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Add files to asset group",
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true, groups: await getGroups() };
    }
    const groups = await addFilesToGroup(groupId, result.filePaths);
    return { canceled: false, groups };
  });
  ipcMain.handle("assets:add-files-to-group", (_event, groupId, filePaths = []) =>
    addFilesToGroup(groupId, filePaths),
  );
  ipcMain.handle("assets:add-indexed-files-to-group", (_event, groupId, sourceKind, ids = []) =>
    addIndexedFilesToGroup(groupId, sourceKind, ids),
  );
  ipcMain.handle("assets:remove-files-from-group", async (_event, groupId, ids = []) => {
    const selectedIds = new Set(Array.isArray(ids) ? ids : []);
    if (!selectedIds.size) return getGroups();
    const store = await readAssetsStore();
    const groups = sanitizeAssetGroups(store.groups || []).map((group) =>
      group.id === groupId
        ? {
            ...group,
            updatedAt: new Date().toISOString(),
            items: (group.items || []).filter((item) => !selectedIds.has(item.id)),
          }
        : group,
    );
    return saveGroups(groups);
  });
}

function setupDiagnosticsIpc() {
  ipcMain.handle("diagnostics:get-info", async () => {
    const store = await readGalleryStore();
    const assetsStore = await readAssetsStore();
    const cacheStats = await getGalleryCacheStats();
    const desktopPrefs = await readDesktopPrefs();
    return getDiagnostics({
      appVersion: app.getVersion(),
      appName: app.getName(),
      buildType: app.isPackaged ? "Electron packaged" : "Electron dev",
      electronMode: true,
      galleryIpcAvailable: true,
      galleryLastFolderName: store.lastFolder ? path.basename(store.lastFolder) : "",
      galleryCacheFiles: cacheStats.files,
      galleryCacheBytes: cacheStats.bytes,
      galleryLastScanCounts: store.lastScan?.counts || null,
      assetsIpcAvailable: true,
      assetsLastFolderName: assetsStore.lastFolder ? path.basename(assetsStore.lastFolder) : "",
      assetsLastScanCounts: assetsStore.lastScan?.counts || null,
      updateProviderConfigured: Boolean(autoUpdater.updateConfigPath),
      startupEnabled: desktopPrefs.runOnStartup,
      backgroundModeEnabled: desktopPrefs.backgroundMode,
    });
  });
}

function setupWriteIpc() {
  ipcMain.handle("write:get-state", () => getWriteState());

  ipcMain.handle("write:select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose where ContentFlow saves writing",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true, ...(await getWriteState()) };
    }

    const store = await readWriteStore();
    const folderPath = result.filePaths[0];
    await fs.mkdir(folderPath, { recursive: true });
    const nextStore = {
      ...store,
      folderPath,
      documents: await sanitizeWriteDocuments(store.documents, folderPath),
    };
    await writeWriteStore(nextStore);
    return { canceled: false, ...(await getWriteState()) };
  });

  ipcMain.handle("write:save-text", async (_event, payload = {}) => {
    const content = String(payload.content || "");
    const store = await readWriteStore();
    if (!store.folderPath) return { needsFolder: true, ...(await getWriteState()) };

    await fs.mkdir(store.folderPath, { recursive: true });
    const now = new Date().toISOString();
    const id = payload.id ? String(payload.id) : createWriteDocumentId();
    const extension = String(payload.fileName || "").toLowerCase().endsWith(".txt") ? ".txt" : ".md";
    const existing = store.documents.find((doc) => doc.id === id);
    const baseName = existing
      ? sanitizeWriteFileName(existing.name)
      : `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)} ${sanitizeWriteFileName(
          payload.fileName || getWriteExcerpt(content) || "writing",
        )}`;
    const fileName = `${baseName}${extension}`;
    const filePath = existing?.path || path.join(store.folderPath, fileName);
    await fs.writeFile(filePath, content, "utf8");

    const document = {
      id,
      name: path.basename(filePath),
      path: filePath,
      updatedAt: now,
      excerpt: getWriteExcerpt(content),
    };
    const documents = [document, ...store.documents.filter((doc) => doc.id !== id)].slice(0, 200);
    await writeWriteStore({
      ...store,
      currentId: id,
      documents,
    });
    return { saved: true, currentId: id, ...(await getWriteState()) };
  });

  ipcMain.handle("write:load-text", async (_event, id) => {
    const store = await readWriteStore();
    const document = store.documents.find((doc) => doc.id === id);
    if (!document?.path) return { found: false, ...(await getWriteState()) };
    const content = await fs.readFile(document.path, "utf8");
    await writeWriteStore({ ...store, currentId: document.id });
    return {
      found: true,
      content,
      document,
      ...(await getWriteState()),
    };
  });
}

app.whenReady().then(async () => {
  configureLogger(app.getPath("userData"));
  const themePrefs = await readThemePrefs();
  nativeTheme.themeSource = electronThemeSource(themePrefs.mode);
  nativeTheme.on("updated", () => {
    readThemePrefs()
      .then((prefs) => broadcastTheme(prefs))
      .catch((error) => logError("Theme update broadcast failed", error));
  });
  setupMediaProtocol();
  setupUpdates();
  setupUpdateIpc();
  setupCompanionIpc();
  setupGalleryIpc();
  setupAssetsIpc();
  setupWriteIpc();
  setupDiagnosticsIpc();
  await checkOcrAssets();
  await createWindow();
  const desktopPrefs = await readDesktopPrefs();
  if (desktopPrefs.backgroundMode) ensureTray();

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        logError("Startup update check failed", error);
      });
    }, 12000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => logError("Window creation failed", error));
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (activeGalleryScan) activeGalleryScan.cancelled = true;
  if (activeThumbnailWarm) activeThumbnailWarm.cancelled = true;
  if (localServer?.server) localServer.server.close();
});
