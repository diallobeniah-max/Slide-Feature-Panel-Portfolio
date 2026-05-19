import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileArchive,
  FilePlus,
  FolderOpen,
  Grid2X2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Button, Card } from "../ui.jsx";
import ContentFlowSelect from "../ui/ContentFlowSelect.jsx";
import VirtualizedGalleryLibrary from "../gallery/VirtualizedGalleryLibrary.jsx";
import GalleryViewer from "../gallery/GalleryViewer.jsx";
import { sortGalleryItems } from "../../utils/galleryGrouping.js";
import { formatShortPath } from "../../utils/mediaTypes.js";
import { startIndexedFileDrag } from "../../utils/fileDrag.js";

const SHELL = "mx-auto grid w-full max-w-[1536px] min-w-0 gap-5 overflow-x-hidden px-5 py-6";
const ASSETS_STATE_KEY = "contentflow-assets-view-state-v1";
const ASSETS_BATCH_SIZE = 40;
const GROUP_PREVIEW_BATCH_SIZE = 20;

const notify = (title, message, type = "success") =>
  window.dispatchEvent(new CustomEvent("studio-notify", { detail: { title, message, type } }));

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function matchesType(item, filter) {
  if (filter === "all") return true;
  if (filter === "images") return item.type === "image";
  if (filter === "videos") return item.type === "video";
  if (filter === "psd") return item.type === "psd";
  if (filter === "affinity") return item.type === "affinity";
  if (filter === "documents") return item.type === "document";
  return true;
}

function loadAssetsViewState() {
  try {
    return JSON.parse(localStorage.getItem(ASSETS_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function hasExternalFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function hasContentFlowFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("contentflow/media-id");
}

function getDroppedContentFlowFiles(event) {
  const ids = String(event.dataTransfer?.getData("contentflow/media-id") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const sourceKind = String(event.dataTransfer?.getData("contentflow/source-kind") || "gallery");
  return { ids, sourceKind };
}

function getDroppedFilePaths(event) {
  return Array.from(event.dataTransfer?.files || [])
    .map((file) => file.path || "")
    .filter(Boolean);
}

function getPreviewWindow(items, index, size = GROUP_PREVIEW_BATCH_SIZE) {
  if (index < 0) return { items: [], index: -1 };
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(index - half, items.length - size));
  const windowItems = items.slice(start, start + size);
  const activeId = items[index]?.id;
  return {
    items: windowItems,
    index: windowItems.findIndex((item) => item.id === activeId),
  };
}

export default function LocalAssets() {
  const api = window.contentFlowAssets || null;
  const isElectron = Boolean(api);
  const savedState = useMemo(loadAssetsViewState, []);
  const [folderPath, setFolderPath] = useState(savedState.folderPath || "");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(savedState.filter || "all");
  const [sortMode, setSortMode] = useState(savedState.sortMode || "newest");
  const [query, setQuery] = useState(savedState.query || "");
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [groupViewerIndex, setGroupViewerIndex] = useState(-1);
  const [backStack, setBackStack] = useState([]);
  const [forwardStack, setForwardStack] = useState([]);
  const [visibleLimit, setVisibleLimit] = useState(ASSETS_BATCH_SIZE);
  const [groups, setGroups] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(savedState.selectedGroupId || "");
  const [selectedAssetIds, setSelectedAssetIds] = useState(() => new Set());
  const [selectedGroupItemIds, setSelectedGroupItemIds] = useState(() => new Set());
  const [groupDropActive, setGroupDropActive] = useState(false);
  const [groupDropArmed, setGroupDropArmed] = useState(false);
  const debouncedQuery = useDebouncedValue(query);
  const searchRef = useRef(null);
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    if (!api) return undefined;
    let cancelled = false;
    Promise.all([api.getLastFolder?.(), api.getLastScan?.(), api.getGroups?.()]).then(([folder, scan, nextGroups]) => {
      if (cancelled) return;
      setFolderPath(folder || "");
      setCounts(scan?.counts || {});
      if (scan?.items?.length) setItems(scan.items);
      setGroups(nextGroups || []);
      setSelectedGroupId((current) => current || nextGroups?.[0]?.id || "");
    });
    const remove = api.onProgress?.((payload) => setProgress(payload));
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [api]);

  const filteredItems = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return sortGalleryItems(
      items.filter((item) => {
        if (!matchesType(item, filter)) return false;
        if (q && !String(item.name || "").toLowerCase().includes(q)) return false;
        return true;
      }),
      sortMode,
    );
  }, [debouncedQuery, filter, items, sortMode]);
  const visibleItems = useMemo(
    () => filteredItems.slice(0, Math.min(visibleLimit, filteredItems.length)),
    [filteredItems, visibleLimit],
  );
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId],
  );
  const selectedGroupItems = selectedGroup?.items || [];
  const groupPreview = useMemo(
    () => getPreviewWindow(selectedGroupItems, groupViewerIndex),
    [groupViewerIndex, selectedGroupItems],
  );

  useEffect(() => {
    localStorage.setItem(
      ASSETS_STATE_KEY,
      JSON.stringify({ folderPath, filter, sortMode, query, selectedGroupId }),
    );
  }, [filter, folderPath, query, selectedGroupId, sortMode]);

  useEffect(() => {
    setVisibleLimit(ASSETS_BATCH_SIZE);
    setSelectedAssetIds(new Set());
  }, [debouncedQuery, filter, sortMode]);

  useEffect(() => {
    if (!api || !folderPath || items.length > 0 || loading || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    scanFolder(folderPath);
  }, [api, folderPath, items.length, loading]);

  function snapshot(overrides = {}) {
    return { filter, sortMode, query, viewerIndex, ...overrides };
  }

  function applyState(state) {
    if (!state) return;
    setFilter(state.filter || "all");
    setSortMode(state.sortMode || "newest");
    setQuery(state.query || "");
    setViewerIndex(Number.isFinite(state.viewerIndex) ? state.viewerIndex : -1);
  }

  function pushState(next) {
    setBackStack((stack) => [...stack.slice(-24), snapshot()]);
    setForwardStack([]);
    applyState(next);
  }

  function goBack() {
    setBackStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setForwardStack((forward) => [snapshot(), ...forward.slice(0, 24)]);
      applyState(previous);
      return stack.slice(0, -1);
    });
  }

  function goForward() {
    setForwardStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[0];
      setBackStack((back) => [...back.slice(-24), snapshot()]);
      applyState(next);
      return stack.slice(1);
    });
  }

  async function scanFolder(target = folderPath) {
    if (!api) return;
    if (!target) {
      await selectFolder();
      return;
    }
    setLoading(true);
    setProgress({ phase: "starting", found: 0 });
    const result = await api.scanFolder(target);
    setLoading(false);
    setProgress(null);
    setFolderPath(result.folderPath || target);
    setItems(result.items || []);
    setCounts(result.counts || {});
    setBackStack([]);
    setForwardStack([]);
    setVisibleLimit(ASSETS_BATCH_SIZE);
  }

  async function selectFolder() {
    if (!api) return;
    const selected = await api.selectFolder();
    if (selected.canceled || !selected.folderPath) return;
    setFolderPath(selected.folderPath);
    await scanFolder(selected.folderPath);
  }

  async function createGroup() {
    if (!api?.createGroup) return;
    const cleanName = groupName.trim();
    if (!cleanName) {
      notify("Name the group", "Add a short group name before creating it.", "error");
      return;
    }
    const nextGroups = await api.createGroup(cleanName);
    setGroups(nextGroups || []);
    setSelectedGroupId(nextGroups?.[0]?.id || "");
    setGroupName("");
    notify("Asset Group Created", `${cleanName} is ready for dropped files.`);
  }

  async function addFilesToSelectedGroup(filePaths) {
    if (!api?.addFilesToGroup || !selectedGroup?.id) return;
    if (!filePaths.length) {
      notify("Drop Skipped", "These files did not expose local Windows paths.", "warning");
      return;
    }
    const nextGroups = await api.addFilesToGroup(selectedGroup.id, filePaths);
    setGroups(nextGroups || []);
    notify("Files Added", `${filePaths.length} file${filePaths.length === 1 ? "" : "s"} added to ${selectedGroup.name}.`);
  }

  async function addIndexedFilesToSelectedGroup(sourceKind, ids) {
    if (!api?.addIndexedFilesToGroup || !selectedGroup?.id) return;
    if (!ids.length) {
      notify("Drop Skipped", "No ContentFlow gallery files were included in that drag.", "warning");
      return;
    }
    const nextGroups = await api.addIndexedFilesToGroup(selectedGroup.id, sourceKind, ids);
    setGroups(nextGroups || []);
    notify("Files Added", `${ids.length} selected file${ids.length === 1 ? "" : "s"} added to ${selectedGroup.name}.`);
  }

  async function selectFilesForGroup() {
    if (!api?.selectFilesForGroup || !selectedGroup?.id) return;
    const result = await api.selectFilesForGroup(selectedGroup.id);
    if (result?.groups) setGroups(result.groups);
    if (!result?.canceled) notify("Files Added", `${selectedGroup.name} was updated.`);
  }

  async function removeGroupFile(itemId) {
    if (!api?.removeFilesFromGroup || !selectedGroup?.id) return;
    const nextGroups = await api.removeFilesFromGroup(selectedGroup.id, [itemId]);
    setGroups(nextGroups || []);
    setGroupViewerIndex(-1);
  }

  async function deleteSelectedGroup() {
    if (!api?.deleteGroup || !selectedGroup?.id) return;
    const nextGroups = await api.deleteGroup(selectedGroup.id);
    setGroups(nextGroups || []);
    setSelectedGroupId(nextGroups?.[0]?.id || "");
    setGroupViewerIndex(-1);
    setSelectedGroupItemIds(new Set());
  }

  function handleGroupDragEnter(event) {
    if (!hasExternalFiles(event) && !hasContentFlowFiles(event)) return;
    event.preventDefault();
    setGroupDropActive(true);
  }

  function handleGroupDragOver(event) {
    if (!hasExternalFiles(event) && !hasContentFlowFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = selectedGroup ? "copy" : "none";
    setGroupDropArmed(true);
  }

  function handleGroupDragLeave(event) {
    if (!hasExternalFiles(event) && !hasContentFlowFiles(event)) return;
    event.preventDefault();
    setGroupDropArmed(false);
    setGroupDropActive(false);
  }

  function handleGroupDrop(event) {
    if (!hasExternalFiles(event) && !hasContentFlowFiles(event)) return;
    event.preventDefault();
    setGroupDropActive(false);
    setGroupDropArmed(false);
    if (!selectedGroup) {
      notify("Create a group first", "Name a group before dropping files into it.", "error");
      return;
    }
    if (hasContentFlowFiles(event)) {
      const { ids, sourceKind } = getDroppedContentFlowFiles(event);
      addIndexedFilesToSelectedGroup(sourceKind, ids);
      return;
    }
    addFilesToSelectedGroup(getDroppedFilePaths(event));
  }

  function openGroupItem(item) {
    const index = selectedGroupItems.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) setGroupViewerIndex(index);
  }

  function toggleAssetSelection(id) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupItemSelection(id) {
    setSelectedGroupItemIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getAssetDragItems(item) {
    if (!selectedAssetIds.has(item.id)) return item;
    const selected = visibleItems.filter((candidate) => selectedAssetIds.has(candidate.id));
    return selected.length ? selected : item;
  }

  function getGroupDragItems(item) {
    if (!selectedGroupItemIds.has(item.id)) return item;
    const selected = selectedGroupItems.filter((candidate) => selectedGroupItemIds.has(candidate.id));
    return selected.length ? selected : item;
  }

  if (!isElectron) {
    return (
      <main className={SHELL}>
        <Card className="min-w-0 overflow-hidden border-zinc-800 bg-zinc-950 text-white">
          <div className="grid min-h-[28rem] place-items-center p-6 text-center sm:p-10">
            <div className="max-w-2xl">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/10 text-zinc-300 shadow-2xl">
                <FileArchive size={30} />
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Desktop Access Required
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                Assets runs in the Windows app
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-zinc-400">
                Folder scanning, grouped asset storage, and drag-out file access need Electron's safe local file permissions.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Scan folders", "Index local creative files."],
                  ["Group files", "Drop mixed formats into named sets."],
                  ["Drag out", "Send selected assets to other apps."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                    <p className="text-sm font-black text-zinc-100">{title}</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-500">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className={SHELL}>
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Assets</p>
            <h2 className="mt-0.5 truncate text-2xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
              {folderPath ? formatShortPath(folderPath) : "Design Library"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="black">{counts.total || items.length || 0} total</Badge>
              <Badge variant="default">{counts.psd || 0} PSD</Badge>
              <Badge variant="default">{counts.affinity || 0} Affinity</Badge>
              <Badge variant="default">{counts.images || 0} images</Badge>
              <Badge variant="default">{counts.videos || 0} videos</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={ArrowLeft}
              onClick={viewerIndex >= 0 && !backStack.length ? () => setViewerIndex(-1) : goBack}
              disabled={!backStack.length && viewerIndex < 0}
            >
              Back
            </Button>
            <Button size="sm" variant="outline" icon={ArrowRight} onClick={goForward} disabled={!forwardStack.length}>
              Forward
            </Button>
            <Button size="sm" variant="outline" icon={RefreshCw} onClick={() => scanFolder(folderPath)} disabled={!folderPath || loading}>
              Refresh
            </Button>
            <Button size="sm" icon={FolderOpen} onClick={selectFolder}>
              Select Folder
            </Button>
          </div>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <Search size={16} className="text-zinc-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-white"
            />
          </label>
          <ContentFlowSelect
            value={filter}
            onChange={(value) => pushState({ filter: value, viewerIndex: -1 })}
            icon={Sparkles}
            options={[
              { value: "all", label: "All" },
              { value: "images", label: "Images" },
              { value: "videos", label: "Videos" },
              { value: "psd", label: "PSD" },
              { value: "affinity", label: "Affinity" },
              { value: "documents", label: "Documents" },
            ]}
          />
          <ContentFlowSelect
            value={sortMode}
            onChange={(value) => pushState({ sortMode: value, viewerIndex: -1 })}
            icon={Grid2X2}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "name", label: "Name" },
              { value: "type", label: "File type" },
              { value: "size", label: "File size" },
            ]}
          />
        </div>
      </Card>

      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Asset Groups</p>
            <h2 className="mt-0.5 truncate text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
              Drop Files Into Named Groups
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium text-zinc-500">
              Keep any local file type together, then preview images/videos or drag files into another app.
            </p>
          </div>
          {selectedGroup && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={FilePlus} onClick={selectFilesForGroup}>
                Add Files
              </Button>
              <Button size="sm" variant="outline" icon={Trash2} onClick={deleteSelectedGroup}>
                Delete Group
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            <div className="flex gap-2">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createGroup();
                }}
                placeholder="Group name"
                className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              <Button size="icon" icon={Plus} onClick={createGroup} aria-label="Create asset group" title="Create group" />
            </div>

            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setGroupViewerIndex(-1);
                    setSelectedGroupItemIds(new Set());
                  }}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selectedGroup?.id === group.id
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                  }`}
                >
                  <p className="truncate text-sm font-black">{group.name}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest opacity-60">
                    {group.items?.length || 0} file{group.items?.length === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
              {!groups.length && (
                <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-sm font-semibold text-zinc-500 dark:border-zinc-700">
                  Create the first group to start dropping files.
                </div>
              )}
            </div>
          </div>

          <div
            className={`relative min-h-72 rounded-[24px] border border-dashed p-4 transition ${
              groupDropActive
                ? "border-zinc-950 bg-zinc-100 dark:border-white dark:bg-white/10"
                : "border-zinc-300 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-950/50"
            }`}
            onDragEnter={handleGroupDragEnter}
            onDragOver={handleGroupDragOver}
            onDragLeave={handleGroupDragLeave}
            onDrop={handleGroupDrop}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {selectedGroup ? selectedGroup.name : "No group selected"}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {selectedGroup
                    ? `${selectedGroupItems.length} grouped file${selectedGroupItems.length === 1 ? "" : "s"}`
                    : "Choose or create a group."}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 shadow-sm dark:bg-zinc-900">
                <Upload size={14} />
                {groupDropArmed ? "Drop now" : "Drag files here"}
              </span>
            </div>

            {selectedGroupItems.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {selectedGroupItems.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    draggable={true}
                    onDragStart={(event) => startIndexedFileDrag(event, "assets", getGroupDragItems(item))}
                    onClick={() => openGroupItem(item)}
                    className={`group relative aspect-square overflow-hidden rounded-[18px] border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 dark:bg-zinc-900 ${
                      selectedGroupItemIds.has(item.id)
                        ? "border-zinc-950 ring-2 ring-zinc-950/20 dark:border-white dark:ring-white/25"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid h-full w-full place-items-center p-3 text-center text-zinc-400">
                        <div>
                          <FileArchive className="mx-auto" size={28} />
                          <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
                            {item.extension || "file"}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white opacity-0 transition group-hover:opacity-100">
                      <p className="truncate text-xs font-black">{item.name}</p>
                    </div>
                    <span
                      role="checkbox"
                      aria-checked={selectedGroupItemIds.has(item.id)}
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleGroupItemSelection(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        toggleGroupItemSelection(item.id);
                      }}
                      className={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-xl border backdrop-blur transition ${
                        selectedGroupItemIds.has(item.id)
                          ? "border-white bg-white text-zinc-950"
                          : "border-white/20 bg-black/55 text-white hover:bg-black/75"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded ${selectedGroupItemIds.has(item.id) ? "bg-zinc-950" : "border border-white/80"}`} />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeGroupFile(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        removeGroupFile(item.id);
                      }}
                      className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-xl bg-black/65 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
                      title="Remove from group"
                    >
                      <Trash2 size={13} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid min-h-48 place-items-center text-center">
                <div>
                  <Upload className="mx-auto text-zinc-400" size={32} />
                  <p className="mt-3 text-lg font-black tracking-tight text-zinc-950 dark:text-white">
                    Drop any local files here
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-500">
                    PNG, JPEG, PSD, PDF, ZIP, and other file types can live in the same named group.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {loading && (
        <Card className="p-4">
          <p className="text-sm font-black text-zinc-950 dark:text-white">
            Scanning assets... {progress?.found || 0} found
          </p>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            PSD and Affinity files are indexed read-only. Preview falls back safely when no thumbnail is available.
          </p>
        </Card>
      )}

      {!loading && !folderPath && (
        <Card className="grid min-h-[24rem] place-items-center p-8 text-center">
          <div>
            <FileArchive className="mx-auto text-zinc-400" size={36} />
            <h2 className="mt-4 text-2xl font-black tracking-tight">Select a design folder</h2>
            <p className="mt-2 text-sm font-medium text-zinc-500">
              ContentFlow will index PSD, Affinity, images, videos, and documents without modifying originals.
            </p>
            <Button className="mt-5" icon={FolderOpen} onClick={selectFolder}>
              Select Folder
            </Button>
          </div>
        </Card>
      )}

      {filteredItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="default">
            Showing {visibleItems.length} of {filteredItems.length}
          </Badge>
          {visibleLimit < filteredItems.length && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisibleLimit((value) => Math.min(filteredItems.length, value + ASSETS_BATCH_SIZE))}
            >
              Load More
            </Button>
          )}
        </div>
      )}

      {filteredItems.length > 0 && (
        <VirtualizedGalleryLibrary
          items={visibleItems}
          sourceKind="assets"
          selectedIds={selectedAssetIds}
          onToggleSelect={toggleAssetSelection}
          getDragItems={getAssetDragItems}
          onOpen={(item, source) => {
            pushState({ viewerIndex: source.findIndex((candidate) => candidate.id === item.id) });
          }}
        />
      )}

      {folderPath && !loading && items.length === 0 && (
        <Card className="grid min-h-[20rem] place-items-center p-8 text-center">
          <div>
            <h2 className="text-xl font-black tracking-tight">No creative assets found</h2>
            <p className="mt-2 text-sm font-medium text-zinc-500">
              This folder did not contain supported design/media files.
            </p>
          </div>
        </Card>
      )}

      {groupViewerIndex >= 0 && groupPreview.index >= 0 && (
        <GalleryViewer
          items={groupPreview.items}
          index={groupPreview.index}
          onClose={() => setGroupViewerIndex(-1)}
          onNavigate={(nextIndex) => {
            const nextItem = groupPreview.items[nextIndex];
            const absoluteIndex = selectedGroupItems.findIndex((candidate) => candidate.id === nextItem?.id);
            if (absoluteIndex >= 0) setGroupViewerIndex(absoluteIndex);
          }}
          onTagsChange={() => {}}
          sourceKind="assets"
        />
      )}

      {viewerIndex >= 0 && (
        <GalleryViewer
          items={visibleItems}
          index={viewerIndex}
          onClose={() => setViewerIndex(-1)}
          onNavigate={setViewerIndex}
          onTagsChange={() => {}}
          sourceKind="assets"
        />
      )}
    </main>
  );
}
