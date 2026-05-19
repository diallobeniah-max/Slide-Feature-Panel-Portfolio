import React from "react";
import GalleryGrid from "./GalleryGrid.jsx";

export default function GallerySection({ group, onOpen }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            {group.items.length} item{group.items.length === 1 ? "" : "s"}
          </p>
          <h3 className="text-xl font-black italic tracking-tight text-zinc-950 dark:text-white">
            {group.title}
          </h3>
        </div>
      </div>
      <GalleryGrid items={group.items} onOpen={onOpen} />
    </section>
  );
}
