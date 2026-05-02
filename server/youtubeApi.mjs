/**
 * YouTube Download API — Vite dev-server middleware
 * Uses yt-dlp + ffmpeg for metadata fetching, downloading, trimming, and subtitles.
 *
 * Endpoints:
 *   POST /api/yt/info       — fetch single video metadata
 *   POST /api/yt/playlist   — fetch playlist metadata (list of videos)
 *   POST /api/yt/download   — download video with quality/format/trim options
 *   POST /api/yt/subtitles  — download subtitles in srt or vtt
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

/* ── helpers ───────────────────────────────────────────────────── */

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/** Validate a YouTube URL strictly */
function isValidYoutubeUrl(url) {
  try {
    const u = new URL(url);
    const validHosts = [
      'youtube.com', 'www.youtube.com', 'm.youtube.com',
      'music.youtube.com', 'youtu.be',
    ];
    return validHosts.includes(u.hostname);
  } catch { return false; }
}

/** Locate yt-dlp binary — checks PATH and common install dirs */
async function findBinary(name) {
  try {
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where' : 'which',
      [name], { timeout: 5000 },
    );
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    if (firstLine) return firstLine;
  } catch { /* not in PATH */ }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      join(localAppData, 'Microsoft', 'WinGet', 'Links', `${name}.exe`),
      join(localAppData, 'Programs', 'yt-dlp', `${name}.exe`),
      `C:\\yt-dlp\\${name}.exe`,
    ];
    for (const p of candidates) {
      try { await fs.access(p); return p; } catch { /* skip */ }
    }
  }
  return name;
}

let ytdlpPath = null;
let ffmpegPath = null;

async function ensureBinaries() {
  if (!ytdlpPath) ytdlpPath = await findBinary('yt-dlp');
  if (!ffmpegPath) ffmpegPath = await findBinary('ffmpeg');
}

/** Build the -f format selector string for yt-dlp */
function buildFormatSelector(quality, format) {
  if (quality === 'audio') return 'bestaudio';
  const heightMap = { '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 };
  const h = heightMap[quality];
  if (h) {
    return `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
  }
  // "best" or unknown
  return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
}

/** Clean up temporary files safely */
async function cleanupFiles(...paths) {
  for (const p of paths) {
    try { await fs.unlink(p); } catch { /* ignore */ }
  }
}

/* ── API handlers ──────────────────────────────────────────────── */

/** POST /api/yt/info — get video metadata + available formats & subtitles */
async function handleInfo(req, res) {
  try {
    const { url } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isValidYoutubeUrl(url)) return json(res, 400, { error: 'Invalid YouTube URL. Only youtube.com and youtu.be links are accepted.' });

    await ensureBinaries();

    const { stdout } = await execFileAsync(ytdlpPath, [
      '--dump-json', '--no-playlist', '--no-download', url,
    ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

    const meta = JSON.parse(stdout);

    // Build quality options from available formats
    const qualitySet = new Map();
    for (const f of (meta.formats || [])) {
      if (f.height && f.vcodec && f.vcodec !== 'none') {
        const label = `${f.height}p`;
        if (!qualitySet.has(label) || (f.filesize || 0) > (qualitySet.get(label).filesize || 0)) {
          qualitySet.set(label, {
            label, height: f.height,
            filesize: f.filesize || f.filesize_approx || 0,
            ext: f.ext, vcodec: f.vcodec,
          });
        }
      }
    }
    // Sort by height descending
    const qualities = [...qualitySet.values()]
      .sort((a, b) => b.height - a.height)
      .slice(0, 8);

    // Get audio-only size estimate
    const audioBest = (meta.formats || [])
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
      .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];

    // Get available subtitle languages
    const subtitleLangs = [];
    const subs = meta.subtitles || {};
    const autoSubs = meta.automatic_captions || {};
    for (const [lang, tracks] of Object.entries(subs)) {
      subtitleLangs.push({ lang, label: lang, auto: false });
    }
    for (const [lang, tracks] of Object.entries(autoSubs)) {
      if (!subs[lang]) {
        subtitleLangs.push({ lang, label: `${lang} (auto)`, auto: true });
      }
    }

    return json(res, 200, {
      id: meta.id,
      title: meta.title || meta.fulltitle || 'Untitled',
      thumbnail: meta.thumbnail || meta.thumbnails?.[meta.thumbnails.length - 1]?.url || '',
      duration: meta.duration || 0,
      channel: meta.channel || meta.uploader || '',
      viewCount: meta.view_count || 0,
      uploadDate: meta.upload_date || '',
      description: (meta.description || '').slice(0, 300),
      qualities,
      audioSize: audioBest?.filesize || audioBest?.filesize_approx || 0,
      subtitleLangs: subtitleLangs.slice(0, 30),
    });
  } catch (err) {
    console.error('[YT-API] info error:', err.message);
    return json(res, 500, { error: err.message || 'Failed to fetch info' });
  }
}

/** POST /api/yt/playlist — fetch playlist info */
async function handlePlaylist(req, res) {
  try {
    const { url } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isValidYoutubeUrl(url)) return json(res, 400, { error: 'Invalid YouTube URL.' });

    await ensureBinaries();

    const { stdout } = await execFileAsync(ytdlpPath, [
      '--flat-playlist', '--dump-json', '--yes-playlist', url,
    ], { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });

    // yt-dlp outputs one JSON object per line for flat-playlist
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

/** POST /api/yt/subtitles — download subtitles */
async function handleSubtitles(req, res) {
  try {
    const { url, lang = 'en', format: subFmt = 'srt' } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isValidYoutubeUrl(url)) return json(res, 400, { error: 'Invalid YouTube URL.' });

    await ensureBinaries();

    const tmpDir = join(tmpdir(), 'yt-panel-downloads');
    await fs.mkdir(tmpDir, { recursive: true });
    const outId = randomUUID();
    const outTemplate = join(tmpDir, `${outId}.%(ext)s`);

    const args = [
      '--write-subs', '--write-auto-subs',
      '--sub-lang', lang,
      '--sub-format', subFmt,
      '--skip-download',
      '--convert-subs', subFmt,
      '-o', outTemplate,
      '--no-playlist', url,
    ];

    await execFileAsync(ytdlpPath, args, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });

    // Find the subtitle file
    const files = await fs.readdir(tmpDir);
    const subFile = files.find(f => f.startsWith(outId) && (f.endsWith('.srt') || f.endsWith('.vtt')));
    if (!subFile) throw new Error('No subtitles found for this video/language');

    const subPath = join(tmpDir, subFile);
    const stat = await fs.stat(subPath);
    const ext = subFile.split('.').pop();

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="subtitles_${lang}.${ext}"`,
      'Access-Control-Allow-Origin': '*',
    });

    const stream = createReadStream(subPath);
    stream.pipe(res);
    stream.on('end', () => cleanupFiles(subPath));
  } catch (err) {
    console.error('[YT-API] subtitles error:', err.message);
    if (!res.headersSent) return json(res, 500, { error: err.message || 'Subtitles failed' });
  }
}

/** POST /api/yt/download — download with quality/format/trim, returns file */
async function handleDownload(req, res) {
  try {
    const { url, start, end, format = 'mp4', quality = 'best' } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isValidYoutubeUrl(url)) return json(res, 400, { error: 'Invalid YouTube URL.' });

    // Validate trim values
    if (start != null && start < 0) return json(res, 400, { error: 'Start time cannot be negative.' });
    if (end != null && start != null && end <= start) return json(res, 400, { error: 'End time must be after start time.' });

    await ensureBinaries();

    const needsTrim = (start != null && start > 0) || (end != null && end > 0);
    const tmpDir = join(tmpdir(), 'yt-panel-downloads');
    await fs.mkdir(tmpDir, { recursive: true });
    const outId = randomUUID();
    const isAudio = quality === 'audio';
    const fmtSelector = buildFormatSelector(quality, format);
    const mergeFormat = isAudio ? 'mp4' : (format === 'mp3' ? 'mp4' : format);
    const outExt = isAudio || format === 'mp3' ? 'mp3' : format;

    if (needsTrim) {
      // Download raw, then trim with ffmpeg
      const rawPath = join(tmpDir, `${outId}_raw.%(ext)s`);
      const dlArgs = ['-f', fmtSelector, '--merge-output-format', mergeFormat, '-o', rawPath, '--no-playlist', url];
      await execFileAsync(ytdlpPath, dlArgs, { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 });

      const files = await fs.readdir(tmpDir);
      const rawFile = files.find(f => f.startsWith(`${outId}_raw`));
      if (!rawFile) throw new Error('Download produced no file');

      const rawFullPath = join(tmpDir, rawFile);
      const trimmedPath = join(tmpDir, `${outId}_trimmed.${outExt}`);

      // Build ffmpeg trim args
      const ffArgs = ['-y', '-i', rawFullPath];
      if (start != null && start > 0) ffArgs.push('-ss', String(start));
      if (end != null && end > 0) ffArgs.push('-to', String(end));
      if (isAudio || format === 'mp3') {
        ffArgs.push('-vn', '-acodec', 'libmp3lame', '-b:a', '192k');
      } else {
        ffArgs.push('-c', 'copy');
      }
      ffArgs.push(trimmedPath);

      await execFileAsync(ffmpegPath, ffArgs, { timeout: 120_000 });

      const stat = await fs.stat(trimmedPath);
      res.writeHead(200, {
        'Content-Type': isAudio ? 'audio/mpeg' : `video/${format}`,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="trimmed_${outId}.${outExt}"`,
        'Access-Control-Allow-Origin': '*',
      });
      const stream = createReadStream(trimmedPath);
      stream.pipe(res);
      stream.on('end', () => cleanupFiles(rawFullPath, trimmedPath));
    } else {
      // Direct download (no trim)
      const outPath = join(tmpDir, `${outId}.%(ext)s`);
      const dlArgs = ['-f', fmtSelector, '--merge-output-format', isAudio ? 'mp3' : mergeFormat, '-o', outPath, '--no-playlist'];
      if (isAudio || format === 'mp3') dlArgs.push('--extract-audio', '--audio-format', 'mp3');
      dlArgs.push(url);

      await execFileAsync(ytdlpPath, dlArgs, { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 });

      const files = await fs.readdir(tmpDir);
      const outFile = files.find(f => f.startsWith(outId));
      if (!outFile) throw new Error('Download produced no file');

      const outFullPath = join(tmpDir, outFile);
      const finalExt = outFile.split('.').pop();
      const stat = await fs.stat(outFullPath);

      res.writeHead(200, {
        'Content-Type': isAudio ? 'audio/mpeg' : `video/${finalExt}`,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="download_${outId}.${finalExt}"`,
        'Access-Control-Allow-Origin': '*',
      });
      const stream = createReadStream(outFullPath);
      stream.pipe(res);
      stream.on('end', () => cleanupFiles(outFullPath));
    }
  } catch (err) {
    console.error('[YT-API] download error:', err.message);
    if (!res.headersSent) return json(res, 500, { error: err.message || 'Download failed' });
  }
}

/* ── Middleware factory ─────────────────────────────────────────── */

export function createYoutubeMiddleware() {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS' && req.url?.startsWith('/api/yt')) {
      cors(res); res.writeHead(204); return res.end();
    }
    if (req.method === 'POST' && req.url === '/api/yt/info') { cors(res); return handleInfo(req, res); }
    if (req.method === 'POST' && req.url === '/api/yt/playlist') { cors(res); return handlePlaylist(req, res); }
    if (req.method === 'POST' && req.url === '/api/yt/download') { cors(res); return handleDownload(req, res); }
    if (req.method === 'POST' && req.url === '/api/yt/subtitles') { cors(res); return handleSubtitles(req, res); }
    next();
  };
}
