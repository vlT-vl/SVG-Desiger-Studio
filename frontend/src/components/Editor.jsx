import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle, FiArrowDown, FiArrowRight, FiCheck, FiCopy, FiGitMerge,
  FiMaximize2, FiPlus, FiTrash2, FiUpload, FiX,
} from "react-icons/fi";
import { highlightSvg } from "../lib/highlight.js";
import { extractSvgInner, applyMerge } from "../lib/svg/merge.js";
import { resolveElementRange, findInsertionPoint, appendEdit } from "../lib/svg/elementLocator.js";
import { validateSvgSyntax } from "../lib/svg/validate.js";
import { DEFAULT_TITLE_TAG } from "../lib/svg/defaults.js";
import * as nex from "../lib/nex.js";
import "../styles/Editor.css";

const ELEMENT_SNIPPETS = [
  { label: "Rectangle", code: '<rect x="0" y="0" width="200" height="40" rx="13" ry="13" fill="#cccccc"/>' },
  { label: "Circle",    code: '<circle cx="60" cy="60" r="50" fill="#cccccc"/>' },
  { label: "Ellipse",   code: '<ellipse cx="100" cy="60" rx="80" ry="40" fill="#cccccc"/>' },
  { label: "Line",      code: '<line x1="20" y1="20" x2="220" y2="120" stroke="#cccccc" stroke-width="8" stroke-linecap="round"/>' },
  { label: "Path",      code: '<path d="M20 120 C80 20 150 180 220 80" fill="none" stroke="#cccccc" stroke-width="8" stroke-linecap="round"/>' },
  { label: "Text",      code: '<text class="wordmark" x="45" y="60" font-size="44" dominant-baseline="central" fill="#cccccc">text</text>' },
  { label: "Comment",   code: '<!-- comment -->' },
];

const GROUP_SKELETON = '<g transform="translate(0, 0) scale(1)">\n</g>';
const EDITOR_LINE_HEIGHT = 13 * 1.6;
const EDITOR_PAD_TOP = 10;
const TOP_OBSCURE_PX = 50;
const BOTTOM_OBSCURE_PX = 58;

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

function formatSnippetBlock(str, depth = 1) {
  const pad = "  ".repeat(depth);
  return trimBlankLines(str.split("\n")).map((line) => pad + line).join("\n");
}

function normalizeWrapRange(code, range) {
  if (!range) return null;

  let contentStart = Math.max(0, Math.min(range.start, range.end));
  let contentEnd = Math.min(code.length, Math.max(range.start, range.end));
  while (contentStart < contentEnd && /\s/.test(code[contentStart])) contentStart++;
  while (contentEnd > contentStart && /\s/.test(code[contentEnd - 1])) contentEnd--;
  if (contentStart >= contentEnd) return null;

  const lineStart = code.lastIndexOf("\n", contentStart - 1) + 1;
  const prefix = code.slice(lineStart, contentStart);
  const baseIndent = prefix.match(/^[ \t]*/)?.[0] ?? "";
  const replaceStart = /^[ \t]*$/.test(prefix) ? lineStart : contentStart;

  return { contentStart, contentEnd, replaceStart, replaceEnd: contentEnd, baseIndent };
}

function formatWrappedInner(str, baseIndent) {
  const [firstLine, ...restLines] = trimBlankLines(str.split("\n"));
  return [
    baseIndent + "  " + firstLine,
    ...restLines.map((line) => (line.trim() ? "  " + line : "")),
  ].join("\n");
}

export function Editor({ value, onChange, onLoad, onSelectionChange, focusRequest, clearSelectionToken, hlTarget, onUndo, onRedo, onClear }) {
  const textareaRef    = useRef(null);
  const gutterRef      = useRef(null);
  const hlRef          = useRef(null);
  const snippetsBtnRef  = useRef(null);
  const snippetsMenuRef = useRef(null);
  const contextMenuRef  = useRef(null);
  const contextMenuRangeRef = useRef(null);

  const [dropping,     setDropping]     = useState(false);
  const [dropZone,     setDropZone]     = useState(null); // "replace" | "merge" | null, while dropping
  const [copied,       setCopied]       = useState(false);
  const [pendingDrop,  setPendingDrop]  = useState(null);
  const [importError,  setImportError]  = useState(null); // dropped file's name, or null
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [contextMenu,  setContextMenu]  = useState(null); // { x, y } or null
  const [editorObscured, setEditorObscured] = useState({ top: false, bottom: false });
  const [txStr,    setTxStr]    = useState("0");
  const [tyStr,    setTyStr]    = useState("0");
  const [scaleStr, setScaleStr] = useState("1");

  const safe = value ?? "";
  const lineCount = (safe.match(/\n/g) || []).length + 1;
  const svgIssue = useMemo(() => validateSvgSyntax(safe), [safe]);

  const tx = Number(txStr);
  const ty = Number(tyStr);
  const scale = Number(scaleStr);
  const mergeValid = Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(scale);

  function keepEditorSelection(e) {
    e.preventDefault();
  }

  // Selecting an element by clicking it in the Preview moves the editor's cursor
  // to the matching source range — `focusRequest` carries a fresh token on every
  // request (even if start/end repeat) so this always re-applies and re-scrolls.
  useEffect(() => {
    if (!focusRequest) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(focusRequest.start, focusRequest.end);

    // Approximates the target line's scroll offset by counting newlines before it;
    // doesn't account for soft line-wrapping on very long lines (e.g. long path
    // "d" values), but matches the common case of one element per line.
    const line = (safe.slice(0, focusRequest.start).match(/\n/g) || []).length;
    ta.scrollTop = Math.max(0, line * EDITOR_LINE_HEIGHT - ta.clientHeight / 2 + EDITOR_LINE_HEIGHT);
    requestAnimationFrame(() => updateEditorObscured(focusRequest.start));
  }, [focusRequest]);

  // Deselecting in the Preview (click on background) collapses any leftover
  // text selection here too, without stealing focus into the editor for what
  // was a Preview-only click.
  useEffect(() => {
    if (!clearSelectionToken) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.selectionStart = ta.selectionEnd = ta.selectionStart;
  }, [clearSelectionToken]);

  // Close the snippets menu on outside click — same pattern as ColorPicker's popover.
  useEffect(() => {
    if (!snippetsOpen) return;
    function onDown(e) {
      if (
        !snippetsMenuRef.current?.contains(e.target) &&
        !snippetsBtnRef.current?.contains(e.target)
      ) {
        setSnippetsOpen(false);
      }
    }
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [snippetsOpen]);

  // Close the right-click "Wrap in <g>" menu on outside click — same pattern.
  useEffect(() => {
    if (!contextMenu) return;
    function onDown(e) {
      if (!contextMenuRef.current?.contains(e.target)) {
        contextMenuRangeRef.current = null;
        setContextMenu(null);
      }
    }
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const menu = contextMenuRef.current;
    if (!menu) return;

    function onNativeDown(e) {
      if (!e.target?.closest?.("[data-wrap-context-item]")) return;
      handleWrapContextDown(e);
    }

    menu.addEventListener("pointerdown", onNativeDown, true);
    menu.addEventListener("mousedown", onNativeDown, true);
    return () => {
      menu.removeEventListener("pointerdown", onNativeDown, true);
      menu.removeEventListener("mousedown", onNativeDown, true);
    };
  }, [contextMenu]);

  // Right-clicking with an active selection (or just a cursor resting inside
  // a resolvable element) opens a tiny custom context menu offering "Wrap in
  // <g>" — this replaced a Snippets-panel button for that action because any
  // *button* click steals focus from the textarea, and handleBlur() (below)
  // collapses the selection on every blur, so by the time such a button's
  // onClick fired the selection was already gone. A right-click/contextmenu
  // event does neither itself: it doesn't move focus and doesn't touch the
  // selection, so the range is still exactly what the user chose right here.
  //
  // The menu item is a non-focusable div, not a button, and applies its action
  // during pointerdown/mousedown capture before focus/click/blur sequencing in
  // the webview can interfere. A native DOM listener on the menu mirrors the
  // React handler as a webview fallback. The range is captured HERE both in
  // state (for rendering) and in a ref (for the event handler), while it's
  // guaranteed valid.
  function handleContextMenu(e) {
    const ta = e.currentTarget;
    const hasSelectionNow = ta.selectionStart !== ta.selectionEnd;
    const range = hasSelectionNow
      ? { start: ta.selectionStart, end: ta.selectionEnd }
      : hlTarget
        ? resolveElementRange(safe, hlTarget.tagName, hlTarget.count)
        : null;
    if (!range) return;
    e.preventDefault();
    contextMenuRangeRef.current = range;
    setContextMenu({ x: e.clientX, y: e.clientY, range });
  }

  // The textarea's selectionStart/End stay valid even once it's blurred
  // (clicking the circular trigger button doesn't clear them), so all the
  // positioning below always reflects wherever the user last left the
  // cursor/selection, not just while the textarea is actively focused.
  //
  // A bare element snippet dropped into a completely empty editor would
  // produce invalid/incomplete SVG (no root at all) — if there's no <svg>
  // yet, wrap the snippet in a minimal root instead of inserting it bare.
  // This is itself a whole-new-document being created, same as a file
  // import/drop, so it must always get a <title> too (DEFAULT_TITLE_TAG,
  // shared with App.jsx's ensureTitle() so both paths can't drift apart).
  // xmlns/version/baseProfile + explicit width/height/viewBox (512×512,
  // fixed) on purpose, not just a bare viewBox: an SVG entirely built from
  // scratch through this menu would otherwise never have an intrinsic size
  // of its own, which toPng.js's ensureIntrinsicSize() already has to patch
  // back in at export time anyway (a real WebKit decode failure, not just a
  // style nicety) — setting it here means a brand-new document is already
  // complete/correct from the very first snippet, instead of relying on
  // that export-time patch alone. xmlns/version/baseProfile make a
  // from-scratch document a complete, standalone-valid SVG file on its own
  // (openable/portable outside this app), not just "good enough for this
  // app's own renderer".
  function insertSnippet(text) {
    if (!safe.trim()) {
      const prefix = `<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 512 512" width="512" height="512">\n  ${DEFAULT_TITLE_TAG}\n`;
      const inner  = formatSnippetBlock(text, 1);
      onChange(prefix + inner + "\n</svg>");
      const caret = prefix.length + inner.length;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.selectionStart = el.selectionEnd = caret;
      });
      setSnippetsOpen(false);
      return;
    }

    const ta = textareaRef.current;

    // Always append as the last child of whichever container
    // (nearest enclosing <g>/<svg>/...) the cursor currently sits inside,
    // even when text is selected. Snippets are insert-new-element actions,
    // never replace-selection actions. If the cursor happens to rest
    // mid-tag/mid-attribute of some unrelated element, findInsertionPoint()
    // falls back to the enclosing container instead of corrupting that tag.
    const pos = ta ? ta.selectionStart : safe.length;
    const insertion = findInsertionPoint(safe, pos);
    if (!insertion) return;

    const block = formatSnippetBlock(text, insertion.depth);
    const edit = appendEdit(safe, insertion, block);
    onChange(safe.slice(0, edit.start) + edit.text + safe.slice(edit.end));
    const caret = edit.start + edit.text.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = caret;
    });
    setSnippetsOpen(false);
  }

  // Wraps `range` (already resolved and captured by handleContextMenu — see
  // its comment for why this must be a value handed in, not re-derived here)
  // in a <g transform">, same positioning wrapper shape as the merge
  // feature but without nesting a coordinate-preserving <svg> inside it
  // (this repositions existing local content, not an imported foreign file
  // with its own viewBox). Indentation, relative to baseIndent (the column
  // where the wrapped content originally started):
  //  - the new wrapper's own open/close tags sit at baseIndent, same level
  //    the content used to be at.
  //  - inner's FIRST line starts at column 0 (the normalized range cuts right
  //    at its '<', no leading whitespace of its own) and needs baseIndent +
  //    one more level.
  //  - inner's SUBSEQUENT lines already carry their original absolute
  //    file-column indentation (extracted verbatim, still consistent with
  //    baseIndent's context) and only need one more level on top of that —
  //    NOT baseIndent again, which would double it.
  function insertWrapInG(range) {
    const normalized = normalizeWrapRange(safe, range);
    if (!normalized) return;

    const { contentStart, contentEnd, replaceStart, replaceEnd, baseIndent } = normalized;
    const inner = formatWrappedInner(safe.slice(contentStart, contentEnd), baseIndent);
    const wrapped = `${baseIndent}<g transform="translate(0, 0) scale(1)">\n${inner}\n${baseIndent}</g>`;
    onChange(safe.slice(0, replaceStart) + wrapped + safe.slice(replaceEnd));
    const caret = replaceStart + wrapped.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = caret;
    });
  }

  function handleWrapContextDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const range = contextMenuRangeRef.current ?? contextMenu?.range;
    contextMenuRangeRef.current = null;
    insertWrapInG(range);
    setContextMenu(null);
  }

  function syncScroll() {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (hlRef.current) {
      hlRef.current.scrollTop  = ta.scrollTop;
      hlRef.current.scrollLeft = ta.scrollLeft;
    }
    updateEditorObscured(ta.selectionStart);
  }

  function updateEditorObscured(pos) {
    const ta = textareaRef.current;
    if (!ta) return;

    const line = (safe.slice(0, pos).match(/\n/g) || []).length;
    const visualY = line * EDITOR_LINE_HEIGHT - ta.scrollTop + EDITOR_PAD_TOP;
    const next = {
      top: visualY < TOP_OBSCURE_PX,
      bottom: visualY > ta.clientHeight - BOTTOM_OBSCURE_PX,
    };

    setEditorObscured(prev => (
      prev.top === next.top && prev.bottom === next.bottom ? prev : next
    ));
  }

  function reportSelection(target) {
    const range = { start: target.selectionStart, end: target.selectionEnd };
    onSelectionChange?.(range);
    updateEditorObscured(range.start);
  }

  function handleKeyDown(e) {
    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (key === "z" || key === "y")) {
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      const handled = isUndo ? onUndo?.() : isRedo ? onRedo?.() : false;
      if (handled) e.preventDefault();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const ta    = textareaRef.current;
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      onChange(safe.substring(0, start) + "  " + safe.substring(end));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    if (e.key === "Escape" && pendingDrop) setPendingDrop(null);
    if (e.key === "Escape" && contextMenu) setContextMenu(null);
  }

  function handleClearClick() {
    onClear?.();
  }

  async function handleCopy() {
    if (!safe) return;
    try {
      await nex.clipboard.native.writeText(safe);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  function handleBlur() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.selectionStart = ta.selectionEnd = ta.selectionStart;
  }

  function focusIssue() {
    if (!svgIssue) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = Math.max(0, Math.min(safe.length, svgIssue.offset ?? 0));
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos;
    onSelectionChange?.({ start: pos, end: pos });

    const line = Math.max(1, svgIssue.line ?? 1);
    const lineHeight = 13 * 1.6;
    ta.scrollTop = Math.max(0, (line - 1) * lineHeight - ta.clientHeight / 2 + lineHeight);
    syncScroll();
  }

  // While a file is dragged over a non-empty editor, the overlay below splits
  // into two stacked zones ("Upload as new" on top, "Merge" on the bottom) —
  // dropZone tracks which half the cursor is currently over, purely from
  // mouse Y position (no separate per-zone drop targets/listeners; a single
  // owner for the drag/drop events on .editor-wrap, same simplicity lesson
  // learned the hard way from the old Preview element-drag saga). An empty
  // editor has nothing to lose either way, so it skips the split entirely —
  // there dropZone is always "replace", same as importing a fresh file.
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
    if (!safe.trim()) {
      setDropZone("replace");
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropZone(e.clientY - rect.top < rect.height / 2 ? "replace" : "merge");
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropping(false);
      setDropZone(null);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDropping(false);
    // Falls back to "merge" (today's only behavior on a non-empty editor)
    // if for some reason a drop lands without a prior dragover having set a
    // zone — never silently replaces existing content by accident.
    const zone = dropZone ?? "merge";
    setDropZone(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      // Validated ONCE, up front, before either path (replace or merge) can
      // act on it — extractSvgInner() is the same root-<svg>-detection this
      // app already trusts everywhere else (merge, prettify's fallback
      // chain), so a non-SVG drop (a PNG, a random text file, anything
      // without a real root <svg> element) is rejected identically no matter
      // which zone it lands on, instead of the replace path previously
      // shoving whatever text() decoded to straight into the document
      // unvalidated. Stops here — no onLoad/onChange/setPendingDrop call at
      // all — and surfaces a modal instead of failing silently.
      const extracted = extractSvgInner(text);
      if (!extracted) {
        setImportError(file.name);
        return;
      }
      if (!safe.trim() || zone === "replace") {
        (onLoad ?? onChange)(text);
        return;
      }
      setPendingDrop({ ...extracted, name: file.name });
      setTxStr("0");
      setTyStr("0");
      setScaleStr("1");
    } catch {
      setImportError(file.name);
    }
  }

  function handleImportErrorClose() {
    setImportError(null);
  }

  function handleMergeApply() {
    if (!pendingDrop || !mergeValid) return;
    onChange(applyMerge(safe, pendingDrop, tx, ty, scale));
    setPendingDrop(null);
  }

  function handleMergeCancel() {
    setPendingDrop(null);
  }

  function handleMergeCardKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleMergeCancel();
    } else if (e.key === "Enter" && mergeValid) {
      e.preventDefault();
      handleMergeApply();
    }
  }

  return (
    <div
      className={`editor-wrap${dropping ? " editor-wrap--dropping" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1} className="editor-gutter__line">{i + 1}</div>
        ))}
      </div>

      <div className="editor-body">
        <div
          ref={hlRef}
          className="editor-hl"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightSvg(safe) + '\n' }}
        />
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          onSelect={(e) => reportSelection(e.target)}
          onKeyUp={(e) => reportSelection(e.target)}
          onClick={(e) => reportSelection(e.target)}
          onContextMenu={handleContextMenu}
          onBlur={handleBlur}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="SVG source code"
        />
      </div>

      {svgIssue && (
        <button
          className="editor-syntax-warning"
          type="button"
          onClick={focusIssue}
          title={svgIssue.message}
        >
          <FiAlertTriangle size={14} />
          <span className="editor-syntax-warning__label">
            SVG syntax warning
          </span>
          <span className="editor-syntax-warning__where">
            {svgIssue.line ?? "?"}{svgIssue.column ? `:${svgIssue.column}` : ""}
          </span>
          <span className="editor-syntax-warning__msg">{svgIssue.message}</span>
        </button>
      )}

      <div className={`editor-toolbar${editorObscured.top && !snippetsOpen ? " editor-toolbar--compact" : ""}`}>
        {safe && (
          <button
            className="editor-action-wrap editor-action-wrap--danger"
            onMouseDown={keepEditorSelection}
            onClick={handleClearClick}
            title="Clear editor"
            type="button"
            aria-label="Clear SVG code"
          >
            <span className="editor-action-label" aria-hidden="true">Clear</span>
            <span className="editor-action-btn" aria-hidden="true">
              <FiTrash2 size={14} />
            </span>
          </button>
        )}

        {safe && (
          <button
            className={`editor-action-wrap${copied ? " editor-action-wrap--active" : ""}`}
            onMouseDown={keepEditorSelection}
            onClick={handleCopy}
            title="Copy SVG code"
            type="button"
            aria-label="Copy SVG source"
          >
            <span className="editor-action-label" aria-hidden="true">
              {copied ? "Copied!" : "Copy SVG"}
            </span>
            <span className="editor-action-btn" aria-hidden="true">
              {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
            </span>
          </button>
        )}

        {/* Dropdown menu can't legally live inside a <button>, so the trigger
            and the menu are siblings here, positioned relative to this outer
            wrap instead of to the trigger button itself. */}
        <div className="editor-snippets-trigger">
          <button
            ref={snippetsBtnRef}
            className={`editor-action-wrap${snippetsOpen ? " editor-action-wrap--active" : ""}`}
            onMouseDown={keepEditorSelection}
            onClick={() => setSnippetsOpen((o) => !o)}
            title="Insert SVG snippet"
            type="button"
            aria-label="Insert SVG snippet"
          >
            <span className="editor-action-label" aria-hidden="true">Snippets</span>
            <span className="editor-action-btn" aria-hidden="true">
              <FiPlus size={14} />
            </span>
          </button>

          {snippetsOpen && (
            <div ref={snippetsMenuRef} className="editor-snippets-menu">
              {ELEMENT_SNIPPETS.map((s) => (
                <button
                  key={s.label}
                  className="editor-snippets-item"
                  type="button"
                  onMouseDown={keepEditorSelection}
                  onClick={() => insertSnippet(s.code)}
                >
                  {s.label}
                </button>
              ))}
              <button
                className="editor-snippets-item"
                type="button"
                onMouseDown={keepEditorSelection}
                onClick={() => insertSnippet(GROUP_SKELETON)}
              >
                Group (transform + scale)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right-click "Wrap in <g>" — selection-preserving alternative to a
          menu button, see handleContextMenu() ── */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="editor-snippets-menu editor-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="editor-snippets-item"
            data-wrap-context-item
            role="menuitem"
            tabIndex={-1}
            onPointerDownCapture={handleWrapContextDown}
            onMouseDownCapture={handleWrapContextDown}
          >
            Wrap in &lt;g&gt;
          </div>
        </div>
      )}

      {/* ── Merge panel — backdrop + card centrato ── */}
      {pendingDrop && (
        <div className="editor-merge-backdrop" onClick={handleMergeCancel}>
          <div
            className="editor-merge-card"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleMergeCardKeyDown}
          >

            <div className="editor-merge-card__header">
              <span className="editor-merge-card__title">
                <FiGitMerge size={13} />
                Merge SVG{pendingDrop.name ? `: ${pendingDrop.name}` : ""}
              </span>
              <button className="editor-merge-card__close" onClick={handleMergeCancel} type="button">
                <FiX size={12} />
              </button>
            </div>

            <div className="editor-merge-card__body">
              <div className="editor-merge-fields">
                <label className="editor-merge-field">
                  <FiArrowRight size={12} />
                  <span>X</span>
                  <input type="number" value={txStr} onChange={e => setTxStr(e.target.value)} autoFocus />
                </label>
                <label className="editor-merge-field">
                  <FiArrowDown size={12} />
                  <span>Y</span>
                  <input type="number" value={tyStr} onChange={e => setTyStr(e.target.value)} />
                </label>
                <label className="editor-merge-field">
                  <FiMaximize2 size={12} />
                  <span>Scale</span>
                  <input type="number" value={scaleStr} step="0.1" onChange={e => setScaleStr(e.target.value)} />
                </label>
              </div>
              {!mergeValid && (
                <div className="editor-merge-error">Enter valid numbers for X, Y and Scale.</div>
              )}
            </div>

            <div className="editor-merge-card__footer">
              <button className="editor-merge-btn editor-merge-btn--ghost" onClick={handleMergeCancel} type="button">
                Cancel
              </button>
              <button
                className="editor-merge-btn editor-merge-btn--primary"
                onClick={handleMergeApply}
                type="button"
                disabled={!mergeValid}
              >
                Merge
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Import error — invalid (non-SVG) file dropped, either zone.
          autoFocus on the OK button lets Escape/Enter close it immediately,
          same lightweight keyboard-handling pattern as the merge card. ── */}
      {importError && (
        <div className="editor-merge-backdrop" onClick={handleImportErrorClose}>
          <div
            className="editor-merge-card"
            onClick={e => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter") {
                e.preventDefault();
                handleImportErrorClose();
              }
            }}
          >
            <div className="editor-merge-card__header">
              <span className="editor-merge-card__title editor-merge-card__title--error">
                <FiAlertTriangle size={13} />
                Import failed
              </span>
              <button className="editor-merge-card__close" onClick={handleImportErrorClose} type="button">
                <FiX size={12} />
              </button>
            </div>

            <div className="editor-merge-card__body">
              <p className="editor-import-error-msg">
                "{importError}" doesn't look like a valid SVG file. Only SVG files can be imported or merged here.
              </p>
            </div>

            <div className="editor-merge-card__footer">
              <button
                className="editor-merge-btn editor-merge-btn--primary"
                onClick={handleImportErrorClose}
                type="button"
                autoFocus
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {dropping && (
        <div className="editor-drop-overlay" aria-hidden="true">
          {safe.trim() ? (
            <>
              <div className={`editor-drop-zone${dropZone === "replace" ? " editor-drop-zone--active" : ""}`}>
                <FiUpload size={18} />
                <span className="editor-drop-zone__title">Upload as new</span>
                <span className="editor-drop-zone__hint">Replaces the current SVG</span>
              </div>
              <div className={`editor-drop-zone${dropZone === "merge" ? " editor-drop-zone--active" : ""}`}>
                <FiGitMerge size={18} />
                <span className="editor-drop-zone__title">Merge</span>
                <span className="editor-drop-zone__hint">Combine with the current SVG</span>
              </div>
            </>
          ) : (
            <div className="editor-drop-zone editor-drop-zone--active">
              <FiUpload size={18} />
              <span className="editor-drop-zone__title">Drop SVG to open</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
