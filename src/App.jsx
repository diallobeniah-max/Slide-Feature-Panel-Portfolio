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
  Info,
  RefreshCw,
  ShieldCheck,
  FileArchive,
  ExternalLink,
  Pin,
} from "lucide-react";
import { Suspense, lazy, useEffect, useState, useRef, useCallback } from "react";
import Notifications, { playChime } from "./components/Notifications.jsx";
import UpdateCenter from "./components/UpdateCenter.jsx";

const BatchStudioPanel = lazy(() => import("./components/BatchStudio.jsx"));
const SlideSlicerPanel = lazy(() => import("./components/SlideSlicerPanel.jsx"));
const InstagramPanel = lazy(() => import("./components/InstagramPanel.jsx"));
const GridBuilder = lazy(() => import("./components/GridBuilder.jsx"));
const SpellChecker = lazy(() => import("./components/SpellChecker.jsx"));
const WritingPanel = lazy(() => import("./components/WritingPanel.jsx"));
const YouTubePanel = lazy(() => import("./components/youtube/YouTubePanel.jsx"));
const LocalGallery = lazy(() => import("./components/gallery/LocalGallery.jsx"));
const LocalAssets = lazy(() => import("./components/assets/LocalAssets.jsx"));

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
];
const THEME_STATE_KEY = "contentflow-theme-mode";

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
}) {
  const [open, setOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");
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
  const [desktopPrefs, setDesktopPrefs] = useState(null);
  const ref = useRef(null);

  const isElectron = Boolean(window.contentFlow?.platform?.isElectron);
  const buildType = isElectron ? "Electron" : "Web";
  const galleryIpcAvailable = Boolean(window.contentFlowGallery);
  const updateIpcAvailable = Boolean(window.contentFlow?.updates?.checkForUpdates);
  const diagnosticsAvailable = Boolean(window.contentFlowDiagnostics?.getInfo);
  const desktopAvailable = Boolean(window.contentFlow?.desktop?.getPreferences);

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
        onClick={() => setOpen((v) => !v)}
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

      {/* Dropdown */}
      {open && (
        <div className="animate-studio-pop absolute left-0 top-[calc(100%+10px)] z-50 max-h-[calc(100vh-7rem)] w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900">
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
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="custom-scrollbar max-h-[calc(100vh-13rem)] space-y-5 overflow-y-auto p-5">
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
      )}
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
  const [animKey, setAnimKey] = useState(0);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const canPopoutWorkspace = ["writing", "instagram", "batch", "gallery"].includes(workspace);
  const popoutAvailable = Boolean(window.contentFlow?.windows?.openTool);

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
    setAnimKey((k) => k + 1);
  };

  const handleShellWheel = (event) => {
    if (event.deltaY > 8) {
      setIsHeaderCompact(true);
    } else if (event.deltaY < -8 && window.scrollY <= 4) {
      setIsHeaderCompact(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f8f5ef] text-zinc-950 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-50"
      onWheelCapture={handleShellWheel}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
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
            <SettingsPopover
              fontSize={fontSize}
              setFontSize={setFontSize}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
              notifsEnabled={notifsEnabled}
              setNotifsEnabled={setNotifsEnabled}
            />
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
          <nav className="hidden items-center md:flex">
            <div
              className={`flex gap-1 rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition-all duration-300 dark:border-zinc-800/80 dark:bg-zinc-900 ${
                isHeaderCompact ? "p-0.5" : "p-1"
              }`}
            >
              {WORKSPACE_TABS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => switchTab(value)}
                  className={`relative rounded-xl font-black uppercase tracking-widest transition-all duration-300 ease-out ${
                    isHeaderCompact ? "px-3 py-1.5 text-[9px]" : "px-3.5 py-2 text-[10px]"
                  }
                    ${
                      workspace === value
                        ? "bg-zinc-950 text-white shadow-md dark:bg-white dark:text-zinc-950"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    }`}
                >
                  {label}
                  {workspace === value && (
                    <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-white/30 dark:bg-zinc-950/30" />
                  )}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* Mobile tab bar */}
        <div
          className={`flex gap-1 border-t border-zinc-100 px-4 transition-all duration-300 md:hidden dark:border-zinc-800 overflow-x-auto no-scrollbar ${
            isHeaderCompact ? "py-1.5" : "py-2"
          }`}
        >
          {WORKSPACE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => switchTab(value)}
              className={`shrink-0 rounded-xl px-3 font-black uppercase tracking-widest transition-all duration-200 ${
                isHeaderCompact ? "py-1.5 text-[9px]" : "py-2 text-[10px]"
              }
                ${
                  workspace === value
                    ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Panel content ──────────────────────────────────────── */}
      <main className="panel-enter">
        <LazyTool>
        {workspace === "instagram" ? (
          <InstagramPanel initialUrl={initialIgUrl} />
        ) : workspace === "batch" ? (
          <BatchStudioPanel />
        ) : workspace === "grid" ? (
          <GridBuilder />
        ) : workspace === "spellcheck" ? (
          <SpellChecker />
        ) : workspace === "writing" ? (
          <WritingPanel />
        ) : workspace === "youtube" ? (
          <YouTubePanel />
        ) : workspace === "gallery" ? (
          <LocalGallery />
        ) : workspace === "assets" ? (
          <LocalAssets />
        ) : (
          <SlideSlicerPanel />
        )}
        </LazyTool>
      </main>

      {/* ── Global notifications ──────────────────────────────── */}
      <Notifications notifications={notifications} onDismiss={dismissNotif} />
      <UpdateCenter />
    </div>
  );
}
