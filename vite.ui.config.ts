import { defineConfig } from "vite";

import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  plugins: [viteSingleFile(), tsconfigPaths()],
  root: path.resolve(__dirname, "src/frontend/ui"),

  // 프로덕션 빌드에서만 isDev를 false로 강제 (debug 코드 트리쉐이킹)
  define:
    mode === "production"
      ? { "window.location.hostname": JSON.stringify("figma.com") }
      : {},

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
    sourcemap: false, // 프로덕션에서 소스맵 비활성화
    minify: "esbuild", // 빠른 minify
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
      // debug 폴더를 번들에서 제외 (external로 처리)
      external: (id) => id.includes("/debug/"),
    },
  },
}));
