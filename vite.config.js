import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  publicDir: false,
  server: {
    host: true,
    port: 5173,
    open: 'influencer.html'
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
