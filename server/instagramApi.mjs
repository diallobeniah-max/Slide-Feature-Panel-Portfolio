const INSTAGRAM_HOST = "https://www.instagram.com";
const GRAPHQL_DOCUMENT_ID = "9510064595728286";
const WEB_APP_ID = "936619743392459";

const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  referer: `${INSTAGRAM_HOST}/`,
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(res) {
  sendJson(res, 405, { ok: false, error: "Only GET requests are supported." });
}

function getRequestUrl(req) {
  return new URL(req.url || "/", "http://localhost");
}

function cleanText(value = "") {
  return String(value)
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#x3D;/g, "=")
    .replace(/\\u003d/gi, "=");
}

export function normalizeInstagramUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0] === "reels" ? "reel" : parts[0];
    const shortcode = parts[1];

    if (host !== "instagram.com") return "";
    if (!["p", "reel", "tv"].includes(type)) return "";
    if (!shortcode) return "";

    return `${INSTAGRAM_HOST}/${type}/${shortcode}/`;
  } catch {
    return "";
  }
}

function getPostParts(instagramUrl) {
  const url = new URL(instagramUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  return {
    type: parts[0] === "reels" ? "reel" : parts[0],
    shortcode: parts[1],
  };
}

function isAllowedMediaUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host.endsWith(".cdninstagram.com") ||
        host === "cdninstagram.com" ||
        host.endsWith(".fbcdn.net") ||
        host === "fbcdn.net")
    );
  } catch {
    return false;
  }
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[a-z_]+=)/i);
}

function findCsrfCookie(cookies) {
  const csrf = cookies
    .map((cookie) => cookie.split(";")[0])
    .find((cookie) => cookie.startsWith("csrftoken="));
  return csrf ? csrf.replace("csrftoken=", "") : "";
}

async function getInstagramSession() {
  const res = await fetch(INSTAGRAM_HOST, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
  });
  const cookies = getSetCookies(res.headers).map((cookie) =>
    cookie.split(";")[0],
  );
  return {
    csrf: findCsrfCookie(cookies),
    cookieHeader: cookies.join("; "),
  };
}

async function fetchInstagramGraphql(shortcode) {
  const session = await getInstagramSession();
  const body = new URLSearchParams({
    variables: JSON.stringify({
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
    }),
    doc_id: GRAPHQL_DOCUMENT_ID,
  });

  const res = await fetch(`${INSTAGRAM_HOST}/graphql/query`, {
    method: "POST",
    headers: {
      ...REQUEST_HEADERS,
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      cookie: session.cookieHeader,
      "x-asbd-id": "129477",
      "x-csrftoken": session.csrf,
      "x-ig-app-id": WEB_APP_ID,
      "x-requested-with": "XMLHttpRequest",
    },
    body,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Instagram returned ${res.status}.`);
  }

  const data = await res.json();
  const media =
    data?.data?.xdt_shortcode_media || data?.data?.shortcode_media || null;
  if (!media) {
    throw new Error("No public media data was returned for this link.");
  }

  return media;
}

function bestImageFromNode(node) {
  const candidates = node?.image_versions2?.candidates;
  if (Array.isArray(candidates) && candidates.length) {
    const [best] = [...candidates].sort(
      (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
    );
    return best?.url || "";
  }

  const resources = node?.display_resources;
  if (Array.isArray(resources) && resources.length) {
    const [best] = [...resources].sort(
      (a, b) =>
        (b.config_width || 0) * (b.config_height || 0) -
        (a.config_width || 0) * (a.config_height || 0),
    );
    return best?.src || "";
  }

  return node?.display_url || node?.thumbnail_src || "";
}

function bestVideoFromNode(node) {
  const versions = node?.video_versions;
  if (Array.isArray(versions) && versions.length) {
    const [best] = [...versions].sort(
      (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
    );
    return best?.url || "";
  }
  return node?.video_url || "";
}

function extensionFromUrl(url, type) {
  const withoutQuery = url.split("?")[0].toLowerCase();
  const match = withoutQuery.match(/\.([a-z0-9]{3,5})$/);
  if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  return type === "video" ? "mp4" : "jpg";
}

function formatMediaItem(node, index, shortcode) {
  const isVideo = Boolean(
    node?.is_video ||
      node?.media_type === 2 ||
      node?.video_url ||
      node?.video_versions?.length,
  );
  const url = cleanText(isVideo ? bestVideoFromNode(node) : bestImageFromNode(node));
  const fallbackImage = cleanText(bestImageFromNode(node));
  if (!url || !isAllowedMediaUrl(url)) return null;

  const type = isVideo ? "video" : "image";
  const ext = extensionFromUrl(url, type);
  const dimensions = node?.dimensions || {
    width: node?.original_width || node?.display_resources?.at?.(-1)?.config_width,
    height:
      node?.original_height || node?.display_resources?.at?.(-1)?.config_height,
  };

  return {
    id: `${shortcode}-${index}-${url.slice(-12)}`,
    index,
    type,
    name: `${shortcode}_${String(index + 1).padStart(2, "0")}.${ext}`,
    url,
    thumbnailUrl: isVideo && fallbackImage ? fallbackImage : url,
    width: Number(dimensions?.width || 0),
    height: Number(dimensions?.height || 0),
  };
}

function mediaNodesFromGraphql(media) {
  const edges = media?.edge_sidecar_to_children?.edges;
  if (Array.isArray(edges) && edges.length) {
    return edges.map((edge) => edge.node).filter(Boolean);
  }

  if (Array.isArray(media?.carousel_media) && media.carousel_media.length) {
    return media.carousel_media;
  }

  return [media];
}

function extractItemsFromGraphql(media, shortcode) {
  return mediaNodesFromGraphql(media)
    .map((node, index) => formatMediaItem(node, index, shortcode))
    .filter(Boolean);
}

function extractPostInfo(media) {
  const captionEdge = media?.edge_media_to_caption?.edges?.[0]?.node;
  return {
    ownerUsername: media?.owner?.username || "",
    ownerFullName: media?.owner?.full_name || "",
    isPrivate: Boolean(media?.owner?.is_private),
    caption: captionEdge?.text || "",
    mediaCount: Number(media?.edge_sidecar_to_children?.edges?.length || 1),
    typename: media?.__typename || media?.typename || "",
  };
}

function findBalancedObject(text, startIndex) {
  const start = text.indexOf("{", startIndex);
  if (start < 0) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return "";
}

function getJsonObjectsByMarker(text, marker) {
  const objects = [];
  let cursor = 0;

  while (cursor < text.length) {
    const markerIndex = text.indexOf(marker, cursor);
    if (markerIndex < 0) break;
    const objectText = findBalancedObject(text, markerIndex + marker.length);
    cursor = markerIndex + marker.length;
    if (!objectText) continue;

    try {
      objects.push(JSON.parse(objectText));
    } catch {
      // Ignore parse failures and keep scanning.
    }
  }

  return objects;
}

function collectScriptJson(html) {
  const objects = [];
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = cleanText(match[1]).trim();
    if (!script || script.length > 1_500_000) continue;
    if (!script.startsWith("{") && !script.startsWith("[")) continue;
    try {
      objects.push(JSON.parse(script));
    } catch {
      // Not a pure JSON script.
    }
  }
  return objects;
}

function walkForMedia(value, shortcode, found = []) {
  if (!value || typeof value !== "object") return found;

  if (
    value.shortcode === shortcode ||
    value.code === shortcode ||
    value.__typename === "GraphSidecar" ||
    value.__typename === "XDTGraphSidecar"
  ) {
    const items = extractItemsFromGraphql(value, shortcode);
    if (items.length) found.push(...items);
  }

  if (Array.isArray(value)) {
    for (const item of value) walkForMedia(item, shortcode, found);
    return found;
  }

  for (const item of Object.values(value)) {
    walkForMedia(item, shortcode, found);
  }
  return found;
}

function dedupeItems(items) {
  const seen = new Set();
  return items
    .filter((item) => {
      if (!item?.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .map((item, index) => ({
      ...item,
      index,
      name: item.name.replace(/_\d\d\./, `_${String(index + 1).padStart(2, "0")}.`),
    }));
}

function extractCdnItemsFromHtml(html, shortcode) {
  const cleaned = cleanText(html);
  const seen = new Set();
  const items = [];
  const mediaPattern =
    /https:\/\/[^"'<>\s\\]+(?:cdninstagram\.com|fbcdn\.net)\/[^"'<>\s\\]+?(?:\.mp4|\.jpg|\.jpeg|\.webp)(?:\?[^"'<>\s\\]+)?/gi;

  for (const match of cleaned.matchAll(mediaPattern)) {
    const url = cleanText(match[0]);
    if (!isAllowedMediaUrl(url)) continue;
    if (/\/(?:s\d+x\d+|p\d+x\d+)\//i.test(url)) continue;
    if (/profile|sprite|static|emoji|avatar/i.test(url)) continue;
    if (seen.has(url)) continue;

    seen.add(url);
    const type = /\.mp4(?:\?|$)/i.test(url) ? "video" : "image";
    const index = items.length;
    items.push({
      id: `${shortcode}-html-${index}`,
      index,
      type,
      name: `${shortcode}_${String(index + 1).padStart(2, "0")}.${extensionFromUrl(url, type)}`,
      url,
      thumbnailUrl: url,
      width: 0,
      height: 0,
    });
  }

  return items;
}

function extractItemsFromHtml(html, shortcode) {
  const cleaned = cleanText(html);
  const jsonObjects = [
    ...getJsonObjectsByMarker(cleaned, '"xdt_shortcode_media":'),
    ...getJsonObjectsByMarker(cleaned, '"shortcode_media":'),
    ...collectScriptJson(cleaned),
  ];

  const structured = dedupeItems(
    jsonObjects.flatMap((object) => walkForMedia(object, shortcode)),
  );
  if (structured.length) return structured;

  return dedupeItems(extractCdnItemsFromHtml(cleaned, shortcode));
}

async function fetchHtmlFallbacks(normalizedUrl, type, shortcode) {
  const candidateUrls = [
    normalizedUrl,
    `${INSTAGRAM_HOST}/${type}/${shortcode}/embed/captioned/`,
  ];

  for (const url of candidateUrls) {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) continue;
    const html = await res.text();
    const items = extractItemsFromHtml(html, shortcode);
    if (items.length) return items;
  }

  return [];
}

function clientMediaUrls(item) {
  const params = new URLSearchParams({ url: item.url, name: item.name });
  const thumbnailParams = new URLSearchParams({
    url: item.thumbnailUrl || item.url,
    name: item.name,
  });

  return {
    ...item,
    mediaUrl: item.url,
    previewUrl: `/api/instagram-media?${thumbnailParams.toString()}`,
    downloadUrl: `/api/instagram-media?${params.toString()}&download=1`,
  };
}

export async function scrapeInstagramCarousel(value) {
  const normalizedUrl = normalizeInstagramUrl(value);
  if (!normalizedUrl) {
    throw new Error("Enter a valid Instagram post, reel, or carousel link.");
  }

  const { type, shortcode } = getPostParts(normalizedUrl);
  let postInfo = {
    ownerUsername: "",
    ownerFullName: "",
    isPrivate: false,
    caption: "",
    mediaCount: 0,
    typename: "",
  };
  let items = [];
  let source = "html";

  try {
    const media = await fetchInstagramGraphql(shortcode);
    postInfo = extractPostInfo(media);
    items = extractItemsFromGraphql(media, shortcode);
    source = "graphql";
  } catch (error) {
    items = await fetchHtmlFallbacks(normalizedUrl, type, shortcode);
    if (!items.length) throw error;
  }

  const deduped = dedupeItems(items);
  if (!deduped.length) {
    throw new Error("No downloadable carousel media was found for this link.");
  }

  return {
    ok: true,
    post: {
      url: normalizedUrl,
      shortcode,
      type,
      source,
      ...postInfo,
      mediaCount: deduped.length,
    },
    items: deduped.map(clientMediaUrls),
  };
}

export async function handleInstagramCarouselApi(req, res) {
  if (req.method && req.method !== "GET") return sendMethodNotAllowed(res);

  const url = getRequestUrl(req).searchParams.get("url") || "";
  try {
    const result = await scrapeInstagramCarousel(url);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 422, {
      ok: false,
      error:
        error?.message ||
        "Instagram blocked extraction for this public link. Try again later.",
    });
  }
}

export async function handleInstagramMediaApi(req, res) {
  if (req.method && req.method !== "GET") return sendMethodNotAllowed(res);

  const requestUrl = getRequestUrl(req);
  const targetUrl = requestUrl.searchParams.get("url") || "";
  const name = requestUrl.searchParams.get("name") || "instagram-media";
  const shouldDownload = requestUrl.searchParams.get("download") === "1";

  if (!isAllowedMediaUrl(targetUrl)) {
    sendJson(res, 400, { ok: false, error: "Unsupported media URL." });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        ...REQUEST_HEADERS,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!upstream.ok || !upstream.body) {
      sendJson(res, upstream.status || 502, {
        ok: false,
        error: "Instagram media could not be downloaded.",
      });
      return;
    }

    res.statusCode = 200;
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") || "application/octet-stream",
    );
    res.setHeader("cache-control", "private, max-age=300");
    if (shouldDownload) {
      res.setHeader(
        "content-disposition",
        `attachment; filename="${name.replace(/["\\]/g, "")}"`,
      );
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch {
    sendJson(res, 502, {
      ok: false,
      error: "Instagram media could not be downloaded.",
    });
  }
}

export function createInstagramMiddleware() {
  return async function instagramMiddleware(req, res, next) {
    const requestUrl = getRequestUrl(req);

    if (requestUrl.pathname === "/api/instagram-carousel") {
      await handleInstagramCarouselApi(req, res);
      return;
    }

    if (requestUrl.pathname === "/api/instagram-media") {
      await handleInstagramMediaApi(req, res);
      return;
    }

    next();
  };
}
