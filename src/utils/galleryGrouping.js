const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

export function getMediaDate(item) {
  const date = new Date(item?.takenAt || item?.modifiedAt || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function getMediaMonthKey(item) {
  const date = getMediaDate(item);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getMediaMonthTitle(item) {
  return MONTH_FORMATTER.format(getMediaDate(item));
}

export function sortGalleryItems(items, sortMode = "newest") {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sortMode === "oldest") return getMediaDate(a) - getMediaDate(b);
    if (sortMode === "name") return String(a.name).localeCompare(String(b.name));
    if (sortMode === "type") {
      return (
        String(a.extension).localeCompare(String(b.extension)) ||
        String(a.name).localeCompare(String(b.name))
      );
    }
    if (sortMode === "size") return (b.size || 0) - (a.size || 0);
    return getMediaDate(b) - getMediaDate(a);
  });
  return sorted;
}

export function groupMediaByMonth(items) {
  const groups = new Map();
  for (const item of items) {
    const key = getMediaMonthKey(item);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: getMediaMonthTitle(item),
        date: getMediaDate(item),
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

export function formatMediaDate(item) {
  const date = getMediaDate(item);
  if (date.getFullYear() <= 1970) return "Unknown date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
