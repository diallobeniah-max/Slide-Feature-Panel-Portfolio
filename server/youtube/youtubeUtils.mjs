import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export const execFileAsync = promisify(execFile);

export function parseBody(req) {
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

export function json(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function findBinary(name) {
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

export async function ensureBinaries() {
  if (!ytdlpPath) ytdlpPath = await findBinary('yt-dlp');
  if (!ffmpegPath) ffmpegPath = await findBinary('ffmpeg');
  return { ytdlpPath, ffmpegPath };
}

export function buildFormatSelector(quality, format) {
  if (quality === 'audio') return 'bestaudio';
  const heightMap = { '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 };
  const h = heightMap[quality];
  if (h) {
    return `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
  }
  return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
}

export async function cleanupFiles(...paths) {
  for (const p of paths) {
    try { await fs.unlink(p); } catch { /* ignore */ }
  }
}
