import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { TestComp } from "./debug/TestComp";
import "./index.css";

// 개발 웹페이지: BrowserRouter (localhost/dev 접근 가능)
// Figma 플러그인: MemoryRouter (URL 없는 환경)
const isDev =
  typeof window !== "undefined" && window.location.hostname === "localhost";

const Router = isDev ? BrowserRouter : MemoryRouter;
const routerProps = isDev ? {} : { initialEntries: ["/"] };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router {...routerProps}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dev" element={<TestComp />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
