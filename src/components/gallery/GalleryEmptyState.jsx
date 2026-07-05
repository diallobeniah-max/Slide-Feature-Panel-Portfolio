import React from "react";
import { FolderOpen, Images, ShieldCheck } from "lucide-react";
import { Button, Card } from "../ui.jsx";

export default function GalleryEmptyState({ isElectron, onSelectFolder }) {
  return (
    <Card className="relative grid min-h-[30rem] place-items-center overflow-hidden p-8 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_30%),radial-gradient(circle_at_70%_70%,rgba(113,113,122,0.16),transparent_32%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_70%_70%,rgba(113,113,122,0.18),transparent_32%)]" />
      <div className="relative max-w-lg">
        <div className="mx-auto mb-6 grid grid-cols-3 gap-2">
          {[Images, FolderOpen, ShieldCheck].map((Icon, index) => (
            <div
              key={index}
              className="grid aspect-square place-items-center rounded-[26px] border border-zinc-200 bg-white/80 text-zinc-400 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80"
            >
              <Icon size={index === 1 ? 30 : 24} />
            </div>
          ))}
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Local Gallery
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
          {isElectron ? "Choose a folder for Collections" : "Desktop gallery runs in Electron"}
        </h2>
        <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-500">
          {isElectron
            ? "Flow builds a read-only, offline media library from your Windows folders. Files are scanned locally and never renamed, moved, or uploaded."
            : "The web version cannot recursively read Windows folders. Open the Electron desktop app to use the offline local gallery."}
        </p>
        {isElectron && (
          <Button className="mt-6" icon={FolderOpen} onClick={onSelectFolder}>
            Select Folder
          </Button>
        )}
      </div>
    </Card>
  );
}
