import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".js"],
  },

  build: {
    target: "es2017",
    lib: {
      entry: path.resolve(__dirname, "src/plugin/code.ts"),
      name: "code",
      fileName: "code",
      formats: ["iife"],
    },
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: "code.js",
      },
    },
  },
});
