const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'music.youtube.com', 'youtu.be',
]);

const INSTAGRAM_HOSTS = new Set([
  'instagram.com', 'www.instagram.com', 'm.instagram.com',
]);

const FACEBOOK_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com',
  'mbasic.facebook.com', 'web.facebook.com', 'fb.watch',
  'fb.com', 'www.fb.com', 'l.facebook.com', 'lm.facebook.com',
]);

function parseUrl(url) {
  try {
    const u = new URL(url);
    return u;
  } catch { return false; }
}

export function isYoutubeUrl(url) {
  const u = parseUrl(url);
  return Boolean(u && YOUTUBE_HOSTS.has(u.hostname.toLowerCase()));
}

export function getVideoPlatform(url) {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return 'youtube';
  if (INSTAGRAM_HOSTS.has(host)) return 'instagram';
  if (FACEBOOK_HOSTS.has(host)) return 'facebook';
  return null;
}

export function isSupportedVideoUrl(url) {
  return Boolean(getVideoPlatform(url));
}

export function normalizeVideoUrl(url) {
  const parsed = parseUrl(String(url || '').trim());
  if (!parsed) return String(url || '').trim();
  const host = parsed.hostname.toLowerCase();

  if ((host === 'l.facebook.com' || host === 'lm.facebook.com') && parsed.pathname === '/l.php') {
    const target = parsed.searchParams.get('u');
    return target ? normalizeVideoUrl(target) : parsed.toString();
  }

  parsed.hash = '';
  if (FACEBOOK_HOSTS.has(host)) {
    for (const key of ['mibextid', '__tn__', 'ref', 'sfnsn', 'rdid']) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

export const isValidYoutubeUrl = isYoutubeUrl;
