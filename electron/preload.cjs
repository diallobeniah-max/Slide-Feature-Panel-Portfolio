const { contextBridge, ipcRenderer } = require("electron");

function onIpc(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const updates = {
  getCurrentVersion: () => ipcRenderer.invoke("updates:get-current-version"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  restartAndInstall: () => ipcRenderer.invoke("updates:restart-and-install"),
  onStatus: (callback) => onIpc("updates:status", callback),
};

const gallery = {
  selectFolder: () => ipcRenderer.invoke("gallery:select-folder"),
  scanFolder: (folderPath) => ipcRenderer.invoke("gallery:scan-folder", folderPath || ""),
  cancelScan: () => ipcRenderer.invoke("gallery:cancel-scan"),
  rescanFolder: () => ipcRenderer.invoke("gallery:rescan-folder"),
  getMediaFileUrl: (mediaId) => ipcRenderer.invoke("gallery:get-media-file-url", mediaId),
  getLastFolder: () => ipcRenderer.invoke("gallery:get-last-folder"),
  getCacheStats: () => ipcRenderer.invoke("gallery:get-cache-stats"),
  getLastScan: () => ipcRenderer.invoke("gallery:get-last-scan"),
  startThumbnailCache: (mediaIds) =>
    ipcRenderer.invoke("gallery:start-thumbnail-cache", Array.isArray(mediaIds) ? mediaIds : []),
  pauseThumbnailCache: () => ipcRenderer.invoke("gallery:pause-thumbnail-cache"),
  saveMediaTags: (mediaId, tags) =>
    ipcRenderer.invoke("gallery:save-media-tags", mediaId, tags),
  getMediaTags: (mediaId) => ipcRenderer.invoke("gallery:get-media-tags", mediaId || ""),
  clearGalleryCache: () => ipcRenderer.invoke("gallery:clear-gallery-cache"),
  clearLocalTags: () => ipcRenderer.invoke("gallery:clear-media-tags"),
  onProgress: (callback) => onIpc("gallery:progress", callback),
  onThumbnailProgress: (callback) => onIpc("gallery:thumbnail-progress", callback),
};

const files = {
  openExternal: (kind, id) => ipcRenderer.invoke("files:open-external", kind, id),
  reveal: (kind, id) => ipcRenderer.invoke("files:reveal", kind, id),
  copySelected: (kind, ids) => ipcRenderer.invoke("files:copy-selected", kind, Array.isArray(ids) ? ids : []),
  startDrag: (kind, ids) => ipcRenderer.send("files:start-drag", kind, Array.isArray(ids) ? ids : [ids]),
};

const assets = {
  selectFolder: () => ipcRenderer.invoke("assets:select-folder"),
  scanFolder: (folderPath) => ipcRenderer.invoke("assets:scan-folder", folderPath || ""),
  rescanFolder: () => ipcRenderer.invoke("assets:rescan-folder"),
  getLastFolder: () => ipcRenderer.invoke("assets:get-last-folder"),
  getLastScan: () => ipcRenderer.invoke("assets:get-last-scan"),
  getGroups: () => ipcRenderer.invoke("assets:get-groups"),
  createGroup: (name) => ipcRenderer.invoke("assets:create-group", String(name || "")),
  renameGroup: (groupId, name) => ipcRenderer.invoke("assets:rename-group", String(groupId || ""), String(name || "")),
  deleteGroup: (groupId) => ipcRenderer.invoke("assets:delete-group", String(groupId || "")),
  selectFilesForGroup: (groupId) => ipcRenderer.invoke("assets:select-files-for-group", String(groupId || "")),
  addFilesToGroup: (groupId, filePaths) =>
    ipcRenderer.invoke("assets:add-files-to-group", String(groupId || ""), Array.isArray(filePaths) ? filePaths : []),
  addIndexedFilesToGroup: (groupId, sourceKind, ids) =>
    ipcRenderer.invoke(
      "assets:add-indexed-files-to-group",
      String(groupId || ""),
      String(sourceKind || ""),
      Array.isArray(ids) ? ids : [],
    ),
  removeFilesFromGroup: (groupId, ids) =>
    ipcRenderer.invoke("assets:remove-files-from-group", String(groupId || ""), Array.isArray(ids) ? ids : []),
  onProgress: (callback) => onIpc("assets:progress", callback),
};

const desktop = {
  getPreferences: () => ipcRenderer.invoke("desktop:get-preferences"),
  setRunOnStartup: (enabled) => ipcRenderer.invoke("desktop:set-run-on-startup", Boolean(enabled)),
  setBackgroundMode: (enabled) => ipcRenderer.invoke("desktop:set-background-mode", Boolean(enabled)),
};

const windows = {
  openTool: (tool) => ipcRenderer.invoke("windows:open-tool", String(tool || "")),
};

const popout = {
  getState: () => ipcRenderer.invoke("popout:get-state"),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("popout:set-always-on-top", Boolean(enabled)),
};

const theme = {
  getState: () => ipcRenderer.invoke("theme:get-state"),
  setMode: (mode, isDark) => ipcRenderer.invoke("theme:set-mode", String(mode || "auto"), Boolean(isDark)),
  onChanged: (callback) => onIpc("theme:changed", callback),
};

const appState = {
  setUnsaved: (hasUnsaved, source = "") =>
    ipcRenderer.invoke("app:set-unsaved-state", Boolean(hasUnsaved), String(source || "")),
};

contextBridge.exposeInMainWorld("contentFlow", {
  platform: {
    isElectron: true,
    os: process.platform,
  },
  companion: {
    open: () => ipcRenderer.invoke("companion:open"),
  },
  windows,
  popout,
  theme,
  desktop,
  appState,
  updates,
  files,
  assets,
  gallery: {
    selectImageFolder: () => ipcRenderer.invoke("gallery:select-image-folder"),
  },
});

contextBridge.exposeInMainWorld("contentFlowGallery", gallery);
contextBridge.exposeInMainWorld("contentFlowAssets", assets);
contextBridge.exposeInMainWorld("contentFlowFiles", files);

contextBridge.exposeInMainWorld("contentFlowDiagnostics", {
  getInfo: () => ipcRenderer.invoke("diagnostics:get-info"),
});
