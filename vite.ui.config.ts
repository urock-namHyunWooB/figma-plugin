import { defineConfig, Plugin } from "vite";
import fs from "fs";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";

// API 엔드포인트를 추가하는 Vite 플러그인
function saveFailingFixturePlugin(): Plugin {
  return {
    name: "save-failing-fixture",
    configureServer(server) {
      server.middlewares.use("/api/save-failing", async (req, res) => {
        // CORS 헤더 추가 (Figma 플러그인에서 호출 가능하도록)
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        // Preflight 요청 처리
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            const { fileName, nodeData, imageBase64 } = data;

            if (!fileName || !nodeData) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "fileName and nodeData required" }));
              return;
            }

            const failingDir = path.resolve(__dirname, "test/fixtures/failing");
            
            // 디렉토리가 없으면 생성
            if (!fs.existsSync(failingDir)) {
              fs.mkdirSync(failingDir, { recursive: true });
            }

            // JSON 파일 저장
            const jsonPath = path.join(failingDir, `${fileName}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(nodeData, null, 2));

            // 이미지가 있으면 저장
            if (imageBase64) {
              const imgPath = path.join(failingDir, `${fileName}.png`);
              const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
              fs.writeFileSync(imgPath, Buffer.from(base64Data, "base64"));
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, path: jsonPath }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [viteSingleFile(), tsconfigPaths(), saveFailingFixturePlugin()],
  root: path.resolve(__dirname, "src/frontend/ui"),

  // mode에 따라 DEV_BUILD 플래그 설정
  // - development: DEV 기능 활성화 (Save to Failing 버튼 등)
  // - production: DEV 기능 비활성화
  define: {
    __DEV_BUILD__: JSON.stringify(mode === "development"),
    ...(mode === "production"
      ? { "window.location.hostname": JSON.stringify("figma.com") }
      : {}),
  },

  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "src/backend"),
      "@frontend/ui": path.resolve(__dirname, "src/frontend/ui"),
      "@compiler": path.resolve(__dirname, "src/frontend/ui/domain/compiler"),
      "@fixtures": path.resolve(__dirname, "test/fixtures"),
    },
  },
  server: {
    cors: {
      origin: "*", // 모든 origin 허용 (Figma 플러그인 포함)
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    },
    fs: {
      allow: [
        path.resolve(__dirname, "src"),
        path.resolve(__dirname, "test"),
        path.resolve(__dirname, "node_modules"),
      ],
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
