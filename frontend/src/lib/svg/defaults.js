export const DEFAULT_SVG = "";

// Shared with App.jsx's ensureTitle() (whole-new-document load) and Editor.jsx's
// empty-editor snippet skeleton (whole-new-document creation) — kept as one
// constant so both paths can never drift into inserting different title text.
export const DEFAULT_TITLE_TAG = '<title id="title">svg studio editor - title example</title>';
