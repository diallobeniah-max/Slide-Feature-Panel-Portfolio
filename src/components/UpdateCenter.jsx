import React, { useEffect, useState } from "react";
import { Download, RefreshCw, RotateCcw, X } from "lucide-react";
import { Button, Card } from "./ui.jsx";

function hasElectronUpdates() {
  return Boolean(window.contentFlow?.updates);
}

export default function UpdateCenter() {
  const [status, setStatus] = useState(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasElectronUpdates()) return undefined;

    let cancelled = false;
    window.contentFlow.updates.getCurrentVersion().then((version) => {
      if (!cancelled) setCurrentVersion(version || "");
    });

    const unsubscribe = window.contentFlow.updates.onStatus((payload) => {
      setStatus(payload);
      if (["available", "downloading", "downloaded"].includes(payload?.state)) {
        setOpen(true);
      }
    });

    window.contentFlow.updates.checkForUpdates().catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (!hasElectronUpdates() || !open || !status) return null;

  const isDownloading = status.state === "downloading";
  const isDownloaded = status.state === "downloaded";
  const percent = Math.max(0, Math.min(100, Number(status.percent || 0)));

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-zinc-950/70 backdrop-blur-xl animate-studio-fade"
        onClick={() => {
          if (!isDownloading) setOpen(false);
        }}
        aria-label="Close update dialog"
      />
      <Card className="relative w-full max-w-lg rounded-t-[28px] bg-white shadow-2xl animate-control-panel-sheet dark:bg-zinc-900 sm:rounded-[28px] sm:animate-control-panel-pop">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Desktop Update
            </p>
            <h2 className="mt-1 text-xl font-black italic tracking-tight text-zinc-950 dark:text-white">
              {status.title || "ContentFlow update"}
            </h2>
          </div>
          {!isDownloading && (
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-2xl border border-zinc-200 text-zinc-500 transition hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Close update dialog"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Current
              </p>
              <p className="mt-1 font-mono text-sm font-black text-zinc-900 dark:text-zinc-100">
                {currentVersion || status.currentVersion || "Unknown"}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                Available
              </p>
              <p className="mt-1 font-mono text-sm font-black text-zinc-900 dark:text-zinc-100">
                {status.version || "Pending"}
              </p>
            </div>
          </div>

          {status.releaseDate && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              Released {new Date(status.releaseDate).toLocaleDateString()}
            </p>
          )}

          {status.description && (
            <div className="max-h-40 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
              {String(status.description)}
            </div>
          )}

          {isDownloading && (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-zinc-950 transition-all dark:bg-white"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Downloading {percent}%
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {isDownloaded ? (
              <Button
                icon={RotateCcw}
                className="w-full"
                onClick={() => window.contentFlow.updates.restartAndInstall()}
              >
                Restart Now
              </Button>
            ) : (
              <Button
                icon={isDownloading ? RefreshCw : Download}
                className="w-full"
                disabled={isDownloading}
                onClick={() => window.contentFlow.updates.downloadUpdate()}
              >
                {isDownloading ? "Downloading" : "Update Now"}
              </Button>
            )}
            {!isDownloading && !isDownloaded && (
              <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
                Later
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
