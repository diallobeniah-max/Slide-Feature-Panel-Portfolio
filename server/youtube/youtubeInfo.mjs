import { parseBody, json, ensureBinaries, execFileAsync, buildNetworkArgs, getYtDlpErrorMessage } from './youtubeUtils.mjs';
import { getVideoPlatform, isSupportedVideoUrl, isYoutubeUrl, normalizeVideoUrl } from './youtubeValidation.mjs';

export async function handleInfo(req, res) {
  let platform = null;
  try {
    const { url } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isSupportedVideoUrl(url)) return json(res, 400, { error: 'Invalid video URL. Paste a YouTube, Facebook, or Instagram link.' });

    const normalizedUrl = normalizeVideoUrl(url);
    platform = getVideoPlatform(normalizedUrl);
    const { ytdlpPath } = await ensureBinaries();

    const { stdout } = await execFileAsync(ytdlpPath, [
      ...buildNetworkArgs(), '--dump-json', '--no-playlist', '--no-download', normalizedUrl,
    ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

    const meta = JSON.parse(stdout);

    const qualitySet = new Map();
    for (const f of (meta.formats || [])) {
      if (f.height && f.vcodec && f.vcodec !== 'none') {
        const label = `${f.height}p`;
        if (!qualitySet.has(label) || (f.filesize || 0) > (qualitySet.get(label).filesize || 0)) {
          qualitySet.set(label, {
            label,
            height: f.height,
            filesize: f.filesize || f.filesize_approx || 0,
            ext: f.ext,
            vcodec: f.vcodec,
            fps: f.fps || 0,
          });
        }
      }
    }
    const qualities = [...qualitySet.values()].sort((a, b) => b.height - a.height).slice(0, 8);

    const audioBest = (meta.formats || [])
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
      .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];

    const subtitleLangs = [];
    const subs = meta.subtitles || {};
    const autoSubs = meta.automatic_captions || {};
    for (const [lang, tracks] of Object.entries(subs)) {
      subtitleLangs.push({ lang, label: lang, auto: false });
    }
    for (const [lang, tracks] of Object.entries(autoSubs)) {
      if (!subs[lang]) subtitleLangs.push({ lang, label: `${lang} (auto)`, auto: true });
    }

    return json(res, 200, {
      id: meta.id,
      platform,
      title: meta.title || meta.fulltitle || 'Untitled',
      thumbnail: meta.thumbnail || meta.thumbnails?.[meta.thumbnails.length - 1]?.url || '',
      duration: meta.duration || 0,
      channel: meta.channel || meta.uploader || '',
      viewCount: meta.view_count || 0,
      uploadDate: meta.upload_date || '',
      description: (meta.description || '').slice(0, 300),
      qualities,
      bestSize: qualities[0]?.filesize
        ? qualities[0].filesize + (audioBest?.filesize || audioBest?.filesize_approx || 0)
        : (meta.filesize || meta.filesize_approx || 0),
      audioSize: audioBest?.filesize || audioBest?.filesize_approx || 0,
      subtitleLangs: subtitleLangs.slice(0, 30),
    });
  } catch (err) {
    console.error('[YT-API] info error:', err.message);
    return json(res, 500, { error: getYtDlpErrorMessage(err, platform || 'video') });
  }
}

export async function handlePlaylist(req, res) {
  try {
    const { url } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isYoutubeUrl(url)) return json(res, 400, { error: 'Playlist mode only accepts YouTube links.' });

    const { ytdlpPath } = await ensureBinaries();

    const { stdout } = await execFileAsync(ytdlpPath, [
      '--flat-playlist', '--dump-json', '--yes-playlist', url,
    ], { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });

    const entries = stdout.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .map(e => ({
        id: e.id, title: e.title || 'Untitled',
        url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
        duration: e.duration || 0,
      }));

    return json(res, 200, { entries, count: entries.length });
  } catch (err) {
    console.error('[YT-API] playlist error:', err.message);
    return json(res, 500, { error: err.message || 'Failed to fetch playlist' });
  }
}
