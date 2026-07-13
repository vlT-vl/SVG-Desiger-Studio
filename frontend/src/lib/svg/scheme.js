// Resolves an SVG's own embedded `@media (prefers-color-scheme: light|dark)`
// CSS blocks (inside its <style> elements) into a static result for a chosen
// scheme. This is the only way to make Preview/PNG actually react to a
// light/dark toggle: @media queries are evaluated against the real OS/browser
// preference, never against any app-level state, so there is no way to just
// "force" one from the outside without rewriting the CSS itself first.
//
// Deliberately unrelated to the app's own UI theme (lib/theme.js,
// syncThemeWithNexAppearance()) — this only concerns how a *dropped-in SVG's*
// conditional styling gets resolved for rendering, nothing else.
//
// Known limitation: only the simple `@media (prefers-color-scheme: X)` form
// is recognized — a compound query combining it with another condition (e.g.
// `@media (min-width: 400px) and (prefers-color-scheme: dark)`) is neither
// detected as "supported" nor resolved. Matches the only form this feature
// has ever needed to handle in practice (self-adapting icon sets like GitHub
// octicons), same scope as the rest of this codebase's SVG helpers.

const MEDIA_BLOCK_SRC = "@media\\s*\\(\\s*prefers-color-scheme\\s*:\\s*(light|dark)\\s*\\)\\s*\\{";
const SUPPORT_RE = new RegExp(MEDIA_BLOCK_SRC, "i");
const MEDIA_BLOCK_RE = new RegExp(MEDIA_BLOCK_SRC, "gi");
const STYLE_TAG_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

// True only if the SVG actually contains at least one recognized
// prefers-color-scheme media block — callers use this to hide the toggle
// entirely for the (vast majority of) SVGs that never use this feature,
// instead of showing a control that would visibly do nothing.
export function supportsColorScheme(svgCode) {
  return !!svgCode && SUPPORT_RE.test(svgCode);
}

// Walks one <style> block's CSS text; for every recognized media block
// (brace-balanced, so nested rule blocks inside it don't confuse the scan):
// inlines its contents unwrapped when it matches `scheme`, or drops the whole
// block when it doesn't — resolving the cascade the same way a browser
// actually in that mode would, but as static output any renderer (live DOM,
// or an offscreen <img> rasterized to canvas for PNG export) can draw
// without needing to genuinely be "in" that OS mode itself.
function resolveMediaBlocks(css, scheme) {
  let out = "";
  let i = 0;
  MEDIA_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = MEDIA_BLOCK_RE.exec(css))) {
    out += css.slice(i, m.index);
    const braceStart = MEDIA_BLOCK_RE.lastIndex - 1;
    let depth = 1, j = braceStart + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    if (m[1].toLowerCase() === scheme) out += css.slice(braceStart + 1, j - 1);
    i = j;
    MEDIA_BLOCK_RE.lastIndex = j;
  }
  out += css.slice(i);
  return out;
}

// Applies resolveMediaBlocks() to every <style> element's text content found
// in the document; everything else (markup, attributes) passes through
// untouched. `scheme` must be "light" or "dark" — any other value (including
// null/undefined, used whenever the toggle isn't active) returns the SVG
// unchanged.
export function resolveColorScheme(svgCode, scheme) {
  if (!svgCode || (scheme !== "light" && scheme !== "dark")) return svgCode;
  STYLE_TAG_RE.lastIndex = 0;
  return svgCode.replace(STYLE_TAG_RE, (full, open, css, close) => `${open}${resolveMediaBlocks(css, scheme)}${close}`);
}
