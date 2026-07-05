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

const EXTRA_VIDEO_HOSTS = new Map([
  ['vimeo.com', 'vimeo'],
  ['www.vimeo.com', 'vimeo'],
  ['player.vimeo.com', 'vimeo'],
  ['tiktok.com', 'tiktok'],
  ['www.tiktok.com', 'tiktok'],
  ['vm.tiktok.com', 'tiktok'],
  ['twitter.com', 'x'],
  ['www.twitter.com', 'x'],
  ['x.com', 'x'],
  ['www.x.com', 'x'],
  ['dailymotion.com', 'dailymotion'],
  ['www.dailymotion.com', 'dailymotion'],
  ['dai.ly', 'dailymotion'],
  ['twitch.tv', 'twitch'],
  ['www.twitch.tv', 'twitch'],
  ['clips.twitch.tv', 'twitch'],
  ['reddit.com', 'reddit'],
  ['www.reddit.com', 'reddit'],
  ['v.redd.it', 'reddit'],
]);

const UNSUPPORTED_STREAMING_HOSTS = new Set([
  'movish.net',
  'www.movish.net',
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
  if (EXTRA_VIDEO_HOSTS.has(host)) return EXTRA_VIDEO_HOSTS.get(host);
  return null;
}

export function isSupportedVideoUrl(url) {
  return Boolean(getVideoPlatform(url));
}

export function getUnsupportedVideoUrlReason(url) {
  const u = parseUrl(url);
  if (!u) return 'Paste a valid video URL.';
  const host = u.hostname.toLowerCase();
  if (UNSUPPORTED_STREAMING_HOSTS.has(host)) {
    return 'This looks like a copyrighted streaming episode site, so Flow cannot download from it. Use a public or user-owned video link instead.';
  }
  return 'This site is not supported yet. Try YouTube, Facebook, Instagram, Vimeo, TikTok, X/Twitter, Dailymotion, Twitch, or Reddit.';
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
