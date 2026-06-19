import { parseBody, json, ensureBinaries, execFileAsync, buildFormatSelector, buildProgressiveFormatSelector, buildNetworkArgs, cleanupFiles, getYtDlpErrorMessage, isServerlessRuntime } from './youtubeUtils.mjs';
import { getVideoPlatform, isSupportedVideoUrl, normalizeVideoUrl } from './youtubeValidation.mjs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

function sanitizeFileBase(value) {
  return String(value || 'video')
    .replace(/\.[a-zA-Z0-9]{1,5}$/, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'video';
}

async function uniqueTargetPath(folderPath, baseName, ext) {
  await fs.mkdir(folderPath, { recursive: true });
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  let candidate = join(folderPath, `${baseName}${cleanExt}`);
  let index = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = join(folderPath, `${baseName} (${index})${cleanExt}`);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function maybeSaveToFolder(res, sourcePath, { folderPath, fileName, fallbackName, contentType }) {
  if (!folderPath) return false;
  const resolvedFolder = resolve(String(folderPath));
  const finalExt = extname(sourcePath) || extname(fallbackName) || '.mp4';
  const baseName = sanitizeFileBase(fileName || fallbackName || basename(sourcePath, finalExt));
  const targetPath = await uniqueTargetPath(resolvedFolder, baseName, finalExt);
  await fs.copyFile(sourcePath, targetPath);
  const stat = await fs.stat(targetPath);
  json(res, 200, {
    saved: true,
    path: targetPath,
    filename: basename(targetPath),
    size: stat.size,
    contentType,
  });
  return true;
}

function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function streamServerlessDownload(res, ytdlpPath, { url, quality, format, fileName, platform }) {
  const selector = buildProgressiveFormatSelector(quality);
  const { stdout } = await execFileAsync(ytdlpPath, [
    ...buildNetworkArgs(),
    '--dump-single-json', '--no-playlist', '--no-download',
    '-f', selector,
    url,
  ], { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });
  const meta = JSON.parse(stdout);
  const selected = meta.requested_downloads?.[0] || meta;
  const mediaUrl = selected.url || meta.url;
  if (!mediaUrl) throw new Error('No downloadable video stream was found.');

  const remote = await fetch(mediaUrl, {
    headers: selected.http_headers || meta.http_headers || {},
    redirect: 'follow',
  });
  if (!remote.ok || !remote.body) throw new Error(`Video server returned ${remote.status}.`);

  const ext = selected.ext || meta.ext || (quality === 'audio' ? 'm4a' : 'mp4');
  const finalName = `${sanitizeFileBase(fileName || meta.title || 'video')}.${ext}`;
  const headers = {
    'Content-Type': remote.headers.get('content-type') || (quality === 'audio' ? 'audio/mp4' : `video/${ext}`),
    'Content-Disposition': `attachment; filename="${finalName}"`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
  };
  const contentLength = remote.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;
  res.writeHead(200, headers);

  await new Promise((resolve, reject) => {
    const stream = Readable.fromWeb(remote.body);
    stream.once('error', reject);
    res.once('finish', resolve);
    res.once('close', resolve);
    stream.pipe(res);
  });
}

function sanitizeDownloadId(value) {
  const clean = String(value || '').trim();
  return /^[a-zA-Z0-9-]{8,80}$/.test(clean) ? clean : randomUUID();
}

function findCompletedOutput(files, prefix) {
  return files.find((file) =>
    file.startsWith(prefix)
    && !file.endsWith('.part')
    && !file.endsWith('.ytdl')
    && !file.endsWith('.temp'),
  );
}

export async function handleDownload(req, res) {
  let platform = 'video';
  const processController = new AbortController();
  let responseFinished = false;
  const abortWork = () => {
    if (!responseFinished) processController.abort();
  };
  req.once('aborted', abortWork);
  res.once('close', abortWork);
  res.once('finish', () => { responseFinished = true; });
  try {
    const { url, start, end, format = 'mp4', quality = 'best', folderPath = '', fileName = '', downloadId = '' } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isSupportedVideoUrl(url)) return json(res, 400, { error: 'Invalid video URL. Paste a YouTube, Facebook, or Instagram link.' });

    if (start != null && start < 0) return json(res, 400, { error: 'Start time cannot be negative.' });
    if (end != null && start != null && end <= start) return json(res, 400, { error: 'End time must be after start time.' });

    const normalizedUrl = normalizeVideoUrl(url);
    platform = getVideoPlatform(normalizedUrl) || 'video';
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();

    const needsTrim = (start != null && start > 0) || (end != null && end > 0);
    const tmpDir = join(tmpdir(), 'yt-panel-downloads');
    await fs.mkdir(tmpDir, { recursive: true });
    const outId = sanitizeDownloadId(downloadId);
    const isAudio = quality === 'audio';
    const fmtSelector = buildFormatSelector(quality, format, platform);
    const mergeFormat = isAudio ? 'mp4' : (format === 'mp3' ? 'mp4' : format);
    const outExt = isAudio || format === 'mp3' ? 'mp3' : format;

    if (isServerlessRuntime()) {
      if (needsTrim || isAudio || format === 'mp3') {
        return json(res, 400, { error: 'The website can download complete videos. Trimming and MP3 conversion are available in the desktop app.' });
      }
      return streamServerlessDownload(res, ytdlpPath, {
        url: normalizedUrl, quality, format, fileName, platform,
      });
    }

    const localFolderPath = folderPath && isLoopbackRequest(req) ? folderPath : '';

    if (needsTrim) {
      const rawPath = join(tmpDir, `${outId}_raw.%(ext)s`);
      const dlArgs = [...buildNetworkArgs(), '-f', fmtSelector, '--merge-output-format', mergeFormat, '-o', rawPath, '--no-playlist', normalizedUrl];
      await execFileAsync(ytdlpPath, dlArgs, { timeout: 300_000, maxBuffer: 50 * 1024 * 1024, signal: processController.signal });

      const files = await fs.readdir(tmpDir);
      const rawFile = findCompletedOutput(files, `${outId}_raw`);
      if (!rawFile) throw new Error('Download produced no file');

      const rawFullPath = join(tmpDir, rawFile);
      const trimmedPath = join(tmpDir, `${outId}_trimmed.${outExt}`);

      const ffArgs = ['-y', '-i', rawFullPath];
      if (start != null && start > 0) ffArgs.push('-ss', String(start));
      if (end != null && end > 0) ffArgs.push('-to', String(end));
      if (isAudio || format === 'mp3') {
        ffArgs.push('-vn', '-acodec', 'libmp3lame', '-b:a', '192k');
      } else {
        ffArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart');
      }
      ffArgs.push(trimmedPath);

      await execFileAsync(ffmpegPath, ffArgs, { timeout: 120_000, signal: processController.signal });

      const stat = await fs.stat(trimmedPath);
      const saved = await maybeSaveToFolder(res, trimmedPath, {
        folderPath: localFolderPath,
        fileName,
        fallbackName: `trimmed_${outId}.${outExt}`,
        contentType: isAudio ? 'audio/mpeg' : `video/${format}`,
      });
      if (saved) {
        await cleanupFiles(rawFullPath, trimmedPath);
        return;
      }

      res.writeHead(200, {
        'Content-Type': isAudio ? 'audio/mpeg' : `video/${format}`,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${sanitizeFileBase(fileName || `trimmed_${outId}`)}.${outExt}"`,
        'Access-Control-Allow-Origin': '*',
      });
      const stream = createReadStream(trimmedPath);
      stream.pipe(res);
      stream.on('end', () => cleanupFiles(rawFullPath, trimmedPath));
    } else {
      const outPath = join(tmpDir, `${outId}.%(ext)s`);
      const dlArgs = [...buildNetworkArgs(), '-f', fmtSelector, '--merge-output-format', isAudio ? 'mp3' : mergeFormat, '-o', outPath, '--no-playlist'];
      if (isAudio || format === 'mp3') dlArgs.push('--extract-audio', '--audio-format', 'mp3');
      dlArgs.push(normalizedUrl);

      await execFileAsync(ytdlpPath, dlArgs, { timeout: 300_000, maxBuffer: 50 * 1024 * 1024, signal: processController.signal });

      const files = await fs.readdir(tmpDir);
      const outFile = findCompletedOutput(files, outId);
      if (!outFile) throw new Error('Download produced no file');

      const outFullPath = join(tmpDir, outFile);
      const finalExt = outFile.split('.').pop();
      const stat = await fs.stat(outFullPath);
      const saved = await maybeSaveToFolder(res, outFullPath, {
        folderPath: localFolderPath,
        fileName,
        fallbackName: `download_${outId}.${finalExt}`,
        contentType: isAudio ? 'audio/mpeg' : `video/${finalExt}`,
      });
      if (saved) {
        await cleanupFiles(outFullPath);
        return;
      }

      res.writeHead(200, {
        'Content-Type': isAudio ? 'audio/mpeg' : `video/${finalExt}`,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${sanitizeFileBase(fileName || `download_${outId}`)}.${finalExt}"`,
        'Access-Control-Allow-Origin': '*',
      });
      const stream = createReadStream(outFullPath);
      stream.pipe(res);
      stream.on('end', () => cleanupFiles(outFullPath));
    }
  } catch (err) {
    if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
      console.log('[YT-API] download paused:', err.message);
      return;
    }
    console.error('[YT-API] download error:', err.message);
    if (!res.headersSent) return json(res, 500, { error: getYtDlpErrorMessage(err, platform) });
  } finally {
    req.off('aborted', abortWork);
    res.off('close', abortWork);
  }
}

export async function handleSubtitles(req, res) {
  try {
    const { url, lang = 'en', format: subFmt = 'srt' } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isSupportedVideoUrl(url)) return json(res, 400, { error: 'Invalid video URL. Paste a YouTube, Facebook, or Instagram link.' });

    const { ytdlpPath } = await ensureBinaries();

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
