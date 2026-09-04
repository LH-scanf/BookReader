import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { isDesktopApp } from "./platform";

const WebStatus = React.lazy(() => import("./WebStatus"));
const BackgroundSync = React.lazy(() => import("./sync/BackgroundSync"));
document.documentElement.dataset.platform = isDesktopApp() ? "desktop" : "web";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {__WEB_BUILD__ && !isDesktopApp() && <React.Suspense fallback={null}><BackgroundSync /><WebStatus /></React.Suspense>}
  </React.StrictMode>,
);
