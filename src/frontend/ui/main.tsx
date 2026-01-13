import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";

// 개발 웹페이지: BrowserRouter (localhost/dev 접근 가능)
// Figma 플러그인: MemoryRouter (URL 없는 환경)
const isDev =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// 개발 모드에서만 TestComp 동적 로드 (프로덕션 빌드에서 제외)
const TestComp = isDev
  ? lazy(() => import("./debug/TestComp").then((m) => ({ default: m.TestComp })))
  : () => null;

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
      </Routes>
    </Router>
  </React.StrictMode>
);
