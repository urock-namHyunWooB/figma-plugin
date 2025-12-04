import { defineConfig } from "vitest/config";
import path from "path";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom", // 기본 브라우저 환경 시뮬레이션
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30000,
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // 브라우저 모드 설정 (Playwright 사용)
    // button.test.tsx는 브라우저 모드에서 실행됨
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        {
          browser: "chromium",
          isolate: false,
        },
      ],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/frontend/wasm-engine/build/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@backend": path.resolve(__dirname, "./src/backend"),
      "@backend/*": path.resolve(__dirname, "./src/backend/*"),
      "@frontend/ui": path.resolve(__dirname, "./src/frontend/ui"),
      "@frontend/ui/*": path.resolve(__dirname, "./src/frontend/ui/*"),
      "@compiler": path.resolve(__dirname, "./src/frontend/ui/domain/compiler"),
      "@compiler/*": path.resolve(
        __dirname,
        "./src/frontend/ui/domain/compiler/*"
      ),
    },
  },
});
