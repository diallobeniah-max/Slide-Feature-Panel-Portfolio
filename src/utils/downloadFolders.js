const DB_NAME = "flow-download-folders";
const STORE_NAME = "handles";
const PREFS_KEY = "flow-web-download-folders-v1";
const LEGACY_PREFIX = ["content", "flow"].join("");
const LEGACY_PREFS_KEY = `${LEGACY_PREFIX}-web-download-folders-v1`;

const EMPTY_FOLDERS = {
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
};

function openFolderDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open folder storage."));
  });
}

async function withStore(mode, operation) {
  const db = await openFolderDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Folder storage failed."));
    });
  } finally {
    db.close();
  }
}

export function canChooseWebDownloadFolder() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function getWebDownloadFolderPreferences() {
  try {
    const savedText = localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_PREFS_KEY) || "{}";
    if (!localStorage.getItem(PREFS_KEY) && savedText !== "{}") localStorage.setItem(PREFS_KEY, savedText);
    const saved = JSON.parse(savedText);
    return {
      downloadFolders: {
        ...EMPTY_FOLDERS,
        ...(saved.downloadFolders || {}),
      },
    };
  } catch {
    return { downloadFolders: { ...EMPTY_FOLDERS } };
  }
}

export function setWebDownloadFolderPreferences(patch) {
  const current = getWebDownloadFolderPreferences();
  const next = {
    downloadFolders: {
      ...current.downloadFolders,
      ...(patch || {}),
    },
  };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

function resolvePreferredFolderKey(preferences, key) {
  if (preferences.useGlobalForAll && preferences.global) return "global";
  if (preferences.useVideoGrabberForAll && preferences.videoGrabber) return "videoGrabber";
  return preferences[key] ? key : preferences.global ? "global" : key;
}

export async function chooseWebDownloadFolder(key) {
  if (!canChooseWebDownloadFolder()) {
    throw new Error("This browser does not support choosing a permanent download folder.");
  }

  const handle = await window.showDirectoryPicker({
    id: `flow-${key}`,
    mode: "readwrite",
  });
  const permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("Folder access was not granted.");

  await withStore("readwrite", (store) => store.put(handle, key));
  return setWebDownloadFolderPreferences(key === "global" ? { [key]: handle.name, useGlobalForAll: true } : { [key]: handle.name });
}

export async function getWebDownloadFolderHandle(key, requestPermission = false) {
  if (!canChooseWebDownloadFolder()) return null;
  const handle = await withStore("readonly", (store) => store.get(key));
  if (!handle) return null;

  let permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted" && requestPermission) {
    permission = await handle.requestPermission({ mode: "readwrite" });
  }
  return permission === "granted" ? handle : null;
}

export async function saveBlobToWebDownloadFolder(handle, fileName, blob) {
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function saveBlobToPreferredFolder(key, fileName, blob) {
  if (window.flow?.desktop?.saveExportFile) {
    const result = await window.flow.desktop.saveExportFile(key, fileName, await blob.arrayBuffer());
    return Boolean(result?.saved);
  }

  const preferences = getWebDownloadFolderPreferences().downloadFolders;
  const preferredKey = resolvePreferredFolderKey(preferences, key);
  const handle = await getWebDownloadFolderHandle(preferredKey, true);
  if (!handle) return false;
  await saveBlobToWebDownloadFolder(handle, fileName, blob);
  return true;
}
