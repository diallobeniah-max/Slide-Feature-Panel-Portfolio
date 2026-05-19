import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Film,
  Folder,
  Image as ImageIcon,
  Images,
  Pin,
  Play,
  Tags,
} from "lucide-react";
import { Badge, Button } from "../ui.jsx";
import {
  formatMediaDate,
  getMediaMonthTitle,
  groupMediaByMonth,
} from "../../utils/galleryGrouping.js";
import { isImageMedia, isVideoMedia } from "../../utils/mediaTypes.js";
import { canDragIndexedFile, startIndexedFileDrag } from "../../utils/fileDrag.js";

function getPreviewItems(items, predicate, limit = 10) {
  return items.filter(predicate).slice(0, limit);
}

function getMonthLabel(item) {
  return item ? getMediaMonthTitle(item) : "Collections";
}

function CollectionCard({
  item,
  title,
  subtitle,
  icon: Icon,
  onClick,
  actionIcon: ActionIcon,
  actionLabel = "",
  actionActive = false,
  onAction,
  sourceKind = "gallery",
}) {
  const isVideo = isVideoMedia(item);
  const previewUrl = item?.thumbnailUrl || "";
  const extension = String(item?.extension || item?.type || "video").toUpperCase();

  return (
    <div className="relative h-44 w-36 shrink-0 sm:h-52 sm:w-44">
      <button
        type="button"
        draggable={Boolean(item?.id) && canDragIndexedFile()}
        onDragStart={(event) => startIndexedFileDrag(event, sourceKind, item)}
        onClick={onClick}
        className="group relative h-full w-full overflow-hidden rounded-[22px] border border-white/10 bg-zinc-100 text-left shadow-sm shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-2xl hover:shadow-black/25 dark:bg-zinc-900"
      >
        {previewUrl && isImageMedia(item) ? (
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : isVideo ? (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-zinc-200 to-zinc-300 text-zinc-500 dark:from-zinc-900 dark:to-zinc-950">
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-3xl bg-black/10 text-zinc-700 dark:bg-white/10 dark:text-white">
                <Film size={24} />
              </span>
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest">{extension}</p>
            </div>
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-zinc-200 to-zinc-300 text-zinc-500 dark:from-zinc-800 dark:to-zinc-950">
            <Icon size={34} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="line-clamp-2 text-lg font-black leading-tight tracking-tight">{title}</p>
          <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wider text-white/70">
            {subtitle}
          </p>
        </div>
        <div className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-2xl bg-white/20 text-white shadow-sm backdrop-blur-xl">
          {isVideo ? <Film size={17} /> : <Icon size={17} />}
        </div>
        {isVideo && (
          <div className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-xl">
            <Play size={15} fill="currentColor" />
          </div>
        )}
      </button>
      {ActionIcon && (
        <button
          type="button"
          aria-label={actionLabel}
          title={actionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onAction?.();
          }}
          className={`absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-2xl text-white shadow-sm backdrop-blur-xl transition hover:scale-105 ${
            actionActive ? "bg-zinc-950/85 dark:bg-white/25" : "bg-black/35 hover:bg-black/55"
          }`}
        >
          <ActionIcon size={17} fill={actionActive ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

function MonthCard({ group, pinned, onOpen, onTogglePin }) {
  return (
    <CollectionCard
      item={group.items[0]}
      title={group.title}
      subtitle={`${group.items.length} picture${group.items.length === 1 ? "" : "s"}`}
      icon={ImageIcon}
      actionIcon={Pin}
      actionLabel={pinned ? `Unpin ${group.title}` : `Pin ${group.title}`}
      actionActive={pinned}
      onAction={() => onTogglePin(group.key)}
      onClick={() => onOpen(group.key)}
    />
  );
}

function Section({ title, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="min-w-0 space-y-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex items-center gap-2 text-left"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-500 transition group-hover:bg-zinc-200 group-hover:text-zinc-950 dark:bg-zinc-900 dark:group-hover:bg-zinc-800 dark:group-hover:text-white">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
        <h3 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
          {title}
        </h3>
        <Badge variant="default">{count}</Badge>
      </button>
      {open && (
        <div className="flex max-w-full gap-3 overflow-x-auto overscroll-x-contain pb-3 no-scrollbar">
          {children}
        </div>
      )}
    </section>
  );
}

function HeroMosaic({ items, onOpenItem }) {
  const heroItems = items.slice(0, 5);
  const lead = heroItems[0];
  const leadIsVideo = isVideoMedia(lead);
  const leadUrl = lead?.thumbnailUrl || "";

  return (
    <div className="grid h-[18rem] max-w-full min-w-0 gap-2 overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 p-2 shadow-xl shadow-black/20 sm:h-[20rem] sm:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] xl:h-[22rem]">
      <button
        type="button"
        draggable={Boolean(lead?.id) && canDragIndexedFile()}
        onDragStart={(event) => startIndexedFileDrag(event, "gallery", lead)}
        onClick={() => lead && onOpenItem(lead)}
        className="group relative min-h-0 overflow-hidden rounded-[22px] bg-zinc-900 text-left"
      >
        {leadUrl ? (
          <img
            src={leadUrl}
            alt=""
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
        ) : leadIsVideo ? (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-800 text-white">
            <div className="text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-[2rem] bg-white/10 shadow-inner">
                <Film size={34} />
              </span>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-white/55">
                Video
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center text-zinc-500">
            <Images size={42} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Latest Moment
          </p>
          <h2 className="mt-1 line-clamp-2 text-2xl font-black tracking-tight sm:text-3xl">
            {getMonthLabel(lead)}
          </h2>
          <p className="mt-2 line-clamp-1 text-sm font-semibold text-white/70">
            {lead?.name || "Select a folder to build your local library"}
          </p>
        </div>
      </button>

      <div className="hidden min-h-0 min-w-0 grid-cols-2 gap-2 sm:grid sm:grid-cols-1">
        {heroItems.slice(1, 5).map((item) => (
          <button
            type="button"
            key={`hero-${item.id}`}
            draggable={canDragIndexedFile()}
            onDragStart={(event) => startIndexedFileDrag(event, "gallery", item)}
            onClick={() => onOpenItem(item)}
            className="group relative min-h-0 overflow-hidden rounded-[18px] bg-zinc-900 text-left"
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/55">
                {isVideoMedia(item) ? <Film size={26} /> : <Images size={26} />}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3">
              <p className="truncate text-sm font-black text-white">{item.name}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                {formatMediaDate(item)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GalleryHome({
  items,
  availableTags,
  folderPath,
  pinnedMonthKeys,
  onOpenItem,
  onShowLibrary,
  onSetFilter,
  onSetTagFilter,
  onOpenMonth,
  onTogglePinnedMonth,
}) {
  const recentItems = useMemo(() => items.slice(0, 12), [items]);
  const videos = useMemo(() => getPreviewItems(items, isVideoMedia), [items]);
  const images = useMemo(() => getPreviewItems(items, isImageMedia), [items]);
  const tagged = useMemo(
    () => items.filter((item) => item.tags?.length).slice(0, 10),
    [items],
  );
  const monthGroups = useMemo(() => groupMediaByMonth(items), [items]);
  const monthCards = useMemo(() => monthGroups.slice(0, 10), [monthGroups]);
  const pinnedMonthGroups = useMemo(() => {
    const byKey = new Map(monthGroups.map((group) => [group.key, group]));
    return pinnedMonthKeys.map((key) => byKey.get(key)).filter(Boolean);
  }, [monthGroups, pinnedMonthKeys]);

  if (!items.length) return null;

  return (
    <div className="grid min-w-0 gap-7 overflow-hidden">
      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Local Gallery
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
              Collections
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onShowLibrary}>
              Library View
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onSetFilter("videos");
                onShowLibrary();
              }}
            >
              Videos
            </Button>
          </div>
        </div>
        <HeroMosaic items={recentItems} onOpenItem={onOpenItem} />
      </div>

      <Section title="Recent" count={recentItems.length}>
        {recentItems.map((item) => (
          <CollectionCard
            key={item.id}
            item={item}
            title={item.name}
            subtitle={formatMediaDate(item)}
            icon={ImageIcon}
            onClick={() => onOpenItem(item)}
          />
        ))}
      </Section>

      <Section title="Pinned Months" count={pinnedMonthGroups.length} defaultOpen>
        {pinnedMonthGroups.length ? (
          pinnedMonthGroups.map((group) => (
            <MonthCard
              key={`pinned-month-${group.key}`}
              group={group}
              pinned
              onOpen={onOpenMonth}
              onTogglePin={onTogglePinnedMonth}
            />
          ))
        ) : (
          <CollectionCard
            title="No pinned months"
            subtitle="Pin one from Memories"
            icon={Pin}
            onClick={onShowLibrary}
          />
        )}
      </Section>

      <Section title="Memories" count={monthCards.length}>
        {monthCards.map((group) => (
          <MonthCard
            key={`month-${group.key}`}
            group={group}
            pinned={pinnedMonthKeys.includes(group.key)}
            onOpen={onOpenMonth}
            onTogglePin={onTogglePinnedMonth}
          />
        ))}
      </Section>

      <Section title="Pinned Tags" count={tagged.length} defaultOpen={tagged.length > 0}>
        {tagged.length ? (
          tagged.map((item) => (
            <CollectionCard
              key={`tagged-${item.id}`}
              item={item}
              title={item.tags?.[0] || "Tagged"}
              subtitle={item.name}
              icon={Pin}
              onClick={() => onOpenItem(item)}
            />
          ))
        ) : (
          <CollectionCard
            title="No pinned tags"
            subtitle="Add tags in the viewer"
            icon={Pin}
            onClick={onShowLibrary}
          />
        )}
      </Section>

      <Section title="Albums" count={3}>
        <CollectionCard
          item={images[0]}
          title="Images"
          subtitle={`${items.filter(isImageMedia).length} files`}
          icon={ImageIcon}
          onClick={() => {
            onSetFilter("images");
            onShowLibrary();
          }}
        />
        <CollectionCard
          item={videos[0]}
          title="Videos"
          subtitle={`${items.filter(isVideoMedia).length} files`}
          icon={Film}
          onClick={() => {
            onSetFilter("videos");
            onShowLibrary();
          }}
        />
        <CollectionCard
          title="Current Folder"
          subtitle={folderPath ? "Selected source" : "No folder"}
          icon={Folder}
          onClick={onShowLibrary}
        />
      </Section>

      <Section title="Tags" count={availableTags.length} defaultOpen={availableTags.length > 0}>
        {availableTags.length ? (
          availableTags.map((tag) => {
            const taggedItem = items.find((item) => item.tags?.includes(tag));
            return (
              <CollectionCard
                key={tag}
                item={taggedItem}
                title={tag}
                subtitle={`${items.filter((item) => item.tags?.includes(tag)).length} items`}
                icon={Tags}
                onClick={() => {
                  onSetTagFilter(tag);
                  onShowLibrary();
                }}
              />
            );
          })
        ) : (
          <CollectionCard
            title="No tags yet"
            subtitle="Tags stay local to this app"
            icon={Tags}
            onClick={onShowLibrary}
          />
        )}
      </Section>
    </div>
  );
}
