import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);

export const execFileAsync = promisify(execFile);

export function parseBody(req) {
  if (req.body != null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    try {
      return Promise.resolve(JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body)));
    } catch {
      return Promise.reject(new Error('Invalid JSON'));
    }
  }
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
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
}

async function findPackagedYtDlp() {
  try {
    const packagePath = require.resolve('yt-dlp-exec/package.json');
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const candidate = join(dirname(packagePath), 'bin', binaryName);
    await fs.access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

async function findStandaloneYtDlp() {
  const source = join(process.cwd(), 'vendor', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  try {
    await fs.access(source);
  } catch {
    return null;
  }

  if (process.platform !== 'linux') return source;
  const executable = join(tmpdir(), 'flow-yt-dlp');
  try {
    await fs.access(executable);
  } catch {
    await fs.copyFile(source, executable);
    await fs.chmod(executable, 0o755);
  }
  return executable;
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

  if (name === 'yt-dlp') {
    const standalone = await findStandaloneYtDlp();
    if (standalone) return standalone;
    const packaged = await findPackagedYtDlp();
    if (packaged) return packaged;
  }

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

export function buildFormatSelector(quality, format, platform = 'youtube') {
  if (quality === 'audio') return 'bestaudio';
  const heightMap = { '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 };
  const h = heightMap[String(quality || '').replace(/p$/i, '')];
  if (platform === 'facebook' || platform === 'instagram') {
    return h
      ? `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/bv*[height<=${h}]+ba/bv*[height<=${h}]/b[height<=${h}][ext=mp4]/b[height<=${h}]/b[ext=mp4]/b`
      : 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/bv*/b[height>=720][ext=mp4]/b[ext=mp4]/b';
  }
  if (h) {
    return `bestvideo[height<=${h}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]/best`;
  }
  return 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
}

export function buildFallbackFormatSelector(quality, platform = 'youtube') {
  if (quality === 'audio') return 'bestaudio/best';
  const heightMap = { '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 };
  const h = heightMap[String(quality || '').replace(/p$/i, '')];
  if (platform === 'facebook' || platform === 'instagram') {
    return h ? `bv*[height<=${h}]+ba/bv*[height<=${h}]/b[height<=${h}]/bv*+ba/bv*/b[ext=mp4]/b` : 'bv*+ba/bv*/b[ext=mp4]/b';
  }
  return h ? `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best` : 'bestvideo+bestaudio/best';
}

export function buildProgressiveFormatSelector(quality) {
  const heightMap = { '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 };
  const h = heightMap[String(quality || '').replace(/p$/i, '')];
  return h
    ? `best[height<=${h}][ext=mp4]/best[height<=${h}]/best[ext=mp4]/best`
    : 'best[ext=mp4]/best';
}

export function buildNetworkArgs() {
  return [
    '--force-ipv4',
    '--retries', '5',
    '--fragment-retries', '5',
    '--socket-timeout', '30',
    '--geo-bypass',
    '--no-check-certificates',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language: en-US,en;q=0.9',
    '--no-warnings',
  ];
}

export function getYtDlpErrorMessage(error, platform = 'video') {
  const raw = `${error?.stderr || ''}\n${error?.message || ''}`.trim();
  if (/login|log in|cookies|private|not available/i.test(raw) && platform === 'facebook') {
    return 'Facebook could not access this video. Make sure it is public and opens without a Facebook login.';
  }
  if (/requested format is not available|no video formats|no formats/i.test(raw)) {
    return 'That exact quality was not available from this link. Try Highest Available again or choose another quality.';
  }
  const line = raw.split(/\r?\n/).reverse().find((entry) => /ERROR:/i.test(entry));
  const message = (line || error?.message || 'Download failed')
    .replace(/^.*?ERROR:\s*/i, '')
    .replace(/\s*\[generic\].*$/i, '')
    .trim();
  if (/^Command failed:/i.test(message)) return 'The video download command failed before a usable stream was returned. Please try again.';
  return message;
}

export function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export async function cleanupFiles(...paths) {
  for (const p of paths) {
    try { await fs.unlink(p); } catch { /* ignore */ }
  }
}
