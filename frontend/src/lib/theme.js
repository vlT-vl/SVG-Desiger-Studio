import { appearance } from "./nex.js";
import { prefs } from "./prefs.js";

const STORAGE_KEY = "nex-theme";
const THEMES = new Set(["system", "light", "dark"]);

function normalizeTheme(value) {
  return value === "dark" || value === "light" ? value : null;
}

export function getBrowserSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getSystemTheme() {
  return getBrowserSystemTheme();
}

export async function getNexSystemTheme() {
  try {
    const info = await appearance.info();
    return normalizeTheme(info?.theme) ?? getBrowserSystemTheme();
  } catch {
    return getBrowserSystemTheme();
  }
}

export function getThemePreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.has(saved)) return saved;
  } catch {}
  return "system";
}

export function resolveTheme(preference = getThemePreference()) {
  return preference === "dark" || preference === "light" ? preference : getBrowserSystemTheme();
}

export function applyTheme(preference = getThemePreference(), systemTheme = getBrowserSystemTheme()) {
  const normalized = THEMES.has(preference) ? preference : "system";
  const resolved = normalized === "system" ? (normalizeTheme(systemTheme) ?? getBrowserSystemTheme()) : normalized;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = normalized;
  root.style.colorScheme = resolved;
  return { preference: normalized, theme: resolved };
}

export function restoreThemePreference(preference) {
  const normalized = THEMES.has(preference) ? preference : "system";
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {}
  return applyTheme(normalized);
}

export function setThemePreference(preference) {
  const state = restoreThemePreference(preference);
  prefs.set(STORAGE_KEY, state.preference).catch(() => {});
  return state;
}

export async function syncThemeWithNexAppearance(preference = getThemePreference()) {
  const normalized = THEMES.has(preference) ? preference : "system";
  if (normalized !== "system") return applyTheme(normalized);
  return applyTheme("system", await getNexSystemTheme());
}

export function toggleTheme(current = getThemePreference()) {
  const resolved = resolveTheme(current);
  return setThemePreference(resolved === "dark" ? "light" : "dark");
}

export function watchSystemTheme(callback) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => callback(getBrowserSystemTheme());
  if (query.addEventListener) {
    query.addEventListener("change", listener);
  } else {
    query.addListener?.(listener);
  }
  return () => {
    if (query.removeEventListener) {
      query.removeEventListener("change", listener);
    } else {
      query.removeListener?.(listener);
    }
  };
}
