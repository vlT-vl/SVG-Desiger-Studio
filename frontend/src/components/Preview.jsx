import { useEffect, useMemo, useRef, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import { getSvgDimensions, ensureIntrinsicSize } from "../lib/svg/toPng.js";
import { resolveColorScheme } from "../lib/svg/scheme.js";
import { NON_RENDERING_TAGS } from "../lib/svg/elementLocator.js";
import "../styles/Preview.css";

export const FIT_PADDING  = 0.9;   // leave a 10% margin around the fitted content
export const FIT_ZOOM_MIN = 0.05;
export const FIT_ZOOM_MAX = 10;

const TRANSPARENT_BG_STYLE = {
  backgroundImage: "repeating-conic-gradient(#707680 0% 25%, #8f949c 0% 50%)",
  backgroundSize: "18px 18px",
};

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const ZOOM_DEFAULT = 1;

export function Preview({
  svgCode,
  hlTarget,
  zoom = ZOOM_DEFAULT,
  onZoomChange,
  pan = { x: 0, y: 0 },
  onPanChange,
  fitToken,
  onSelectElement,
  onClearSelection,
  scheme = null,
  showGuides = false,
}) {
  const [dragging,   setDragging]   = useState(false);
  const [hlBox,      setHlBox]      = useState(null);

  const containerRef  = useRef(null);
  const innerRef      = useRef(null);
  const dragStart     = useRef(null);

  // Fit-to-view — only fired when a whole new SVG is loaded (import / drop into an
  // empty editor), never on merge or plain edits: those callers don't bump fitToken.
  // Sizes the zoom so the SVG's intrinsic width/height fits inside the visible
  // canvas, and recenters the pan, so a freshly loaded file is never dropped in at
  // a leftover zoom/pan that made sense for the previous (differently sized) SVG.
  useEffect(() => {
    if (!fitToken) return;
    if (!containerRef.current) return;

    const dims = getSvgDimensions(svgCode);
    if (!dims.width || !dims.height) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const fit = Math.min(
      (rect.width * FIT_PADDING) / dims.width,
      (rect.height * FIT_PADDING) / dims.height
    );

    onZoomChange?.(Math.max(FIT_ZOOM_MIN, Math.min(fit, FIT_ZOOM_MAX)));
    onPanChange?.({ x: 0, y: 0 });
  }, [fitToken]);

  // Recompute element highlight box whenever target, SVG content, zoom or pan changes —
  // and also on container resize, since the box is cached in pixel coordinates and would
  // otherwise stay stale (wrong position) until one of the other deps happens to change.
  useEffect(() => {
    function recomputeHlBox() {
      if (!hlTarget || !innerRef.current || !containerRef.current) {
        setHlBox(null);
        return;
      }
      const { tagName, count } = hlTarget;
      const el = tagName === "svg"
        ? innerRef.current.querySelectorAll("svg")[count]
        : innerRef.current.querySelectorAll(tagName)[count];
      if (!el) {
        setHlBox(null);
        return;
      }

      const highlightEl = getRenderableHighlightElement(el, innerRef.current);
      if (!highlightEl) {
        setHlBox(null);
        return;
      }

      const canvasRect = containerRef.current.getBoundingClientRect();
      const box = getHighlightBox(highlightEl, canvasRect, innerRef.current);

      if (!box) {
        setHlBox(null);
        return;
      }

      setHlBox({
        ...box,
        tagName: normalizedTagName(highlightEl),
      });
    }

    recomputeHlBox();

    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(recomputeHlBox);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hlTarget, svgCode, zoom, pan]);

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

  // Canvas pan starts on any plain left-button press on the background — a
  // press that lands on a selectable shape is instead handled (and
  // stopPropagation'd) by onInnerPointerDown/onHlPointerDown below, so the two
  // gestures never fight over the same pointerdown.
  function onPointerDown(e) {
    if (e.button !== 0) return;
    // A press outside .preview-inner entirely (the checkered padding beyond
    // the rendered SVG's own box) never reaches onInnerPointerDown at all —
    // it only ever lands here, so this is the only place that can clear the
    // selection for it. A press that bubbled here FROM a background click
    // inside .preview-inner already cleared it there (e.target is still that
    // original descendant, so innerRef.current.contains(e.target) is true) —
    // skip re-clearing to avoid a redundant, no-op state update on every pan.
    if (!innerRef.current?.contains(e.target)) {
      onClearSelection?.();
    }
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

  // Plain click selects an SVG element and moves the editor cursor to its source.
  // A click that lands on background — empty space that resolves only to the
  // root <svg>, never a real shape — clears whatever was previously selected
  // instead of leaving it untouched.
  function onInnerPointerDown(e) {
    if (e.button !== 0 || !innerRef.current) return;

    const el = getSelectableElementFromPointer(e, innerRef.current);
    if (!el) {
      onClearSelection?.();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const locator = locateDomElement(el, innerRef.current);
    if (locator) onSelectElement?.(locator.tagName, locator.count);
  }

  // The highlight box is a bounding-box rectangle, bigger than the element's
  // actual painted geometry (useful as an easier hit target for thin strokes
  // or fill:none shapes) — but that also means clicking on visually "empty"
  // space that merely falls inside that rectangle must NOT blindly re-confirm
  // whatever was already selected. Re-run the same pixel-accurate hit-test
  // onInnerPointerDown uses (elementsFromPoint sees straight through the box,
  // which fails root.contains(root=.preview-inner) and gets skipped) so a
  // click here selects whatever real geometry is actually under the pointer —
  // same element, a different overlapping one, or nothing (background: clear).
  function onHlPointerDown(e) {
    if (e.button !== 0 || !innerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const el = getSelectableElementFromPointer(e, innerRef.current);
    if (!el) {
      onClearSelection?.();
      return;
    }
    const locator = locateDomElement(el, innerRef.current);
    if (locator) onSelectElement?.(locator.tagName, locator.count);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const resolvedSvg = useMemo(
    () => resolveColorScheme(ensureIntrinsicSize(svgCode || ""), scheme),
    [svgCode, scheme]
  );

  return (
    <div className="preview-root">
      <div
        ref={containerRef}
        className="preview-canvas"
        style={{
          ...TRANSPARENT_BG_STYLE,
          cursor: dragging ? "grabbing" : "grab",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          ref={innerRef}
          className="preview-inner"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
          onPointerDown={onInnerPointerDown}
          dangerouslySetInnerHTML={{ __html: resolvedSvg }}
        />

        {/* Element highlight overlay — clickable to (re)select the element */}
        {hlBox && (
          <div
            className="preview-hl-box"
            style={{
              left:   hlBox.left,
              top:    hlBox.top,
              width:  hlBox.width,
              height: hlBox.height,
            }}
            onPointerDown={onHlPointerDown}
          >
            <span className="preview-hl-label">{hlBox.tagName}</span>
          </div>
        )}

        {/* Forced color-scheme indicator — only shown while the SchemeToggle
            in OutputPanel is actively resolving this SVG's own @media
            (prefers-color-scheme) rules (scheme.js). key={scheme} remounts
            the pill on every light<->dark switch, replaying the entrance
            animation each time as a lightweight "mode changed" cue, not just
            on first appearance. */}
        {scheme && (
          <div key={scheme} className={`preview-scheme-pill preview-scheme-pill--${scheme}`} aria-hidden="true">
            {scheme === "dark" ? <FiMoon size={11} /> : <FiSun size={11} />}
            <span>{scheme === "dark" ? "Dark" : "Light"}</span>
          </div>
        )}

        {/* Center crosshair — a sibling of .preview-inner, not a child of it,
            so it marks the CANVAS's own center and stays fixed on screen
            regardless of pan/zoom of the SVG content itself. */}
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

// Derives the same { tagName, count } identifier elementLocator.js's
// findElementAtSelection() computes from an editor cursor/selection, but from
// an actual DOM node instead — the count is just this element's index among
// same-tag siblings in document order, which matches querySelectorAll's order
// (and thus findElementAtSelection's count).
function locateDomElement(el, root) {
  if (!el || !root) return null;
  const tagName = normalizedTagName(el);
  const all = Array.from(root.querySelectorAll("*"))
    .filter((node) => normalizedTagName(node) === tagName);
  const count = Array.prototype.indexOf.call(all, el);
  return count < 0 ? null : { tagName, count };
}

function getSelectableElementFromPointer(e, root) {
  if (!root) return null;

  const path = e.nativeEvent?.composedPath?.() ?? e.composedPath?.() ?? [e.target];
  const fromPath = pickSelectableElement(path, root);
  if (fromPath) return fromPath;

  const fromPoint = root.ownerDocument?.elementsFromPoint?.(e.clientX, e.clientY) ?? [];
  return pickSelectableElement(fromPoint, root);
}

function pickSelectableElement(nodes, root) {
  const rootSvg = root.querySelector("svg");

  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    if (node === root || !root.contains(node)) continue;

    const tagName = normalizedTagName(node);
    if (!tagName) continue;

    // Clicking empty space inside the root SVG should not select the whole
    // document. A nested <svg> is still a real movable object, so only the
    // top-level injected SVG is treated as background here.
    if (tagName === "svg" && node === rootSvg) continue;
    if (isNonRenderingElement(node)) continue;

    const renderable = getRenderableHighlightElement(node, root) ?? node;
    if (!renderable || renderable === root) continue;
    if (normalizedTagName(renderable) === "svg" && renderable === rootSvg) continue;

    return renderable;
  }

  return null;
}

function getRenderableHighlightElement(el, stopEl) {
  const nonRenderingContext = findNonRenderingContext(el, stopEl);
  if (!nonRenderingContext && !isNonRenderingElement(el)) return el;

  const start = nonRenderingContext ?? el;
  for (let node = start.parentElement; node && node !== stopEl; node = node.parentElement) {
    if (!isNonRenderingElement(node)) return node;
  }

  return null;
}

function getHighlightBox(el, canvasRect, stopEl) {
  const renderedBox = rectToCanvasBox(el.getBoundingClientRect(), canvasRect);
  if (renderedBox) return renderedBox;

  const svgBox = svgBBoxToCanvasBox(el, canvasRect);
  if (svgBox) return svgBox;

  for (let node = el.parentElement; node && node !== stopEl; node = node.parentElement) {
    const parentBox = rectToCanvasBox(node.getBoundingClientRect(), canvasRect);
    if (parentBox) return parentBox;
  }

  return null;
}

function isNonRenderingElement(el) {
  return NON_RENDERING_TAGS.has(normalizedTagName(el));
}

function findNonRenderingContext(el, stopEl) {
  for (let node = el; node && node !== stopEl; node = node.parentElement) {
    if (isNonRenderingElement(node)) return node;
  }
  return null;
}

function normalizedTagName(el) {
  return (el?.tagName ?? "").toLowerCase();
}

function rectToCanvasBox(rect, canvasRect) {
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return {
    left:   rect.left - canvasRect.left,
    top:    rect.top  - canvasRect.top,
    width:  Math.max(rect.width, 1),
    height: Math.max(rect.height, 1),
  };
}

function svgBBoxToCanvasBox(el, canvasRect) {
  if (typeof el.getBBox !== "function" || typeof el.getScreenCTM !== "function") return null;

  try {
    const bbox = el.getBBox();
    const ctm = el.getScreenCTM();
    if (!ctm || (bbox.width === 0 && bbox.height === 0)) return null;

    const points = [
      new DOMPoint(bbox.x, bbox.y).matrixTransform(ctm),
      new DOMPoint(bbox.x + bbox.width, bbox.y).matrixTransform(ctm),
      new DOMPoint(bbox.x, bbox.y + bbox.height).matrixTransform(ctm),
      new DOMPoint(bbox.x + bbox.width, bbox.y + bbox.height).matrixTransform(ctm),
    ];

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    return rectToCanvasBox({
      left,
      top,
      width: right - left,
      height: bottom - top,
    }, canvasRect);
  } catch {
    return null;
  }
}
