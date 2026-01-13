import { defineConfig } from "vitest/config";
import path from "path";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  // 테스트 환경에서 Prettier 스킵을 위한 환경 변수
  define: {
    "import.meta.env.VITEST": "true",
  },
  // Vite 캐시 디렉토리 (vitest 캐시도 여기에 저장됨)
  cacheDir: "node_modules/.vite",
  // 빌드 최적화
  esbuild: {
    target: "esnext",
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30000,
    // 브라우저 전용 테스트만 실행
    include: ["test/**/*.browser-only.test.ts", "test/**/browser-only.test.ts"],
    // 병렬 실행
    fileParallelism: true,
    // test.concurrent의 동시 실행 수 제한
    maxConcurrency: 10,
    // vmThreads: 더 가벼운 격리로 빠른 실행
    pool: "vmThreads",
    poolOptions: {
      vmThreads: {
        minThreads: 2,
        maxThreads: 4,
      },
    },
    // 브라우저 모드 (Playwright)
    browser: {
      enabled: true,
      provider: playwright({
        launch: {
          args: [
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--no-first-run",
          ],
        },
      }),
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
