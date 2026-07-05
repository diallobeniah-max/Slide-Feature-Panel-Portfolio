export const formatTime = (s) => {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
    : `${m}:${String(sec).padStart(2,"0")}`;
};

export const formatBytes = (b) => {
  if (!b) return "Size unavailable";
  const k = 1024, s = ["B","KB","MB","GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const FACEBOOK_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com', 'web.facebook.com', 'fb.watch', 'fb.com', 'www.fb.com', 'l.facebook.com', 'lm.facebook.com']);
const EXTRA_VIDEO_HOSTS = new Map([
  ['vimeo.com', 'Vimeo'],
  ['www.vimeo.com', 'Vimeo'],
  ['player.vimeo.com', 'Vimeo'],
  ['tiktok.com', 'TikTok'],
  ['www.tiktok.com', 'TikTok'],
  ['vm.tiktok.com', 'TikTok'],
  ['twitter.com', 'X'],
  ['www.twitter.com', 'X'],
  ['x.com', 'X'],
  ['www.x.com', 'X'],
  ['dailymotion.com', 'Dailymotion'],
  ['www.dailymotion.com', 'Dailymotion'],
  ['dai.ly', 'Dailymotion'],
  ['twitch.tv', 'Twitch'],
  ['www.twitch.tv', 'Twitch'],
  ['clips.twitch.tv', 'Twitch'],
  ['reddit.com', 'Reddit'],
  ['www.reddit.com', 'Reddit'],
  ['v.redd.it', 'Reddit'],
]);
const UNSUPPORTED_STREAMING_HOSTS = new Set(['movish.net', 'www.movish.net']);

function parseUrl(url) {
  try {
    const u = new URL(url.trim());
    return u;
  } catch {
    return null;
  }
}

export const isYoutubeUrl = (url) => {
  const u = parseUrl(url);
  return Boolean(u && YOUTUBE_HOSTS.has(u.hostname.toLowerCase()));
};

export const getVideoPlatform = (url) => {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return 'youtube';
  if (INSTAGRAM_HOSTS.has(host)) return 'instagram';
  if (FACEBOOK_HOSTS.has(host)) return 'facebook';
  if (EXTRA_VIDEO_HOSTS.has(host)) return EXTRA_VIDEO_HOSTS.get(host).toLowerCase();
  return null;
};

export const getVideoPlatformLabel = (urlOrPlatform) => {
  const platform = ['youtube', 'instagram', 'facebook'].includes(urlOrPlatform)
    ? urlOrPlatform
    : getVideoPlatform(urlOrPlatform);
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'facebook') return 'Facebook';
  if (platform === 'x') return 'X';
  if (['vimeo', 'tiktok', 'dailymotion', 'twitch', 'reddit'].includes(platform)) {
    return platform[0].toUpperCase() + platform.slice(1);
  }
  return 'Video';
};

export const isSupportedVideoUrl = (url) => Boolean(getVideoPlatform(url));

export const getUnsupportedVideoUrlReason = (url) => {
  const u = parseUrl(url);
  if (!u) return "Paste a valid video URL.";
  const host = u.hostname.toLowerCase();
  if (UNSUPPORTED_STREAMING_HOSTS.has(host)) {
    return "This looks like a copyrighted streaming episode site, so Flow cannot download from it. Use a public or user-owned video link instead.";
  }
  return "Try YouTube, Facebook, Instagram, Vimeo, TikTok, X/Twitter, Dailymotion, Twitch, or Reddit.";
};

export const isValidYoutubeUrl = isYoutubeUrl;

export const extractVideoId = (url) => {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
};

const HISTORY_KEY = "yt_download_history";
export const loadHistory = () => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};
export const saveHistory = (history) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch {}
};

let ytApiPromise = null;
export const loadYTApi = () => {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
  return ytApiPromise;
};
