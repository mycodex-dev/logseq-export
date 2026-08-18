import { defineConfig } from "vite";
import logseqPlugin from "vite-plugin-logseq";

export default defineConfig({
  plugins: [logseqPlugin()],
  base: "./",
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
