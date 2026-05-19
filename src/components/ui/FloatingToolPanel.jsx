import React, { useEffect, useMemo, useRef, useState } from "react";
import { GripHorizontal, Maximize2, RotateCcw, X } from "lucide-react";

const DEFAULT_SIZE = { width: 340, height: 500 };
const MIN_SIZE = { width: 292, height: 260 };
const EDGE_PADDING = 12;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1200, height: 800 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getDefaultFrame(size = DEFAULT_SIZE) {
  const viewport = getViewportSize();
  return {
    x: Math.max(EDGE_PADDING, viewport.width - size.width - 28),
    y: Math.max(EDGE_PADDING, 112),
    width: size.width,
    height: Math.min(size.height, viewport.height - 150),
  };
}

function sanitizeFrame(frame, defaultSize) {
  const viewport = getViewportSize();
  const width = clamp(
    Number(frame?.width) || defaultSize.width,
    MIN_SIZE.width,
    Math.max(MIN_SIZE.width, viewport.width - EDGE_PADDING * 2),
  );
  const height = clamp(
    Number(frame?.height) || defaultSize.height,
    MIN_SIZE.height,
    Math.max(MIN_SIZE.height, viewport.height - EDGE_PADDING * 2),
  );
  const x = clamp(
    Number(frame?.x) || EDGE_PADDING,
    EDGE_PADDING,
    Math.max(EDGE_PADDING, viewport.width - width - EDGE_PADDING),
  );
  const y = clamp(
    Number(frame?.y) || EDGE_PADDING,
    EDGE_PADDING,
    Math.max(EDGE_PADDING, viewport.height - height - EDGE_PADDING),
  );
  return { x, y, width, height };
}

function loadFrame(storageKey, defaultSize) {
  if (typeof localStorage === "undefined") return getDefaultFrame(defaultSize);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    return saved ? sanitizeFrame(saved, defaultSize) : getDefaultFrame(defaultSize);
  } catch {
    return getDefaultFrame(defaultSize);
  }
}

export default function FloatingToolPanel({
  storageKey = "contentflow-floating-panel",
  title,
  eyebrow = "Panel",
  open,
  onClose,
  children,
  defaultSize = DEFAULT_SIZE,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [frame, setFrame] = useState(() => loadFrame(storageKey, defaultSize));
  const [isCompactScreen, setIsCompactScreen] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const safeFrame = useMemo(
    () => sanitizeFrame(frame, defaultSize),
    [defaultSize, frame],
  );

  useEffect(() => {
    const updateLayout = () => {
      setIsCompactScreen(window.matchMedia("(max-width: 720px)").matches);
      setFrame((current) => sanitizeFrame(current, defaultSize));
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [defaultSize]);

  useEffect(() => {
    if (!open || isCompactScreen) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(safeFrame));
    } catch {
      // Storage can be disabled; the panel still works without persistence.
    }
  }, [isCompactScreen, open, safeFrame, storageKey]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerMove = (event) => {
      const action = dragRef.current;
      if (!action) return;
      event.preventDefault();
      const viewport = getViewportSize();
      const dx = event.clientX - action.startX;
      const dy = event.clientY - action.startY;

      if (action.type === "move") {
        setFrame((current) =>
          sanitizeFrame(
            {
              ...current,
              x: action.frame.x + dx,
              y: action.frame.y + dy,
            },
            defaultSize,
          ),
        );
        return;
      }

      setFrame((current) => {
        const width = clamp(
          action.frame.width + dx,
          MIN_SIZE.width,
          Math.max(MIN_SIZE.width, viewport.width - action.frame.x - EDGE_PADDING),
        );
        const height = clamp(
          action.frame.height + dy,
          MIN_SIZE.height,
          Math.max(MIN_SIZE.height, viewport.height - action.frame.y - EDGE_PADDING),
        );
        return sanitizeFrame({ ...current, width, height }, defaultSize);
      });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      setActiveAction("");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [defaultSize, open]);

  if (!open) return null;

  const startAction = (event, type) => {
    if (isCompactScreen) return;
    event.preventDefault();
    dragRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      frame: safeFrame,
    };
    setActiveAction(type);
    document.body.style.userSelect = "none";
    document.body.style.cursor = type === "move" ? "grabbing" : "nwse-resize";
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const resetFrame = () => {
    const next = getDefaultFrame(defaultSize);
    setFrame(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Best effort only.
    }
  };

  const panelStyle = isCompactScreen
    ? undefined
    : {
        width: `${safeFrame.width}px`,
        height: `${safeFrame.height}px`,
        left: `${safeFrame.x}px`,
        top: `${safeFrame.y}px`,
      };

  return (
    <section
      ref={panelRef}
      className={`fixed z-[210] flex flex-col overflow-hidden border border-zinc-200 bg-[#f8f5ef]/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 ${
        isCompactScreen
          ? "inset-x-0 bottom-0 max-h-[82vh] rounded-t-[26px] animate-control-panel-sheet"
          : "rounded-[22px] animate-control-panel-pop"
      } ${activeAction ? "transition-none" : "transition-shadow duration-200"}`}
      style={panelStyle}
      role="dialog"
      aria-label={title}
    >
      <div
        className="flex shrink-0 cursor-grab items-center justify-between gap-3 border-b border-zinc-200/80 bg-gradient-to-b from-white/85 to-white/60 px-3 py-2.5 active:cursor-grabbing dark:border-zinc-800 dark:from-zinc-900/95 dark:to-zinc-950/80"
        onPointerDown={(event) => startAction(event, "move")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripHorizontal size={16} className="shrink-0 text-zinc-400" />
          <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-black tracking-tight text-zinc-950 dark:text-white">
            {title}
          </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-xl px-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            onClick={resetFrame}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Reset panel position"
            title="Reset position"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <span
            className="hidden h-8 w-8 place-items-center rounded-xl text-zinc-500 sm:grid dark:text-zinc-400"
            title="Drag edges to resize"
          >
            <Maximize2 size={14} />
          </span>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Close panel"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5 custom-scrollbar">
        <div className="grid content-start gap-3 floating-panel-compact">
          {children}
        </div>
      </div>

      {!isCompactScreen && (
        <button
          type="button"
          aria-label="Resize panel"
          title="Resize panel"
          className="absolute bottom-1.5 right-1.5 h-5 w-5 cursor-nwse-resize rounded-md border-b-2 border-r-2 border-zinc-400/70 opacity-70 transition hover:opacity-100 dark:border-zinc-500"
          onPointerDown={(event) => startAction(event, "resize")}
        />
      )}
    </section>
  );
}
