import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname);

  return {
  resolve: {
    extensions: [".ts", ".js"],
  },

  define: {
    GITHUB_TOKEN: JSON.stringify(env.VITE_GITHUB_TOKEN || ""),
  },

  build: {
    target: "es2017",
    lib: {
      entry: path.resolve(__dirname, "src/backend/code.ts"),
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
};
});
