/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Vercel builds turn off the SSE stream client (see /api/realtime-stream).
    'import.meta.env.VITE_REALTIME_SSE': JSON.stringify(process.env.VERCEL ? 'off' : 'on'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('@floating-ui')) {
              return 'vendor-editor';
            }
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react/')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('marked') || id.includes('dompurify')) {
              return 'vendor-marked';
            }
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
