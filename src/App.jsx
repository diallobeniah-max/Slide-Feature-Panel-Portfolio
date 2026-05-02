import {
  Layers,
  Settings,
  X,
  Moon,
  Sun,
  Type,
  Monitor,
  Bell,
  Volume2,
  Cpu,
} from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import BatchStudioPanel from "./components/BatchStudio.jsx";
import SlideSlicerPanel from "./components/SlideSlicerPanel.jsx";
import InstagramPanel from "./components/InstagramPanel.jsx";
import GridBuilder from "./components/GridBuilder.jsx";
import SpellChecker from "./components/SpellChecker.jsx";
import WritingPanel from "./components/WritingPanel.jsx";
import YouTubePanel from "./components/YouTubePanel.jsx";
import Notifications, { playChime } from "./components/Notifications.jsx";

const iconProps = { strokeWidth: 1.75 };

const WORKSPACE_TABS = [
  { value: "slicer", label: "Slicer" },
  { value: "grid", label: "Grid" },
  { value: "spellcheck", label: "Spell" },
  { value: "writing", label: "Write" },
  { value: "instagram", label: "Capture" },
  { value: "batch", label: "Batch" },
  { value: "youtube", label: "Tube" },
];

/* ─── Settings Popover ─────────────────────────────────────────── */
function SettingsPopover({
  fontSize,
  setFontSize,
  isDark,
  setIsDark,
  themeMode,
  setThemeMode,
  soundEnabled,
  setSoundEnabled,
  notifsEnabled,
  setNotifsEnabled,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
        <div className="animate-studio-pop absolute left-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900">
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

          <div className="space-y-5 p-5">
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
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
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
                      : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── App Shell ────────────────────────────────────────────────── */
export default function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialIgUrl = initialParams.get("ig") || "";
  const initialWorkspace = initialParams.get("workspace");

  const [isDark, setIsDark] = useState(true);
  const [themeMode, setThemeMode] = useState("auto");
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

  // Auto-detect system theme preference
  useEffect(() => {
    if (themeMode === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      setIsDark(mediaQuery.matches);
      
      const handler = (e) => setIsDark(e.matches);
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      setIsDark(themeMode === "dark");
    }
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

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
      className="min-h-screen bg-zinc-50 text-zinc-950 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-50"
      onWheelCapture={handleShellWheel}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-40 border-b border-zinc-200/70 bg-zinc-50/90 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out dark:border-zinc-800/70 dark:bg-zinc-950/90 ${
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
              isDark={isDark}
              setIsDark={setIsDark}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
              notifsEnabled={notifsEnabled}
              setNotifsEnabled={setNotifsEnabled}
            />
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
          className={`flex gap-1 border-t border-zinc-100 px-4 transition-all duration-300 md:hidden dark:border-zinc-800 ${
            isHeaderCompact ? "py-1.5" : "py-2"
          }`}
        >
          {WORKSPACE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => switchTab(value)}
              className={`flex-1 rounded-xl px-2 font-black uppercase tracking-widest transition-all duration-200 ${
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
      <main key={animKey} className="panel-enter">
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
        ) : (
          <SlideSlicerPanel />
        )}
      </main>

      {/* ── Global notifications ──────────────────────────────── */}
      <Notifications notifications={notifications} onDismiss={dismissNotif} />
    </div>
  );
}
