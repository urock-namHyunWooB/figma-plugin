import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { TestComp } from "./debug/TestComp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dev" element={<TestComp />} />
      </Routes>
    </MemoryRouter>
  </React.StrictMode>
);
