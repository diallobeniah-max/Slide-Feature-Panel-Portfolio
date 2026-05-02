import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createInstagramMiddleware } from './server/instagramApi.mjs';
import { createYoutubeMiddleware } from './server/youtube/youtubeRoutes.mjs';

function instagramCaptureApi() {
  return {
    name: 'instagram-capture-api',
    configureServer(server) {
      server.middlewares.use(createInstagramMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createInstagramMiddleware());
    },
  };
}

function youtubeDownloadApi() {
  return {
    name: 'youtube-download-api',
    configureServer(server) {
      server.middlewares.use(createYoutubeMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createYoutubeMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), instagramCaptureApi(), youtubeDownloadApi()],
});
