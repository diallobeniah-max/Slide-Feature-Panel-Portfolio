import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

/* ── Chime generator (Web Audio API, no file needed) ─────────────── */
export function playChime(type = "success") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    const notes =
      type === "error"
        ? [{ f: 440, t: 0 }, { f: 330, t: 0.18 }]
        : type === "warning"
          ? [{ f: 660, t: 0 }, { f: 550, t: 0.18 }]
          : [{ f: 880, t: 0 }, { f: 1108, t: 0.16 }, { f: 1318, t: 0.32 }];

    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, now + t);
      gain.gain.linearRampToValueAtTime(0.14, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.55);
      osc.start(now + t);
      osc.stop(now + t + 0.6);
    });
  } catch { /* AudioContext blocked */ }
}

/* ── Single toast card ─────────────────────────────────────────────── */
const ICONS = {
  success: <CheckCircle2 size={18} className="text-emerald-400 shrink-0" strokeWidth={2} />,
  error:   <AlertCircle  size={18} className="text-rose-400 shrink-0"    strokeWidth={2} />,
  info:    <Info         size={18} className="text-sky-400 shrink-0"     strokeWidth={2} />,
};

const BORDERS = {
  success: "border-emerald-500/30",
  error:   "border-rose-500/30",
  info:    "border-sky-500/30",
};

function Toast({ notification, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(notification.id), 5000);
    return () => clearTimeout(t);
  }, [notification.id, onDismiss]);

  return (
    <div
      className={`
        flex items-start gap-3 w-80 rounded-2xl border bg-zinc-900/95 dark:bg-zinc-950/95
        backdrop-blur-xl p-4 shadow-2xl
        ${BORDERS[notification.type] || BORDERS.info}
        animate-studio-slide-l
      `}
      style={{ animationFillMode: "both" }}
    >
      {ICONS[notification.type] || ICONS.info}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-white">
          {notification.title}
        </p>
        {notification.message && (
          <p className="mt-0.5 text-[10px] font-medium text-zinc-400 leading-relaxed">
            {notification.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(notification.id)}
        className="p-0.5 rounded-lg text-zinc-500 hover:text-white transition-colors shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/* ── Container (rendered by App.jsx) ──────────────────────────────── */
export default function Notifications({ notifications, onDismiss }) {
  return (
    <div className="fixed bottom-6 right-6 z-[500] flex flex-col gap-2 items-end pointer-events-none">
      {notifications.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <Toast notification={n} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
