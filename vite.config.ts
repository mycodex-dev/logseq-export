import { defineConfig } from "vite";
import logseqPlugin from "vite-plugin-logseq";

export default defineConfig({
  plugins: [logseqPlugin()],
  base: "./",
  build: {
    target: "esnext",
    minify: "esbuild",
    // Keep relative chunk paths working for unpacked Logseq plugins.
    modulePreload: false,
    rollupOptions: {
      output: {
        // Stable, relative chunk names under dist/assets
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
