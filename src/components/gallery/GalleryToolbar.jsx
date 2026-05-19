import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  FolderOpen,
  Images,
  LayoutGrid,
  RefreshCw,
  Search,
  Tags,
} from "lucide-react";
import { Badge, Button, Card } from "../ui.jsx";
import ContentFlowSelect from "../ui/ContentFlowSelect.jsx";
import { formatShortPath } from "../../utils/mediaTypes.js";

export default function GalleryToolbar({
  counts,
  folderPath,
  filter,
  setFilter,
  sortMode,
  setSortMode,
  query,
  setQuery,
  tagFilter,
  setTagFilter,
  availableTags,
  onSelectFolder,
  onRefresh,
  searchRef,
  galleryView,
  setGalleryView,
  loading = false,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
}) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Gallery
          </p>
          <h2 className="mt-0.5 truncate text-2xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
            {folderPath ? formatShortPath(folderPath) : "Local Photos"}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="black">{counts.total || 0} total</Badge>
            <Badge variant="default">{counts.images || 0} images</Badge>
            <Badge variant="default">{counts.videos || 0} videos</Badge>
            <Badge variant="success">{folderPath ? "Offline folder" : "No folder"}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" icon={ArrowLeft} onClick={onBack} disabled={!canGoBack || loading}>
            Back
          </Button>
          <Button size="sm" variant="outline" icon={ArrowRight} onClick={onForward} disabled={!canGoForward || loading}>
            Forward
          </Button>
          <Button size="sm" variant="outline" icon={RefreshCw} onClick={onRefresh} disabled={!folderPath || loading}>
            Refresh
          </Button>
          <Button size="sm" icon={FolderOpen} onClick={onSelectFolder}>
            Select Folder
          </Button>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-950">
          {[
            { id: "collections", label: "Collections", icon: Images },
            { id: "library", label: "Library", icon: LayoutGrid },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setGalleryView(id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                galleryView === id
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <Search size={16} className="text-zinc-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search file name..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-white"
          />
        </label>

        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-950">
          {["all", "images", "videos"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                filter === value
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <ContentFlowSelect
          value={sortMode}
          onChange={setSortMode}
          icon={Grid2X2}
          label="Sort gallery"
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "name", label: "Name" },
            { value: "type", label: "File type" },
            { value: "size", label: "File size" },
          ]}
        />

        <ContentFlowSelect
          value={tagFilter}
          onChange={setTagFilter}
          icon={Tags}
          label="Filter tags"
          options={[
            { value: "", label: "All tags" },
            ...availableTags.map((tag) => ({ value: tag, label: tag })),
          ]}
        />
      </div>
    </Card>
  );
}
