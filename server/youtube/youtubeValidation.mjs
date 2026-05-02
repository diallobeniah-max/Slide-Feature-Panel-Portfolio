export function isValidYoutubeUrl(url) {
  try {
    const u = new URL(url);
    const validHosts = [
      'youtube.com', 'www.youtube.com', 'm.youtube.com',
      'music.youtube.com', 'youtu.be',
    ];
    return validHosts.includes(u.hostname);
  } catch { return false; }
}
