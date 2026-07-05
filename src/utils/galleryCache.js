const LOCAL_TAGS_KEY = "flow-gallery-tags";

function readLocalTags() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_TAGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalTags(tags) {
  try {
    localStorage.setItem(LOCAL_TAGS_KEY, JSON.stringify(tags));
  } catch {
    // Local tags are a convenience in web fallback mode.
  }
}

export function getLocalMediaTags(mediaId = "") {
  const tags = readLocalTags();
  return mediaId ? tags[mediaId] || [] : tags;
}

export function saveLocalMediaTags(mediaId, nextTags) {
  const tags = readLocalTags();
  tags[mediaId] = [...new Set(nextTags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  writeLocalTags(tags);
  return tags[mediaId];
}

export function clearLocalGalleryTags() {
  writeLocalTags({});
}
