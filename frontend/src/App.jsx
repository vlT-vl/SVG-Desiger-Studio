import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import bootLogoRaw from "../../res/svgdesigner.svg?raw";
import { BootSplash } from "./components/BootSplash.jsx";
import { Editor } from "./components/Editor.jsx";
import { OutputPanel } from "./components/OutputPanel.jsx";
import { Toolbar } from "./components/Toolbar.jsx";
import About from "./views/About.jsx";
import Settings from "./views/Settings.jsx";
import { DEFAULT_SVG, DEFAULT_TITLE_TAG } from "./lib/svg/defaults.js";
import { optimize } from "./lib/svg/optimize.js";
import { getColorAtCursor } from "./lib/colorAtCursor.js";
import { resolveElementRange, findElementAtSelection } from "./lib/svg/elementLocator.js";
import { resolveColorScheme } from "./lib/svg/scheme.js";
import { applyTheme, getBrowserSystemTheme, getNexSystemTheme, getThemePreference, syncThemeWithNexAppearance } from "./lib/theme.js";
import { prefs } from "./lib/prefs.js";
import { UI_KEY, DEFAULT_UI } from "./lib/uiSettings.js";
import "./styles/App.css";

const HISTORY_LIMIT = 100;
const BOOT_LOGO_DARK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(resolveColorScheme(bootLogoRaw, "dark"))}`;

// Injects a default <title> right after the root <svg ...> open tag when the
// document doesn't already have one. Only ever applied to a whole NEW SVG
// being loaded (file import / drop into an empty editor) — never reactively
// on typed edits, which would fight the user mid-keystroke and clutter undo
// history. Same naive-but-safe root-tag regex already used by Preview.jsx's
// ensureIntrinsicSize() for an equivalent single-attribute-injection task.
function ensureTitle(svg) {
  if (!svg || /<title[\s>]/i.test(svg)) return svg;
  const m = svg.match(/<svg\b[^>]*>/i);
  if (!m) return svg;
  const insertAt = m.index + m[0].length;
  return svg.slice(0, insertAt) + `\n  ${DEFAULT_TITLE_TAG}` + svg.slice(insertAt);
}

export default function App() {
  const [bootTheme,     setBootTheme]     = useState(() => getBrowserSystemTheme());
  const [booting,       setBooting]       = useState(true);
  const [svgCode,       setSvgCodeState]  = useState(DEFAULT_SVG);
  const [activeTab,     setActiveTab]     = useState("preview");
  const [optimizeStats, setOptimizeStats] = useState(null);
  const [aboutOpen,     setAboutOpen]     = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [splitPct,      setSplitPct]      = useState(50);
  const [divActive,     setDivActive]     = useState(false);
  const [editorSel,     setEditorSel]     = useState(null);
  const [fitToken,      setFitToken]      = useState(0);
  const [focusRequest,  setFocusRequest]  = useState(null);
  const [clearSelectionToken, setClearSelectionToken] = useState(0);

  const [uiSettings, setUiSettingsState] = useState(() => {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (!raw) return DEFAULT_UI;
      return { ...DEFAULT_UI, ...JSON.parse(raw) };
    } catch { return DEFAULT_UI; }
  });

  const debounceRef    = useRef(null);
  const bodyRef        = useRef(null);
  const isDragging     = useRef(false);
  const pickerRangeRef = useRef(null);
  const svgCodeRef     = useRef(DEFAULT_SVG);
  const historyRef     = useRef({ past: [], future: [] });

  useEffect(() => {
    applyTheme(getThemePreference());
    getNexSystemTheme()
      .then(setBootTheme)
      .catch(() => {});
    syncThemeWithNexAppearance(getThemePreference())
      .catch(() => {});
  }, []);

  useEffect(() => {
    svgCodeRef.current = svgCode;
  }, [svgCode]);

  function pushHistory(prev) {
    const history = historyRef.current;
    history.past.push(prev);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
  }

  function setSvgCode(nextOrUpdater, options = {}) {
    const { history = true } = options;
    const prev = svgCodeRef.current;
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
    if (next === prev) return;
    if (history) pushHistory(prev);
    svgCodeRef.current = next;
    setSvgCodeState(next);
  }

  function undoSvgCode() {
    const history = historyRef.current;
    if (!history.past.length) return false;

    const current = svgCodeRef.current;
    const previous = history.past.pop();
    history.future.push(current);
    svgCodeRef.current = previous;
    setSvgCodeState(previous);
    return true;
  }

  function redoSvgCode() {
    const history = historyRef.current;
    if (!history.future.length) return false;

    const current = svgCodeRef.current;
    const next = history.future.pop();
    history.past.push(current);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    svgCodeRef.current = next;
    setSvgCodeState(next);
    return true;
  }

  useEffect(() => {
    function onKeyDown(e) {
      const target = e.target;
      const tag = target?.tagName?.toLowerCase?.();
      const editable = target?.isContentEditable || tag === "textarea" || tag === "input" || tag === "select";
      if (editable) return;

      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;

      const handled = isUndo ? undoSvgCode() : redoSvgCode();
      if (handled) e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!svgCode?.trim()) { setOptimizeStats(null); return; }
      try { setOptimizeStats(optimize(svgCode)); } catch { setOptimizeStats(null); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [svgCode]);

  // Switch active tab if it gets hidden
  useEffect(() => {
    if (!uiSettings.visibleTabs.includes(activeTab)) {
      setActiveTab(uiSettings.visibleTabs[0] ?? "preview");
    }
  }, [uiSettings.visibleTabs]);

  function setUiSettings(patch) {
    setUiSettingsState(prev => {
      const next = { ...prev, ...patch };
      const serialized = JSON.stringify(next);
      try { localStorage.setItem(UI_KEY, serialized); } catch {}
      prefs.set(UI_KEY, serialized).catch(() => {});
      return next;
    });
  }

  function handleClear() {
    setSvgCode("");
    setOptimizeStats(null);
  }

  // Fired only when a whole new SVG is loaded (import from file, or drag-drop onto
  // an empty editor) — never on merge or plain typing — so the preview zoom/pan can
  // be re-fitted to the new content's size instead of keeping a stale value that
  // made sense for whatever was open before. Also the only point where a missing
  // <title> gets auto-inserted (see ensureTitle) — a whole new document is the
  // only time this is safe to do without fighting a mid-edit keystroke.
  function handleSvgLoad(content) {
    setSvgCode(ensureTitle(content));
    setFitToken(t => t + 1);
  }

  // Same fit-to-view computation as handleSvgLoad, triggered manually by the
  // "Fit to view" button so the user can restore it after zooming/panning by hand.
  function handleFitToView() {
    setFitToken(t => t + 1);
  }

  // ── Split divider drag ────────────────────────────────────────────────────
  function handleDividerDown(e) {
    isDragging.current = true;
    setDivActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleDividerMove(e) {
    if (!isDragging.current) return;
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const pct  = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(18, Math.min(82, pct)));
  }

  function handleDividerUp() {
    isDragging.current = false;
    setDivActive(false);
  }

  // ── SVG element highlight from editor selection ───────────────────────────
  // editorSel is a { start, end } range (collapsed when start === end) reported
  // by the editor's cursor/selection; hlTarget resolves it to the innermost
  // structural SVG element (never the root <svg>) for the Preview to highlight.
  //
  // findElementAtSelection() does a full scanElements() pass over the whole
  // document — computed here (in an effect) rather than as a plain render-body
  // const, on purpose: editorSel changes on essentially every keystroke
  // (onKeyUp/onSelect report the live cursor position), and a render-body call
  // would re-run that full scan synchronously inside the SAME render that also
  // updates svgCode — blocking the paint of the freshly-typed Preview content
  // behind an unrelated, more expensive computation on every single key. Moving
  // it into an effect lets the content-bearing render (Preview's innerHTML,
  // Editor's textarea value) commit and paint immediately; the highlight/menu
  // state that depends on hlTarget catches up a tick later instead.
  const [hlTarget, setHlTarget] = useState(null);
  useEffect(() => {
    setHlTarget(findElementAtSelection(svgCode, editorSel?.start, editorSel?.end));
  }, [svgCode, editorSel]);

  const colorAtCursor = getColorAtCursor(svgCode, editorSel?.start);

  // Clicking an element in the Preview selects it by selecting its FULL source
  // range (open tag through matching close tag, including nested children) in
  // the editor — hlTarget then re-derives from that same range, so both
  // selection paths converge on the same element.
  function handleSelectElement(tagName, count) {
    const range = resolveElementRange(svgCode, tagName, count);
    if (!range) return;
    setEditorSel({ start: range.start, end: range.end });
    setFocusRequest({ start: range.start, end: range.end, token: Date.now() });
  }

  // Clicking Preview background (resolves only to the root <svg>, never a real
  // shape) clears whatever element was previously selected: hlTarget drops out
  // (editorSel -> null) and the editor's own leftover text selection, if any,
  // is collapsed too — without stealing focus into the editor for a Preview click.
  function handleClearSelection() {
    setEditorSel(null);
    setClearSelectionToken(t => t + 1);
  }

  // ── Color picker ──────────────────────────────────────────────────────────
  function handlePickerOpen() {
    const ca = getColorAtCursor(svgCode, editorSel?.start);
    pickerRangeRef.current = ca ? { start: ca.start, end: ca.end } : null;
  }

  function handlePickerClose() {
    pickerRangeRef.current = null;
  }

  function handleColorChange(hex) {
    const range = pickerRangeRef.current;
    if (!range) return;
    setSvgCode(prev => prev.slice(0, range.start) + hex + prev.slice(range.end));
    pickerRangeRef.current = { start: range.start, end: range.start + hex.length };
  }

  if (booting) {
    return (
      <BootSplash
        logoSrc={BOOT_LOGO_DARK}
        title="SVG Designer Studio"
        theme={bootTheme}
        onDone={() => setBooting(false)}
      />
    );
  }

  return (
    <div className="app">
      <Toolbar
        svgCode={svgCode}
        activeTab={activeTab}
        optimizeStats={optimizeStats}
        splitPct={splitPct}
        colorAtCursor={colorAtCursor}
        showOptimize={uiSettings.showOptimize}
        showPrettify={uiSettings.showPrettify}
        showColorPicker={uiSettings.showColorPicker}
        visibleTabs={uiSettings.visibleTabs}
        onTabChange={setActiveTab}
        onSvgChange={setSvgCode}
        onImport={handleSvgLoad}
        onClear={handleClear}
        onAboutOpen={() => { setSettingsOpen(false); setAboutOpen(true); }}
        onSettingsOpen={() => { setAboutOpen(false); setSettingsOpen(true); }}
        onPickerOpen={handlePickerOpen}
        onPickerClose={handlePickerClose}
        onColorChange={handleColorChange}
      />

      <div className="app-body" ref={bodyRef}>
        <div className="app-pane" style={{ width: `${splitPct}%` }}>
          <Editor
            value={svgCode}
            onChange={setSvgCode}
            onLoad={handleSvgLoad}
            onSelectionChange={setEditorSel}
            focusRequest={focusRequest}
            clearSelectionToken={clearSelectionToken}
            hlTarget={hlTarget}
            onUndo={undoSvgCode}
            onRedo={redoSvgCode}
            onClear={handleClear}
          />
        </div>

        <div
          className={`app-divider${divActive ? " app-divider--active" : ""}`}
          onPointerDown={handleDividerDown}
          onPointerMove={handleDividerMove}
          onPointerUp={handleDividerUp}
          onPointerCancel={handleDividerUp}
          aria-hidden="true"
        />

        <div className="app-pane app-pane--output">
          <OutputPanel
            svgCode={svgCode}
            activeTab={activeTab}
            hlTarget={hlTarget}
            fitToken={fitToken}
            onFitToView={handleFitToView}
            onSelectElement={handleSelectElement}
            onClearSelection={handleClearSelection}
          />
        </div>
      </div>

      {aboutOpen && (
        <div className="about-overlay">
          <div className="about-overlay__bar">
            <button className="about-overlay__close" type="button" onClick={() => setAboutOpen(false)}>
              <FiX size={15} />
            </button>
          </div>
          <About />
        </div>
      )}

      {settingsOpen && (
        <div className="about-overlay">
          <div className="about-overlay__bar">
            <button className="about-overlay__close" type="button" onClick={() => setSettingsOpen(false)}>
              <FiX size={15} />
            </button>
          </div>
          <Settings
            onOpenAbout={() => { setSettingsOpen(false); setAboutOpen(true); }}
            uiSettings={uiSettings}
            onUiSettings={setUiSettings}
          />
        </div>
      )}
    </div>
  );
}
