import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createInstagramMiddleware } from './server/instagramApi.mjs';

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

export default defineConfig({
  plugins: [react(), tailwindcss(), instagramCaptureApi()],
});
