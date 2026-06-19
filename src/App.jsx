import {
  Layers,
  Settings,
  X,
  Moon,
  Sun,
  Type,
  Monitor,
  Bell,
  Copy,
  Volume2,
  Cpu,
  Images,
  Image as ImageIcon,
  Info,
  RefreshCw,
  ShieldCheck,
  FileArchive,
  Folder,
  Gauge,
  Grid3X3,
  WandSparkles,
  Pencil,
  Camera,
  TestTube2,
  ChevronRight,
  ExternalLink,
  Palette,
  Pin,
  Wrench,
} from "lucide-react";
import { Suspense, lazy, useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Notifications, { playChime } from "./components/Notifications.jsx";
import UpdateCenter from "./components/UpdateCenter.jsx";
import {
  canChooseWebDownloadFolder,
  chooseWebDownloadFolder,
  getWebDownloadFolderPreferences,
  setWebDownloadFolderPreferences,
} from "./utils/downloadFolders.js";

const BatchStudioPanel = lazy(() => import("./components/BatchStudio.jsx"));
const SlideSlicerPanel = lazy(() => import("./components/SlideSlicerPanel.jsx"));
const InstagramPanel = lazy(() => import("./components/InstagramPanel.jsx"));
const GridBuilder = lazy(() => import("./components/GridBuilder.jsx"));
const SpellChecker = lazy(() => import("./components/SpellChecker.jsx"));
const WritingPanel = lazy(() => import("./components/WritingPanel.jsx"));
const YouTubePanel = lazy(() => import("./components/youtube/YouTubePanel.jsx"));
const LocalGallery = lazy(() => import("./components/gallery/LocalGallery.jsx"));
const LocalAssets = lazy(() => import("./components/assets/LocalAssets.jsx"));
const ToolsPanel = lazy(() => import("./components/ToolsPanel.jsx"));

const iconProps = { strokeWidth: 1.75 };

const WORKSPACE_TABS = [
  { value: "slicer", label: "Slicer" },
  { value: "grid", label: "Grid" },
  { value: "spellcheck", label: "Spell" },
  { value: "writing", label: "Write" },
  { value: "instagram", label: "Capture" },
  { value: "batch", label: "Batch" },
  { value: "youtube", label: "Tube" },
  { value: "gallery", label: "Gallery" },
  { value: "assets", label: "Assets" },
  { value: "tools", label: "Tools" },
];
const THEME_STATE_KEY = "contentflow-theme-mode";
const PANEL_ACCENTS_KEY = "contentflow-panel-accents-v1";
const NAV_LAYOUT_KEY = "contentflow-nav-layout";
const NAV_SHOW_ICONS_KEY = "contentflow-nav-show-icons";
const APP_VERSION = "0.1.4";
const WRITE_COMMAND_ORDER_KEY = "contentflow-write-command-order-v1";
const PANEL_ACCENT_COLORS = [
  { label: "Auto", value: "", kind: "auto" },
  { label: "Emerald", value: "#0f9f76" },
  { label: "Amber", value: "#d97706" },
];
const PANEL_HELP = {
  slicer: "Slice one design into carousel pieces and export a slide set.",
  grid: "Build grid layouts or record a logo/layer placement for repeated images.",
  spellcheck: "Check spelling, OCR text from images, and clean writing.",
  writing: "Write formatted text, use slash commands, save drafts, and insert media.",
  instagram: "Capture or download Instagram media for local editing.",
  batch: "Convert, trim, compress, and preview media files in groups.",
  youtube: "Fetch YouTube info, subtitles, trims, and social-ready downloads.",
  gallery: "Browse local images/videos and drag them into other apps.",
  assets: "Group design files, images, videos, PSD, Affinity, and documents.",
  tools: "Compress, preview, preset, and archive Gallery pictures or videos.",
};
const PANEL_ICON_MAP = {
  slicer: Gauge,
  grid: Grid3X3,
  spellcheck: WandSparkles,
  writing: Pencil,
  instagram: Camera,
  batch: Layers,
  youtube: TestTube2,
  gallery: ImageIcon,
  assets: Folder,
  tools: Wrench,
};
const SETTINGS_PANEL_ORDER = [
  "slicer",
  "batch",
  "grid",
  "youtube",
  "spellcheck",
  "gallery",
  "writing",
  "assets",
  "instagram",
  "tools",
];
const WRITE_COMMAND_OPTIONS = [
  ["text", "Text"],
  ["heading-1", "Heading 1"],
  ["heading-2", "Heading 2"],
  ["heading-3", "Heading 3"],
  ["heading-4", "Heading 4"],
  ["heading-5", "Heading 5"],
  ["bullet", "Bulleted List"],
  ["numbered", "Numbered List"],
  ["todo", "To-do List"],
  ["callout", "Callout"],
  ["divider", "Divider"],
  ["table", "Table"],
  ["image", "Image"],
  ["video", "Video"],
  ["file", "File"],
  ["emoji", "Emoji"],
  ["dropdown", "Dropdown"],
];

const DOWNLOAD_FOLDER_PANELS = [
  { key: "instagram", label: "Capture" },
  { key: "batch", label: "Batch" },
  { key: "grid", label: "Grid" },
  { key: "slicer", label: "Slicer" },
  { key: "spell", label: "Spell" },
  { key: "writing", label: "Write" },
  { key: "tools", label: "Tools" },
];

function getWriteCommandOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(WRITE_COMMAND_ORDER_KEY) || "[]");
    const ids = WRITE_COMMAND_OPTIONS.map(([id]) => id);
    return [
      ...(Array.isArray(saved) ? saved.filter((id) => ids.includes(id)) : []),
      ...ids.filter((id) => !saved?.includes?.(id)),
    ];
  } catch {
    return WRITE_COMMAND_OPTIONS.map(([id]) => id);
  }
}

function getPanelAccents() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_ACCENTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function getPanelAccentValue(panelAccents, panel, isDark = false) {
  const savedAccent = panelAccents[panel];
  if (savedAccent && typeof savedAccent === "object") {
    return savedAccent[isDark ? "dark" : "light"] || savedAccent.light || savedAccent.dark || "";
  }
  return savedAccent || "";
}

function getSavedNavLayout() {
  try {
    const saved = localStorage.getItem(NAV_LAYOUT_KEY);
    return saved === "vertical" ? "vertical" : "horizontal";
  } catch {
    return "horizontal";
  }
}

function getSavedNavShowIcons() {
  try {
    return localStorage.getItem(NAV_SHOW_ICONS_KEY) !== "false";
  } catch {
    return true;
  }
}

function hexToRgb(hex) {
  const normalized = String(hex || "#18181b").replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return { r: 24, g: 24, b: 27 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex({ r, g, b }) {
  const clamp = (value) => Math.max(0, Math.min(255, Number(value) || 0));
  return `#${[clamp(r), clamp(g), clamp(b)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
    if (max === gn) hue = (bn - rn) / delta + 2;
    if (max === bn) hue = (rn - gn) / delta + 4;
    hue *= 60;
  }
  return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

function hslToHex({ h, s, l }) {
  const hue = (((Number(h) || 0) % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
  const lightness = Math.max(0, Math.min(100, Number(l) || 0)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [rn, gn, bn] =
    hue < 60 ? [chroma, x, 0] :
    hue < 120 ? [x, chroma, 0] :
    hue < 180 ? [0, chroma, x] :
    hue < 240 ? [0, x, chroma] :
    hue < 300 ? [x, 0, chroma] :
    [chroma, 0, x];
  return rgbToHex({ r: Math.round((rn + m) * 255), g: Math.round((gn + m) * 255), b: Math.round((bn + m) * 255) });
}

function normalizeHexInput(value) {
  const cleaned = String(value || "").trim().replace("#", "").replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return cleaned.length === 6 ? `#${cleaned}` : "";
}

function ToolLoadingFallback() {
  return (
    <div className="grid min-h-[24rem] place-items-center p-8">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950 dark:border-zinc-800 dark:border-t-white" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Loading tool
        </p>
      </div>
    </div>
  );
}

function LazyTool({ children }) {
  return <Suspense fallback={<ToolLoadingFallback />}>{children}</Suspense>;
}

function formatApproxBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}

function getSavedThemeMode() {
  try {
    return localStorage.getItem(THEME_STATE_KEY) || "auto";
  } catch {
    return "auto";
  }
}

function resolveDarkMode(mode) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
}

function useContentFlowTheme() {
  const [themeMode, setThemeModeState] = useState(getSavedThemeMode);
  const [isDark, setIsDark] = useState(() => resolveDarkMode(getSavedThemeMode()));

  useEffect(() => {
    let cancelled = false;
    window.contentFlow?.theme?.getState?.().then((state) => {
      if (!cancelled && state?.mode) setThemeModeState(state.mode);
    });
    const removeThemeListener = window.contentFlow?.theme?.onChanged?.((state) => {
      if (state?.mode) setThemeModeState(state.mode);
    });
    return () => {
      cancelled = true;
      removeThemeListener?.();
    };
  }, []);

  useEffect(() => {
    const update = () => setIsDark(resolveDarkMode(themeMode));
    update();
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    mediaQuery?.addEventListener?.("change", update);
    const handleStorage = (event) => {
      if (event.key === THEME_STATE_KEY && event.newValue) {
        setThemeModeState(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      mediaQuery?.removeEventListener?.("change", update);
      window.removeEventListener("storage", handleStorage);
    };
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    localStorage.setItem(THEME_STATE_KEY, themeMode);
    window.contentFlow?.theme?.setMode?.(themeMode, isDark);
  }, [isDark, themeMode]);

  return { isDark, themeMode, setThemeMode: setThemeModeState };
}

/* ─── Settings Popover ─────────────────────────────────────────── */
function CompanionPanel() {
  useContentFlowTheme();
  return (
    <main className="min-h-screen bg-[#f8f5ef] p-4 text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <div className="rounded-3xl border border-zinc-200 bg-white/90 p-4 shadow-2xl dark:border-white/10 dark:bg-zinc-900/90">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          ContentFlow Companion
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Quick Tools</h1>
        <div className="mt-5 grid gap-3">
          {[
            ["Write Tools", "Quick notes and editor controls foundation."],
            ["OCR Quick Scan", "Future desktop scan entry point."],
            ["Capture Links", "Paste and prepare capture links."],
            ["Quick Notes", "Small scratchpad window foundation."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-zinc-200 bg-zinc-100 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm font-black">{title}</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function PopoutShell({ tool }) {
  useContentFlowTheme();
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const titles = {
    writing: "Write",
    instagram: "Capture",
    batch: "Batch",
    gallery: "Gallery",
  };

  useEffect(() => {
    document.documentElement.classList.add("contentflow-popout");
    let cancelled = false;
    window.contentFlow?.popout?.getState?.().then((state) => {
      if (!cancelled) setAlwaysOnTop(Boolean(state?.alwaysOnTop));
    });
    return () => {
      cancelled = true;
      document.documentElement.classList.remove("contentflow-popout");
    };
  }, []);

  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    const state = await window.contentFlow?.popout?.setAlwaysOnTop?.(next);
    if (state) setAlwaysOnTop(Boolean(state.alwaysOnTop));
  };

  const renderTool = () => {
    if (tool === "writing") return <LazyTool><WritingPanel /></LazyTool>;
    if (tool === "instagram") return <LazyTool><InstagramPanel /></LazyTool>;
    if (tool === "batch") return <LazyTool><BatchStudioPanel /></LazyTool>;
    if (tool === "gallery") return <LazyTool><LocalGallery /></LazyTool>;
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8f5ef] p-6 text-zinc-950 dark:bg-zinc-950 dark:text-white">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-white/10 dark:bg-white/5">
          <p className="text-sm font-black">This ContentFlow tool cannot be popped out yet.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f5ef] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-[#f8f5ef]/90 px-5 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
              <Layers size={14} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                ContentFlow Popout
              </p>
              <h1 className="text-sm font-black text-zinc-900 dark:text-white">
                {titles[tool] || "Tool"}
              </h1>
            </div>
          </div>
          {window.contentFlow?.popout?.setAlwaysOnTop && (
            <button
              type="button"
              onClick={toggleAlwaysOnTop}
              aria-pressed={alwaysOnTop}
              title={alwaysOnTop ? "Unpin window" : "Keep window on top"}
              className={`grid h-10 w-10 place-items-center rounded-2xl border text-zinc-500 shadow-sm transition hover:-translate-y-0.5 ${
                alwaysOnTop
                  ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                  : "border-zinc-200 bg-white hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white"
              }`}
            >
              <Pin size={16} />
            </button>
          )}
        </div>
      </header>
      {renderTool()}
    </div>
  );
}

function SettingsPopover({
  fontSize,
  setFontSize,
  themeMode,
  setThemeMode,
  soundEnabled,
  setSoundEnabled,
  notifsEnabled,
  setNotifsEnabled,
  panelAccents,
  setPanelAccent,
  activeWorkspace,
  onSelectWorkspace,
  navLayout,
  setNavLayout,
  showNavIcons,
  setShowNavIcons,
}) {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [expandedColorPanel, setExpandedColorPanel] = useState(null);
  const [colorEditorMode, setColorEditorMode] = useState("RGB");
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [updateStatus, setUpdateStatus] = useState("Ready");
  const [lastChecked, setLastChecked] = useState("");
  const [galleryLastFolder, setGalleryLastFolder] = useState("");
  const [galleryCacheStats, setGalleryCacheStats] = useState(null);
  const [galleryLastScan, setGalleryLastScan] = useState(null);
  const [assetsLastFolder, setAssetsLastFolder] = useState("");
  const [assetsLastScan, setAssetsLastScan] = useState(null);
  const [ocrMode, setOcrMode] = useState(
    () => localStorage.getItem("contentflow-ocr-default-mode") || "fast",
  );
  const [ocrPreprocess, setOcrPreprocess] = useState(
    () => localStorage.getItem("contentflow-ocr-preprocess") !== "false",
  );
  const [desktopPrefs, setDesktopPrefs] = useState(() =>
    window.contentFlow?.desktop?.getPreferences ? null : getWebDownloadFolderPreferences(),
  );
  const [writeCommandOrder, setWriteCommandOrder] = useState(getWriteCommandOrder);
  const ref = useRef(null);

  const isElectron = Boolean(window.contentFlow?.platform?.isElectron);
  const buildType = isElectron ? "Electron" : "Web";
  const galleryIpcAvailable = Boolean(window.contentFlowGallery);
  const updateIpcAvailable = Boolean(window.contentFlow?.updates?.checkForUpdates);
  const diagnosticsAvailable = Boolean(window.contentFlowDiagnostics?.getInfo);
  const desktopAvailable = Boolean(window.contentFlow?.desktop?.getPreferences);
  const folderPickerAvailable = desktopAvailable || canChooseWebDownloadFolder();

  const openSettings = () => {
    setIsClosing(false);
    setOpen(true);
  };

  const closeSettings = () => {
    if (!open || isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
    }, 320);
  };

  const chooseWorkspace = (value) => {
    onSelectWorkspace?.(value);
    closeSettings();
  };

  const setNavigationLayout = (value) => {
    setNavLayout(value);
    localStorage.setItem(NAV_LAYOUT_KEY, value);
  };

  const toggleHorizontalIcons = () => {
    setShowNavIcons((current) => {
      const next = !current;
      localStorage.setItem(NAV_SHOW_ICONS_KEY, String(next));
      return next;
    });
  };

  const sizes = [
    { label: "SM", value: 14 },
    { label: "MD", value: 16 },
    { label: "LG", value: 18 },
  ];

  useEffect(() => {
    let cancelled = false;
    const loadGalleryDiagnostics = async () => {
      try {
        const [folder, cacheStats, lastScan] = await Promise.all([
          window.contentFlowGallery?.getLastFolder?.(),
          window.contentFlowGallery?.getCacheStats?.(),
          window.contentFlowGallery?.getLastScan?.(),
        ]);
        if (cancelled) return;
        setGalleryLastFolder(folder || "");
        setGalleryCacheStats(cacheStats || null);
        setGalleryLastScan(lastScan || null);
        const [assetsFolder, assetsScan] = await Promise.all([
          window.contentFlowAssets?.getLastFolder?.(),
          window.contentFlowAssets?.getLastScan?.(),
        ]);
        setAssetsLastFolder(assetsFolder || "");
        setAssetsLastScan(assetsScan || null);
      } catch {
        if (!cancelled) {
          setGalleryCacheStats(null);
          setGalleryLastScan(null);
        }
      }
    };
    window.contentFlow?.updates?.getCurrentVersion?.().then((version) => {
      if (!cancelled && version) setAppVersion(version);
    });
    window.contentFlow?.desktop?.getPreferences?.().then((prefs) => {
      if (!cancelled) setDesktopPrefs(prefs || null);
    });
    loadGalleryDiagnostics();
    const removeUpdateListener = window.contentFlow?.updates?.onStatus?.((payload) => {
      setUpdateStatus(payload?.title || payload?.state || "Update status changed");
      if (payload?.state === "checking" || payload?.state === "not-available") {
        setLastChecked(new Date().toLocaleString());
      }
    });
    return () => {
      cancelled = true;
      removeUpdateListener?.();
    };
  }, []);

  const setOcrDefaultMode = (mode) => {
    setOcrMode(mode);
    localStorage.setItem("contentflow-ocr-default-mode", mode);
    window.dispatchEvent(new Event("contentflow-settings-changed"));
  };

  const toggleOcrPreprocess = () => {
    const next = !ocrPreprocess;
    setOcrPreprocess(next);
    localStorage.setItem("contentflow-ocr-preprocess", String(next));
    window.dispatchEvent(new Event("contentflow-settings-changed"));
  };

  const checkForUpdates = async () => {
    if (!window.contentFlow?.updates?.checkForUpdates) {
      setUpdateStatus("Updates are available in Electron builds.");
      return;
    }
    setUpdateStatus("Checking for updates");
    const result = await window.contentFlow.updates.checkForUpdates();
    setUpdateStatus(result?.title || result?.state || "Update check started");
    setLastChecked(new Date().toLocaleString());
  };

  const setRunOnStartup = async (enabled) => {
    const prefs = await window.contentFlow?.desktop?.setRunOnStartup?.(enabled);
    if (prefs) setDesktopPrefs(prefs);
  };

  const setBackgroundMode = async (enabled) => {
    const prefs = await window.contentFlow?.desktop?.setBackgroundMode?.(enabled);
    if (prefs) setDesktopPrefs(prefs);
  };

  const chooseDownloadFolder = async (key) => {
    try {
      const prefs = desktopAvailable
        ? await window.contentFlow.desktop.selectDownloadFolder(key)
        : await chooseWebDownloadFolder(key);
      if (prefs && !prefs.canceled) {
        setDesktopPrefs(prefs);
        window.dispatchEvent(new Event("contentflow-download-folders-changed"));
        window.dispatchEvent(new CustomEvent("studio-notify", {
          detail: {
            title: "Download Folder Set",
            message: key === "global" ? "All connected exports will use this folder by default." : key === "videoGrabber" ? "Video Grabber will save here by default." : "Folder preference saved.",
            type: "success",
          },
        }));
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Folder Not Set", message: error?.message || "Could not open the folder picker.", type: "error" },
      }));
    }
  };

  const setDownloadFolderPatch = async (patch) => {
    const prefs = desktopAvailable
      ? await window.contentFlow.desktop.setDownloadFolders(patch)
      : setWebDownloadFolderPreferences(patch);
    if (prefs) {
      setDesktopPrefs(prefs);
      window.dispatchEvent(new Event("contentflow-download-folders-changed"));
    }
  };

  const downloadFolders = desktopPrefs?.downloadFolders || {};

  const moveWriteCommand = (id, direction) => {
    setWriteCommandOrder((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      localStorage.setItem(WRITE_COMMAND_ORDER_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("contentflow-write-commands-changed"));
      return next;
    });
  };

  const clearGalleryCache = async () => {
    if (!window.contentFlowGallery?.clearGalleryCache) return;
    await window.contentFlowGallery.clearGalleryCache();
    const cacheStats = await window.contentFlowGallery?.getCacheStats?.();
    setGalleryCacheStats(cacheStats || null);
    window.dispatchEvent(
      new CustomEvent("studio-notify", {
        detail: { title: "Gallery Cache Cleared", message: "Local thumbnail/cache data was cleared." },
      }),
    );
  };

  const clearGalleryTags = async () => {
    if (!window.contentFlowGallery?.clearLocalTags) return;
    await window.contentFlowGallery.clearLocalTags();
    window.dispatchEvent(
      new CustomEvent("studio-notify", {
        detail: { title: "Gallery Tags Cleared", message: "Local gallery tags were removed." },
      }),
    );
  };

  const copyDiagnosticInfo = async () => {
    const diagnostics = window.contentFlowDiagnostics?.getInfo
      ? await window.contentFlowDiagnostics.getInfo()
      : {
          generatedAt: new Date().toISOString(),
          appVersion,
          buildType,
          electronMode: false,
          galleryIpcAvailable: false,
          updateIpcAvailable: false,
          ocrStatus: "local browser OCR assets",
          lastError: null,
        };
    await navigator.clipboard?.writeText(JSON.stringify(diagnostics, null, 2));
    window.dispatchEvent(
      new CustomEvent("studio-notify", {
        detail: { title: "Diagnostics Copied", message: "Safe local diagnostic info was copied." },
      }),
    );
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => (open ? closeSettings() : openSettings())}
        aria-label="Open settings"
        className={`group relative grid h-10 w-10 place-items-center rounded-2xl border transition-all duration-300 ease-out
          ${
            open
              ? "border-zinc-900 bg-zinc-950 text-white shadow-lg dark:border-white dark:bg-white dark:text-zinc-950"
              : "border-zinc-200 bg-white text-zinc-500 shadow-sm hover:-translate-y-0.5 hover:border-zinc-400 hover:text-zinc-950 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white"
          }`}
      >
        <Settings
          size={18}
          {...iconProps}
          className={`transition-transform duration-500 ease-out ${open ? "rotate-90" : "group-hover:rotate-45"}`}
        />
      </button>

      {/* Settings drawer */}
      {open && typeof document !== "undefined" && createPortal((
        <div
          className={`fixed inset-0 z-[9990] ${
            isClosing ? "pointer-events-none animate-settings-backdrop-out" : "animate-settings-backdrop-in"
          }`}
        >
          <button
            type="button"
            aria-label="Close settings"
            className="absolute inset-0 bg-black/25"
            onClick={closeSettings}
          />
        <div
          className={`absolute bottom-6 top-6 flex w-[44rem] max-w-[96vw] flex-col overflow-hidden rounded-[2rem] border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900 ${
            navLayout === "vertical" ? "left-20 max-w-[calc(100vw-6rem)]" : "left-6"
          } ${
            isClosing ? "animate-settings-drawer-out" : "animate-settings-drawer"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <Monitor size={15} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-100">
                  Interface
                </p>
                <p className="text-[10px] font-mono text-zinc-400">
                  {fontSize}px root
                </p>
              </div>
            </div>
            <button
              onClick={closeSettings}
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-all duration-300 hover:rotate-90 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {/* Scale presets */}
            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Text Scale
              </p>
              <div className="grid grid-cols-3 gap-2">
                {sizes.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setFontSize(s.value)}
                    className={`rounded-xl py-2 text-[11px] font-black uppercase tracking-widest transition-all duration-200
                      ${
                        fontSize === s.value
                          ? "bg-zinc-950 text-white shadow-md dark:bg-white dark:text-zinc-950"
                          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom slider */}
            <details className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Info size={15} {...iconProps} /> Panel Guide
                </span>
                <ChevronRight size={15} {...iconProps} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-4">
              <div className="mb-4 flex items-start gap-3 text-zinc-500">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-inner dark:bg-zinc-800 dark:text-zinc-200">
                  <Info size={18} />
                </div>
                <div>
                  <span className="text-[13px] font-black uppercase tracking-[0.22em] text-zinc-900 dark:text-zinc-100">
                  Panel Guide
                  </span>
                  <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-zinc-500">
                    Learn what each panel does and when to use it.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SETTINGS_PANEL_ORDER.map((value) => {
                  const tab = WORKSPACE_TABS.find((item) => item.value === value);
                  const PanelIcon = PANEL_ICON_MAP[value] || Layers;
                  return (
                    <button
                      type="button"
                      onClick={() => chooseWorkspace(value)}
                      key={value}
                      className={`flex min-h-[5.25rem] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 ${
                        activeWorkspace === value
                          ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                          : "border-zinc-100 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/70"
                      }`}
                    >
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-100 bg-zinc-50 text-zinc-700 shadow-inner dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                        <PanelIcon size={19} {...iconProps} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-900 dark:text-zinc-100">
                          {tab?.label}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-relaxed text-zinc-500">
                          {PANEL_HELP[value]}
                        </p>
                      </div>
                      <ChevronRight size={16} className="ml-auto shrink-0 text-zinc-400" {...iconProps} />
                    </button>
                  );
                })}
              </div>
              </div>
            </details>

            <details className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Palette size={15} {...iconProps} /> Panel Colors
                </span>
                <ChevronRight size={15} {...iconProps} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-4">
              <div className="mb-4 flex items-start gap-3 text-zinc-500">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-inner dark:bg-zinc-800 dark:text-zinc-200">
                  <Palette size={18} />
                </div>
                <div>
                <span className="text-[13px] font-black uppercase tracking-[0.22em] text-zinc-900 dark:text-zinc-100">
                  Panel Colors
                </span>
                <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-zinc-500">
                  Choose auto, two prime colors, or a custom color wheel.
                </p>
                </div>
              </div>
              <div className="grid gap-3">
                {SETTINGS_PANEL_ORDER.map((value) => {
                  const tab = WORKSPACE_TABS.find((item) => item.value === value);
                  const PanelIcon = PANEL_ICON_MAP[value] || Layers;
                  const currentAccent = getPanelAccentValue(panelAccents, value);
                  const customSelected =
                    currentAccent && !PANEL_ACCENT_COLORS.some((color) => color.value === currentAccent);
                  const expanded = expandedColorPanel === value;
                  const customColor = currentAccent || "#18181b";
                  const rgb = hexToRgb(customColor);
                  const hsl = hexToHsl(customColor);
                  const updateRgb = (channel, channelValue) => {
                    setPanelAccent(value, rgbToHex({ ...rgb, [channel]: channelValue }));
                  };
                  const updateHsl = (channel, channelValue) => {
                    setPanelAccent(value, hslToHex({ ...hsl, [channel]: channelValue }));
                  };
                  const pickFieldColor = (event, field) => {
                    const rect = field.getBoundingClientRect();
                    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
                    setPanelAccent(value, hslToHex({ h: hsl.h, s: Math.round(x * 100), l: Math.round((1 - y) * 100) }));
                  };
                  const copyHex = async () => {
                    await navigator.clipboard?.writeText(customColor.toUpperCase());
                    window.dispatchEvent(
                      new CustomEvent("studio-notify", {
                        detail: { title: "Hex Copied", message: customColor.toUpperCase() },
                      }),
                    );
                  };
                  return (
                  <div
                    key={value}
                    className={`overflow-hidden rounded-2xl border bg-white/80 shadow-sm transition-colors dark:bg-zinc-900/70 ${
                      expanded
                        ? "border-zinc-950/60 dark:border-white/70"
                        : "border-zinc-100 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3 px-3.5 py-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-50 text-zinc-700 shadow-inner dark:bg-zinc-950 dark:text-zinc-200">
                        <PanelIcon size={18} {...iconProps} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-200">
                          {tab?.label}
                        </p>
                        <p className="mt-0.5 hidden truncate text-[10px] font-medium text-zinc-500 sm:block">
                          Adjust the color used in the {tab?.label} panel.
                        </p>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {PANEL_ACCENT_COLORS.map((color) => (
                        <button
                          key={`${value}-${color.label}`}
                          type="button"
                          onClick={() => setPanelAccent(value, color.value)}
                          title={color.label}
                          className={`h-9 w-9 rounded-full border shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_5px_10px_rgba(0,0,0,0.12)] transition hover:scale-105 ${
                            currentAccent === color.value
                              ? "border-white ring-2 ring-zinc-950/35 ring-offset-2 ring-offset-white dark:ring-white/70 dark:ring-offset-zinc-900"
                              : "border-white/80 opacity-90 dark:border-white/10"
                          }`}
                          style={{
                            background:
                              color.value ||
                              "linear-gradient(135deg,#111827 0%,#111827 47%,#f4f4f5 53%,#f4f4f5 100%)",
                          }}
                        />
                        ))}
                        <button
                          type="button"
                          onClick={() => setExpandedColorPanel((current) => (current === value ? null : value))}
                          title="Custom color"
                          aria-expanded={expanded}
                          className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_5px_10px_rgba(0,0,0,0.12)] transition hover:scale-105 ${
                            customSelected || expanded
                              ? "border-white ring-2 ring-zinc-950/35 ring-offset-2 ring-offset-white dark:ring-white/70 dark:ring-offset-zinc-900"
                              : "border-white/80 dark:border-white/10"
                          }`}
                          style={{
                            background: currentAccent || "conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff2d55,#ff3b30)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedColorPanel((current) => (current === value ? null : value))}
                          className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
                          aria-label={`${expanded ? "Close" : "Open"} ${tab?.label} color options`}
                        >
                          <ChevronRight
                            size={16}
                            {...iconProps}
                            className={`transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`}
                          />
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="grid gap-4 border-t border-zinc-100 p-4 dark:border-zinc-800 lg:grid-cols-[12rem_1fr]">
                        <div className="grid content-start gap-3 text-xs font-semibold text-zinc-500">
                          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            Custom Color
                          </span>
                          <div
                            className="relative block h-28 w-28 overflow-hidden rounded-full border border-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_10px_24px_rgba(0,0,0,0.22)]"
                            style={{
                              background:
                                "conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff2d55,#ff3b30)",
                            }}
                          >
                            <span className="absolute inset-[38%] rounded-full border-2 border-white/80 shadow" />
                          </div>
                        </div>
                        <div className="grid gap-3">
                          <label className="grid gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            Color Field
                            <div
                              onPointerDown={(event) => {
                                const field = event.currentTarget;
                                pickFieldColor(event, field);
                                const move = (moveEvent) => pickFieldColor(moveEvent, field);
                                const up = () => {
                                  window.removeEventListener("pointermove", move);
                                  window.removeEventListener("pointerup", up);
                                  window.removeEventListener("pointercancel", up);
                                };
                                window.addEventListener("pointermove", move);
                                window.addEventListener("pointerup", up);
                                window.addEventListener("pointercancel", up);
                              }}
                              className="relative block h-24 w-full cursor-crosshair overflow-visible rounded-xl border border-zinc-200 shadow-inner dark:border-zinc-700"
                              style={{
                                background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(0,0,0,0.92) 100%), linear-gradient(90deg, #fff 0%, hsl(${hsl.h} 100% 50%) 100%)`,
                              }}
                            >
                              <span
                                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                                style={{ left: `${hsl.s}%`, top: `${100 - hsl.l}%`, backgroundColor: customColor }}
                              />
                            </div>
                          </label>
                          <div className="relative h-3 overflow-hidden rounded-full border border-white/20 bg-[linear-gradient(90deg,#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff2d55,#ff3b30)]">
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={hsl.h}
                              onChange={(event) => updateHsl("h", event.target.value)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              aria-label={`${tab?.label} hue`}
                            />
                            <span
                              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow"
                              style={{ left: `calc(${hsl.h / 3.6}% - 0.5rem)`, backgroundColor: customColor }}
                            />
                          </div>
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <div className="grid grid-cols-3 rounded-xl border border-zinc-200 bg-zinc-100 p-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                              {["RGB", "HEX", "HSL"].map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setColorEditorMode(mode)}
                                  className={`rounded-lg px-3 py-1.5 transition ${
                                    colorEditorMode === mode
                                      ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                                      : "hover:text-zinc-900 dark:hover:text-white"
                                  }`}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={copyHex}
                              title="Copy HEX"
                              className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:text-white"
                            >
                              <Copy size={15} {...iconProps} />
                            </button>
                          </div>
                          {colorEditorMode === "RGB" && (
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                ["r", "R", rgb.r],
                                ["g", "G", rgb.g],
                                ["b", "B", rgb.b],
                              ].map(([channel, label, channelValue]) => (
                                <label key={channel} className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                  {label}
                                  <input
                                    type="number"
                                    min="0"
                                    max="255"
                                    value={channelValue}
                                    onChange={(event) => updateRgb(channel, event.target.value)}
                                    className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                          {colorEditorMode === "HEX" && (
                            <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              HEX
                              <div className="grid grid-cols-[1fr_auto] gap-2">
                                <input
                                  type="text"
                                  value={customColor.toUpperCase()}
                                  onChange={(event) => {
                                    const next = normalizeHexInput(event.target.value);
                                    if (next) setPanelAccent(value, next);
                                  }}
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-bold tracking-wider text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={copyHex}
                                  className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:text-white"
                                >
                                  Copy
                                </button>
                              </div>
                            </label>
                          )}
                          {colorEditorMode === "HSL" && (
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                ["h", "H", hsl.h, 360],
                                ["s", "S", hsl.s, 100],
                                ["l", "L", hsl.l, 100],
                              ].map(([channel, label, channelValue, max]) => (
                                <label key={channel} className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                  {label}
                                  <input
                                    type="number"
                                    min="0"
                                    max={max}
                                    value={channelValue}
                                    onChange={(event) => updateHsl(channel, event.target.value)}
                                    className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Recent
                            </span>
                            {["#7c3aed", "#2563eb", "#0ea5a4", "#22c55e", "#f59e0b", "#f97316", "#ef4444"].map((recent) => (
                              <button
                                key={recent}
                                type="button"
                                title={recent}
                                onClick={() => setPanelAccent(value, recent)}
                                className="h-6 w-6 rounded-full border border-white/70 shadow-sm"
                                style={{ backgroundColor: recent }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              </div>
            </details>

            <details className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Monitor size={15} {...iconProps} /> Accessibility Panel
                </span>
                <ChevronRight size={15} {...iconProps} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-4">
              <div className="mb-4 flex items-start gap-3 text-zinc-500">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-inner dark:bg-zinc-800 dark:text-zinc-200">
                  <Monitor size={18} />
                </div>
                <div>
                  <span className="text-[13px] font-black uppercase tracking-[0.22em] text-zinc-900 dark:text-zinc-100">
                    Accessibility Panel
                  </span>
                  <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-zinc-500">
                    Choose how the main panel navigation is displayed.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["horizontal", "Horizontal"],
                  ["vertical", "Vertical"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNavigationLayout(value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      navLayout === value
                        ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                        : "border-zinc-100 bg-white/80 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.18em]">{label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleHorizontalIcons}
                disabled={navLayout === "vertical"}
                className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:opacity-45 ${
                  showNavIcons
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                    : "border-zinc-100 bg-white/80 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300"
                }`}
              >
                <span className="text-[11px] font-black uppercase tracking-[0.18em]">
                  Horizontal Icons
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
                  {showNavIcons ? "On" : "Off"}
                </span>
              </button>
              </div>
            </details>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Type size={13} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Custom
                  </span>
                </div>
                <span className="rounded-lg bg-zinc-950 px-2 py-0.5 font-mono text-[10px] font-bold text-white dark:bg-white dark:text-zinc-950">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min="13"
                max="21"
                step="0.5"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="studio-range w-full"
              />
              <div className="mt-2 flex justify-between text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                <span>13px</span>
                <span>21px</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <Folder size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Download Folders
                </span>
              </div>
              <div className="mb-3 rounded-xl bg-zinc-950 p-3 text-white dark:bg-white dark:text-zinc-950">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Global export folder</p>
                    <p className="mt-1 truncate text-xs font-semibold">{downloadFolders.global || "Choose once for every panel"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!folderPickerAvailable}
                    onClick={() => chooseDownloadFolder("global")}
                    className="shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-40 dark:bg-zinc-950 dark:text-white"
                  >
                    Choose
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setDownloadFolderPatch({ useGlobalForAll: !downloadFolders.useGlobalForAll })}
                  className={`mt-3 w-full rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition ${
                    downloadFolders.useGlobalForAll ? "bg-emerald-500 text-white" : "bg-white/10 text-white dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {downloadFolders.useGlobalForAll ? "Global folder active for all panels" : "Use separate panel folders"}
                </button>
              </div>
              <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/70">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      Video Grabber
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {downloadFolders.videoGrabber || "Ask where to save"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!folderPickerAvailable}
                    onClick={() => chooseDownloadFolder("videoGrabber")}
                    className="shrink-0 rounded-xl bg-zinc-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                  >
                    Choose
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={!desktopAvailable && !canChooseWebDownloadFolder()}
                onClick={() => setDownloadFolderPatch({ useVideoGrabberForAll: !downloadFolders.useVideoGrabberForAll })}
                className={`mt-2 w-full rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-40 ${
                  downloadFolders.useVideoGrabberForAll
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                }`}
              >
                Legacy panels use {downloadFolders.useVideoGrabberForAll ? "Video Grabber folder" : "own folders"}
              </button>
              <div className="mt-3 grid gap-2">
                {DOWNLOAD_FOLDER_PANELS.map((panel) => (
                  <div
                    key={panel.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-white/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/50"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        {panel.label}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-zinc-500">
                        {downloadFolders.useGlobalForAll && downloadFolders.global
                          ? downloadFolders.global
                          : downloadFolders.useVideoGrabberForAll
                          ? (downloadFolders.videoGrabber || "Same as Video Grabber")
                          : (downloadFolders[panel.key] || "Ask where to save")}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!folderPickerAvailable || downloadFolders.useGlobalForAll || downloadFolders.useVideoGrabberForAll}
                      onClick={() => chooseDownloadFolder(panel.key)}
                      className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-35 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    >
                      Set
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] font-medium leading-relaxed text-zinc-500">
                The global folder is used automatically by connected export panels. Turn it off only when individual panels need different locations.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <FileArchive size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Assets
                </span>
              </div>
              <p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {assetsLastFolder || "No assets folder selected"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {assetsLastScan?.counts?.total ?? 0} Assets
                </span>
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {assetsLastScan?.counts?.psd ?? 0} PSD
                </span>
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {assetsLastScan?.counts?.affinity ?? 0} Affinity
                </span>
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {assetsLastScan?.counts?.skipped ?? 0} Skipped
                </span>
              </div>
            </div>

            {/* Sound + Notification toggles */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "Sound",
                  icon: <Volume2 size={14} />,
                  val: soundEnabled,
                  set: setSoundEnabled,
                },
                {
                  label: "Alerts",
                  icon: <Bell size={14} />,
                  val: notifsEnabled,
                  set: setNotifsEnabled,
                },
              ].map(({ label, icon, val, set }) => (
                <button
                  key={label}
                  onClick={() => set((v) => !v)}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 transition-all ${
                    val
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white/50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                    {icon} {label}
                  </span>
                  <span
                    className={`text-[9px] font-black ${val ? "opacity-60" : "opacity-40"}`}
                  >
                    {val ? "ON" : "OFF"}
                  </span>
                </button>
              ))}
            </div>

            {/* Theme mode toggle */}
            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Theme
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "auto", label: "Auto", icon: <Cpu size={14} /> },
                  { value: "light", label: "Light", icon: <Sun size={14} /> },
                  { value: "dark", label: "Dark", icon: <Moon size={14} /> },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setThemeMode(mode.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl py-3 transition-all duration-200 ${
                      themeMode === mode.value
                        ? "bg-zinc-950 text-white shadow-md dark:bg-white dark:text-zinc-950"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {mode.icon}
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      {mode.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Info size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    App
                  </span>
                </div>
                <span className="rounded-lg bg-zinc-950 px-2 py-0.5 font-mono text-[10px] font-bold text-white dark:bg-white dark:text-zinc-950">
                  v{appVersion}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {buildType}
                </span>
                <button
                  type="button"
                  onClick={copyDiagnosticInfo}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  <Copy size={12} /> Diagnostics
                </button>
              </div>
              <p className="mt-3 text-[10px] font-medium leading-relaxed text-zinc-500">
                Local OCR and gallery data stay on this device. Diagnostics avoid file contents and extracted text.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
                <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                  OCR Local
                </span>
                <span
                  className={`rounded-xl px-3 py-2 ${
                    galleryIpcAvailable
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  }`}
                >
                  Gallery IPC {galleryIpcAvailable ? "On" : "Web"}
                </span>
                <span
                  className={`rounded-xl px-3 py-2 ${
                    updateIpcAvailable
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  }`}
                >
                  Update IPC {updateIpcAvailable ? "On" : "Off"}
                </span>
                <span
                  className={`rounded-xl px-3 py-2 ${
                    diagnosticsAvailable
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  }`}
                >
                  Diagnostics {diagnosticsAvailable ? "On" : "Basic"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <Monitor size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Desktop
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!desktopAvailable}
                  onClick={() => setRunOnStartup(!desktopPrefs?.runOnStartup)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-40 ${
                    desktopPrefs?.runOnStartup
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  }`}
                >
                  Startup {desktopPrefs?.runOnStartup ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  disabled={!desktopAvailable}
                  onClick={() => setBackgroundMode(!desktopPrefs?.backgroundMode)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-40 ${
                    desktopPrefs?.backgroundMode
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  }`}
                >
                  Tray {desktopPrefs?.backgroundMode ? "On" : "Off"}
                </button>
              </div>
              <p className="mt-3 text-[10px] font-medium leading-relaxed text-zinc-500">
                {desktopAvailable
                  ? "Electron can hide to the tray and optionally run on Windows startup."
                  : "Desktop startup and tray settings are available in Electron mode."}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-zinc-500">
                  <RefreshCw size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Updates
                  </span>
                </div>
                <button
                  type="button"
                  onClick={checkForUpdates}
                  className="rounded-xl bg-zinc-950 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  Check
                </button>
              </div>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {updateStatus}
              </p>
              <p className="mt-1 text-[10px] font-medium text-zinc-500">
                {lastChecked ? `Last checked ${lastChecked}` : "Release hosting/signing is still needed for full auto-update distribution."}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <Type size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Write Slash Menu
                </span>
              </div>
              <p className="mb-3 text-[10px] font-medium leading-relaxed text-zinc-500">
                Reorder the commands shown when you type slash in Write.
              </p>
              <div className="grid max-h-72 gap-1 overflow-y-auto pr-1">
                {writeCommandOrder.map((id, index) => {
                  const label = WRITE_COMMAND_OPTIONS.find(([value]) => value === id)?.[1] || id;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-zinc-100 px-2 py-1.5 dark:bg-zinc-800"
                    >
                      <span className="truncate text-[11px] font-black text-zinc-700 dark:text-zinc-200">
                        {label}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveWriteCommand(id, -1)}
                          disabled={index === 0}
                          className="rounded-lg bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 disabled:opacity-35 dark:bg-zinc-950"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveWriteCommand(id, 1)}
                          disabled={index === writeCommandOrder.length - 1}
                          className="rounded-lg bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 disabled:opacity-35 dark:bg-zinc-950"
                        >
                          Down
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <ShieldCheck size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  OCR
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["fast", "accurate"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOcrDefaultMode(mode)}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                      ocrMode === mode
                        ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleOcrPreprocess}
                className={`mt-2 w-full rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                  ocrPreprocess
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                }`}
              >
                Preprocessing {ocrPreprocess ? "On" : "Off"}
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 flex items-center gap-2 text-zinc-500">
                <Images size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Gallery
                </span>
              </div>
              <p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {galleryLastFolder || "No folder selected"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {galleryCacheStats?.files ?? 0} Thumbs
                </span>
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {formatApproxBytes(galleryCacheStats?.bytes)}
                </span>
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {galleryLastScan?.counts?.total ?? 0} Items
                </span>
                <span className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  {galleryLastScan?.counts?.skipped ?? 0} Skipped
                </span>
              </div>
              {galleryLastScan?.counts && (
                <p className="mt-2 text-[10px] font-medium leading-relaxed text-zinc-500">
                  Last scan: {galleryLastScan.counts.images || 0} images,{" "}
                  {galleryLastScan.counts.videos || 0} videos
                  {galleryLastScan.counts.cacheCorrupt
                    ? `, ${galleryLastScan.counts.cacheCorrupt} cache issue${galleryLastScan.counts.cacheCorrupt === 1 ? "" : "s"}`
                    : ""}
                  .
                </p>
              )}
              {galleryLastScan?.error && (
                <p className="mt-2 line-clamp-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  Last scan error: {galleryLastScan.error}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={clearGalleryCache}
                  disabled={!window.contentFlowGallery}
                  className="rounded-xl bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Clear Cache
                </button>
                <button
                  type="button"
                  onClick={clearGalleryTags}
                  disabled={!window.contentFlowGallery}
                  className="rounded-xl bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Clear Tags
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      ), document.body)}
    </div>
  );
}

/* ─── App Shell ────────────────────────────────────────────────── */
export default function App() {
  const initialParams = new URLSearchParams(window.location.search);
  if (initialParams.get("companion") === "1") return <CompanionPanel />;
  if (initialParams.get("popout")) return <PopoutShell tool={initialParams.get("popout")} />;

  const initialIgUrl = initialParams.get("ig") || "";
  const initialWorkspace = initialParams.get("workspace");

  const { isDark, themeMode, setThemeMode } = useContentFlowTheme();
  const [fontSize, setFontSize] = useState(16);
  const [workspace, setWorkspace] = useState(
    initialWorkspace === "capture" || initialIgUrl
      ? "instagram"
      : WORKSPACE_TABS.some((t) => t.value === initialWorkspace)
        ? initialWorkspace
        : "slicer",
  );
  const [prevWorkspace, setPrevWorkspace] = useState(workspace);
  const [visitedWorkspaces, setVisitedWorkspaces] = useState(() => new Set([workspace]));
  const [animKey, setAnimKey] = useState(0);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [panelAccents, setPanelAccents] = useState(getPanelAccents);
  const [navLayout, setNavLayout] = useState(getSavedNavLayout);
  const [showNavIcons, setShowNavIcons] = useState(getSavedNavShowIcons);
  const canPopoutWorkspace = ["writing", "instagram", "batch", "gallery"].includes(workspace);
  const popoutAvailable = Boolean(window.contentFlow?.windows?.openTool);
  const setPanelAccent = useCallback((panel, color) => {
    setPanelAccents((current) => {
      const next = { ...current };
      if (color) {
        next[panel] = color;
      } else {
        delete next[panel];
      }
      localStorage.setItem(PANEL_ACCENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifsEnabled, setNotifsEnabled] = useState(true);

  const dismissNotif = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Global studio-notify event handler
  useEffect(() => {
    const handler = (e) => {
      const { title, message, type = "success" } = e.detail || {};
      if (soundEnabled) playChime(type);
      if (!notifsEnabled) return;
      const id = crypto.randomUUID();
      setNotifications((prev) => [
        ...prev.slice(-4),
        { id, title, message, type },
      ]);
    };
    window.addEventListener("studio-notify", handler);
    return () => window.removeEventListener("studio-notify", handler);
  }, [soundEnabled, notifsEnabled]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--studio-font-size",
      `${fontSize}px`,
    );
  }, [fontSize]);

  useEffect(() => {
    const handleScroll = () => setIsHeaderCompact(window.scrollY > 24);
    const handlePanelScroll = (event) =>
      setIsHeaderCompact(Boolean(event.detail?.compact));
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("studio-panel-scroll", handlePanelScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("studio-panel-scroll", handlePanelScroll);
    };
  }, []);

  useEffect(() => {
    const formatSteppedValue = (value, step) => {
      const stepText = String(step || "");
      const decimals = stepText.includes(".") ? stepText.split(".")[1].length : 0;
      return decimals ? value.toFixed(decimals) : String(Math.round(value));
    };

    const handleNumberWheel = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
      if (document.activeElement !== target && !target.matches(":hover")) return;

      event.preventDefault();
      event.stopPropagation();

      const step = Number(target.step) || 1;
      const min = target.min === "" ? -Infinity : Number(target.min);
      const max = target.max === "" ? Infinity : Number(target.max);
      const fallback = Number.isFinite(min) ? min : 0;
      const current = target.value === "" ? fallback : Number(target.value);
      if (!Number.isFinite(current)) return;

      const direction = event.deltaY < 0 ? 1 : -1;
      const next = Math.min(max, Math.max(min, current + direction * step));
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(target, formatSteppedValue(next, step));
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    };

    window.addEventListener("wheel", handleNumberWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("wheel", handleNumberWheel, {
        capture: true,
      });
    };
  }, []);

  const switchTab = (value) => {
    if (value === workspace) return;
    setPrevWorkspace(workspace);
    setWorkspace(value);
    setVisitedWorkspaces((current) => {
      const next = new Set(current);
      next.add(value);
      return next;
    });
    setAnimKey((k) => k + 1);
  };

  const handleShellWheel = (event) => {
    if (event.deltaY > 8) {
      setIsHeaderCompact(true);
    } else if (event.deltaY < -8 && window.scrollY <= 4) {
      setIsHeaderCompact(false);
    }
  };

  const renderPanelNavButton = ({ value, label }, variant = "horizontal") => {
    const accent = getPanelAccentValue(panelAccents, value, isDark);
    const active = workspace === value;
    const PanelIcon = PANEL_ICON_MAP[value] || Layers;
    const activeStyle = active && accent ? { backgroundColor: accent, color: "#fff" } : undefined;

    if (variant === "vertical") {
      return (
        <button
          key={value}
          type="button"
          onClick={() => switchTab(value)}
          title={label}
          aria-label={label}
          className={`grid h-10 w-10 place-items-center rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${
            active
              ? "border-zinc-950 bg-zinc-950 text-white shadow-md dark:border-white dark:bg-white dark:text-zinc-950"
              : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white"
          }`}
          style={activeStyle}
        >
          <PanelIcon size={18} {...iconProps} />
        </button>
      );
    }

    return (
      <button
        key={value}
        onClick={() => switchTab(value)}
        className={`relative flex items-center gap-2 rounded-xl font-black uppercase tracking-widest transition-all duration-300 ease-out ${
          isHeaderCompact ? "px-3 py-1.5 text-[9px]" : "px-3.5 py-2 text-[10px]"
        }
          ${
             active
              ? "bg-zinc-950 text-white shadow-md dark:bg-white dark:text-zinc-950"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          }`}
        style={activeStyle}
      >
        {showNavIcons && <PanelIcon size={isHeaderCompact ? 13 : 14} {...iconProps} />}
        <span>{label}</span>
        {active && (
          <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-white/30 dark:bg-zinc-950/30" />
        )}
      </button>
    );
  };

  const renderSettingsControl = () => (
    <SettingsPopover
      fontSize={fontSize}
      setFontSize={setFontSize}
      themeMode={themeMode}
      setThemeMode={setThemeMode}
      soundEnabled={soundEnabled}
      setSoundEnabled={setSoundEnabled}
      notifsEnabled={notifsEnabled}
      setNotifsEnabled={setNotifsEnabled}
      panelAccents={panelAccents}
      setPanelAccent={setPanelAccent}
      activeWorkspace={workspace}
      onSelectWorkspace={switchTab}
      navLayout={navLayout}
      setNavLayout={setNavLayout}
      showNavIcons={showNavIcons}
      setShowNavIcons={setShowNavIcons}
    />
  );

  return (
    <div
      className="min-h-screen bg-[#f8f5ef] text-zinc-950 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-50"
      onWheelCapture={handleShellWheel}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      {navLayout !== "vertical" && (
      <header
        className={`sticky top-0 z-40 border-b border-zinc-200/70 bg-[#f8f5ef]/90 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out dark:border-zinc-800/70 dark:bg-zinc-950/90 ${
          isHeaderCompact ? "shadow-lg shadow-black/5 dark:shadow-black/30" : ""
        }`}
      >
        <div
          className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 transition-all duration-300 ease-out ${
            isHeaderCompact ? "py-2" : "py-3.5"
          }`}
        >
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            {renderSettingsControl()}
            {canPopoutWorkspace && popoutAvailable && (
              <button
                type="button"
                onClick={() => window.contentFlow?.windows?.openTool?.(workspace)}
                aria-label="Open current tool in a separate window"
                title="Open in separate window"
                className={`hidden place-items-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:text-zinc-950 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white sm:grid ${
                  isHeaderCompact ? "h-9 w-9" : "h-10 w-10"
                }`}
              >
                <ExternalLink size={17} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <div
                  className={`grid place-items-center rounded-xl bg-zinc-950 text-white shadow-sm transition-all duration-300 dark:bg-white dark:text-zinc-950 ${
                    isHeaderCompact ? "h-6 w-6" : "h-7 w-7"
                  }`}
                >
                  <Layers size={isHeaderCompact ? 13 : 14} strokeWidth={2.5} />
                </div>
                <h1
                  className={`font-black tracking-tight text-zinc-900 transition-all duration-300 dark:text-white ${
                    isHeaderCompact ? "text-[0.98em]" : "text-[1.08em]"
                  }`}
                >
                  ContentFlow
                </h1>
              </div>
            </div>
          </div>

          {/* Desktop tab bar */}
          <nav className={navLayout === "vertical" ? "hidden" : "hidden items-center md:flex"}>
            <div
              className={`flex gap-1 rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition-all duration-300 dark:border-zinc-800/80 dark:bg-zinc-900 ${
                isHeaderCompact ? "p-0.5" : "p-1"
              }`}
            >
              {WORKSPACE_TABS.map((tab) => renderPanelNavButton(tab, "horizontal"))}
            </div>
          </nav>
        </div>

        {/* Mobile tab bar */}
        <div
          className={`flex gap-1 border-t border-zinc-100 px-4 transition-all duration-300 md:hidden dark:border-zinc-800 overflow-x-auto no-scrollbar ${
            isHeaderCompact ? "py-1.5" : "py-2"
          }`}
        >
          {WORKSPACE_TABS.map(({ value, label }) => {
            const accent = getPanelAccentValue(panelAccents, value, isDark);
            const active = workspace === value;
            const PanelIcon = PANEL_ICON_MAP[value] || Layers;
            return (
            <button
              key={value}
              onClick={() => switchTab(value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 font-black uppercase tracking-widest transition-all duration-200 ${
                isHeaderCompact ? "py-1.5 text-[9px]" : "py-2 text-[10px]"
              }
                ${
                   active
                    ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              style={active && accent ? { backgroundColor: accent, color: "#fff" } : undefined}
            >
              {showNavIcons && <PanelIcon size={13} {...iconProps} />}
              {label}
            </button>
            );
          })}
        </div>
      </header>
      )}

      {/* ── Panel content ──────────────────────────────────────── */}
      {navLayout === "vertical" && (
        <aside className="fixed left-4 top-[50vh] z-[10000] hidden max-h-[calc(100vh-3rem)] -translate-y-1/2 flex-col gap-1.5 overflow-y-auto rounded-3xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900/90 md:flex">
          <button
            type="button"
            title="ContentFlow"
            aria-label="ContentFlow"
            className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-950 text-white shadow-md dark:bg-white dark:text-zinc-950"
          >
            <Layers size={18} strokeWidth={2.5} />
          </button>
          {WORKSPACE_TABS.map((tab) => renderPanelNavButton(tab, "vertical"))}
          <div className="grid place-items-center pt-2">
            {renderSettingsControl()}
          </div>
        </aside>
      )}
      <main className={`panel-enter ${navLayout === "vertical" ? "transition-[padding] duration-300 md:pl-20" : ""}`}>
        {visitedWorkspaces.has("slicer") && <div style={{ display: workspace === "slicer" ? "block" : "none" }}>
          <LazyTool><SlideSlicerPanel /></LazyTool>
        </div>}
        {visitedWorkspaces.has("instagram") && <div style={{ display: workspace === "instagram" ? "block" : "none" }}>
          <LazyTool><InstagramPanel initialUrl={initialIgUrl} /></LazyTool>
        </div>}
        {visitedWorkspaces.has("batch") && <div style={{ display: workspace === "batch" ? "block" : "none" }}>
          <LazyTool><BatchStudioPanel /></LazyTool>
        </div>}
        {visitedWorkspaces.has("grid") && <div style={{ display: workspace === "grid" ? "block" : "none" }}>
          <LazyTool><GridBuilder /></LazyTool>
        </div>}
        {visitedWorkspaces.has("spellcheck") && <div style={{ display: workspace === "spellcheck" ? "block" : "none" }}>
          <LazyTool><SpellChecker /></LazyTool>
        </div>}
        {visitedWorkspaces.has("writing") && <div style={{ display: workspace === "writing" ? "block" : "none" }}>
          <LazyTool><WritingPanel /></LazyTool>
        </div>}
        {visitedWorkspaces.has("youtube") && <div style={{ display: workspace === "youtube" ? "block" : "none" }}>
          <LazyTool><YouTubePanel /></LazyTool>
        </div>}
        {visitedWorkspaces.has("gallery") && <div style={{ display: workspace === "gallery" ? "block" : "none" }}>
          <LazyTool><LocalGallery /></LazyTool>
        </div>}
        {visitedWorkspaces.has("assets") && <div style={{ display: workspace === "assets" ? "block" : "none" }}>
          <LazyTool><LocalAssets /></LazyTool>
        </div>}
        {visitedWorkspaces.has("tools") && <div style={{ display: workspace === "tools" ? "block" : "none" }}>
          <LazyTool><ToolsPanel /></LazyTool>
        </div>}
      </main>

      {/* ── Global notifications ──────────────────────────────── */}
      <Notifications notifications={notifications} onDismiss={dismissNotif} />
      <UpdateCenter />
    </div>
  );
}
