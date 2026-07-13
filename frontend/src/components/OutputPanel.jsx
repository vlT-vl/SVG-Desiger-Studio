import { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiCheck, FiCopy, FiCrosshair, FiMaximize2, FiMinus, FiMoon, FiPlus, FiSave, FiSun } from "react-icons/fi";
import * as nex from "../lib/nex.js";
import { Preview, ZOOM_DEFAULT, ZOOM_STEPS, FIT_PADDING, FIT_ZOOM_MIN, FIT_ZOOM_MAX } from "./Preview.jsx";
import { toReact } from "../lib/svg/toReact.js";
import { toReactNative } from "../lib/svg/toReactNative.js";
import { toPng } from "../lib/svg/toPng.js";
import { supportsColorScheme } from "../lib/svg/scheme.js";
import { toDataUriBase64, toDataUriEncoded } from "../lib/svg/dataUri.js";
import { highlightJsx } from "../lib/highlight.js";
import "../styles/OutputPanel.css";

export const TABS = [
  { id: "preview",     label: "Preview" },
  { id: "react",       label: "React" },
  { id: "reactnative", label: "React Native" },
  { id: "png",         label: "PNG" },
  { id: "datauri",     label: "Data URI" },
];

function CopyButton({ getText, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const text = await Promise.resolve(getText());
      await nex.clipboard.native.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button className="output-action-btn" onClick={handleCopy} type="button" title={label}>
      {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
      <span>{copied ? "Copied!" : label}</span>
    </button>
  );
}

function SaveButton({ getBlob, filename, filters, label = "Save", disabled = false }) {
  const [err, setErr] = useState(false);

  async function handleSave() {
    if (disabled) return;
    setErr(false);
    try {
      const blob = await Promise.resolve(getBlob());
      if (!blob) return;

      const saveResult = await nex.dialog.save({
        defaultFilename: filename,
        ...(filters ? { filters } : {}),
      });
      const savePath = saveResult?.paths?.[0] ?? saveResult?.path;
      if (!savePath || saveResult?.canceled) return;

      if (blob.type === "image/png") {
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await nex.fs.write(savePath, b64, "base64");
      } else {
        const text = await blob.text();
        await nex.fs.write(savePath, text, "utf8");
      }
    } catch {
      setErr(true);
      setTimeout(() => setErr(false), 2500);
    }
  }

  return (
    <button
      className={`output-action-btn${err ? " output-action-btn--err" : ""}`}
      onClick={handleSave}
      type="button"
      title={label}
      disabled={disabled}
    >
      <FiSave size={14} />
      <span>{err ? "Save failed" : label}</span>
    </button>
  );
}

function CodeOutput({ code }) {
  return (
    <div className="output-code-wrap">
      <pre className="output-code">
        <code dangerouslySetInnerHTML={{ __html: code ? highlightJsx(code) + '\n' : '' }} />
      </pre>
    </div>
  );
}

const PNG_FILTERS = [{ name: "PNG Image", patterns: ["*.png"] }];
const PNG_RENDER_DELAY_MS = 80;

function ZoomButtons({ zoom, onZoomChange, onZoomReset, onFitToView }) {
  const zoomPct = Math.round(zoom * 100);

  function zoomIn() {
    onZoomChange((z) => { const n = ZOOM_STEPS.find((s) => s > z); return n ?? z; });
  }

  function zoomOut() {
    onZoomChange((z) => { const n = [...ZOOM_STEPS].reverse().find((s) => s < z); return n ?? z; });
  }

  return (
    <div className="output-zoom-group" aria-label="Zoom">
      <button className="output-icon-btn" onClick={zoomOut} title="Zoom out" type="button">
        <FiMinus size={13} />
      </button>
      <button className="output-pct-btn" onClick={onZoomReset} title="Reset zoom" type="button">
        {zoomPct}%
      </button>
      <button className="output-icon-btn" onClick={zoomIn} title="Zoom in" type="button">
        <FiPlus size={13} />
      </button>
      {onFitToView && (
        <button className="output-icon-btn" onClick={onFitToView} title="Fit to view" type="button">
          <FiMaximize2 size={13} />
        </button>
      )}
    </div>
  );
}

// Reusable center-guides toggle — dashed horizontal/vertical crosshair drawn
// over the checkerboard canvas (Preview.jsx and PngOutput below both accept
// the same showGuides boolean), one shared button/state for both tabs so
// toggling it in either place stays in sync with the other, same pattern as
// SchemeToggle above.
function GuidesToggle({ active, onToggle }) {
  return (
    <button
      className={`output-icon-btn${active ? " output-icon-btn--active" : ""}`}
      onClick={onToggle}
      title={active ? "Hide center guides" : "Show center guides"}
      type="button"
      aria-pressed={active}
    >
      <FiCrosshair size={13} />
    </button>
  );
}

const SCALE_OPTIONS = [3, 4, 5, 6, 7, 8];
const BASE_SIZE_OPTIONS = [128, 256, 512, 1024];

function ScaleButtons({ scale, onScaleChange }) {
  return (
    <div className="output-scale-group" aria-label="Scale">
      {SCALE_OPTIONS.map((s) => (
        <button
          key={s}
          className={`output-scale-btn${scale === s ? " output-scale-btn--active" : ""}`}
          onClick={() => onScaleChange(s)}
          type="button"
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

function BaseSizeButtons({ baseSize, onBaseSizeChange }) {
  return (
    <div className="output-basesize-group" aria-label="Base size">
      {BASE_SIZE_OPTIONS.map((s) => (
        <button
          key={s}
          className={`output-basesize-btn${baseSize === s ? " output-basesize-btn--active" : ""}`}
          onClick={() => onBaseSizeChange(s)}
          type="button"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// Reusable light/dark preview toggle — a single sliding switch (not a pair of
// buttons), shared by the SVG Preview and PNG footers (same component, same
// lifted state in OutputPanel), so switching scheme in either tab updates
// both in real time. Only ever rendered by the caller when
// supportsColorScheme(svgCode) is true (see scheme.js) — an SVG with no
// @media (prefers-color-scheme) blocks of its own has nothing for this to
// resolve, so the control never appears for it at all rather than sitting
// there visibly doing nothing. Always exactly light or dark (a real toggle
// has two states, not three) — the knob carries the current mode's own icon,
// same idiom as the sliding switches in Settings.jsx's Interface section,
// but this one lives entirely here: it forces the *SVG's own* embedded
// scheme for preview/export purposes, completely independent of and
// unrelated to the app's own UI theme.
function SchemeToggle({ scheme, onChange }) {
  const isDark = scheme === "dark";
  return (
    <button
      className={`output-scheme-switch${isDark ? " output-scheme-switch--dark" : ""}`}
      onClick={() => onChange(isDark ? "light" : "dark")}
      title={isDark ? "Previewing in dark mode — switch to light" : "Previewing in light mode — switch to dark"}
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="SVG color scheme"
    >
      <span className="output-scheme-switch__knob">
        {isDark ? <FiMoon size={10} /> : <FiSun size={10} />}
      </span>
    </button>
  );
}

function FormatButtons({ format, onFormatChange }) {
  return (
    <div className="output-format-group" aria-label="Data URI format">
      {["base64", "encoded"].map((f) => (
        <button
          key={f}
          className={`output-format-btn${format === f ? " output-format-btn--active" : ""}`}
          onClick={() => onFormatChange(f)}
          type="button"
        >
          {f === "base64" ? "Base64" : "URL Encoded"}
        </button>
      ))}
    </div>
  );
}

function OutputCommandBar({ children }) {
  return <div className="output-footer">{children}</div>;
}

function PngOutput({
  svgCode,
  scale = 3,
  baseSize = 128,
  scheme = null,
  onPngBlobChange,
  zoom = ZOOM_DEFAULT,
  onZoomChange,
  pan = { x: 0, y: 0 },
  onPanChange,
  fitToken,
  showGuides = false,
}) {
  const [pngUrl,    setPngUrl]    = useState(null);
  const [error,     setError]     = useState(null);
  const [dragging,  setDragging]  = useState(false);
  // True from the instant any render-affecting prop changes (svgCode, scale,
  // baseSize, scheme) until the freshly rasterized blob lands — dims the
  // still-showing old image immediately (see .output-png-img--stale) so a
  // click always gets visible feedback right away, instead of the image just
  // sitting there unchanged for the debounce + rasterization window, which
  // reads as "stuck"/unresponsive. Restores the stale-while-rendering
  // treatment this tab used to have (T18) before it was dropped in the
  // Sessione 14 base-size/scale rewrite.
  const [rendering, setRendering] = useState(false);
  const prevUrlRef  = useRef(null);
  const timerRef    = useRef(null);
  const renderIdRef = useRef(0);
  const containerRef = useRef(null);
  const dragStart     = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (!svgCode?.trim()) {
      renderIdRef.current += 1;
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      onPngBlobChange?.(null);
      setPngUrl(null);
      setError(null);
      setRendering(false);
      return;
    }

    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;
    setRendering(true);

    timerRef.current = setTimeout(() => {
      setError(null);
      toPng(svgCode, scale, baseSize, scheme)
        .then((blob) => {
          if (renderId !== renderIdRef.current) return;
          const url = URL.createObjectURL(blob);
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
          prevUrlRef.current = url;
          onPngBlobChange?.(blob);
          setPngUrl(url);
          setRendering(false);
        })
        .catch((e) => {
          if (renderId !== renderIdRef.current) return;
          setError(e.message);
          onPngBlobChange?.(null);
          setRendering(false);
        });
    }, PNG_RENDER_DELAY_MS);

    return () => clearTimeout(timerRef.current);
  }, [svgCode, scale, baseSize, scheme, onPngBlobChange]);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
      onPngBlobChange?.(null);
    };
  }, [onPngBlobChange]);

  // Same fit-to-view as Preview.jsx: sizes the view zoom (not the export "scale"
  // or "base size", which only control raster resolution/canvas box) so the
  // exported PNG's on-screen square fits the visible canvas. The exported PNG
  // is always a baseSize x baseSize square, so the fit is against that square,
  // not the SVG's own (possibly non-square) intrinsic aspect ratio.
  useEffect(() => {
    if (!fitToken) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const fit = Math.min(
      (rect.width * FIT_PADDING) / baseSize,
      (rect.height * FIT_PADDING) / baseSize
    );

    onZoomChange?.(Math.max(FIT_ZOOM_MIN, Math.min(fit, FIT_ZOOM_MAX)));
    onPanChange?.({ x: 0, y: 0 });
  }, [fitToken]);

  function zoomIn() {
    onZoomChange?.((z) => { const n = ZOOM_STEPS.find((s) => s > z); return n ?? z; });
  }
  function zoomOut() {
    onZoomChange?.((z) => { const n = [...ZOOM_STEPS].reverse().find((s) => s < z); return n ?? z; });
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(); else zoomOut();
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging || !dragStart.current) return;
    onPanChange?.({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }

  function onPointerUp() {
    setDragging(false);
    dragStart.current = null;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  return (
    <div className="output-png-wrap">
      <div
        ref={containerRef}
        className="output-png-canvas"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {error && !pngUrl && (
          <div className="output-error">
            <div className="output-error__box">
              <FiAlertTriangle size={16} />
              <span>{error}</span>
            </div>
          </div>
        )}
        {pngUrl && (
          <div
            className="output-png-inner"
            style={{
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            }}
          >
            <img
              src={pngUrl}
              className={`output-png-img${rendering ? " output-png-img--stale" : ""}`}
              alt="SVG rendered as PNG"
              style={{ width: baseSize, height: baseSize }}
              draggable={false}
            />
          </div>
        )}

        {/* Center crosshair — a sibling of .output-png-inner, not a child of
            it, so it marks the CANVAS's own center and stays fixed on screen
            regardless of pan/zoom of the rendered PNG itself. */}
        {showGuides && (
          <>
            <div className="preview-guide-h" aria-hidden="true" />
            <div className="preview-guide-v" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

function DataUriOutput({ value }) {
  return (
    <div className="output-datauri-wrap">
      <textarea className="output-datauri-ta" readOnly value={value} />
    </div>
  );
}

export function OutputPanel({ svgCode, activeTab, hlTarget, fitToken, onFitToView, onSelectElement, onClearSelection }) {
  const [previewZoom, setPreviewZoom] = useState(ZOOM_DEFAULT);
  const [previewPan,  setPreviewPan]  = useState({ x: 0, y: 0 });
  const [pngZoom,     setPngZoom]     = useState(ZOOM_DEFAULT);
  const [pngPan,      setPngPan]      = useState({ x: 0, y: 0 });
  const [pngScale,    setPngScale]    = useState(3);
  const [pngBaseSize, setPngBaseSize] = useState(128);
  const [pngBlob,     setPngBlob]     = useState(null);
  const [dataUriFormat, setDataUriFormat] = useState("base64");

  // Shared by both the SVG Preview and PNG tabs (one toggle, one state) so
  // forcing a scheme updates both in real time. colorScheme is always
  // "light" or "dark" — the user's last picked preference, which persists
  // across different SVGs (nothing to "turn off": a real two-state switch,
  // not a three-state on/off/unset control). It only ever gets APPLIED
  // (activeScheme) when the current SVG actually carries its own
  // @media (prefers-color-scheme) rules — see scheme.js — so loading an SVG
  // that doesn't use this feature never mutates its markup, even though the
  // toggle's own remembered preference is untouched underneath.
  const [colorScheme, setColorScheme] = useState("dark");
  const schemeSupported = useMemo(() => supportsColorScheme(svgCode), [svgCode]);
  const activeScheme = schemeSupported ? colorScheme : null;

  // Shared by both tabs too, same reasoning as colorScheme above — one
  // crosshair state, toggled from either tab's footer, marks the canvas's
  // own center in both.
  const [showGuides, setShowGuides] = useState(false);

  const reactCode = activeTab === "react"       ? toReact(svgCode)       : null;
  const rnCode    = activeTab === "reactnative" ? toReactNative(svgCode) : null;
  const dataUriValue = activeTab === "datauri"
    ? dataUriFormat === "base64"
      ? toDataUriBase64(svgCode)
      : toDataUriEncoded(svgCode)
    : "";

  function resetPreviewZoom() {
    setPreviewZoom(ZOOM_DEFAULT);
    setPreviewPan({ x: 0, y: 0 });
  }

  function resetPngZoom() {
    setPngZoom(ZOOM_DEFAULT);
    setPngPan({ x: 0, y: 0 });
  }

  return (
    <div className="output-panel">
      <div className="output-content">
        {activeTab === "preview" && (
          <Preview
            svgCode={svgCode}
            hlTarget={hlTarget}
            zoom={previewZoom}
            onZoomChange={setPreviewZoom}
            pan={previewPan}
            onPanChange={setPreviewPan}
            fitToken={fitToken}
            onSelectElement={onSelectElement}
            onClearSelection={onClearSelection}
            scheme={activeScheme}
            showGuides={showGuides}
          />
        )}

        {activeTab === "react" && (
          <div className="output-code-panel">
            <CodeOutput code={reactCode} />
          </div>
        )}

        {activeTab === "reactnative" && (
          <div className="output-code-panel">
            <CodeOutput code={rnCode} />
          </div>
        )}

        {activeTab === "png" && (
          <PngOutput
            svgCode={svgCode}
            scale={pngScale}
            baseSize={pngBaseSize}
            scheme={activeScheme}
            onPngBlobChange={setPngBlob}
            zoom={pngZoom}
            onZoomChange={setPngZoom}
            pan={pngPan}
            onPanChange={setPngPan}
            fitToken={fitToken}
            showGuides={showGuides}
          />
        )}
        {activeTab === "datauri" && <DataUriOutput value={dataUriValue} />}
      </div>

      <OutputCommandBar>
        {activeTab === "preview" && (
          <>
            <ZoomButtons
              zoom={previewZoom}
              onZoomChange={setPreviewZoom}
              onZoomReset={resetPreviewZoom}
              onFitToView={onFitToView}
            />
            {schemeSupported && <SchemeToggle scheme={colorScheme} onChange={setColorScheme} />}
            <GuidesToggle active={showGuides} onToggle={() => setShowGuides((g) => !g)} />
            <CopyButton getText={() => svgCode} label="Copy SVG" />
            <SaveButton
              getBlob={() => new Blob([svgCode ?? ""], { type: "image/svg+xml" })}
              filename="image.svg"
              filters={[{ name: "SVG Image", patterns: ["*.svg"] }]}
              label="Save SVG"
            />
          </>
        )}
        {activeTab === "react" && (
          <>
            <CopyButton getText={() => reactCode} label="Copy JSX" />
            <SaveButton
              getBlob={() => new Blob([reactCode ?? ""], { type: "text/plain" })}
              filename="SvgComponent.jsx"
              filters={[{ name: "JSX Component", patterns: ["*.jsx"] }]}
              label="Save JSX"
            />
          </>
        )}
        {activeTab === "reactnative" && (
          <>
            <CopyButton getText={() => rnCode} label="Copy React Native" />
            <SaveButton
              getBlob={() => new Blob([rnCode ?? ""], { type: "text/plain" })}
              filename="SvgComponent.native.jsx"
              filters={[{ name: "React Native Component", patterns: ["*.jsx"] }]}
              label="Save React Native"
            />
          </>
        )}
        {activeTab === "png" && (
          <>
            <ZoomButtons
              zoom={pngZoom}
              onZoomChange={setPngZoom}
              onZoomReset={resetPngZoom}
              onFitToView={onFitToView}
            />
            {schemeSupported && <SchemeToggle scheme={colorScheme} onChange={setColorScheme} />}
            <GuidesToggle active={showGuides} onToggle={() => setShowGuides((g) => !g)} />
            <BaseSizeButtons baseSize={pngBaseSize} onBaseSizeChange={setPngBaseSize} />
            <ScaleButtons scale={pngScale} onScaleChange={setPngScale} />
            <SaveButton
              getBlob={() => pngBlob}
              filename="image.png"
              filters={PNG_FILTERS}
              label="Save PNG"
              disabled={!pngBlob}
            />
          </>
        )}
        {activeTab === "datauri" && (
          <>
            <FormatButtons format={dataUriFormat} onFormatChange={setDataUriFormat} />
            <CopyButton getText={() => dataUriValue} label="Copy Data URI" />
            <SaveButton
              getBlob={() => new Blob([dataUriValue], { type: "text/plain" })}
              filename="image.svg.datauri.txt"
              label="Save Data URI"
            />
          </>
        )}
      </OutputCommandBar>
    </div>
  );
}
