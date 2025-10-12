import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  // Root directory where index.html is located
  root: 'src',

  // Base URL for deployment
  base: '/',

  // Build configuration
  build: {
    // Output directory (relative to project root, not src)
    outDir: '../dist',

    // Empty output directory before building
    emptyOutDir: true,

    // Generate source maps for debugging
    sourcemap: false, // Set to true if you need debugging in production

    // Target modern browsers that support top-level await
    target: 'es2022',

    // Minification (use esbuild - faster than terser)
    minify: 'esbuild',

    // Chunk size warnings (default is 500kb, we increase for Cesium)
    chunkSizeWarningLimit: 2000,

    // Rollup options for advanced bundling
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: undefined, // Cesium loaded from CDN, no need to chunk

        // Asset file names with hash for cache busting
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];

          // Images and fonts
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico|webp)$/i.test(assetInfo.name)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }

          // CSS files
          if (ext === 'css') {
            return `assets/css/[name]-[hash][extname]`;
          }

          // Default
          return `assets/[name]-[hash][extname]`;
        },

        // Chunk file names
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },

    // Asset inline limit (smaller assets will be inlined as base64)
    assetsInlineLimit: 4096, // 4kb
  },

  // Server configuration for development
  server: {
    port: 3000,
    open: true,
    cors: true,
  },

  // Preview server configuration
  preview: {
    port: 4173,
    open: true,
  },

  // Plugins
  plugins: [
    // Copy static assets that shouldn't be processed
    viteStaticCopy({
      targets: [
        {
          src: 'config.json',
          dest: '.'
        },
        {
          src: 'env.js',
          dest: '.'
        },
        {
          src: 'favicon.ico',
          dest: '.'
        },
        {
          src: 'assets/**/*',
          dest: 'assets'
        }
      ]
    })
  ],

  // Optimizations
  optimizeDeps: {
    exclude: ['cesium'], // Cesium loaded from CDN
  },

  // Define global constants
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
