import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import TodayPage from "./components/TodayPage";
import TrendsPage from "./components/TrendsPage";
import BindingsPage from "./components/BindingsPage";
import FloatingWidget from "./components/FloatingWidget";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<TodayPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="bindings" element={<BindingsPage />} />
        </Route>
        <Route path="/widget" element={<FloatingWidget />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
