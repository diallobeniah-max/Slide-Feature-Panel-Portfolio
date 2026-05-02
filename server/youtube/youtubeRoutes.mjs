import { handleInfo, handlePlaylist } from './youtubeInfo.mjs';
import { handleDownload, handleSubtitles } from './youtubeDownload.mjs';
import { cors } from './youtubeUtils.mjs';

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
