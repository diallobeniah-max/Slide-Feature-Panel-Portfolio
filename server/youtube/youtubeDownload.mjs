import { parseBody, json, ensureBinaries, execFileAsync, buildFormatSelector, cleanupFiles } from './youtubeUtils.mjs';
import { isValidYoutubeUrl } from './youtubeValidation.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';

export async function handleDownload(req, res) {
  try {
    const { url, start, end, format = 'mp4', quality = 'best' } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isValidYoutubeUrl(url)) return json(res, 400, { error: 'Invalid YouTube URL.' });

    if (start != null && start < 0) return json(res, 400, { error: 'Start time cannot be negative.' });
    if (end != null && start != null && end <= start) return json(res, 400, { error: 'End time must be after start time.' });

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();

    const needsTrim = (start != null && start > 0) || (end != null && end > 0);
    const tmpDir = join(tmpdir(), 'yt-panel-downloads');
    await fs.mkdir(tmpDir, { recursive: true });
    const outId = randomUUID();
    const isAudio = quality === 'audio';
    const fmtSelector = buildFormatSelector(quality, format);
    const mergeFormat = isAudio ? 'mp4' : (format === 'mp3' ? 'mp4' : format);
    const outExt = isAudio || format === 'mp3' ? 'mp3' : format;

    if (needsTrim) {
      const rawPath = join(tmpDir, `${outId}_raw.%(ext)s`);
      const dlArgs = ['-f', fmtSelector, '--merge-output-format', mergeFormat, '-o', rawPath, '--no-playlist', url];
      await execFileAsync(ytdlpPath, dlArgs, { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 });

      const files = await fs.readdir(tmpDir);
      const rawFile = files.find(f => f.startsWith(`${outId}_raw`));
      if (!rawFile) throw new Error('Download produced no file');

      const rawFullPath = join(tmpDir, rawFile);
      const trimmedPath = join(tmpDir, `${outId}_trimmed.${outExt}`);

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

export async function handleSubtitles(req, res) {
  try {
    const { url, lang = 'en', format: subFmt = 'srt' } = await parseBody(req);
    if (!url) return json(res, 400, { error: 'Missing url' });
    if (!isValidYoutubeUrl(url)) return json(res, 400, { error: 'Invalid YouTube URL.' });

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
