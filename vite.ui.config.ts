import { defineConfig } from "vite";

import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), viteSingleFile(), tsconfigPaths()],
  root: path.resolve(__dirname, "src/frontend/ui"),
  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "src/backend"),
      "@frontend/ui": path.resolve(__dirname, "src/frontend/ui"),
    },
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
