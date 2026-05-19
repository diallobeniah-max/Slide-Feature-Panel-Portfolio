import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function ControlPanelModal({
  title,
  eyebrow = "Control Panel",
  open,
  onClose,
  children,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-zinc-950/70 backdrop-blur-xl animate-studio-fade"
        aria-label="Close control panel"
        onClick={onClose}
      />

      <section className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-zinc-200 bg-[#f8f5ef] shadow-2xl animate-control-panel-sheet dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-[28rem] sm:rounded-[28px] sm:animate-control-panel-pop">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200/70 bg-white/70 px-5 py-4 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/80">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {eyebrow}
            </p>
            <h2 className="mt-1 truncate text-lg font-black italic tracking-tight text-zinc-950 dark:text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-white"
            onClick={onClose}
            aria-label="Close panel"
            title="Close panel"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid content-start gap-5">{children}</div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
