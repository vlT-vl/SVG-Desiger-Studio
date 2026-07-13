import { useEffect, useState } from "react";
import { IoSettings } from "react-icons/io5";
import { FiMonitor, FiSun, FiMoon, FiInfo, FiArchive, FiUpload, FiTrash2 } from "react-icons/fi";
import packageJson from "../../package.json";
import * as nex from "../lib/nex.js";
import { getThemePreference, syncThemeWithNexAppearance, setThemePreference } from "../lib/theme.js";
import { DEFAULT_UI } from "../lib/uiSettings.js";
import "../styles/Settings.css";

const ALL_TABS = [
  { id: "preview",     label: "Preview" },
  { id: "react",       label: "React" },
  { id: "reactnative", label: "React Native" },
  { id: "png",         label: "PNG" },
  { id: "datauri",     label: "Data URI" },
];

function fmtDate(str) {
  const IT = {
    gennaio: "January", febbraio: "February", marzo: "March", aprile: "April",
    maggio: "May", giugno: "June", luglio: "July", agosto: "August",
    settembre: "September", ottobre: "October", novembre: "November", dicembre: "December",
  };
  if (!str) return str;
  return str.replace(/[a-zA-ZÀ-ú]+/g, (w) => IT[w.toLowerCase()] ?? w);
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`settings-toggle${checked ? " settings-toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="settings-toggle-row">
      <span className="settings-toggle-row__label">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function Settings({ onOpenAbout, uiSettings = DEFAULT_UI, onUiSettings }) {
  const [themePref, setThemePref] = useState(() => getThemePreference());
  const [toast,     setToast]     = useState(null);
  const [appInfo,   setAppInfo]   = useState(null);

  useEffect(() => {
    nex.app.info().then(setAppInfo).catch(() => {});
  }, []);

  const version = appInfo?.version ?? packageJson.version;
  const build   = appInfo?.build ?? packageJson.build;
  const updated = fmtDate(appInfo?.updated ?? packageJson.updated);

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleThemeChange(preference) {
    setThemePref(preference);
    if (preference === "system") {
      await syncThemeWithNexAppearance("system");
    } else {
      setThemePreference(preference);
    }
  }

  function handleTabToggle(tabId, checked) {
    const next = checked
      ? [...uiSettings.visibleTabs, tabId]
      : uiSettings.visibleTabs.filter(t => t !== tabId);
    if (next.length === 0) return;
    onUiSettings?.({ visibleTabs: next });
  }

  async function handleExport() {
    try {
      const backup = {
        version: 1,
        app: "svg-designer",
        exported: new Date().toISOString(),
        uiSettings,
      };
      const result = await nex.dialog.save({
        defaultFilename: "svg-designer-settings.json",
        filters: [{ name: "JSON backup", patterns: ["*.json"] }],
      });
      const path = result?.paths?.[0] ?? result?.path;
      if (!path || result?.canceled) return;
      await nex.fs.write(path, JSON.stringify(backup, null, 2), "utf8");
      showToast("ok", "Settings exported successfully");
    } catch {
      showToast("err", "Export failed");
    }
  }

  async function handleImport() {
    try {
      const result = await nex.dialog.open({
        title: "Import settings",
        filters: [{ name: "JSON backup", patterns: ["*.json"] }],
      });
      const path = result?.paths?.[0] ?? result?.path;
      if (!path || result?.canceled) return;

      const { data } = await nex.fs.read(path, "utf8");
      const parsed = JSON.parse(data);
      const imported = parsed?.uiSettings;
      if (!imported || typeof imported !== "object") throw new Error("invalid backup");

      const merged = { ...DEFAULT_UI, ...imported };
      if (!Array.isArray(merged.visibleTabs) || merged.visibleTabs.length === 0) {
        merged.visibleTabs = DEFAULT_UI.visibleTabs;
      }
      onUiSettings?.(merged);
      showToast("ok", "Settings imported successfully");
    } catch {
      showToast("err", "Import failed");
    }
  }

  function handleClearData() {
    onUiSettings?.({ ...DEFAULT_UI });
    showToast("ok", "Settings reset to defaults");
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <IoSettings size={26} className="settings-header__icon" />
        <h1 className="settings-header__title">Settings</h1>
      </div>

      {/* ── Appearance ── */}
      <div className="settings-card">
        <div className="settings-card__title">Appearance</div>
        <div className="settings-theme-toggle" role="radiogroup" aria-label="Theme">
          {[
            ["system", "System", FiMonitor],
            ["light",  "Light",  FiSun],
            ["dark",   "Dark",   FiMoon],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              className={`settings-theme-option${themePref === value ? " settings-theme-option--active" : ""}`}
              type="button"
              role="radio"
              aria-checked={themePref === value}
              onClick={() => handleThemeChange(value)}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Interface ── */}
      <div className="settings-card">
        <div className="settings-card__title">Interface</div>

        <div className="settings-toggle-section">
          <div className="settings-toggle-section__label">Toolbar</div>
          <ToggleRow
            label="Optimize button"
            checked={uiSettings.showOptimize}
            onChange={v => onUiSettings?.({ showOptimize: v })}
          />
          <ToggleRow
            label="Prettify button"
            checked={uiSettings.showPrettify}
            onChange={v => onUiSettings?.({ showPrettify: v })}
          />
          <ToggleRow
            label="Color picker"
            checked={uiSettings.showColorPicker}
            onChange={v => onUiSettings?.({ showColorPicker: v })}
          />
        </div>

        <div className="settings-toggle-section">
          <div className="settings-toggle-section__label">Output tabs</div>
          {ALL_TABS.map(tab => (
            <ToggleRow
              key={tab.id}
              label={tab.label}
              checked={uiSettings.visibleTabs.includes(tab.id)}
              onChange={v => handleTabToggle(tab.id, v)}
            />
          ))}
        </div>
      </div>

      {/* ── Data ── */}
      <div className="settings-card">
        <div className="settings-card__title">Data</div>
        <div className="settings-actions settings-actions--3col">
          <button className="settings-btn" onClick={handleExport} type="button">
            <FiArchive size={14} />
            <span>Export settings</span>
          </button>
          <button className="settings-btn" onClick={handleImport} type="button">
            <FiUpload size={14} />
            <span>Import settings</span>
          </button>
          <button className="settings-btn settings-btn--danger" onClick={handleClearData} type="button">
            <FiTrash2 size={14} />
            <span>Reset to defaults</span>
          </button>
        </div>
        {toast && (
          <div className={`settings-toast settings-toast--${toast.type}`}>
            {toast.msg}
          </div>
        )}
      </div>

      {/* ── App info ── */}
      <div className="settings-card">
        <div className="settings-card__title">App info</div>
        <div className="settings-info-grid">
          <div className="settings-info-cell">
            <div className="settings-info-cell__label">Version</div>
            <div className="settings-info-cell__value">{version}</div>
          </div>
          <div className="settings-info-cell">
            <div className="settings-info-cell__label">Build</div>
            <div className="settings-info-cell__value">{build}</div>
          </div>
          <div className="settings-info-cell">
            <div className="settings-info-cell__label">Last update</div>
            <div className="settings-info-cell__value">{updated}</div>
          </div>
        </div>
        {onOpenAbout && (
          <button className="settings-about-link" onClick={onOpenAbout}>
            <FiInfo size={13} />
            View full About page
          </button>
        )}
      </div>
    </div>
  );
}
