import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/common/ToastProvider";
import { CutoutSettingsProvider } from "./contexts/CutoutSettingsContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <CutoutSettingsProvider>
          <App />
        </CutoutSettingsProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
