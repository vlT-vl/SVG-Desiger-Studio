import { useEffect, useRef, useState } from "react";
import { hsvToHex, parseColorToHsv } from "../lib/colorAtCursor.js";
import "../styles/ColorPicker.css";

export function ColorPicker({ color, onOpen, onChange, onClose }) {
  const [open,     setOpen]     = useState(false);
  const [hsv,      setHsv]      = useState({ h: 0, s: 1, v: 1 });
  const [hexInput, setHexInput] = useState("#444444");
  const [popPos,   setPopPos]   = useState({ top: 0, left: 0 });

  const hsvRef    = useRef({ h: 0, s: 1, v: 1 });
  const swatchRef = useRef(null);
  const squareRef = useRef(null);
  const hueRef    = useRef(null);
  const popRef    = useRef(null);

  // Sync from prop only while picker is closed
  useEffect(() => {
    if (open || !color) return;
    const p = parseColorToHsv(color);
    if (!p) return;
    hsvRef.current = p;
    setHsv(p);
    setHexInput(hsvToHex(p.h, p.s, p.v));
  }, [color, open]);

  // Close on outside click (capture phase to beat pointer-capture on divider)
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (
        !popRef.current?.contains(e.target) &&
        !swatchRef.current?.contains(e.target)
      ) {
        setOpen(false);
        onClose?.();
      }
    }
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose]);

  function openPicker() {
    const rect  = swatchRef.current.getBoundingClientRect();
    const POP_W = 210;
    const POP_H = 232;
    let left = rect.left;
    let top  = rect.bottom + 6;
    if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
    if (top  + POP_H > window.innerHeight - 8) top  = rect.top - POP_H - 6;
    setPopPos({ top, left });
    setOpen(true);
    onOpen?.();
  }

  function closePicker() {
    setOpen(false);
    onClose?.();
  }

  function applyHsv(newHsv) {
    hsvRef.current = newHsv;
    setHsv({ ...newHsv });
    const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    setHexInput(hex);
    onChange?.(hex);
  }

  // ── Drag text-selection guard ───────────────────────────────────────────
  // preventDefault() on the initiating pointerdown stops the browser's
  // native text-selection-drag at the source (root fix). The document-level
  // user-select toggle is a defensive backstop for this webview, mirroring
  // the extra robustness needed elsewhere in this project for pointer/
  // selection edge cases (see handoff.md Sessioni 4/17).
  function beginNoSelectDrag(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.style.userSelect = "none";
    document.documentElement.style.webkitUserSelect = "none";
  }
  function endNoSelectDrag() {
    document.documentElement.style.userSelect = "";
    document.documentElement.style.webkitUserSelect = "";
  }

  // ── Square (saturation × brightness) ────────────────────────────────────

  function onSquareDown(e) {
    beginNoSelectDrag(e);
    moveSV(e);
  }
  function onSquareMove(e) {
    if (!(e.buttons & 1)) return;
    moveSV(e);
  }
  function moveSV(e) {
    const rect = squareRef.current.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    applyHsv({ ...hsvRef.current, s, v });
  }

  // ── Hue strip ────────────────────────────────────────────────────────────

  function onHueDown(e) {
    beginNoSelectDrag(e);
    moveH(e);
  }
  function onHueMove(e) {
    if (!(e.buttons & 1)) return;
    moveH(e);
  }
  function moveH(e) {
    const rect = hueRef.current.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    applyHsv({ ...hsvRef.current, h });
  }

  // ── Hex input ────────────────────────────────────────────────────────────

  function onHexChange(e) {
    const val = e.target.value;
    setHexInput(val);
    const p = parseColorToHsv(val);
    if (!p) return;
    hsvRef.current = p;
    setHsv(p);
    onChange?.(hsvToHex(p.h, p.s, p.v));
  }

  const displayHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueColor   = `hsl(${hsv.h}deg 100% 50%)`;
  const hasColor   = open || !!color;

  return (
    <div className={`cpicker${open ? " cpicker--open" : ""}`}>
      <button
        ref={swatchRef}
        className={[
          "cpicker-swatch",
          open      ? "cpicker-swatch--open"  : "",
          !hasColor ? "cpicker-swatch--empty" : "",
        ].join(" ").trim()}
        style={hasColor ? { background: displayHex } : undefined}
        onClick={open ? closePicker : openPicker}
        title="Color picker"
        type="button"
      />
      <span className="cpicker-label" aria-hidden="true">
        {hasColor ? displayHex : ""}
      </span>

      {open && (
        <div
          ref={popRef}
          className="cpicker-pop"
          style={{ top: popPos.top, left: popPos.left }}
        >
          {/* Saturation / brightness square */}
          <div
            ref={squareRef}
            className="cpicker-sq"
            style={{ background: hueColor }}
            onPointerDown={onSquareDown}
            onPointerMove={onSquareMove}
            onPointerUp={endNoSelectDrag}
            onPointerCancel={endNoSelectDrag}
          >
            <div className="cpicker-sq-white" />
            <div className="cpicker-sq-black" />
            <div
              className="cpicker-sq-cur"
              style={{
                left:       `${hsv.s * 100}%`,
                top:        `${(1 - hsv.v) * 100}%`,
                background: displayHex,
              }}
            />
          </div>

          {/* Hue strip */}
          <div
            ref={hueRef}
            className="cpicker-hue"
            onPointerDown={onHueDown}
            onPointerMove={onHueMove}
            onPointerUp={endNoSelectDrag}
            onPointerCancel={endNoSelectDrag}
          >
            <div
              className="cpicker-hue-cur"
              style={{
                left:       `${(hsv.h / 360) * 100}%`,
                background: hueColor,
              }}
            />
          </div>

          {/* Hex row */}
          <div className="cpicker-hex">
            <div className="cpicker-hex-dot" style={{ background: displayHex }} />
            <input
              className="cpicker-hex-inp"
              value={hexInput}
              onChange={onHexChange}
              spellCheck={false}
              maxLength={9}
            />
          </div>
        </div>
      )}
    </div>
  );
}
