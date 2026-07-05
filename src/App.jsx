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
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Palette,
  Pin,
  Wrench,
  Search,
  Keyboard,
  Download,
  SlidersHorizontal,
  Globe2,
  Network,
  MessageSquare,
  HelpCircle,
  CornerDownLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  User,
  Building2,
  Users,
  HardDrive,
  Package,
  Video,
  ListVideo,
  Ellipsis,
} from "lucide-react";
import { Activity, Suspense, lazy, memo, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Fuse from "fuse.js";
import Notifications, { playChime } from "./components/Notifications.jsx";
import UpdateCenter from "./components/UpdateCenter.jsx";
import {
  canChooseWebDownloadFolder,
  chooseWebDownloadFolder,
  getWebDownloadFolderPreferences,
  setWebDownloadFolderPreferences,
} from "./utils/downloadFolders.js";

const WORKSPACE_LOADERS = {
  slicer: () => import("./components/SlideSlicerPanel.jsx"),
  instagram: () => import("./components/InstagramPanel.jsx"),
  grid: () => import("./components/GridBuilder.jsx"),
  spellcheck: () => import("./components/SpellChecker.jsx"),
  writing: () => import("./components/WritingPanel.jsx"),
  youtube: () => import("./components/youtube/YouTubePanel.jsx"),
  gallery: () => import("./components/gallery/LocalGallery.jsx"),
  assets: () => import("./components/assets/LocalAssets.jsx"),
  tools: () => import("./components/ToolsPanel.jsx"),
};
WORKSPACE_LOADERS.captureTube = () => Promise.all([WORKSPACE_LOADERS.instagram(), WORKSPACE_LOADERS.youtube()]);

const BatchStudioPanel = lazy(() => import("./components/BatchStudio.jsx"));
const SlideSlicerPanel = lazy(WORKSPACE_LOADERS.slicer);
const InstagramPanel = lazy(WORKSPACE_LOADERS.instagram);
const GridBuilder = lazy(WORKSPACE_LOADERS.grid);
const SpellChecker = lazy(WORKSPACE_LOADERS.spellcheck);
const WritingPanel = lazy(WORKSPACE_LOADERS.writing);
const YouTubePanel = lazy(WORKSPACE_LOADERS.youtube);
const LocalGallery = lazy(WORKSPACE_LOADERS.gallery);
const LocalAssets = lazy(WORKSPACE_LOADERS.assets);
const ToolsPanel = lazy(WORKSPACE_LOADERS.tools);

const WORKSPACE_COMPONENTS = {
  slicer: SlideSlicerPanel,
  instagram: InstagramPanel,
  grid: GridBuilder,
  spellcheck: SpellChecker,
  writing: WritingPanel,
  youtube: YouTubePanel,
  gallery: LocalGallery,
  assets: LocalAssets,
  tools: ToolsPanel,
};

const BRAND_ICON_SRC = "/flow-icon.png";
const preloadWorkspace = (workspace) => WORKSPACE_LOADERS[workspace]?.();

const iconProps = { strokeWidth: 1.75 };

const WORKSPACE_TABS = [
  { value: "slicer", label: "Slicer" },
  { value: "grid", label: "Grid" },
  { value: "spellcheck", label: "Spell" },
  { value: "writing", label: "Write" },
  { value: "captureTube", label: "Capture & Tube" },
  { value: "gallery", label: "Gallery" },
  { value: "assets", label: "Assets" },
  { value: "tools", label: "Tools" },
];
const WORKSPACE_LABELS = {
  ...Object.fromEntries(WORKSPACE_TABS.map((tab) => [tab.value, tab.label])),
  batch: "Batch",
};
const THEME_STATE_KEY = "flow-theme-mode";
const PANEL_ACCENTS_KEY = "flow-panel-accents-v1";
const NAV_LAYOUT_KEY = "flow-nav-layout";
const NAV_SHOW_ICONS_KEY = "flow-nav-show-icons";
const APP_VERSION = "0.1.5";
const WRITE_COMMAND_ORDER_KEY = "flow-write-command-order-v1";
const LEGACY_STORAGE_PREFIX = ["content", "flow"].join("");

function legacyFlowKey(key) {
  return key.replace(/^flow/, LEGACY_STORAGE_PREFIX);
}

function readStoredSetting(key, fallback = null) {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    const legacy = localStorage.getItem(legacyFlowKey(key));
    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      return legacy;
    }
  } catch {
    // Ignore storage failures and use the caller fallback.
  }
  return fallback;
}
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
  captureTube: "Capture links and download public video links from one focused workspace.",
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
  captureTube: Camera,
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

const SETTINGS_NAV_ITEMS = [
  { id: "settings-account", label: "Account", description: "Profile, install mode, and security.", icon: User, targetId: "settings-account-panel" },
  { id: "settings-workspace", label: "Workspace", description: "Panels and workspace behavior.", icon: Building2, targetId: "settings-tools" },
  { id: "settings-display", label: "Display", description: "Navigation, icons, and text size.", icon: Monitor, targetId: "settings-display" },
  { id: "settings-appearance", label: "Appearance", description: "Theme and pumpkin accents.", icon: Palette, targetId: "settings-appearance" },
  { id: "settings-storage", label: "Storage", description: "Default save locations.", icon: HardDrive, targetId: "settings-storage" },
  { id: "settings-downloads", label: "Downloads", description: "Video and export folders.", icon: Download, targetId: "settings-storage" },
  { id: "settings-tools", label: "Tools", description: "Panel tools and diagnostics.", icon: Wrench, targetId: "settings-tools" },
  { id: "settings-shortcuts", label: "Shortcuts", description: "Keyboard and command menu.", icon: Keyboard, targetId: "settings-display" },
  { id: "settings-about", label: "About", description: "Version and app builder.", icon: Info, targetId: "settings-local-tools" },
];

const SETTINGS_SEARCH_ITEMS = [
  {
    id: "settings-account",
    type: "settings",
    title: "Settings > Account",
    subtitle: "Settings",
    path: "Settings / Account",
    sectionId: "settings-account-panel",
    icon: User,
    description: "Review profile, sign-in status, install mode, and account security details.",
    actions: ["Open account", "Review install mode", "Check security"],
    keywords: ["account", "profile", "user", "login", "sign in", "google", "security"],
  },
  {
    id: "settings-workspace",
    type: "settings",
    title: "Settings > Workspace",
    subtitle: "Settings",
    path: "Settings / Workspace",
    sectionId: "settings-tools",
    icon: Building2,
    description: "Configure workspace panels and quickly move between Flow tools.",
    actions: ["Open workspace", "Review panels", "Switch tools"],
    keywords: ["workspace", "work space", "panels", "tools", "configure", "organization"],
  },
  {
    id: "settings-general",
    type: "settings",
    title: "General",
    subtitle: "Settings",
    path: "Settings / General",
    sectionId: "settings-tools",
    icon: Settings,
    description: "Review workspace panels, current app state, and the most common Flow settings.",
    actions: ["Open panel list", "Switch workspace", "Review app version"],
    keywords: ["general", "settings", "workspace", "panel", "home", "main", "seetings"],
  },
  {
    id: "settings-appearance",
    type: "settings",
    title: "Settings > Appearance",
    subtitle: "Settings",
    path: "Settings / Appearance",
    sectionId: "settings-appearance",
    icon: Palette,
    description: "Change color mode, pumpkin accents, and per-panel color styling.",
    actions: ["Change theme", "Adjust panel colors", "Preview light and dark mode"],
    keywords: ["appearance", "apprearance", "theme", "dark mode", "light mode", "color", "pumpkin", "accent", "ui"],
  },
  {
    id: "settings-downloads",
    type: "settings",
    title: "Settings > Downloads",
    subtitle: "Settings",
    path: "Settings / Downloads",
    sectionId: "settings-storage",
    icon: Download,
    description: "Control download and export folder behavior for Flow tools.",
    actions: ["Open save locations", "Check Tube override", "Use global folder"],
    keywords: ["download", "downlod", "downloads", "queue", "video", "file", "output", "complete", "exports"],
  },
  {
    id: "settings-save-location",
    type: "settings",
    title: "Settings > Default Save Location",
    subtitle: "Settings / Downloads",
    path: "Settings / Downloads",
    sectionId: "settings-storage",
    highlightId: "settings-default-save-location",
    icon: Folder,
    description: "Configure the folder used across all tools when saving or exporting files.",
    actions: ["Change default folder", "Reset to default", "View current save path"],
    keywords: ["save", "folder", "path", "export", "download", "location", "locaton", "default folder", "files", "output"],
    previewKind: "save-location",
  },
  {
    id: "settings-storage",
    type: "settings",
    title: "Settings > Storage",
    subtitle: "Settings",
    path: "Settings / Storage",
    sectionId: "settings-storage",
    icon: HardDrive,
    description: "Set storage defaults, download folders, and per-tool save overrides.",
    actions: ["Open storage", "Change folder", "Reset default"],
    keywords: ["storage", "stroage", "save", "location", "limits", "folders", "disk"],
  },
  {
    id: "settings-quality-format",
    type: "settings",
    title: "Settings > Quality & Format",
    subtitle: "Settings",
    path: "Settings / Tools",
    sectionId: "settings-tools",
    icon: SlidersHorizontal,
    description: "Review tools that control export quality, file formats, compression, and presets.",
    actions: ["Open Tools", "Review Batch", "Review media presets"],
    keywords: ["quality", "qalty", "format", "compression", "compress", "preset", "export", "jpg", "png", "mp4"],
  },
  {
    id: "settings-advanced",
    type: "settings",
    title: "Settings > Advanced",
    subtitle: "Settings",
    path: "Settings / Advanced",
    sectionId: "settings-tools",
    icon: Cpu,
    description: "Open diagnostics, app capabilities, and advanced workspace controls.",
    actions: ["Copy diagnostics", "Check updates", "Review app build"],
    keywords: ["advanced", "diagnostics", "developer", "app", "version", "performance"],
  },
  {
    id: "settings-browser",
    type: "settings",
    title: "Settings > Browser",
    subtitle: "Settings",
    path: "Settings / Browser",
    sectionId: "settings-display",
    icon: Globe2,
    description: "Review web and desktop behavior that affects browser-based workflows.",
    actions: ["Open display settings", "Review navigation", "Check web mode"],
    keywords: ["browser", "web", "chrome", "website", "app", "open"],
  },
  {
    id: "settings-proxy-network",
    type: "settings",
    title: "Settings > Proxy & Network",
    subtitle: "Settings",
    path: "Settings / Network",
    sectionId: "settings-tools",
    icon: Network,
    description: "Find network-related tools and diagnostics for online media workflows.",
    actions: ["Open tools", "Check diagnostics", "Review downloads"],
    keywords: ["proxy", "network", "internet", "connection", "download", "online"],
  },
  {
    id: "settings-notifications",
    type: "settings",
    title: "Settings > Notifications",
    subtitle: "Settings",
    path: "Settings / Notifications",
    sectionId: "settings-display",
    icon: Bell,
    description: "Control success, error, and app status feedback.",
    actions: ["Toggle sound", "Toggle notifications", "Review feedback"],
    keywords: ["notifications", "notifs", "sound", "alert", "toast", "message"],
  },
  {
    id: "settings-shortcuts",
    type: "settings",
    title: "Settings > Shortcuts",
    subtitle: "Settings",
    path: "Settings / Shortcuts",
    sectionId: "settings-display",
    icon: Keyboard,
    description: "Open keyboard and navigation controls, including command search.",
    actions: ["Use Ctrl K", "Review navigation", "Open display settings"],
    keywords: ["shortcuts", "shorcut", "keyboard", "hotkey", "ctrl", "command", "cmd", "keys"],
  },
  {
    id: "settings-about",
    type: "settings",
    title: "Settings > About",
    subtitle: "Settings",
    path: "Settings / About",
    sectionId: "settings-tools",
    icon: Info,
    description: "Review Flow version, build type, diagnostics, and update status.",
    actions: ["Check updates", "Copy diagnostics", "Review version"],
    keywords: ["about", "version", "update", "diagnostics", "flow"],
  },
];

const TUBE_DISPLAY_COMMAND_ITEMS = [
  {
    id: "tube-display-compact",
    type: "tube-display",
    title: "Tube > Compact Display",
    subtitle: "Tube",
    path: "Tube / Display",
    workspace: "youtube",
    displayMode: "compact",
    icon: ListVideo,
    description: "Use tighter queue cards so many downloads are easier to scan.",
    actions: ["Apply Compact", "Open Tube"],
    keywords: ["tube", "video", "download", "compact", "display", "layout", "queue", "small"],
    previewKind: "tube-display",
  },
  {
    id: "tube-display-large",
    type: "tube-display",
    title: "Tube > Large Display",
    subtitle: "Tube",
    path: "Tube / Display",
    workspace: "youtube",
    displayMode: "large",
    icon: Video,
    description: "Use larger media cards with bigger previews and more visual breathing room.",
    actions: ["Apply Large", "Open Tube"],
    keywords: ["tube", "video", "download", "large", "display", "layout", "queue", "box"],
    previewKind: "tube-display",
  },
  {
    id: "tube-display-horizontal",
    type: "tube-display",
    title: "Tube > Horizontal Display",
    subtitle: "Tube",
    path: "Tube / Display",
    workspace: "youtube",
    displayMode: "horizontal",
    icon: ListVideo,
    description: "Use wide horizontal queue rows for detailed download status and controls.",
    actions: ["Apply Horizontal", "Open Tube"],
    keywords: ["tube", "tub", "video", "download", "horizontal", "horisontal", "large horizontal", "display", "layout", "queue"],
    previewKind: "tube-display",
  },
];

const LOCAL_COMMAND_ITEMS = [
  {
    id: "local-create-app",
    type: "local",
    title: "Local Tools > Create App",
    subtitle: "Local Tools",
    path: "Settings / Local Tools",
    sectionId: "settings-local-tools",
    icon: Package,
    description: "Build the local desktop app using Flow's existing Electron package process.",
    actions: ["Create App", "Open output folder"],
    keywords: ["build", "app", "desktop", "electron", "installer", "package", "local", "create app", "cret app"],
    previewKind: "create-app",
    localOnly: true,
  },
];

const TOOL_COMMAND_ITEMS = [
  {
    id: "tools-badge",
    type: "tool",
    title: "Tools > Badge",
    subtitle: "Tools",
    path: "Tools / Badge",
    workspace: "tools",
    toolSection: "badge",
    icon: ShieldCheck,
    description: "Open the Badge section for media import, preview, compression, and archive export.",
    actions: ["Import files", "Import folder", "Export archive"],
    keywords: ["tools", "badge", "media", "compress", "archive", "zip", "7z"],
  },
  {
    id: "tools-assist",
    type: "tool",
    title: "Tools > Assist",
    subtitle: "Tools",
    path: "Tools / Assist",
    workspace: "tools",
    toolSection: "assist",
    icon: WandSparkles,
    description: "Open Assist for faster preparation and guidance around media workflows.",
    actions: ["Prepare media", "Review presets", "Compare quality"],
    keywords: ["tools", "assist", "assistant", "prepare", "help", "preset"],
  },
  {
    id: "tools-batch",
    type: "tool",
    title: "Tools > Batch",
    subtitle: "Tools",
    path: "Tools / Batch",
    workspace: "tools",
    toolSection: "batch",
    icon: Layers,
    description: "Open Batch inside Tools without losing the original batch workflow.",
    actions: ["Convert media", "Compress files", "Export selected"],
    keywords: ["tools", "batch", "batc", "convert", "trim", "compress", "bulk"],
  },
];

const NAV_COMMAND_ITEMS = WORKSPACE_TABS.map(({ value, label }) => ({
  id: `go-${value}`,
  type: "navigation",
  title: `Go to ${label}`,
  subtitle: "Navigation",
  path: `Flow / ${label}`,
  workspace: value,
  icon: PANEL_ICON_MAP[value] || Layers,
  description: PANEL_HELP[value] || `Open the ${label} workspace.`,
  actions: ["Open workspace", "Keep current state", "Use shared layout"],
  keywords: [label, value, "go", "open", "navigate", PANEL_HELP[value] || ""],
}));

const COMMAND_ITEMS = [
  ...NAV_COMMAND_ITEMS,
  {
    id: "go-settings",
    type: "navigation",
    title: "Go to Settings",
    subtitle: "Navigation",
    path: "Flow / Settings",
    icon: Settings,
    description: "Open Flow settings, search sections, and adjust app preferences.",
    actions: ["Open settings", "Search settings", "Change preferences"],
    keywords: ["settings", "seetings", "preferences", "options", "gear"],
  },
  ...SETTINGS_SEARCH_ITEMS,
  ...TOOL_COMMAND_ITEMS,
  ...TUBE_DISPLAY_COMMAND_ITEMS,
];

function getWriteCommandOrder() {
  try {
    const saved = JSON.parse(readStoredSetting(WRITE_COMMAND_ORDER_KEY, "[]") || "[]");
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
    return JSON.parse(readStoredSetting(PANEL_ACCENTS_KEY, "{}") || "{}");
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
    const saved = readStoredSetting(NAV_LAYOUT_KEY);
    return saved === "vertical" ? "vertical" : "horizontal";
  } catch {
    return "horizontal";
  }
}

function getSavedNavShowIcons() {
  try {
    return readStoredSetting(NAV_SHOW_ICONS_KEY, "true") !== "false";
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

function FlowMark({ className = "" }) {
  return <img src={BRAND_ICON_SRC} alt="" aria-hidden="true" draggable="false" className={className} />;
}

const PAGE_GUIDES = {
  slicer: {
    title: "How to use Slicer",
    body: "Turn one design into carousel-ready slices and export them as a clean set.",
    steps: ["Import or paste a design.", "Adjust slice count and crop guides.", "Preview the result, then export."],
    tip: "Use the preview before export so spacing and edges stay consistent.",
  },
  grid: {
    title: "How to use Grid",
    body: "Build picture grids, save presets, and record logo placement for repeat exports.",
    steps: ["Choose Grid Builder, Presets, or Action Recorder.", "Import pictures and set ratio/placement.", "Save presets and apply them to matching files."],
    tip: "For many photos, detect ratios first so presets apply to the right group.",
  },
  spellcheck: {
    title: "How to use Spell",
    body: "Check text, clean writing, and extract words from images with OCR.",
    steps: ["Paste text or import an image.", "Run spell/OCR tools.", "Review suggestions and copy the cleaned result."],
    tip: "Use Accurate OCR only when the fast scan misses details.",
  },
  writing: {
    title: "How to use Write",
    body: "Draft formatted text, use slash commands, and autosave notes to your default folder.",
    steps: ["Name the document.", "Write or paste content in the editor.", "Use toolbar/slash commands, then export or autosave."],
    tip: "Set Default Save Location in Settings once so Write stops asking for a folder.",
  },
  captureTube: {
    title: "How to use Capture & Tube",
    body: "Use one page for capture workflows and public video downloads.",
    steps: ["Pick Capture or Tube from the segmented bar.", "Paste links or import media.", "Preview, trim, download, or export results."],
    tip: "Tube display mode stays saved, so pick the queue layout you like once.",
  },
  gallery: {
    title: "How to use Gallery",
    body: "Browse local pictures and videos quickly without loading everything at once.",
    steps: ["Choose a folder.", "Browse collections or library view.", "Open, tag, drag, or send media into other tools."],
    tip: "Use Load More for huge folders to keep the app responsive.",
  },
  assets: {
    title: "How to use Assets",
    body: "Organize design files, documents, images, videos, PSD, and Affinity assets.",
    steps: ["Select an assets folder.", "Filter by type or group.", "Open, reveal, or reuse files in other panels."],
    tip: "Refresh after adding files outside Flow so the index stays current.",
  },
  tools: {
    title: "How to use Tools",
    body: "Badge, Assist, and Batch share one compact tools workspace.",
    steps: ["Choose Badge, Assist, or Batch.", "Import files, folders, or Gallery media.", "Preview quality and export selected results."],
    tip: "Badge uses fast thumbnails for display while keeping originals for export.",
  },
};

function PageGuide({ pageId }) {
  const guide = PAGE_GUIDES[pageId];
  const storageKey = `flow-page-guide-collapsed-${pageId}`;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey) === "true");
  if (!guide) return null;
  const toggle = () => {
    setCollapsed((current) => {
      localStorage.setItem(storageKey, String(!current));
      return !current;
    });
  };
  return (
    <section className={`flow-page-guide ${collapsed ? "is-collapsed" : ""}`}>
      <button type="button" className="flow-page-guide-toggle" onClick={toggle} aria-expanded={!collapsed}>
        <HelpCircle size={16} />
        <span>{guide.title}</span>
        <ChevronDown size={16} className="flow-page-guide-chevron" />
      </button>
      {!collapsed && (
        <div className="flow-page-guide-body">
          <p>{guide.body}</p>
          <div className="flow-page-guide-steps">
            {guide.steps.map((step, index) => (
              <span key={step}><strong>{index + 1}</strong>{step}</span>
            ))}
          </div>
          <small>{guide.tip}</small>
        </div>
      )}
    </section>
  );
}

function CaptureTubePanel({ initialTab = "capture", initialIgUrl = "" }) {
  const [activeSection, setActiveSection] = useState(() => sessionStorage.getItem("flow-capture-tube-section") || initialTab);
  useEffect(() => {
    const handleSection = (event) => {
      const section = event.detail?.section;
      if (["capture", "tube"].includes(section)) setActiveSection(section);
    };
    window.addEventListener("flow-capture-tube-section", handleSection);
    return () => window.removeEventListener("flow-capture-tube-section", handleSection);
  }, []);
  const selectSection = (section) => {
    sessionStorage.setItem("flow-capture-tube-section", section);
    setActiveSection(section);
  };
  return (
    <div className="flow-page grid gap-4">
      <div className="flow-segmented-shell">
        <div className="flow-segmented-inner capture-tube-segmented" role="tablist" aria-label="Capture and Tube sections">
          {[
            ["capture", "Capture", Camera],
            ["tube", "Tube", TestTube2],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeSection === value}
              className={`flow-segmented-button ${activeSection === value ? "is-active" : ""}`}
              onClick={() => selectSection(value)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <Activity mode={activeSection === "capture" ? "visible" : "hidden"}>
        <LazyTool><InstagramPanel initialUrl={initialIgUrl} embedded /></LazyTool>
      </Activity>
      <Activity mode={activeSection === "tube" ? "visible" : "hidden"}>
        <LazyTool><YouTubePanel embedded /></LazyTool>
      </Activity>
    </div>
  );
}

const WorkspaceActivity = memo(function WorkspaceActivity({ id, active, initialIgUrl }) {
  const Panel = WORKSPACE_COMPONENTS[id];
  if (id === "captureTube") {
    return (
      <Activity mode={active ? "visible" : "hidden"}>
        <PageGuide pageId={id} />
        <CaptureTubePanel initialTab={sessionStorage.getItem("flow-capture-tube-section") || "capture"} initialIgUrl={initialIgUrl} />
      </Activity>
    );
  }
  if (!Panel) return null;
  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <PageGuide pageId={id} />
      <LazyTool>
        {id === "instagram" ? <Panel initialUrl={initialIgUrl} /> : <Panel />}
      </LazyTool>
    </Activity>
  );
});

function CommandPalette({
  open,
  onClose,
  onRunCommand,
  commandItems = COMMAND_ITEMS,
  downloadFolders = {},
  onChooseDownloadFolder,
  onResetDownloadFolder,
  onApplyTubeDisplay,
  localBuilder,
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewEngaged, setPreviewEngaged] = useState(false);
  const inputRef = useRef(null);
  const fuse = useMemo(
    () =>
      new Fuse(commandItems, {
        keys: ["title", "subtitle", "path", "description", "keywords", "actions"],
        threshold: 0.36,
        ignoreLocation: true,
        minMatchCharLength: 1,
      }),
    [commandItems],
  );
  const results = useMemo(() => {
    const search = query.trim();
    const items = search ? fuse.search(search).map((result) => result.item) : commandItems;
    return items.slice(0, 14);
  }, [commandItems, fuse, query]);
  const selected = results[Math.min(activeIndex, Math.max(0, results.length - 1))] || results[0];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setPreviewEngaged(false);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % Math.max(1, results.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
        return;
      }
      if (event.key === "Enter" && selected) {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          setPreviewEngaged(true);
          return;
        }
        if (!previewEngaged) {
          setPreviewEngaged(true);
          return;
        }
        onRunCommand(selected);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, onRunCommand, previewEngaged, results.length, selected]);

  useEffect(() => {
    setActiveIndex(0);
    setPreviewEngaged(false);
  }, [query]);

  useEffect(() => {
    setPreviewEngaged(false);
  }, [activeIndex]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="command-palette-backdrop" role="presentation">
      <button type="button" className="command-palette-scrim" aria-label="Close command palette" onClick={onClose} />
      <section className="command-palette-shell" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-palette-search">
          <Search size={22} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command or search..."
            aria-label="Search commands and settings"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette-body">
          <div className="command-results custom-scrollbar" role="listbox" aria-label="Command results">
            {results.length ? (
              results.map((item, index) => {
                const Icon = item.icon || Settings;
                const active = index === activeIndex;
                const sectionLabel = item.type === "settings" ? "Settings" : item.type === "tool" ? "Tools" : "Navigation";
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`command-result ${active ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onRunCommand(item)}
                  >
                    <span className="command-result-icon">
                      <Icon size={20} />
                    </span>
                    <span className="min-w-0">
                      <strong>{item.title}</strong>
                      <small>{sectionLabel} - {item.path}</small>
                    </span>
                    {(item.type === "settings" || item.type === "tool") && <kbd>Ctrl Enter</kbd>}
                  </button>
                );
              })
            ) : (
              <div className="command-empty">
                <Search size={22} />
                <strong>No matching commands</strong>
                <span>Try a page name, setting, folder, quality, batch, or gallery.</span>
              </div>
            )}
          </div>
          <aside className={`command-preview ${previewEngaged ? "is-engaged" : ""}`} aria-live="polite">
            {selected ? (
              <>
                <div className="command-preview-head">
                  <span className="command-preview-icon">
                    {(() => {
                      const Icon = selected.icon || Settings;
                      return <Icon size={24} />;
                    })()}
                  </span>
                  <button type="button" onClick={() => onRunCommand(selected)} aria-label={`Open ${selected.title}`}>
                    <ExternalLink size={18} />
                    <span>Open</span>
                  </button>
                </div>
                <p className="command-eyebrow">Quick look</p>
                <h2>{selected.title.replace(/^Settings > /, "").replace(/^Tools > /, "")}</h2>
                <p className="command-path">{selected.path}</p>
                <div className="command-preview-card">
                  <p className="command-preview-label">Preview</p>
                  <p>{selected.description}</p>
                </div>
                {selected.previewKind === "save-location" && (
                  <div className="command-preview-card">
                    <p className="command-preview-label">Current path</p>
                    <p className="command-path-value">{downloadFolders.global || "No default folder selected"}</p>
                    <div className="command-inline-actions">
                      <button type="button" onClick={onChooseDownloadFolder}>Change Folder</button>
                      <button type="button" onClick={onResetDownloadFolder}>Reset</button>
                    </div>
                  </div>
                )}
                {selected.previewKind === "tube-display" && (
                  <div className="command-preview-card">
                    <p className="command-preview-label">Display mode</p>
                    <div className="command-display-options">
                      {["compact", "large", "horizontal"].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={selected.displayMode === mode ? "is-selected" : ""}
                          onClick={() => onApplyTubeDisplay?.(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selected.previewKind === "create-app" && (
                  <div className="command-preview-card">
                    <p className="command-preview-label">Local builder</p>
                    <p>{localBuilder?.status || "Ready"}</p>
                    {localBuilder?.outputPath && <p className="command-path-value">{localBuilder.outputPath}</p>}
                    {localBuilder?.error && <p className="command-error-text">{localBuilder.error}</p>}
                    <div className="command-inline-actions">
                      <button type="button" onClick={localBuilder?.create} disabled={localBuilder?.building}>
                        {localBuilder?.building ? "Building..." : "Create App"}
                      </button>
                      <button type="button" onClick={localBuilder?.openFolder} disabled={!localBuilder?.outputPath}>
                        Open Folder
                      </button>
                    </div>
                  </div>
                )}
                <div className="command-action-list">
                  {(selected.actions || ["Open"]).slice(0, 4).map((action) => (
                    <button key={action} type="button" onClick={() => onRunCommand(selected)}>
                      <span>{action}</span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
                <button type="button" className="command-open-button" onClick={() => onRunCommand(selected)}>
                  <CornerDownLeft size={17} />
                  Open
                </button>
              </>
            ) : null}
          </aside>
        </div>
        <footer className="command-palette-footer">
          <span>Use arrow keys to navigate</span>
          <span>Flow v{APP_VERSION}</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
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
    return readStoredSetting(THEME_STATE_KEY, "auto") || "auto";
  } catch {
    return "auto";
  }
}

function resolveDarkMode(mode) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
}

function useFlowTheme() {
  const [themeMode, setThemeModeState] = useState(getSavedThemeMode);
  const [isDark, setIsDark] = useState(() => resolveDarkMode(getSavedThemeMode()));

  useEffect(() => {
    let cancelled = false;
    window.flow?.theme?.getState?.().then((state) => {
      if (!cancelled && state?.mode) setThemeModeState(state.mode);
    });
    const removeThemeListener = window.flow?.theme?.onChanged?.((state) => {
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
    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    localStorage.setItem(THEME_STATE_KEY, themeMode);
    window.flow?.theme?.setMode?.(themeMode, isDark);
    const transitionTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 520);
    return () => window.clearTimeout(transitionTimer);
  }, [isDark, themeMode]);

  return { isDark, themeMode, setThemeMode: setThemeModeState };
}

/* ─── Settings Popover ─────────────────────────────────────────── */
function CompanionPanel() {
  useFlowTheme();
  return (
    <main className="app-shell p-4">
      <div className="pumpkin-glass rounded-3xl p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--flow-muted)]">
          Flow Companion
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
  useFlowTheme();
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const titles = {
    writing: "Write",
    instagram: "Capture",
    batch: "Batch",
    gallery: "Gallery",
  };

  useEffect(() => {
    document.documentElement.classList.add("flow-popout");
    let cancelled = false;
    window.flow?.popout?.getState?.().then((state) => {
      if (!cancelled) setAlwaysOnTop(Boolean(state?.alwaysOnTop));
    });
    return () => {
      cancelled = true;
      document.documentElement.classList.remove("flow-popout");
    };
  }, []);

  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    const state = await window.flow?.popout?.setAlwaysOnTop?.(next);
    if (state) setAlwaysOnTop(Boolean(state.alwaysOnTop));
  };

  const renderTool = () => {
    if (tool === "writing") return <LazyTool><WritingPanel /></LazyTool>;
    if (tool === "instagram") return <LazyTool><InstagramPanel /></LazyTool>;
    if (tool === "batch") return <LazyTool><BatchStudioPanel /></LazyTool>;
    if (tool === "gallery") return <LazyTool><LocalGallery /></LazyTool>;
    return (
      <div className="app-shell grid place-items-center p-6">
        <div className="pumpkin-glass rounded-3xl p-6 text-center">
          <p className="text-sm font-black">This Flow tool cannot be popped out yet.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="app-header sticky top-0 z-40 border-b px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlowMark className="h-7 w-7 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Flow Popout
              </p>
              <h1 className="text-sm font-black text-zinc-900 dark:text-white">
                {titles[tool] || "Tool"}
              </h1>
            </div>
          </div>
          {window.flow?.popout?.setAlwaysOnTop && (
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
  onOpenCommandPalette,
  isLocalRuntime,
  localBuildState,
  onCreateLocalApp,
  onOpenLocalBuildFolder,
}) {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [maximized, setMaximized] = useState(false);
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
    () => readStoredSetting("flow-ocr-default-mode", "fast") || "fast",
  );
  const [ocrPreprocess, setOcrPreprocess] = useState(
    () => readStoredSetting("flow-ocr-preprocess", "true") !== "false",
  );
  const [desktopPrefs, setDesktopPrefs] = useState(() =>
    window.flow?.desktop?.getPreferences ? null : getWebDownloadFolderPreferences(),
  );
  const [writeCommandOrder, setWriteCommandOrder] = useState(getWriteCommandOrder);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [activeSettingsNav, setActiveSettingsNav] = useState("settings-account");
  const ref = useRef(null);

  const isElectron = Boolean(window.flow?.platform?.isElectron);
  const buildType = isElectron ? "Electron" : "Web";
  const galleryIpcAvailable = Boolean(window.flowGallery);
  const updateIpcAvailable = Boolean(window.flow?.updates?.checkForUpdates);
  const diagnosticsAvailable = Boolean(window.flowDiagnostics?.getInfo);
  const desktopAvailable = Boolean(window.flow?.desktop?.getPreferences);
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
      setMaximized(false);
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

  const activeTab = WORKSPACE_TABS.find((item) => item.value === activeWorkspace);

  useEffect(() => {
    let cancelled = false;
    const loadGalleryDiagnostics = async () => {
      try {
        const [folder, cacheStats, lastScan] = await Promise.all([
          window.flowGallery?.getLastFolder?.(),
          window.flowGallery?.getCacheStats?.(),
          window.flowGallery?.getLastScan?.(),
        ]);
        if (cancelled) return;
        setGalleryLastFolder(folder || "");
        setGalleryCacheStats(cacheStats || null);
        setGalleryLastScan(lastScan || null);
        const [assetsFolder, assetsScan] = await Promise.all([
          window.flowAssets?.getLastFolder?.(),
          window.flowAssets?.getLastScan?.(),
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
    window.flow?.updates?.getCurrentVersion?.().then((version) => {
      if (!cancelled && version) setAppVersion(version);
    });
    window.flow?.desktop?.getPreferences?.().then((prefs) => {
      if (!cancelled) setDesktopPrefs(prefs || null);
    });
    loadGalleryDiagnostics();
    const removeUpdateListener = window.flow?.updates?.onStatus?.((payload) => {
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
    localStorage.setItem("flow-ocr-default-mode", mode);
    window.dispatchEvent(new Event("flow-settings-changed"));
  };

  const toggleOcrPreprocess = () => {
    const next = !ocrPreprocess;
    setOcrPreprocess(next);
    localStorage.setItem("flow-ocr-preprocess", String(next));
    window.dispatchEvent(new Event("flow-settings-changed"));
  };

  const checkForUpdates = async () => {
    if (!window.flow?.updates?.checkForUpdates) {
      setUpdateStatus("Updates are available in Electron builds.");
      return;
    }
    setUpdateStatus("Checking for updates");
    const result = await window.flow.updates.checkForUpdates();
    setUpdateStatus(result?.title || result?.state || "Update check started");
    setLastChecked(new Date().toLocaleString());
  };

  const setRunOnStartup = async (enabled) => {
    const prefs = await window.flow?.desktop?.setRunOnStartup?.(enabled);
    if (prefs) setDesktopPrefs(prefs);
  };

  const setBackgroundMode = async (enabled) => {
    const prefs = await window.flow?.desktop?.setBackgroundMode?.(enabled);
    if (prefs) setDesktopPrefs(prefs);
  };

  const chooseDownloadFolder = async (key) => {
    try {
      const prefs = desktopAvailable
        ? await window.flow.desktop.selectDownloadFolder(key)
        : await chooseWebDownloadFolder(key);
      if (prefs && !prefs.canceled) {
        setDesktopPrefs(prefs);
        window.dispatchEvent(new Event("flow-download-folders-changed"));
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
      ? await window.flow.desktop.setDownloadFolders(patch)
      : setWebDownloadFolderPreferences(patch);
    if (prefs) {
      setDesktopPrefs(prefs);
      window.dispatchEvent(new Event("flow-download-folders-changed"));
    }
  };

  const downloadFolders = desktopPrefs?.downloadFolders || {};
  const settingsSummary = [
    {
      label: "Theme",
      value: themeMode === "auto" ? "Auto" : themeMode === "dark" ? "Dark" : "Light",
      note: "Color mode",
      icon: themeMode === "dark" ? Moon : themeMode === "light" ? Sun : Cpu,
    },
    {
      label: "Panel",
      value: activeTab?.label || "Flow",
      note: "Current workspace",
      icon: PANEL_ICON_MAP[activeWorkspace] || Layers,
    },
    {
      label: "Storage",
      value: downloadFolders.global ? "Set" : "Choose",
      note: "Default export folder",
      icon: Folder,
    },
  ];
  const quickSettings = SETTINGS_NAV_ITEMS.filter((item) => isLocalRuntime || item.id !== "settings-about");
  const settingsFuse = useMemo(
    () =>
      new Fuse(SETTINGS_SEARCH_ITEMS, {
        keys: ["title", "subtitle", "path", "description", "keywords"],
        threshold: 0.38,
        ignoreLocation: true,
        minMatchCharLength: 1,
      }),
    [],
  );
  const settingsResults = settingsSearch.trim()
    ? settingsFuse.search(settingsSearch.trim()).map((result) => result.item).slice(0, 7)
    : [];
  const openSettingSection = (id, highlightId = id) => {
    const navMatch = quickSettings.find((item) => item.id === id || item.targetId === id || item.targetId === highlightId);
    if (navMatch) setActiveSettingsNav(navMatch.id);
    const target = document.getElementById(id);
    if (!target) return;
    if (target.tagName === "DETAILS") target.open = true;
    window.setTimeout(() => {
      const highlightTarget = document.getElementById(highlightId) || target;
      highlightTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightTarget.classList.remove("settings-focus-glow");
      void highlightTarget.offsetWidth;
      highlightTarget.classList.add("settings-focus-glow");
      window.setTimeout(() => highlightTarget.classList.remove("settings-focus-glow"), 1600);
    }, 40);
  };

  useEffect(() => {
    const handleOpenSettingsSection = (event) => {
      const { sectionId = "settings-tools", highlightId } = event.detail || {};
      setIsClosing(false);
      setOpen(true);
      window.setTimeout(() => openSettingSection(sectionId, highlightId), 140);
    };
    window.addEventListener("flow-open-settings-section", handleOpenSettingsSection);
    return () => window.removeEventListener("flow-open-settings-section", handleOpenSettingsSection);
  }, []);

  const moveWriteCommand = (id, direction) => {
    setWriteCommandOrder((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      localStorage.setItem(WRITE_COMMAND_ORDER_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("flow-write-commands-changed"));
      return next;
    });
  };

  const clearGalleryCache = async () => {
    if (!window.flowGallery?.clearGalleryCache) return;
    await window.flowGallery.clearGalleryCache();
    const cacheStats = await window.flowGallery?.getCacheStats?.();
    setGalleryCacheStats(cacheStats || null);
    window.dispatchEvent(
      new CustomEvent("studio-notify", {
        detail: { title: "Gallery Cache Cleared", message: "Local thumbnail/cache data was cleared." },
      }),
    );
  };

  const clearGalleryTags = async () => {
    if (!window.flowGallery?.clearLocalTags) return;
    await window.flowGallery.clearLocalTags();
    window.dispatchEvent(
      new CustomEvent("studio-notify", {
        detail: { title: "Gallery Tags Cleared", message: "Local gallery tags were removed." },
      }),
    );
  };

  const copyDiagnosticInfo = async () => {
    const diagnostics = window.flowDiagnostics?.getInfo
      ? await window.flowDiagnostics.getInfo()
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
              ? "border-[var(--pumpkin-500)] bg-[var(--pumpkin-700)] text-white shadow-lg shadow-[rgba(204,88,0,0.24)]"
              : "border-[var(--flow-border)] bg-[var(--flow-card)] text-[var(--flow-muted)] shadow-sm hover:-translate-y-0.5 hover:border-[var(--flow-border-strong)] hover:text-[var(--pumpkin-700)] hover:shadow-md dark:hover:text-[var(--pumpkin-200)]"
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
          className={`settings-dashboard-shell ${maximized ? "is-maximized" : ""} absolute bottom-6 right-6 top-6 flex w-[36rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-[2rem] border shadow-2xl shadow-[var(--flow-shadow)] ${
            isClosing ? "animate-settings-drawer-out" : "animate-settings-drawer"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--flow-border)] bg-[color-mix(in_srgb,var(--flow-card)_74%,transparent)] px-5 py-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="settings-icon-badge h-10 w-10">
                <Settings size={18} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[var(--flow-muted)]">
                  Flow settings
                </p>
                <p className="text-sm font-black text-[var(--flow-text)]">
                  Profile, appearance, storage, and workspace controls
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMaximized((current) => !current)}
                aria-label={maximized ? "Restore settings" : "Maximize settings"}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--flow-muted)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--flow-soft)] hover:text-[var(--flow-text)]"
              >
                {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={closeSettings}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--flow-muted)] transition-all duration-300 hover:rotate-90 hover:bg-[var(--flow-soft)] hover:text-[var(--flow-text)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="settings-surface min-h-0 flex-1 p-5">
            <section id="settings-account-panel" className="settings-account-row">
              <FlowMark className="h-14 w-14 shrink-0 rounded-[18px] shadow-lg shadow-[rgba(204,88,0,0.18)]" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--flow-faint)]">Flow</p>
                <h2 className="truncate text-xl font-black tracking-tight text-[var(--flow-text)]">Settings</h2>
                <p className="truncate text-xs font-semibold text-[var(--flow-muted)]">
                  {themeMode === "auto" ? "Auto theme" : themeMode === "dark" ? "Dark mode" : "Light mode"} - {activeTab?.label || "Workspace"} - v{appVersion}
                </p>
              </div>
              <span className="hidden rounded-full bg-[var(--flow-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--flow-muted)] sm:inline-flex">
                {buildType}
              </span>
            </section>

            <div className="settings-layout">
              <aside className="settings-sidebar" aria-label="Settings navigation">
                <nav className="settings-quick-nav" aria-label="Settings sections">
                  {quickSettings.map(({ id, targetId, label, description, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={activeSettingsNav === id ? "is-active" : ""}
                      onClick={() => openSettingSection(targetId || id)}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </nav>

                <section className="settings-search-panel" aria-label="Search settings">
                  <div className="settings-search-input">
                    <Search size={16} />
                    <input
                      value={settingsSearch}
                      onChange={(event) => setSettingsSearch(event.target.value)}
                      onFocus={onOpenCommandPalette}
                      onClick={onOpenCommandPalette}
                      placeholder="Search settings..."
                      aria-label="Search settings"
                    />
                    <span>Ctrl K</span>
                  </div>
                  {settingsResults.length > 0 && (
                    <div className="settings-search-results">
                      {settingsResults.map((item) => {
                        const Icon = item.icon || Settings;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openSettingSection(item.sectionId || "settings-tools", item.highlightId)}
                          >
                            <Icon size={15} />
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.path}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </aside>

              <section className="settings-content-panel custom-scrollbar">

            <details id="settings-tools" className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Info size={15} {...iconProps} /> Panels
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
                  Panels
                  </span>
                  <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-zinc-500">
                    Open a workspace or review what each tool does.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SETTINGS_PANEL_ORDER.map((value) => {
                  const tabLabel = WORKSPACE_LABELS[value] || value;
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
                          {tabLabel}
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

            <details id="settings-appearance" className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Palette size={15} {...iconProps} /> Colors
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
                  Colors
                </span>
                <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-zinc-500">
                  Pick a quick accent or open advanced colors only when needed.
                </p>
                </div>
              </div>
              <div className="grid gap-3">
                {SETTINGS_PANEL_ORDER.map((value) => {
                  const tabLabel = WORKSPACE_LABELS[value] || value;
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
                          {tabLabel}
                        </p>
                        <p className="mt-0.5 hidden truncate text-[10px] font-medium text-zinc-500 sm:block">
                          Adjust the color used in the {tabLabel} panel.
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
                          aria-label={`${expanded ? "Close" : "Open"} ${tabLabel} color options`}
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
                                    aria-label={`${tabLabel} hue`}
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

            <details id="settings-display" className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Monitor size={15} {...iconProps} /> Display
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
                    Display
                  </span>
                  <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-zinc-500">
                    Choose how navigation and labels appear.
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

            <details className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Type size={15} {...iconProps} /> Text Size
                </span>
                <ChevronRight size={15} {...iconProps} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-4">
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
            </details>

            <details id="settings-storage" className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <Folder size={15} {...iconProps} /> Save Locations
                </span>
                <ChevronRight size={15} {...iconProps} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-4">
              <div id="settings-default-save-location" className="settings-save-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--flow-muted)]">Default Save Location</p>
                    <h3 className="mt-1 text-base font-black text-[var(--flow-text)]">Global export folder</h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--flow-muted)]">
                      This folder is used across Slicer, Grid, Spell, Write, Capture, Batch, Tube, Gallery, Assets, and Tools unless a tool has its own override.
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
                    downloadFolders.useGlobalForAll && downloadFolders.global
                      ? "bg-emerald-500 text-white"
                      : "bg-[var(--flow-soft)] text-[var(--flow-muted)]"
                  }`}>
                    {downloadFolders.useGlobalForAll && downloadFolders.global ? "Active" : "Not set"}
                  </span>
                </div>
                <div className="settings-path-box mt-4">
                  <Folder size={16} />
                  <span className="truncate">{downloadFolders.global || "No default folder selected"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!folderPickerAvailable}
                    onClick={() => chooseDownloadFolder("global")}
                    className="rounded-[var(--flow-radius-button)] bg-[linear-gradient(135deg,var(--pumpkin-500),var(--pumpkin-700))] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-[rgba(204,88,0,0.2)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-40"
                  >
                    Change Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownloadFolderPatch({ global: "", useGlobalForAll: true })}
                    className="rounded-[var(--flow-radius-button)] border border-[var(--flow-border)] bg-[var(--flow-card)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[var(--flow-muted)] transition hover:-translate-y-0.5 hover:border-[var(--flow-border-strong)] hover:text-[var(--flow-text)]"
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-[var(--flow-border)] bg-[var(--flow-soft)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--flow-muted)]">Tube override</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[var(--flow-text)]">
                      {downloadFolders.videoGrabber || "Using Default Save Location"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!folderPickerAvailable}
                    onClick={() => chooseDownloadFolder("videoGrabber")}
                    className="shrink-0 rounded-[var(--flow-radius-button)] bg-[var(--flow-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--flow-text)] transition hover:-translate-y-0.5 disabled:opacity-40"
                  >
                    Override
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {DOWNLOAD_FOLDER_PANELS.map((panel) => (
                  <div
                    key={panel.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--flow-border)] bg-[var(--flow-card)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        {panel.label}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-zinc-500">
                        {downloadFolders[panel.key]
                          ? `Override: ${downloadFolders[panel.key]}`
                          : (downloadFolders.global ? `Default: ${downloadFolders.global}` : "No default folder selected")}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!folderPickerAvailable}
                      onClick={() => chooseDownloadFolder(panel.key)}
                      className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-35 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    >
                      {downloadFolders[panel.key] ? "Change" : "Set"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] font-medium leading-relaxed text-zinc-500">
                Custom tool folders are clearly marked as overrides. Everything without an override uses the Default Save Location.
              </p>
              </div>
            </details>

            <details className="group rounded-[24px] border border-zinc-100 bg-white/60 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white">
                <span className="flex items-center gap-2">
                  <FileArchive size={15} {...iconProps} /> Assets
                </span>
                <ChevronRight size={15} {...iconProps} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-4">
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
            </details>

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

            {isLocalRuntime && (
              <div id="settings-local-tools" className="rounded-2xl border border-[var(--flow-border)] bg-[var(--flow-soft)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[var(--flow-muted)]">
                    <Package size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Local Tools
                    </span>
                  </div>
                  <span className="rounded-lg bg-[var(--pumpkin-700)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                    Local only
                  </span>
                </div>
                <p className="text-xs font-semibold text-[var(--flow-text)]">
                  Create App
                </p>
                <p className="mt-1 text-[10px] font-medium leading-relaxed text-[var(--flow-muted)]">
                  Builds the local desktop app and shows the output folder. This control is hidden on the deployed website.
                </p>
                <div className="mt-3 rounded-xl border border-[var(--flow-border)] bg-[var(--flow-card)] px-3 py-2 text-[10px] font-bold text-[var(--flow-muted)]">
                  {localBuildState.status}
                  {localBuildState.outputPath && <div className="mt-1 truncate text-[var(--flow-text)]">{localBuildState.outputPath}</div>}
                  {localBuildState.error && <div className="mt-1 text-red-500">{localBuildState.error}</div>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onCreateLocalApp}
                    disabled={localBuildState.building || !window.flow?.desktop?.createApp}
                    className="rounded-xl bg-[linear-gradient(135deg,var(--pumpkin-500),var(--pumpkin-700))] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:-translate-y-0.5 disabled:opacity-40"
                  >
                    {localBuildState.building ? "Building..." : "Create App"}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenLocalBuildFolder}
                    disabled={!localBuildState.outputPath}
                    className="rounded-xl bg-[var(--flow-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--flow-text)] transition hover:-translate-y-0.5 disabled:opacity-40"
                  >
                    Open Folder
                  </button>
                </div>
              </div>
            )}

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
                  disabled={!window.flowGallery}
                  className="rounded-xl bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Clear Cache
                </button>
                <button
                  type="button"
                  onClick={clearGalleryTags}
                  disabled={!window.flowGallery}
                  className="rounded-xl bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Clear Tags
                </button>
              </div>
            </div>
              </section>
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

  const { isDark, themeMode, setThemeMode } = useFlowTheme();
  const [fontSize, setFontSize] = useState(16);
  const normalizedInitialWorkspace =
    initialWorkspace === "batch"
      ? "tools"
      : ["capture", "instagram", "tube", "youtube"].includes(initialWorkspace) || initialIgUrl
        ? "captureTube"
        : WORKSPACE_TABS.some((t) => t.value === initialWorkspace)
          ? initialWorkspace
          : "slicer";
  if (["tube", "youtube"].includes(initialWorkspace)) sessionStorage.setItem("flow-capture-tube-section", "tube");
  if (["capture", "instagram"].includes(initialWorkspace) || initialIgUrl) sessionStorage.setItem("flow-capture-tube-section", "capture");
  const [workspace, setWorkspace] = useState(normalizedInitialWorkspace);
  const [visitedWorkspaces, setVisitedWorkspaces] = useState(() => new Set([workspace]));
  const [panelAccents, setPanelAccents] = useState(getPanelAccents);
  const [navLayout, setNavLayout] = useState(getSavedNavLayout);
  const [showNavIcons, setShowNavIcons] = useState(getSavedNavShowIcons);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [headerOptionsOpen, setHeaderOptionsOpen] = useState(false);
  const [desktopPrefs, setDesktopPrefs] = useState(() =>
    window.flow?.desktop?.getPreferences ? null : getWebDownloadFolderPreferences(),
  );
  const [localBuildState, setLocalBuildState] = useState({ status: "Ready", building: false, outputPath: "", error: "" });
  const canPopoutWorkspace = ["writing", "captureTube", "gallery"].includes(workspace);
  const popoutAvailable = Boolean(window.flow?.windows?.openTool);
  const isLocalRuntime = Boolean(window.flow?.platform?.isElectron) || import.meta.env.DEV || ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const commandItems = useMemo(
    () => (isLocalRuntime ? [...COMMAND_ITEMS, ...LOCAL_COMMAND_ITEMS] : COMMAND_ITEMS),
    [isLocalRuntime],
  );
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
    const loadPrefs = () => {
      if (window.flow?.desktop?.getPreferences) {
        window.flow.desktop.getPreferences().then((prefs) => setDesktopPrefs(prefs || null)).catch(() => {});
      } else {
        setDesktopPrefs(getWebDownloadFolderPreferences());
      }
    };
    loadPrefs();
    window.addEventListener("flow-download-folders-changed", loadPrefs);
    return () => window.removeEventListener("flow-download-folders-changed", loadPrefs);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--studio-font-size",
      `${fontSize}px`,
    );
  }, [fontSize]);

  useEffect(() => {
    const queue = WORKSPACE_TABS.map(({ value }) => value).filter((value) => value !== workspace);
    let cancelled = false;
    let idleId = null;
    let timerId = null;

    const schedule = (callback) => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(callback, { timeout: 1800 });
      } else {
        timerId = window.setTimeout(callback, 350);
      }
    };

    const loadNext = () => {
      if (cancelled || !queue.length) return;
      const next = queue.shift();
      Promise.resolve(preloadWorkspace(next)).catch(() => {}).finally(() => schedule(loadNext));
    };

    schedule(loadNext);
    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
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
    if (value === "batch") {
      sessionStorage.setItem("flow-tools-section", "batch");
      window.dispatchEvent(new CustomEvent("flow-tools-section", { detail: { section: "batch" } }));
      value = "tools";
    }
    if (value === "instagram" || value === "capture") {
      sessionStorage.setItem("flow-capture-tube-section", "capture");
      window.dispatchEvent(new CustomEvent("flow-capture-tube-section", { detail: { section: "capture" } }));
      value = "captureTube";
    }
    if (value === "youtube" || value === "tube") {
      sessionStorage.setItem("flow-capture-tube-section", "tube");
      window.dispatchEvent(new CustomEvent("flow-capture-tube-section", { detail: { section: "tube" } }));
      value = "captureTube";
    }
    if (value === workspace) return;
    setWorkspace(value);
    setVisitedWorkspaces((current) => {
      const next = new Set(current);
      next.add(value);
      return next;
    });
  };

  const runCommand = useCallback((item) => {
    if (!item) return;
    if (item.previewKind === "create-app") return;
    if (item.type === "settings" || item.id === "go-settings") {
      setCommandPaletteOpen(false);
      window.dispatchEvent(
        new CustomEvent("flow-open-settings-section", {
          detail: {
            sectionId: item.sectionId || "settings-tools",
            highlightId: item.highlightId,
          },
        }),
      );
      return;
    }
    if (item.type === "tube-display") {
      localStorage.setItem("flow-tube-display-mode", item.displayMode);
      window.dispatchEvent(new CustomEvent("flow-tube-display-mode", { detail: { mode: item.displayMode } }));
      setCommandPaletteOpen(false);
      switchTab("youtube");
      return;
    }
    if (item.toolSection) {
      setCommandPaletteOpen(false);
      sessionStorage.setItem("flow-tools-section", item.toolSection);
      switchTab("tools");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("flow-tools-section", { detail: { section: item.toolSection } }));
      }, 60);
      return;
    }
    if (item.workspace) {
      setCommandPaletteOpen(false);
      switchTab(item.workspace);
    }
  }, [switchTab]);

  const chooseGlobalDownloadFolder = useCallback(async () => {
    try {
      const prefs = window.flow?.desktop?.selectDownloadFolder
        ? await window.flow.desktop.selectDownloadFolder("global")
        : await chooseWebDownloadFolder("global");
      if (prefs && !prefs.canceled) {
        setDesktopPrefs(prefs);
        window.dispatchEvent(new Event("flow-download-folders-changed"));
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent("studio-notify", {
        detail: { title: "Folder Not Set", message: error?.message || "Could not open the folder picker.", type: "error" },
      }));
    }
  }, []);

  const resetGlobalDownloadFolder = useCallback(async () => {
    const prefs = window.flow?.desktop?.setDownloadFolders
      ? await window.flow.desktop.setDownloadFolders({ global: "", useGlobalForAll: true })
      : setWebDownloadFolderPreferences({ global: "", useGlobalForAll: true });
    if (prefs) {
      setDesktopPrefs(prefs);
      window.dispatchEvent(new Event("flow-download-folders-changed"));
    }
  }, []);

  const applyTubeDisplayMode = useCallback((mode) => {
    localStorage.setItem("flow-tube-display-mode", mode);
    window.dispatchEvent(new CustomEvent("flow-tube-display-mode", { detail: { mode } }));
  }, []);

  const createLocalApp = useCallback(async () => {
    if (!window.flow?.desktop?.createApp) return;
    setLocalBuildState({ status: "Building app...", building: true, outputPath: "", error: "" });
    try {
      const result = await window.flow.desktop.createApp();
      if (result?.ok) {
        setLocalBuildState({
          status: "App created successfully",
          building: false,
          outputPath: result.outputPath || result.releasePath || "",
          error: "",
        });
      } else {
        setLocalBuildState({
          status: "Build failed",
          building: false,
          outputPath: "",
          error: result?.error || "The app build did not complete.",
        });
      }
    } catch (error) {
      setLocalBuildState({ status: "Build failed", building: false, outputPath: "", error: error?.message || "The app build did not complete." });
    }
  }, []);

  const openLocalBuildFolder = useCallback(() => {
    if (localBuildState.outputPath) window.flow?.desktop?.showItemInFolder?.(localBuildState.outputPath);
  }, [localBuildState.outputPath]);

  useEffect(() => {
    const handleCommandShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleCommandShortcut);
    return () => window.removeEventListener("keydown", handleCommandShortcut);
  }, []);

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
          onMouseEnter={() => preloadWorkspace(value)}
          onFocus={() => preloadWorkspace(value)}
          title={label}
          aria-label={label}
          className={`grid h-10 w-10 place-items-center rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${
            active
              ? "border-[var(--pumpkin-500)] bg-[var(--pumpkin-700)] text-white shadow-md shadow-[rgba(204,88,0,0.22)]"
              : "border-[var(--flow-border)] bg-[var(--flow-card)] text-[var(--flow-muted)] hover:border-[var(--flow-border-strong)] hover:text-[var(--pumpkin-700)] dark:hover:text-[var(--pumpkin-200)]"
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
        onMouseEnter={() => preloadWorkspace(value)}
        onFocus={() => preloadWorkspace(value)}
        className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[10px] font-black uppercase tracking-widest transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5
          ${
             active
              ? "bg-[var(--pumpkin-700)] text-white shadow-md shadow-[rgba(204,88,0,0.18)]"
              : "text-[var(--flow-muted)] hover:bg-[var(--flow-soft)] hover:text-[var(--pumpkin-700)] dark:hover:text-[var(--pumpkin-200)]"
          }`}
        style={activeStyle}
      >
        {showNavIcons && <PanelIcon size={14} {...iconProps} />}
        <span>{label}</span>
        {active && (
          <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-white/55" />
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
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      isLocalRuntime={isLocalRuntime}
      localBuildState={localBuildState}
      onCreateLocalApp={createLocalApp}
      onOpenLocalBuildFolder={openLocalBuildFolder}
    />
  );

  const openCurrentPopout = () => {
    const tool = workspace === "captureTube" ? "instagram" : workspace;
    window.flow?.windows?.openTool?.(tool);
    setHeaderOptionsOpen(false);
  };

  return (
    <div className="app-shell transition-colors duration-300">
      {/* ── Header ─────────────────────────────────────────────── */}
      {navLayout !== "vertical" && (
      <header
        className="app-header sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-300 ease-out"
      >
        <div
          className="flow-nav-container flex h-14 items-center justify-between gap-3"
        >
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div>
              <div className="flex items-center gap-2">
                <FlowMark className="h-7 w-7 shrink-0" />
                <h1
                  className="text-[1.08em] font-black tracking-tight text-[var(--flow-text)]"
                >
                  Flow
                </h1>
              </div>
            </div>
          </div>

          {/* Desktop tab bar */}
          <nav className={navLayout === "vertical" ? "hidden" : "hidden items-center md:flex"}>
            <div
              className="pumpkin-nav flex gap-1 rounded-2xl border p-1 transition-[background-color,border-color,box-shadow] duration-300"
            >
              {WORKSPACE_TABS.map((tab) => renderPanelNavButton(tab, "horizontal"))}
            </div>
          </nav>

          <div className="relative ml-auto flex items-center justify-end gap-2">
            {canPopoutWorkspace && popoutAvailable && (
              <button
                type="button"
                onClick={() => setHeaderOptionsOpen((current) => !current)}
                aria-label="More options"
                title="More options"
                className="pumpkin-subtle-action grid h-10 w-10 place-items-center rounded-2xl border text-[var(--flow-muted)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Ellipsis size={18} />
              </button>
            )}
            {headerOptionsOpen && canPopoutWorkspace && popoutAvailable && (
              <div className="header-options-menu animate-studio-pop">
                <button type="button" onClick={openCurrentPopout}>
                  <ExternalLink size={15} />
                  <span>Open in separate window</span>
                </button>
              </div>
            )}
            {renderSettingsControl()}
          </div>
        </div>

        {/* Mobile tab bar */}
        <div
          className="flow-nav-container flex gap-1 overflow-x-auto border-t border-[var(--flow-border)] py-2 md:hidden"
        >
          {WORKSPACE_TABS.map(({ value, label }) => {
            const accent = getPanelAccentValue(panelAccents, value, isDark);
            const active = workspace === value;
            const PanelIcon = PANEL_ICON_MAP[value] || Layers;
            return (
            <button
              key={value}
              onClick={() => switchTab(value)}
              onMouseEnter={() => preloadWorkspace(value)}
              onFocus={() => preloadWorkspace(value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-200
                ${
                   active
                    ? "bg-[var(--pumpkin-700)] text-white shadow-sm"
                    : "text-[var(--flow-muted)] hover:bg-[var(--flow-soft)]"
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
            title="Flow"
            aria-label="Flow"
            className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-md dark:bg-white"
          >
            <FlowMark className="h-9 w-9" />
          </button>
          {WORKSPACE_TABS.map((tab) => renderPanelNavButton(tab, "vertical"))}
          <div className="grid place-items-center pt-2">
            {renderSettingsControl()}
          </div>
        </aside>
      )}
      <main className={`panel-enter ${navLayout === "vertical" ? "transition-[padding] duration-300 md:pl-20" : ""}`}>
        {WORKSPACE_TABS.map(({ value }) => visitedWorkspaces.has(value) ? (
          <WorkspaceActivity
            key={value}
            id={value}
            active={workspace === value}
            initialIgUrl={initialIgUrl}
          />
        ) : null)}
      </main>

      {/* ── Global notifications ──────────────────────────────── */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onRunCommand={runCommand}
        commandItems={commandItems}
        downloadFolders={desktopPrefs?.downloadFolders || {}}
        onChooseDownloadFolder={chooseGlobalDownloadFolder}
        onResetDownloadFolder={resetGlobalDownloadFolder}
        onApplyTubeDisplay={applyTubeDisplayMode}
        localBuilder={{
          ...localBuildState,
          create: createLocalApp,
          openFolder: openLocalBuildFolder,
        }}
      />
      <Notifications notifications={notifications} onDismiss={dismissNotif} />
      <UpdateCenter />
    </div>
  );
}
