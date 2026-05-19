import React from "react";
import { Loader2, X } from "lucide-react";
import { Button, Card } from "../ui.jsx";

export default function GalleryProgress({ progress, onCancel }) {
  const phase = progress?.phase || "starting";
  const found = progress?.found || 0;
  const scannedFiles = progress?.scannedFiles || 0;
  const discoveredFiles = progress?.discoveredFiles || scannedFiles;
  const scannedFolders = progress?.scannedFolders || 0;
  const images = progress?.images || 0;
  const videos = progress?.videos || 0;
  const skipped = progress?.skipped || 0;
  const unreadable = progress?.unreadable || 0;
  const currentFolder = progress?.currentFolder || "";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <Loader2 size={18} className="animate-spin" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {phase === "done" ? "Scan complete" : "Scanning media"}
            </p>
            <p className="mt-0.5 truncate text-sm font-black text-zinc-950 dark:text-white">
              {found} found / {scannedFiles} of {discoveredFiles || scannedFiles} files / {scannedFolders} folders
            </p>
            {currentFolder && (
              <p className="mt-1 truncate text-[10px] font-medium text-zinc-500">
                {currentFolder}
              </p>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" icon={X} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full w-1/2 animate-[studio-shimmer_1.2s_ease_infinite] rounded-full bg-zinc-950 dark:bg-white" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ["Images", images],
          ["Videos", videos],
          ["Skipped", skipped],
          ["Unreadable", unreadable],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-200 bg-white/70 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/50"
          >
            <p className="text-sm font-black text-zinc-950 dark:text-white">{value}</p>
            <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-zinc-500">
              {label}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
