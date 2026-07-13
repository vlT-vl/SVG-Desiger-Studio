import { useState } from "react";
import {
  FiFolder,
  FiTrash2,
  FiZap,
  FiAlignLeft,
  FiInfo,
  FiSettings,
  FiMonitor,
  FiSun,
  FiMoon,
} from "react-icons/fi";
import { TABS } from "./OutputPanel.jsx";
import { ColorPicker } from "./ColorPicker.jsx";
import { optimize } from "../lib/svg/optimize.js";
import { prettify } from "../lib/svg/prettify.js";
import { getSvgDimensions } from "../lib/svg/toPng.js";
import { getThemePreference, setThemePreference, syncThemeWithNexAppearance } from "../lib/theme.js";
import * as nex from "../lib/nex.js";
import "../styles/Toolbar.css";

const THEME_CYCLE = { system: "dark", dark: "light", light: "system" };
const THEME_ICON  = { system: FiMonitor, dark: FiMoon, light: FiSun };
const THEME_LABEL = { system: "System theme", dark: "Dark theme", light: "Light theme" };

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  return (bytes / 1024).toFixed(1) + " KB";
}

export function Toolbar({
  svgCode,
  activeTab,
  optimizeStats,
  splitPct = 50,
  colorAtCursor,
  showOptimize    = true,
  showPrettify    = true,
  showColorPicker = true,
  visibleTabs,
  onTabChange,
  onSvgChange,
  onImport,
  onClear,
  onAboutOpen,
  onSettingsOpen,
  onPickerOpen,
  onPickerClose,
  onColorChange,
}) {
  const [themePref, setThemePref] = useState(() => getThemePreference());
  const [clearAnim, setClearAnim] = useState(false);
  const dims = getSvgDimensions(svgCode);
  const dimLabel = dims.width && dims.height
    ? `${dims.width}×${dims.height}px`
    : "";

  const filteredTabs = visibleTabs
    ? TABS.filter(t => visibleTabs.includes(t.id))
    : TABS;

  async function handleImport() {
    try {
      const result = await nex.dialog.open({
        title: "Import SVG file",
        filters: [
          { name: "SVG files", patterns: ["*.svg"] },
          { name: "All files", patterns: ["*"] },
        ],
      });
      const path = extractPath(result);
      if (!path) return;
      const { data: content } = await nex.fs.read(path, "utf8");
      if (!content) return;
      (onImport ?? onSvgChange)(content);
      nex.recentDocs.add(path).catch(() => {});
    } catch {}
  }

  function handleClear() {
    onClear?.();
    setClearAnim(true);
    setTimeout(() => setClearAnim(false), 350);
  }

  function handleOptimize() {
    const { result } = optimize(svgCode);
    onSvgChange(result);
  }

  function handlePrettify() {
    const result = prettify(svgCode);
    onSvgChange(result);
  }

  async function handleThemeCycle() {
    const next = THEME_CYCLE[themePref] ?? "system";
    setThemePref(next);
    if (next === "system") {
      await syncThemeWithNexAppearance("system");
    } else {
      setThemePreference(next);
    }
  }

  const ThemeIcon = THEME_ICON[themePref] ?? FiMonitor;

  return (
    <div className="toolbar" style={{ "--app-split-pct": splitPct }}>
      <div className="toolbar-left">
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={handleImport}
          title="Import SVG from file"
          type="button"
        >
          <FiFolder size={14} />
          <span>Import from file</span>
        </button>

        <button
          className={`toolbar-btn toolbar-btn--clear${clearAnim ? " toolbar-btn--clear-anim" : ""}`}
          onClick={handleClear}
          title="Clear editor"
          type="button"
        >
          <FiTrash2 size={14} />
          <span>Clear</span>
        </button>

        {dimLabel && (
          <span className="toolbar-dim">{dimLabel}</span>
        )}

        {showOptimize && (
          optimizeStats && optimizeStats.originalBytes > 0 ? (
            <button
              className="toolbar-optimize"
              onClick={handleOptimize}
              title="Optimize SVG"
              type="button"
            >
              <FiZap size={13} />
              <span>
                Optimize{" "}
                <span className="toolbar-optimize__bytes">
                  {fmtSize(optimizeStats.originalBytes)} → {fmtSize(optimizeStats.optimizedBytes)}
                </span>
                {optimizeStats.savings > 0 && (
                  <span className="toolbar-optimize__pct"> -{optimizeStats.savings}%</span>
                )}
              </span>
            </button>
          ) : (
            <button
              className="toolbar-btn"
              onClick={handleOptimize}
              title="Optimize SVG"
              type="button"
            >
              <FiZap size={14} />
              <span>Optimize</span>
            </button>
          )
        )}

        {showPrettify && (
          <button className="toolbar-btn" onClick={handlePrettify} title="Prettify SVG" type="button">
            <FiAlignLeft size={14} />
            <span>Prettify</span>
          </button>
        )}

        {showColorPicker && (
          <>
            <div className="toolbar-sep" aria-hidden="true" />
            <ColorPicker
              color={colorAtCursor?.value ?? null}
              onOpen={onPickerOpen}
              onChange={onColorChange}
              onClose={onPickerClose}
            />
          </>
        )}
      </div>

      <div className="toolbar-tabs" role="tablist" aria-label="Output format">
        {filteredTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`toolbar-tab${activeTab === tab.id ? " toolbar-tab--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="toolbar-right">
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={handleThemeCycle}
          title={THEME_LABEL[themePref]}
          type="button"
        >
          <ThemeIcon size={15} />
        </button>
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={onAboutOpen}
          title="About SVG Designer"
          type="button"
        >
          <FiInfo size={15} />
        </button>
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={onSettingsOpen}
          title="Settings"
          type="button"
        >
          <FiSettings size={15} />
        </button>
      </div>
    </div>
  );
}

function extractPath(raw) {
  if (!raw) return null;
  if (raw.canceled) return null;
  if (typeof raw === "string") return raw || null;
  if (Array.isArray(raw)) return raw[0] || null;
  if (Array.isArray(raw.paths)) return raw.paths[0] || null;
  return raw?.path || raw?.filename || null;
}
