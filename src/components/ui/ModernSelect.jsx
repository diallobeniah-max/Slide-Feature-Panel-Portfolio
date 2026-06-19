import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function ModernSelect({
  value,
  options,
  onChange,
  ariaLabel,
  compact = false,
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;
    const updatePosition = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      const maxHeight = Math.max(180, window.innerHeight - rect.bottom - 20);
      setMenuStyle({
        position: "fixed",
        left: compact ? Math.max(12, rect.right - 112) : rect.left,
        top: rect.bottom + 8,
        width: compact ? 112 : rect.width,
        maxHeight: Math.min(360, maxHeight),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [compact, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`relative ${compact ? "shrink-0" : "min-w-0 flex-1"} ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-white text-left text-zinc-950 shadow-inner-sm transition hover:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-950/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/70 dark:bg-zinc-950/70 dark:text-zinc-100 dark:hover:border-zinc-500 dark:focus:ring-white/10 ${
          compact
            ? "px-3 py-2 text-[10px] font-black uppercase tracking-widest"
            : "px-4 py-3 text-sm font-semibold"
        } border-zinc-200`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={14} className={`shrink-0 text-zinc-500 transition dark:text-zinc-400 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[9999] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/40 dark:ring-white/5"
        >
          <div
            className="overflow-auto overscroll-contain p-1"
            style={{ maxHeight: menuStyle.maxHeight || 288 }}
            onWheel={(event) => {
              event.preventDefault();
              event.currentTarget.scrollTop += event.deltaY;
              event.stopPropagation();
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  option.value === selected?.value
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === selected?.value && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
