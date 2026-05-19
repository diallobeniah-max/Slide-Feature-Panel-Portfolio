import React from "react";
import { Film, File, Image as ImageIcon, Tag } from "lucide-react";
import { formatBytes } from "../../utils/media.js";
import { formatMediaDate } from "../../utils/galleryGrouping.js";
import { isVideoMedia } from "../../utils/mediaTypes.js";
import { canDragIndexedFile, startIndexedFileDrag } from "../../utils/fileDrag.js";

function MediaTile({
  item,
  onOpen,
  sourceKind = "gallery",
  selected = false,
  onToggleSelect,
  getDragItems,
}) {
  const isVideo = isVideoMedia(item);
  const isImage = item.type === "image";
  const canPreviewImage = !["tif", "tiff"].includes(String(item.extension || "").toLowerCase());
  const tags = item.tags || [];
  const previewUrl = item.thumbnailUrl || "";
  const extension = String(item.extension || item.type || "video").toUpperCase();

  return (
    <button
      type="button"
      draggable={canDragIndexedFile()}
      onDragStart={(event) => startIndexedFileDrag(event, sourceKind, getDragItems?.(item) || item)}
      onClick={onOpen}
      className={`group relative aspect-square overflow-hidden rounded-[18px] border bg-zinc-100 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg dark:bg-zinc-900 dark:hover:border-zinc-600 ${
        selected
          ? "border-zinc-950 ring-2 ring-zinc-950/20 dark:border-white dark:ring-white/25"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {previewUrl && !isVideo && canPreviewImage && isImage ? (
        <img
          src={previewUrl}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
        />
      ) : isVideo ? (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-300 text-zinc-500 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-800">
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-black/10 text-zinc-700 shadow-inner dark:bg-white/10 dark:text-white">
              <Film size={28} />
            </span>
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {extension}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center text-zinc-400">
          <div className="text-center">
            {isImage ? <ImageIcon size={28} /> : <File size={28} />}
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest">{extension}</p>
            {!isImage && (
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                Preview unavailable
              </p>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 text-white opacity-0 transition group-hover:opacity-100">
        <p className="truncate text-xs font-black">{item.name}</p>
        <p className="mt-1 text-[10px] font-medium text-white/75">
          {formatMediaDate(item)} / {formatBytes(item.size)}
        </p>
      </div>

      <div className="absolute left-2 top-2 flex gap-1">
        {onToggleSelect && (
          <span
            role="checkbox"
            aria-checked={selected}
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(item.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onToggleSelect(item.id);
            }}
            className={`grid h-7 w-7 place-items-center rounded-xl border backdrop-blur transition ${
              selected
                ? "border-white bg-white text-zinc-950"
                : "border-white/20 bg-black/55 text-white hover:bg-black/75"
            }`}
          >
            <span className={`h-3 w-3 rounded ${selected ? "bg-zinc-950" : "border border-white/80"}`} />
          </span>
        )}
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-black/60 text-white backdrop-blur">
          {isVideo ? <Film size={14} /> : isImage ? <ImageIcon size={14} /> : <File size={14} />}
        </span>
        {tags.length > 0 && (
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-black/60 text-white backdrop-blur">
            <Tag size={13} />
          </span>
        )}
      </div>
    </button>
  );
}

export default function GalleryGrid({
  items,
  onOpen,
  columns,
  sourceKind = "gallery",
  selectedIds = new Set(),
  onToggleSelect,
  getDragItems,
}) {
  const columnClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
        ? "grid-cols-3"
        : columns === 4
          ? "grid-cols-4"
          : columns === 6
            ? "grid-cols-6"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6";

  return (
    <div className={`grid min-w-0 gap-3 overflow-hidden ${columnClass}`}>
      {items.map((item) => (
        <MediaTile
          key={item.id}
          item={item}
          sourceKind={sourceKind}
          selected={selectedIds.has(item.id)}
          onToggleSelect={onToggleSelect}
          getDragItems={getDragItems}
          onOpen={() => onOpen(item)}
        />
      ))}
    </div>
  );
}
