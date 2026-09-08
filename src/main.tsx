import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { isDesktopApp } from "./platform";

// Keep the entire Web/PWA sync and Microsoft auth dependency tree out of the
// Tauri build. __WEB_BUILD__ is replaced by Vite at compile time, unlike a
// runtime platform check which would still emit the lazy-imported chunks.
const WebRuntime = __WEB_BUILD__ ? React.lazy(() => import("./web/WebRuntime")) : null;
document.documentElement.dataset.platform = isDesktopApp() ? "desktop" : "web";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {WebRuntime && <React.Suspense fallback={null}><WebRuntime /></React.Suspense>}
  </React.StrictMode>,
);
