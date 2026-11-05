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
        // Vendor chunks. React gets the highest priority: with the older
        // manualChunks function the editor group also swallowed React (a
        // dependency of @tiptap/react), so every public page downloaded the
        // whole 544 KB editor bundle. Now the editor chunk is admin-only.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', priority: 40, test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|use-sync-external-store)[\\/]/ },
            { name: 'vendor-supabase', priority: 30, test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor-marked', priority: 30, test: /node_modules[\\/](marked|dompurify)[\\/]/ },
            { name: 'vendor-icons', priority: 30, test: /node_modules[\\/]lucide-react[\\/]/ },
            { name: 'vendor-editor', priority: 10, test: /node_modules[\\/](@tiptap|prosemirror-[^\\/]+|@floating-ui|orderedmap|rope-sequence|w3c-keyname|linkifyjs|markdown-it|fast-equals)[\\/]/ },
          ],
        },
      },
    },
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
