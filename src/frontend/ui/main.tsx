import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";

// twind 전역 초기화 (모든 라우트에서 Tailwind 클래스 지원)
import { defineConfig, install, observe } from "@twind/core";
import presetTailwind from "@twind/preset-tailwind";
import presetAutoprefix from "@twind/preset-autoprefix";

const twindConfig = defineConfig({
  presets: [presetAutoprefix(), presetTailwind()],
  hash: false,
  theme: { extend: {} },
  rules: [
    // Arbitrary properties: [property:value] 형식 지원
    [
      /^\[([a-zA-Z-]+):(.+)\]$/,
      ([, prop, value]: string[]) => ({
        [prop]: value.replace(/_/g, " ").replace(/\\_/g, "_"),
      }),
    ] as any,
  ],
  ignorelist: [/^css-/, /^hljs/, /^language-/, /^class_$/, /^function_$/],
});

// twind 전역 설치 및 export
export const twindTw = install(twindConfig);
observe(twindTw, document.documentElement);

// 개발 웹페이지: BrowserRouter (localhost/dev 접근 가능)
// Figma 플러그인: MemoryRouter (URL 없는 환경)
const isDev =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// 개발 모드에서만 TestComp 동적 로드 (프로덕션 빌드에서 제외)
const TestComp = isDev
  ? lazy(() =>
      import("./debug/TestComp").then((m) => ({ default: m.TestComp }))
    )
  : () => null;

// Test 페이지 (로컬 JSON 테스트용)
const TestPage = lazy(() => import("./pages/TestPage"));

const Router = isDev ? BrowserRouter : MemoryRouter;
const routerProps = isDev ? {} : { initialEntries: ["/"] };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router {...routerProps}>
      <Routes>
        <Route path="/" element={<App />} />
        {isDev && (
          <Route
            path="/dev"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <TestComp />
              </Suspense>
            }
          />
        )}

        <Route
          path="/test"
          element={
            <Suspense fallback={<div>Loading...</div>}>
              <TestPage />
            </Suspense>
          }
        />
      </Routes>
    </Router>
  </React.StrictMode>
);
