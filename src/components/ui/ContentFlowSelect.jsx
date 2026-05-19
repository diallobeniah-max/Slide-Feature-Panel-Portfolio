import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function ContentFlowSelect({
  value,
  onChange,
  options = [],
  icon: Icon,
  label,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportPadding = 12;
    const menuWidth = Math.min(
      Math.max(rect.width, 180),
      window.innerWidth - viewportPadding * 2,
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding,
    );
    setMenuStyle({
      position: "fixed",
      top: Math.min(rect.bottom + 8, window.innerHeight - 80),
      left,
      width: menuWidth,
      zIndex: 10000,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (
        buttonRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleReposition = () => updateMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const selectOption = (option) => {
    onChange?.(option.value);
    setOpen(false);
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!["ArrowDown", "Enter", " "].includes(event.key)) return;
          event.preventDefault();
          setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-black uppercase tracking-widest text-zinc-700 shadow-inner-sm transition hover:border-zinc-400 hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:text-white"
      >
        {Icon && <Icon size={15} className="shrink-0 text-zinc-400" />}
        {label && <span className="sr-only">{label}</span>}
        <span className="min-w-0 flex-1 truncate">{selected?.label || "Select"}</span>
        <ChevronDown size={15} className={`shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          style={menuStyle || undefined}
          className="max-h-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl shadow-zinc-950/15 animate-studio-pop dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40"
        >
          <div className="custom-scrollbar max-h-64 overflow-y-auto">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest transition ${
                    active
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active && <Check size={13} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
