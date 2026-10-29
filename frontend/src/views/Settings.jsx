import { useEffect, useState } from "react";
import { IoSettings } from "react-icons/io5";
import { FiMonitor, FiSun, FiMoon, FiInfo, FiArchive, FiUpload, FiTrash2 } from "react-icons/fi";
import packageJson from "../../package.json";
import * as nex from "../lib/nex.js";
import { prefs } from "../lib/prefs.js";
import { getThemePreference, syncThemeWithNexAppearance, setThemePreference } from "../lib/theme.js";
import { DEFAULT_UI } from "../lib/uiSettings.js";
import { UpdaterPanel } from "../components/UpdaterPanel.jsx";
import "../styles/Settings.css";

const ALL_TABS = [
  { id: "preview",     label: "Preview" },
  { id: "react",       label: "React" },
  { id: "reactnative", label: "React Native" },
  { id: "png",         label: "PNG" },
  { id: "datauri",     label: "Data URI" },
];

const PREFS_LOCATION = {
  title: "Preferences file location",
  current: "Current path",
  path: "Absolute path",
  save: "Save",
  restore: "Restore default",
  loading: "Loading…",
  unavailable: "Unavailable",
  error: "The path is invalid or not writable",
};

const UPDATER_LABELS = {
  title: "Updates",
  current: "Current version",
  status: "Status",
  source: "Source",
  lastCheck: "Last check",
  states: {
    idle: "Up to date or not checked yet",
    checking: "Checking…",
    available: "Update available",
    downloading: "Downloading…",
    downloaded: "Ready to install",
    installing: "Installing…",
    error: "Error",
  },
  notConfigured: "Updates not configured",
  unavailable: "Updates are available only in the native app.",
  mandatory: "Mandatory",
  rolledBack: "Previously rolled back",
  updatedOk: "Update completed: version",
  rolledBackResult: "Update rolled back, previous version restored",
  check: "Check for updates",
  download: "Download",
  install: "Install and restart",
  autoCheck: "Automatic check",
  autoDownload: "Automatic download",
};

function fmtDate(str) {
  const IT = {
    gennaio: "January", febbraio: "February", marzo: "March", aprile: "April",
    maggio: "May", giugno: "June", luglio: "July", agosto: "August",
    settembre: "September", ottobre: "October", novembre: "November", dicembre: "December",
  };
  if (!str) return str;
  return str.replace(/[a-zA-ZÀ-ú]+/g, (w) => IT[w.toLowerCase()] ?? w);
}

function InfoTable({ rows }) {
  return (
    <dl className="sn-table">
      {rows.map(([label, value]) => (
        <div key={label} className="sn-row">
          <dt className="sn-row__label">{label}</dt>
          <dd className="sn-row__value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`sn-toggle${checked ? " sn-toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="sn-toggle-row">
      <span className="sn-toggle-row__label">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function Settings({ onOpenAbout, uiSettings = DEFAULT_UI, onUiSettings }) {
  const [themePref, setThemePref] = useState(() => getThemePreference());
  const [toast,     setToast]     = useState(null);
  const [appInfo,   setAppInfo]   = useState(null);
  const [prefsLocation, setPrefsLocation] = useState(undefined);
  const [prefsPath,     setPrefsPath]     = useState("");
  const [prefsError,    setPrefsError]    = useState("");
  const [prefsSaving,   setPrefsSaving]   = useState(false);

  useEffect(() => {
    nex.app.info().then(setAppInfo).catch(() => {});
    prefs.location().then(location => {
      setPrefsLocation(location);
      setPrefsPath(location.path);
    }).catch(() => setPrefsLocation(null));
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
    setThemePreference(preference);
    if (preference === "system") await syncThemeWithNexAppearance("system");
  }

  function handleTabToggle(tabId, checked) {
    const next = checked
      ? [...uiSettings.visibleTabs, tabId]
      : uiSettings.visibleTabs.filter(t => t !== tabId);
    if (next.length === 0) return;
    onUiSettings?.({ visibleTabs: next });
  }

  async function changePrefsLocation(path) {
    setPrefsSaving(true);
    setPrefsError("");
    try {
      const location = await prefs.setLocation(path);
      setPrefsLocation(location);
      setPrefsPath(location.path);
    } catch {
      setPrefsError(PREFS_LOCATION.error);
    } finally {
      setPrefsSaving(false);
    }
  }

  function savePrefsLocation(event) {
    event.preventDefault();
    changePrefsLocation(prefsPath.trim());
  }

  function restorePrefsLocation() {
    changePrefsLocation(null);
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

  const appRows = [
    ["Version", version],
    ["Build", build],
    ["Last update", updated],
  ];

  return (
    <div className="sn settings">
      <div className="sn-header">
        <IoSettings size={26} className="sn-header__icon" />
        <h1 className="sn-header__title">Settings</h1>
      </div>

      <div className="sn-card">
        <div className="sn-card__title">Appearance</div>
        <div className="sn-pills" role="radiogroup" aria-label="Theme">
          {[
            ["system", "System", FiMonitor],
            ["light",  "Light",  FiSun],
            ["dark",   "Dark",   FiMoon],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              className={`sn-pill${themePref === value ? " sn-pill--active" : ""}`}
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

      <div className="sn-card">
        <div className="sn-card__title">Interface</div>

        <div className="sn-toggle-section">
          <div className="sn-toggle-section__label">Toolbar</div>
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

        <div className="sn-toggle-section">
          <div className="sn-toggle-section__label">Output tabs</div>
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

      <div className="sn-card">
        <div className="sn-card__title">{PREFS_LOCATION.title}</div>
        {prefsLocation === undefined && <p className="sn-hint">{PREFS_LOCATION.loading}</p>}
        {prefsLocation === null && <p className="sn-hint">{PREFS_LOCATION.unavailable}</p>}
        {prefsLocation && (
          <dl className="sn-table">
            <div className="sn-row">
              <dt className="sn-row__label">{PREFS_LOCATION.current}</dt>
              <dd className="sn-row__value sn-location__path">{prefsLocation.path}</dd>
            </div>
          </dl>
        )}
        <form className="sn-location" onSubmit={savePrefsLocation}>
          <input
            className="sn-location__input"
            type="text"
            value={prefsPath}
            onChange={event => setPrefsPath(event.target.value)}
            placeholder={PREFS_LOCATION.path}
            aria-label={PREFS_LOCATION.path}
            disabled={prefsSaving}
          />
          <button className="sn-location__button" type="submit" disabled={prefsSaving}>
            {PREFS_LOCATION.save}
          </button>
          <button className="sn-location__restore" type="button" onClick={restorePrefsLocation} disabled={prefsSaving}>
            {PREFS_LOCATION.restore}
          </button>
          {prefsError && <span className="sn-location__error" role="alert">{prefsError}</span>}
        </form>
      </div>

      <UpdaterPanel labels={UPDATER_LABELS} />

      <div className="sn-card">
        <div className="sn-card__title">Data</div>
        <div className="sn-actions">
          <button className="sn-btn" onClick={handleExport} type="button">
            <FiArchive size={14} />
            <span>Export settings</span>
          </button>
          <button className="sn-btn" onClick={handleImport} type="button">
            <FiUpload size={14} />
            <span>Import settings</span>
          </button>
          <button className="sn-btn sn-btn--danger" onClick={handleClearData} type="button">
            <FiTrash2 size={14} />
            <span>Reset to defaults</span>
          </button>
        </div>
        {toast && (
          <div className={`sn-toast sn-toast--${toast.type}`}>
            {toast.msg}
          </div>
        )}
      </div>

      <div className="sn-card">
        <div className="sn-card__title">App info</div>
        <InfoTable rows={appRows} />
        {onOpenAbout && (
          <button className="sn-about-link" onClick={onOpenAbout} type="button">
            <FiInfo size={13} />
            View full About page
          </button>
        )}
      </div>
    </div>
  );
}
