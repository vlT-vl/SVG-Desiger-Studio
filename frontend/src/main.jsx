import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { prefs } from "./lib/prefs.js";
import { applyTheme, restoreThemePreference } from "./lib/theme.js";
import { UI_KEY } from "./lib/uiSettings.js";
import "./index.css";

async function restorePreferences() {
  let timeout;
  try {
    const stored = await Promise.race([
      prefs.get().catch(() => null),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(null), 400);
      }),
    ]);
    if (!stored) return;
    if (stored["nex-theme"]) restoreThemePreference(stored["nex-theme"]);
    if (stored[UI_KEY]) {
      try {
        localStorage.setItem(UI_KEY, stored[UI_KEY]);
      } catch {}
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function start() {
  await restorePreferences();
  applyTheme();
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

start();
