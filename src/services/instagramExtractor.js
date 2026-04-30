const INSTAGRAM_PATTERN = /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv)\/[a-zA-Z0-9_-]+\/?/i;
const DIRECT_MEDIA_PATTERN = /^https?:\/\/.*\.(png|jpe?g|webp|gif|mp4|mov)(\?.*)?$/i;

export const InstagramExtractor = {
  validateUrl(url) {
    return INSTAGRAM_PATTERN.test(url.trim()) || DIRECT_MEDIA_PATTERN.test(url.trim());
  },

  async fetchMedia(url) {
    const trimmedUrl = url.trim();

    if (!this.validateUrl(trimmedUrl)) {
      throw new Error('Paste an Instagram post/reel link or a direct image/video URL.');
    }

    if (DIRECT_MEDIA_PATTERN.test(trimmedUrl)) {
      const extension = trimmedUrl.match(/\.(png|jpe?g|webp|gif|mp4|mov)/i)?.[1]?.toLowerCase() || 'jpg';
      const isVideo = ['mp4', 'mov'].includes(extension);
      return {
        sourceUrl: trimmedUrl,
        postId: 'direct-media',
        needsPicker: false,
        items: [
          {
            id: crypto.randomUUID(),
            type: isVideo ? 'video' : 'image',
            thumbnail: trimmedUrl,
            url: trimmedUrl,
            suggestedFilename: `direct-media.${extension}`,
          },
        ],
      };
    }

    const parts = trimmedUrl.split('/').filter(Boolean);
    const postId = parts.at(-1);

    return {
      sourceUrl: trimmedUrl,
      postId,
      needsPicker: true,
      items: [],
      message:
        'Instagram blocks browser-only scraping. Pick the saved post images/videos from your computer and this tool will preview and download the real files.',
    };
  },
};

export function createPickedMediaItems(files) {
  return Array.from(files).map((file, index) => {
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const extension = file.name.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg');

    return {
      id: `${file.name}-${file.lastModified}-${index}`,
      type,
      thumbnail: URL.createObjectURL(file),
      url: URL.createObjectURL(file),
      file,
      suggestedFilename: file.name || `instagram-media-${String(index + 1).padStart(2, '0')}.${extension}`,
      size: file.size,
    };
  });
}
