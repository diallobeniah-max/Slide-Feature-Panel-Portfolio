export const QUALITY_PRESETS = [
  { id: 'archive', name: 'Archive Master', quality: 100, videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 320_000 },
  { id: 'studio', name: 'Studio Balanced', quality: 92, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 256_000 },
  { id: 'stream', name: 'Fast Stream', quality: 76, videoBitsPerSecond: 5_500_000, audioBitsPerSecond: 192_000 },
  { id: 'social', name: 'Social Light', quality: 58, videoBitsPerSecond: 2_800_000, audioBitsPerSecond: 128_000 },
];

const VIDEO_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
];

const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
];

export function getSupportedMimeType(kind = 'video') {
  const candidates = kind === 'audio' ? AUDIO_MIME_TYPES : VIDEO_MIME_TYPES;
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

export function extensionForMimeType(mimeType, fallback = 'webm') {
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  return fallback;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

export function formatDuration(seconds = 0) {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export function createAssetFromFile(file) {
  const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
  return {
    id: crypto.randomUUID(),
    file,
    type,
    name: file.name,
    size: file.size,
    objectUrl: URL.createObjectURL(file),
    trimStart: 0,
    trimEnd: null,
    optimizedUrl: null,
    optimizedBlob: null,
    optimizedMimeType: '',
    optimizedName: '',
    status: 'queued',
    progress: 0,
    duration: 0,
  };
}

export function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1200);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function readMetadata(asset) {
  return new Promise((resolve) => {
    if (asset.type === 'image') return resolve({ duration: 0, width: 0, height: 0 });

    const element = document.createElement(asset.type === 'audio' ? 'audio' : 'video');
    element.preload = 'metadata';
    element.src = asset.objectUrl;
    element.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(element.duration) ? element.duration : 0,
        width: element.videoWidth || 0,
        height: element.videoHeight || 0,
      });
    };
    element.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
  });
}

async function recordMediaRange(asset, options, onProgress) {
  const outputKind = options.outputMode === 'audio' || asset.type === 'audio' ? 'audio' : 'video';
  const mimeType = getSupportedMimeType(outputKind);
  const source = document.createElement(asset.type === 'audio' ? 'audio' : 'video');
  source.src = asset.objectUrl;
  source.muted = outputKind === 'audio' ? false : true;
  source.playsInline = true;
  source.crossOrigin = 'anonymous';
  source.preload = 'auto';

  await new Promise((resolve, reject) => {
    source.onloadedmetadata = resolve;
    source.onerror = () => reject(new Error('Could not read media metadata.'));
  });

  const duration = Number.isFinite(source.duration) ? source.duration : 0;
  const start = Math.max(0, Math.min(asset.trimStart || 0, duration));
  const end = Math.max(start + 0.1, Math.min(asset.trimEnd || duration, duration));
  const captureLength = Math.max(0.1, end - start);
  const highQuality = options.quality >= 90;
  const preset = QUALITY_PRESETS.find((item) => item.quality === options.quality) || QUALITY_PRESETS[1];

  source.currentTime = start;
  await new Promise((resolve) => {
    source.onseeked = resolve;
  });

  const stream = outputKind === 'audio'
    ? source.captureStream().getAudioTracks().length
      ? new MediaStream(source.captureStream().getAudioTracks())
      : source.captureStream()
    : source.captureStream();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: outputKind === 'video' ? (highQuality ? Math.max(preset.videoBitsPerSecond, 12_000_000) : preset.videoBitsPerSecond) : undefined,
    audioBitsPerSecond: highQuality ? Math.max(preset.audioBitsPerSecond, 256_000) : preset.audioBitsPerSecond,
  });

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const done = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start(200);
  await source.play();

  const startedAt = performance.now();
  while (source.currentTime < end && !source.ended) {
    const elapsed = (performance.now() - startedAt) / 1000;
    onProgress(Math.min(96, Math.round((elapsed / captureLength) * 100)));
    await wait(80);
  }

  source.pause();
  if (recorder.state !== 'inactive') recorder.stop();
  await done;

  return {
    blob: new Blob(chunks, { type: mimeType || (outputKind === 'audio' ? 'audio/webm' : 'video/webm') }),
    mimeType,
    duration,
  };
}

async function optimizeImage(asset, options, onProgress) {
  onProgress(20);
  await wait(90);

  const bitmap = await createImageBitmap(asset.file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);
  onProgress(65);
  await wait(120);

  const quality = options.quality >= 90 ? 1 : Math.max(0.5, options.quality / 100);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  onProgress(100);
  return { blob, mimeType: 'image/webp', duration: 0 };
}

export async function processAsset(asset, options, onProgress) {
  const metadata = await readMetadata(asset);
  onProgress(8);
  await wait(120);

  const result = asset.type === 'image'
    ? await optimizeImage(asset, options, onProgress)
    : await recordMediaRange({ ...asset, duration: metadata.duration }, options, onProgress);

  const extension = extensionForMimeType(result.mimeType, asset.type === 'image' ? 'webp' : 'webm');
  const baseName = asset.name.replace(/\.[^.]+$/, '');
  return {
    ...result,
    duration: metadata.duration,
    optimizedName: `${baseName}.optimized.${extension}`,
  };
}
