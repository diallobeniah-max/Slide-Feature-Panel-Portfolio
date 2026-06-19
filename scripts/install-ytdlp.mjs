import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL && process.platform === 'linux') {
  const version = '2026.03.17';
  const url = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp_linux`;
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const target = join(root, 'vendor', 'yt-dlp');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download yt-dlp ${version}: ${response.status}`);

  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  await fs.chmod(target, 0o755);
  console.log(`Installed standalone yt-dlp ${version} for Vercel.`);
}
