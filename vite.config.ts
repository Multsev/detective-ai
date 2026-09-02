import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@xyflow')) return 'graph-vendor';
          if (id.includes('node_modules/react') || id.includes('node_modules/lucide-react')) return 'ui-vendor';
          return undefined;
        },
      },
    },
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ['react', 'react-dom', 'lucide-react'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
