import { defineConfig } from "vite";

import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [viteSingleFile(), tsconfigPaths()],
  root: path.resolve(__dirname, "src/frontend/ui"),

  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "src/backend"),
      "@frontend/ui": path.resolve(__dirname, "src/frontend/ui"),
      "@compiler": path.resolve(__dirname, "src/frontend/ui/domain/compiler"),
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
