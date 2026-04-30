import JSZip from 'jszip';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadUrl(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadZip(items, filename) {
  const zip = new JSZip();

  for (const item of items) {
    const fileName = item.suggestedFilename || `${item.id}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
    if (item.file) {
      zip.file(fileName, item.file);
      continue;
    }

    const response = await fetch(item.url);
    const blob = await response.blob();
    zip.file(fileName, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, filename);
}

export function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}
