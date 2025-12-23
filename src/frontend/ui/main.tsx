import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { TestComp } from "./debug/TestComp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dev" element={<TestComp />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
